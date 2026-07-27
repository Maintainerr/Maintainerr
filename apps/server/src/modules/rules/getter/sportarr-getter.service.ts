import { MediaItem, MediaItemType } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { IMediaServerService } from '../../api/media-server/media-server.interface';
import { sportarrLeagueExternalIdFromProviderIds } from '../../api/servarr-api/helpers/sportarr-external-id';
import { SportarrEvent } from '../../api/servarr-api/interfaces/sportarr.interface';
import { ServarrService } from '../../api/servarr-api/servarr.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';
import { RulesDto } from '../dtos/rules.dto';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';

// Getter for the native Sportarr application. Resolution keys off the tvdb
// alias Sportarr stamps on its Plex items (reversed back to a league external
// id), then reads league/event fields from Sportarr's own /api/. Nothing here
// is shared with the Sonarr/Radarr getters.
@Injectable()
export class SportarrGetterService {
  plexProperties: Property[];

  constructor(
    private readonly servarrService: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SportarrGetterService.name);
    const ruleConstanst = new RuleConstants();
    this.plexProperties = ruleConstanst.applications.find(
      (el) => el.id === Application.SPORTARR,
    ).props;
  }

  private async getMediaServer(): Promise<IMediaServerService> {
    return this.mediaServerFactory.getService();
  }

  async get(
    id: number,
    libItem: MediaItem,
    dataType?: MediaItemType,
    ruleGroup?: RulesDto,
    _rule?: RuleDto,
    arrLookupCache?: ArrLookupCache,
  ) {
    if (!ruleGroup.collection?.sportarrSettingsId) {
      this.logger.error(
        `No Sportarr server configured for ${ruleGroup.collection?.title}`,
      );
      return null;
    }

    try {
      const prop = this.plexProperties.find((el) => el.id === id);

      // For season/episode scope, resolve up to the show item (the league
      // identity lives on the show's guid, not the child's) and capture the
      // Sportarr season (calendar year) and event index.
      let showItem = libItem;
      let seasonNumber: number | undefined;
      let eventIndex: number | undefined;

      if (dataType === 'season' || dataType === 'episode') {
        seasonNumber = libItem.grandparentId
          ? libItem.parentIndex
          : libItem.index;
        if (dataType === 'episode') {
          eventIndex = libItem.index;
        }
        const mediaServer = await this.getMediaServer();
        showItem = await mediaServer.getMetadata(
          libItem.grandparentId ? libItem.grandparentId : libItem.parentId,
        );
      }

      const settingsId = ruleGroup.collection.sportarrSettingsId;
      const client = await this.servarrService.getSportarrApiClient(settingsId);

      let externalId = sportarrLeagueExternalIdFromProviderIds(
        showItem?.providerIds?.tvdb,
      );
      if (!externalId) {
        // The rule executor can pass a lightweight library item whose
        // providerIds aren't populated. Re-fetch the show's full metadata to
        // read its Sportarr id from the guids before giving up. Memoized per
        // run (the same per-condition redundancy as #3285): every property of
        // every episode of a league would otherwise re-fetch the same show.
        // Evict an empty result so a transient media-server failure retries
        // next condition.
        const mediaServer = await this.getMediaServer();
        const fetchShow = () => mediaServer.getMetadata(showItem?.id);
        const fullShow = await (arrLookupCache
          ? arrLookupCache.memoize(
              `metadata:sportarr:show:${showItem?.id}`,
              fetchShow,
              (item) => item === undefined,
            )
          : fetchShow());
        externalId = sportarrLeagueExternalIdFromProviderIds(
          fullShow?.providerIds?.tvdb,
        );
      }
      if (!externalId) {
        this.logger.warn(
          `Failed to resolve a Sportarr league id for '${libItem.title}' (media server ID '${libItem.id}'). No Sportarr query could be made.`,
        );
        // An empty resolution cannot distinguish "item carries no Sportarr
        // alias" from a transient media-server failure on the metadata reads
        // above, so it must stay `undefined` - `null` would defeat the
        // transient-removal guard and splice items out of collections during
        // an outage (same reasoning as the Sonarr getter, #3307).
        return undefined;
      }

      // The /leagues list is identical for every item in the run, so pull it
      // once through the run-scoped memo and hand it to the resolver instead
      // of re-fetching it per league. Evict a failed (undefined) fetch.
      const resolveLeagues = () =>
        arrLookupCache
          ? arrLookupCache.memoize(
              `sportarr:${settingsId}:leagues`,
              () => client.getLeagues(),
              (leagues) => leagues === undefined,
            )
          : client.getLeagues();

      // League resolution is identical for every season/episode of a league,
      // so dedupe it through the run-scoped memo (evicting a failed lookup so
      // a transient error doesn't mark the league unresolved for the run).
      const lookupLeague = async () => {
        const leagues = await resolveLeagues();
        if (leagues === undefined) {
          return undefined;
        }
        return client.getLeagueByExternalId(externalId, leagues);
      };
      const resolveLeague = () =>
        arrLookupCache
          ? arrLookupCache.memoize(
              `sportarr:${settingsId}:league:${externalId}`,
              lookupLeague,
              (league) => league === undefined,
            )
          : lookupLeague();

      const league = await resolveLeague();
      if (league === undefined) {
        // The lookup itself failed - fail closed rather than substitute
        // values, matching the Sonarr getter's transient-failure handling.
        return undefined;
      }
      if (!league) {
        this.logger.warn(
          `'${libItem.title}' resolved to Sportarr league ${externalId}, which is not tracked in Sportarr.`,
        );
        return null;
      }

      // Both resolvers evict a failed (undefined) fetch from the run-scoped
      // memo so a transient error isn't pinned for the rest of the run.
      const resolveEvents = () =>
        arrLookupCache
          ? arrLookupCache.memoize(
              `sportarr:${settingsId}:events:${league.id}`,
              () => client.getLeagueEvents(league.id),
              (events) => events === undefined,
            )
          : client.getLeagueEvents(league.id);

      const resolveProfiles = () =>
        arrLookupCache
          ? arrLookupCache.memoize(
              `sportarr:${settingsId}:profiles`,
              () => client.getQualityProfiles(),
              (profiles) => profiles === undefined,
            )
          : client.getQualityProfiles();

      switch (prop.name) {
        case 'addDate': {
          return league.added ? new Date(league.added) : null;
        }
        case 'sport': {
          return league.sport ?? null;
        }
        case 'leagueTitle': {
          return league.name ?? null;
        }
        case 'leagueId': {
          return league.id;
        }
        case 'qualityProfileId': {
          return league.qualityProfileId ?? null;
        }
        case 'qualityProfileName': {
          if (league.qualityProfileId == null) return null;
          const profiles = await resolveProfiles();
          if (profiles === undefined) {
            // The profile fetch failed - fail closed, don't report "no name".
            return undefined;
          }
          return (
            profiles.find((p) => p.id === league.qualityProfileId)?.name ?? null
          );
        }
        case 'monitored': {
          if (dataType === 'episode') {
            const events = await resolveEvents();
            if (events === undefined) return undefined;
            const event = this.findEvent(events, seasonNumber, eventIndex);
            return event ? event.monitored : null;
          }
          if (dataType === 'season') {
            const allEvents = await resolveEvents();
            if (allEvents === undefined) return undefined;
            const events = this.seasonEvents(allEvents, seasonNumber);
            return events.length > 0 ? events.some((e) => e.monitored) : null;
          }
          return league.monitored;
        }
        case 'events': {
          const events = await resolveEvents();
          // A failed fetch must not read as "0 events" - a count of 0 is what
          // removal rules key on, so this would fail open during an outage.
          if (events === undefined) return undefined;
          const scoped =
            dataType === 'season'
              ? this.seasonEvents(events, seasonNumber)
              : events;
          return scoped.length;
        }
        case 'downloadedEvents': {
          const events = await resolveEvents();
          if (events === undefined) return undefined;
          const scoped =
            dataType === 'season'
              ? this.seasonEvents(events, seasonNumber)
              : events;
          return scoped.filter((e) => e.hasFile).length;
        }
        case 'hasFutureEvents': {
          // True when the league (or scoped season) still has an event dated in
          // the future - i.e. it is still ongoing rather than a wrapped-up
          // season. Lets retention rules keep in-progress leagues and only act
          // on ended ones. Any scheduled event counts, monitored or not.
          const events = await resolveEvents();
          if (events === undefined) return undefined;
          const scoped =
            dataType === 'season'
              ? this.seasonEvents(events, seasonNumber)
              : events;
          const now = new Date();
          return scoped.some((e) => {
            const date = e.broadcastDate ?? e.eventDate;
            return date != null && new Date(date) > now;
          });
        }
        case 'seasonNumber': {
          if (dataType === 'episode') {
            const events = await resolveEvents();
            if (events === undefined) return undefined;
            const event = this.findEvent(events, seasonNumber, eventIndex);
            return event?.seasonNumber ?? seasonNumber ?? null;
          }
          return seasonNumber ?? null;
        }
        case 'episodeNumber': {
          const events = await resolveEvents();
          if (events === undefined) return undefined;
          const event = this.findEvent(events, seasonNumber, eventIndex);
          return event?.episodeNumber ?? eventIndex ?? null;
        }
        case 'eventDate': {
          const events = await resolveEvents();
          if (events === undefined) return undefined;
          const event = this.findEvent(events, seasonNumber, eventIndex);
          if (!event) return null;
          const date = event.broadcastDate ?? event.eventDate;
          return date ? new Date(date) : null;
        }
        case 'hasFile': {
          const events = await resolveEvents();
          if (events === undefined) return undefined;
          const event = this.findEvent(events, seasonNumber, eventIndex);
          return event ? event.hasFile : null;
        }
        case 'filePath': {
          const events = await resolveEvents();
          if (events === undefined) return undefined;
          const event = this.findEvent(events, seasonNumber, eventIndex);
          return event?.filePath ?? null;
        }
        default: {
          return null;
        }
      }
    } catch (e) {
      this.logger.warn('Sportarr-Getter - Action failed');
      this.logger.debug(e);
      return undefined;
    }
  }

  private seasonEvents(
    events: SportarrEvent[],
    seasonNumber: number | undefined,
  ): SportarrEvent[] {
    if (seasonNumber === undefined) return events;
    return events.filter((e) => e.seasonNumber === seasonNumber);
  }

  private findEvent(
    events: SportarrEvent[],
    seasonNumber: number | undefined,
    eventIndex: number | undefined,
  ): SportarrEvent | undefined {
    if (eventIndex === undefined) return undefined;
    return this.seasonEvents(events, seasonNumber).find(
      (e) => e.episodeNumber === eventIndex,
    );
  }
}
