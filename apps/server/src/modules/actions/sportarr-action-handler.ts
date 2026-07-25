import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { DownloadClientApiService } from '../api/download-client-api/download-client-api.service';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import {
  sportarrLeagueExternalIdFromProviderIds,
  sportarrLeagueExternalIdFromTvdbAlias,
} from '../api/servarr-api/helpers/sportarr-external-id';
import {
  SportarrDownloadHistoryItem,
  SportarrEvent,
  SportarrLeague,
} from '../api/servarr-api/interfaces/sportarr.interface';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsDataService } from '../settings/settings-data.service';

// Action handler for the native Sportarr connection. It performs the media
// lifecycle actions against Sportarr's own /api/ (delete a league / a season's
// event files / a single event's file; unmonitor; change quality profile).
// Nothing here touches the Sonarr/Radarr handlers.
//
@Injectable()
export class SportarrActionHandler {
  constructor(
    private readonly servarrApi: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly settings: SettingsDataService,
    private readonly downloadClient: DownloadClientApiService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SportarrActionHandler.name);
  }

  public async handleAction(
    collection: Collection,
    media: CollectionMedia,
  ): Promise<boolean> {
    const mediaServer = await this.mediaServerFactory.getService();
    const client = await this.servarrApi.getSportarrApiClient(
      collection.sportarrSettingsId,
    );

    let mediaData: MediaItem | undefined = undefined;
    if (['season', 'episode'].includes(collection.type)) {
      mediaData = await mediaServer.getMetadata(media.mediaServerId);
    }

    // Resolve the league from the tvdb alias Sportarr stamps on the Plex item's
    // guid (present on season/episode members too, via the show). Prefer the id
    // Maintainerr already stored on the collection member; fall back to the
    // item's live metadata when it wasn't captured. No fuzzy matching - it is
    // an exact id lookup.
    let externalId = sportarrLeagueExternalIdFromTvdbAlias(media.tvdbId);
    if (!externalId) {
      // The alias lives on the show's guid, so follow a season/episode member
      // up to its show before reading it.
      let showItem =
        mediaData ?? (await mediaServer.getMetadata(media.mediaServerId));
      const showId = showItem?.grandparentId ?? showItem?.parentId;
      if (showId) {
        showItem = await mediaServer.getMetadata(showId);
      }
      externalId = sportarrLeagueExternalIdFromProviderIds(
        showItem?.providerIds?.tvdb,
      );
    }
    if (!externalId) {
      this.logger.log(
        `Couldn't resolve a Sportarr league id for media server item ${media.mediaServerId}. No action was taken.`,
      );
      return false;
    }

    const league = await client.getLeagueByExternalId(externalId);
    if (league === undefined) {
      // Fail closed on a transient lookup failure rather than acting on a blip.
      this.logger.log(
        `Couldn't reach Sportarr to resolve league ${externalId} for media server item ${media.mediaServerId}. No action was taken; will retry next run.`,
      );
      return false;
    }
    if (!league) {
      this.logger.log(
        `Media server item ${media.mediaServerId} resolved to Sportarr league ${externalId}, which is not tracked in Sportarr. No action was taken.`,
      );
      return false;
    }

    switch (collection.arrAction) {
      case ServarrAction.DELETE:
        return this.handleDelete(client, collection, league, mediaData);
      case ServarrAction.UNMONITOR:
        return this.handleUnmonitor(client, collection, league, mediaData);
      case ServarrAction.CHANGE_QUALITY_PROFILE:
        return this.handleChangeQualityProfile(client, collection, league);
      default:
        this.logger.warn(
          `[Sportarr] Action ${ServarrAction[collection.arrAction]} is not supported by the Sportarr connection. No action was taken.`,
        );
        return false;
    }
  }

  private async handleDelete(
    client: Awaited<ReturnType<ServarrService['getSportarrApiClient']>>,
    collection: Collection,
    league: SportarrLeague,
    mediaData: MediaItem | undefined,
  ): Promise<boolean> {
    // Capture the download history before any delete (a whole-league delete
    // removes the league and its events, so the history is gone afterwards).
    const cleanupEnabled = this.settings.downloadClientConfigured();
    const history = cleanupEnabled
      ? await client.getLeagueDownloadHistory(league.id)
      : [];

    switch (collection.type) {
      case 'episode': {
        const event = await this.resolveEvent(client, league, mediaData);
        if (!event) {
          this.logger.warn(
            `[Sportarr] Couldn't identify the event for '${mediaData?.title ?? league.name}'. No delete action was taken.`,
          );
          return false;
        }
        // Unmonitor before deleting the file: deleting a still-monitored
        // event's file would just make Sportarr re-download it. Fail closed
        // when the unmonitor can't be confirmed and leave the file in place;
        // the action is retried next run.
        if (!(await client.setEventMonitored(event.id, false))) {
          this.logger.warn(
            `[Sportarr] Couldn't confirm event '${event.title}' was unmonitored; leaving its file in place.`,
          );
          return false;
        }
        if (!(await client.deleteEventFiles(event.id))) {
          return false;
        }
        this.logger.log(
          `[Sportarr] Deleted event '${event.title}' from league '${league.name}'`,
        );
        // Remove only downloads whose every backed event is this one.
        await this.removeCoveredDownloads(history, new Set([event.id]));
        return true;
      }
      case 'season': {
        const seasonIndex = this.seasonIndex(mediaData);
        if (seasonIndex === undefined) {
          this.logger.warn(
            `[Sportarr] Couldn't identify the season for '${league.name}'. No delete action was taken.`,
          );
          return false;
        }
        const events = await client.getLeagueEvents(league.id);
        if (events === undefined) {
          // The fetch failed - deleting nothing and reporting success would
          // remove the item from the collection with its files still on disk.
          return false;
        }
        // Match on seasonNumber (what the media server exposes as the season
        // index). The season LABEL can be a cross-year string like
        // "2025-2026", so derive it from the matched events for the toggle.
        const seasonEvents = events.filter(
          (e) => e.seasonNumber === seasonIndex,
        );
        if (seasonEvents.length === 0) {
          // League is tracked but Sportarr has no events for this season, so
          // there is nothing to delete or unmonitor.
          this.logger.log(
            `[Sportarr] Season ${seasonIndex} of league '${league.name}' has no events in Sportarr. Nothing to delete.`,
          );
          return true;
        }
        const season = seasonEvents[0].season;
        if (season == null) {
          this.logger.warn(
            `[Sportarr] Season ${seasonIndex} of league '${league.name}' has no season label; can't unmonitor it. No delete action was taken.`,
          );
          return false;
        }
        // Unmonitor the season before deleting its files (same ordering and
        // fail-closed reasoning as the episode scope above).
        if (!(await client.setSeasonMonitored(league.id, season, false))) {
          this.logger.warn(
            `[Sportarr] Couldn't confirm season ${season} of league '${league.name}' was unmonitored; leaving its files in place.`,
          );
          return false;
        }
        const withFiles = seasonEvents.filter((e) => e.hasFile);
        let success = true;
        for (const event of withFiles) {
          success = (await client.deleteEventFiles(event.id)) && success;
        }
        if (!success) {
          this.logger.warn(
            `[Sportarr] Some event files of season ${season} in league '${league.name}' couldn't be deleted; will retry next run.`,
          );
          return false;
        }
        this.logger.log(
          `[Sportarr] Deleted ${withFiles.length} event file(s) from season ${season} of league '${league.name}'`,
        );
        // Remove downloads fully covered by this season (a cross-season pack
        // that also backs a kept season is left alone).
        await this.removeCoveredDownloads(
          history,
          new Set(seasonEvents.map((e) => e.id)),
        );
        return true;
      }
      default: {
        if (!(await client.deleteLeague(league.id, true))) {
          return false;
        }
        this.logger.log(`[Sportarr] Deleted league '${league.name}'`);
        // The whole league is gone, so every download it produced is removable.
        await this.removeCoveredDownloads(
          history,
          new Set(history.map((h) => h.eventId)),
        );
        return true;
      }
    }
  }

  // Removes the downloads whose every backed event is in the deleted set, so a
  // pack that also backs a kept event stays in the client. Mirrors the Sonarr
  // handler's coverage rule. No-op when download-client cleanup is off or
  // nothing is fully covered.
  private async removeCoveredDownloads(
    history: SportarrDownloadHistoryItem[],
    deletedEventIds: Set<number>,
  ): Promise<void> {
    if (history.length === 0) {
      return;
    }

    // Group case-insensitively: the same torrent can appear with differing
    // hash casing across grab/import rows, and a split group would let a pack
    // that still backs a kept event be removed via its fully-covered casing.
    const eventsByDownloadId = new Map<string, Set<number>>();
    for (const row of history) {
      const downloadId = row.downloadId?.trim().toLowerCase();
      if (!downloadId) {
        continue;
      }
      const set = eventsByDownloadId.get(downloadId) ?? new Set<number>();
      set.add(row.eventId);
      eventsByDownloadId.set(downloadId, set);
    }

    const toRemove: string[] = [];
    for (const [downloadId, events] of eventsByDownloadId) {
      if ([...events].every((eventId) => deletedEventIds.has(eventId))) {
        toRemove.push(downloadId);
      }
    }

    if (toRemove.length > 0) {
      await this.downloadClient.removeDownloads(toRemove);
    }
  }

  private async handleUnmonitor(
    client: Awaited<ReturnType<ServarrService['getSportarrApiClient']>>,
    collection: Collection,
    league: SportarrLeague,
    mediaData: MediaItem | undefined,
  ): Promise<boolean> {
    switch (collection.type) {
      case 'episode': {
        const event = await this.resolveEvent(client, league, mediaData);
        if (!event) {
          this.logger.warn(
            `[Sportarr] Couldn't identify the event for '${mediaData?.title ?? league.name}'. No unmonitor action was taken.`,
          );
          return false;
        }
        if (!(await client.setEventMonitored(event.id, false))) {
          return false;
        }
        this.logger.log(
          `[Sportarr] Unmonitored event '${event.title}' in league '${league.name}'`,
        );
        return true;
      }
      case 'season': {
        const seasonIndex = this.seasonIndex(mediaData);
        if (seasonIndex === undefined) {
          this.logger.warn(
            `[Sportarr] Couldn't identify the season for '${league.name}'. No unmonitor action was taken.`,
          );
          return false;
        }
        const events = await client.getLeagueEvents(league.id);
        if (events === undefined) {
          return false;
        }
        // Same seasonNumber-to-label derivation as the delete path: the
        // toggle endpoint keys on the label, which can be a cross-year string.
        const seasonEvents = events.filter(
          (e) => e.seasonNumber === seasonIndex,
        );
        if (seasonEvents.length === 0) {
          this.logger.log(
            `[Sportarr] Season ${seasonIndex} of league '${league.name}' has no events in Sportarr. Nothing to unmonitor.`,
          );
          return true;
        }
        const season = seasonEvents[0].season;
        if (season == null) {
          this.logger.warn(
            `[Sportarr] Season ${seasonIndex} of league '${league.name}' has no season label; can't unmonitor it.`,
          );
          return false;
        }
        if (!(await client.setSeasonMonitored(league.id, season, false))) {
          return false;
        }
        this.logger.log(
          `[Sportarr] Unmonitored season ${season} of league '${league.name}'`,
        );
        return true;
      }
      default: {
        if (!(await client.setLeagueMonitored(league.id, false))) {
          return false;
        }
        this.logger.log(`[Sportarr] Unmonitored league '${league.name}'`);
        return true;
      }
    }
  }

  private async handleChangeQualityProfile(
    client: Awaited<ReturnType<ServarrService['getSportarrApiClient']>>,
    collection: Collection,
    league: SportarrLeague,
  ): Promise<boolean> {
    if (collection.type === 'season' || collection.type === 'episode') {
      // The profile lives on the league; applying it from a season/episode
      // item would silently change every other season the user kept.
      this.logger.warn(
        `[Sportarr] CHANGE_QUALITY_PROFILE is not supported for type: ${collection.type}. Quality profiles can only be changed for entire leagues.`,
      );
      return false;
    }
    const targetProfileId = collection.sportarrQualityProfileId;
    if (targetProfileId == null) {
      this.logger.warn(
        `[Sportarr] No target quality profile set for league '${league.name}'. No change was applied.`,
      );
      return false;
    }
    if (!Number.isInteger(targetProfileId) || targetProfileId <= 0) {
      this.logger.warn(
        `[Sportarr] Invalid quality profile ID (${targetProfileId}) for league '${league.name}'. No change was applied.`,
      );
      return false;
    }
    if (league.qualityProfileId === targetProfileId) {
      return true;
    }
    if (!(await client.setLeagueQualityProfile(league.id, targetProfileId))) {
      return false;
    }
    this.logger.log(
      `[Sportarr] Changed quality profile for league '${league.name}' to profile ID ${targetProfileId}`,
    );
    return true;
  }

  // The media server exposes the Sportarr season as the numeric season index
  // (parentIndex on an episode item, index on a season item). Matching keys on
  // the event's seasonNumber; the display label is derived from the matched
  // events where needed.
  private seasonIndex(mediaData: MediaItem | undefined): number | undefined {
    return mediaData?.grandparentId ? mediaData?.parentIndex : mediaData?.index;
  }

  private async resolveEvent(
    client: Awaited<ReturnType<ServarrService['getSportarrApiClient']>>,
    league: SportarrLeague,
    mediaData: MediaItem | undefined,
  ): Promise<SportarrEvent | undefined> {
    if (
      mediaData?.index === undefined ||
      mediaData?.parentIndex === undefined
    ) {
      return undefined;
    }
    // A failed events fetch yields undefined, which callers treat the same as
    // "event not identified": fail closed, retry next run.
    const events = await client.getLeagueEvents(league.id);
    return events?.find(
      (e) =>
        e.seasonNumber === mediaData.parentIndex &&
        e.episodeNumber === mediaData.index,
    );
  }
}
