import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { SonarrSeries } from '../api/servarr-api/interfaces/sonarr.interface';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';
import {
  findServarrLookupMatch,
  formatServarrLookupCandidates,
} from '../metadata/servarr-lookup.util';

@Injectable()
export class SonarrActionHandler {
  constructor(
    private readonly servarrApi: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly seerrApi: SeerrApiService,
    private readonly metadataService: MetadataService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SonarrActionHandler.name);
  }

  public async handleAction(
    collection: Collection,
    media: CollectionMedia,
  ): Promise<void> {
    const mediaServer = await this.mediaServerFactory.getService();
    const sonarrApiClient = await this.servarrApi.getSonarrApiClient(
      collection.sonarrSettingsId,
    );

    let mediaData: MediaItem | undefined = undefined;

    if (['season', 'episode'].includes(collection.type)) {
      mediaData = await mediaServer.getMetadata(media.mediaServerId);
    }

    const ids = await this.metadataService.resolveIds(media.mediaServerId);
    const resolvedIds = {
      tmdb: (ids?.tmdb as number | undefined) ?? media.tmdbId,
      tvdb: (ids?.tvdb as number | undefined) ?? media.tvdbId,
    };
    const lookupCandidates =
      this.metadataService.buildServarrLookupCandidates(resolvedIds);

    if (lookupCandidates.length === 0) {
      this.logger.log(
        `Couldn't resolve any supported external IDs for media server item ${media.mediaServerId}. No action was taken. Please check this show manually.`,
      );
      return;
    }

    const matchedResult = await findServarrLookupMatch(lookupCandidates, {
      tmdb: (id) => sonarrApiClient.getSeriesByTmdbId(id),
      tvdb: (id) => sonarrApiClient.getSeriesByTvdbId(id),
    });
    let sonarrMedia = matchedResult?.result;

    if (!sonarrMedia?.id) {
      const attemptedIds = formatServarrLookupCandidates(lookupCandidates);

      if (
        collection.arrAction !== ServarrAction.UNMONITOR &&
        collection.arrAction !== ServarrAction.UNMONITOR_SHOW_IF_EMPTY
      ) {
        this.logger.log(
          `Couldn't find show in Sonarr using resolved external IDs [${attemptedIds}] for media server item ${media.mediaServerId}. Attempting to remove from the filesystem via media server.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
      } else {
        this.logger.log(
          `Couldn't find show in Sonarr using resolved external IDs [${attemptedIds}] for media server item ${media.mediaServerId}. No unmonitor action was taken.`,
        );
      }
      return;
    }

    switch (collection.arrAction) {
      case ServarrAction.DELETE:
      case ServarrAction.DELETE_SHOW_IF_EMPTY:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              true,
            );
            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );

            if (collection.arrAction === ServarrAction.DELETE_SHOW_IF_EMPTY) {
              await this.deleteShowIfEmpty(
                sonarrApiClient,
                matchedResult.candidate,
                resolvedIds.tmdb,
                mediaData?.index,
                collection.listExclusions,
              );
            }
            break;
          case 'episode':
            if (collection.arrAction === ServarrAction.DELETE_SHOW_IF_EMPTY) {
              this.logger.warn(
                `[Sonarr] DELETE_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
              );
              break;
            }
            await sonarrApiClient.UnmonitorDeleteEpisodes(
              sonarrMedia.id,
              mediaData?.parentIndex,
              [mediaData?.index],
              true,
            );
            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.parentIndex} episode ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            break;
          default:
            if (collection.arrAction === ServarrAction.DELETE_SHOW_IF_EMPTY) {
              this.logger.warn(
                `[Sonarr] DELETE_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
              );
              break;
            }
            await sonarrApiClient.deleteShow(
              sonarrMedia.id,
              true,
              collection.listExclusions,
            );
            this.logger.log(`Removed show '${sonarrMedia.title}' from Sonarr`);
            break;
        }
        break;
      case ServarrAction.UNMONITOR:
      case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              false,
            );
            this.logger.log(
              `[Sonarr] Unmonitored season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );

            if (
              collection.arrAction === ServarrAction.UNMONITOR_SHOW_IF_EMPTY
            ) {
              await this.unmonitorShowIfEmptyAndEnded(
                sonarrApiClient,
                matchedResult.candidate,
              );
            }
            break;
          case 'episode':
            if (
              collection.arrAction === ServarrAction.UNMONITOR_SHOW_IF_EMPTY
            ) {
              this.logger.warn(
                `[Sonarr] UNMONITOR_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
              );
              break;
            }
            await sonarrApiClient.UnmonitorDeleteEpisodes(
              sonarrMedia.id,
              mediaData?.parentIndex,
              [mediaData?.index],
              false,
            );
            this.logger.log(
              `[Sonarr] Unmonitored season ${mediaData?.parentIndex} episode ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            break;
          default:
            if (
              collection.arrAction === ServarrAction.UNMONITOR_SHOW_IF_EMPTY
            ) {
              this.logger.warn(
                `[Sonarr] UNMONITOR_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
              );
              break;
            }
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'all',
              false,
            );

            if (sonarrMedia) {
              // unmonitor show
              sonarrMedia.monitored = false;
              await sonarrApiClient.updateSeries(sonarrMedia);
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}'`,
              );
            }

            break;
        }
        break;
      case ServarrAction.UNMONITOR_DELETE_ALL:
        switch (collection.type) {
          case 'show':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'all',
              true,
            );

            if (sonarrMedia) {
              // unmonitor show
              sonarrMedia.monitored = false;
              await sonarrApiClient.updateSeries(sonarrMedia);
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and removed all episodes`,
              );
            }

            break;
          default:
            this.logger.warn(
              `[Sonarr] UNMONITOR_DELETE_ALL is not supported for type: ${collection.type}`,
            );
            break;
        }
        break;
      case ServarrAction.UNMONITOR_DELETE_EXISTING:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              true,
              true,
            );
            this.logger.log(
              `[Sonarr] Removed existing episodes from season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            break;
          case 'show':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'existing',
              true,
            );

            if (sonarrMedia) {
              // unmonitor show
              sonarrMedia.monitored = false;
              await sonarrApiClient.updateSeries(sonarrMedia);
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and removed existing episodes`,
              );
            }

            break;
          default:
            this.logger.warn(
              `[Sonarr] UNMONITOR_DELETE_EXISTING is not supported for type: ${collection.type}`,
            );
            break;
        }
        break;
    }
  }

  private async deleteShowIfEmpty(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    lookupCandidate: { providerKey: string; id: number },
    tmdbId: number | undefined,
    removedSeasonNumber: number | undefined,
    listExclusions: boolean | undefined,
  ): Promise<void> {
    const series = await this.refetchSeries(sonarrApiClient, lookupCandidate);

    if (!series?.id || !this.isShowEmpty(series, 'files')) {
      return;
    }

    const hasSeerrCheckInputs =
      tmdbId !== undefined && removedSeasonNumber !== undefined;

    if (this.seerrApi.isConfigured() && hasSeerrCheckInputs) {
      const hasRemainingRequests =
        await this.seerrApi.hasRemainingSeasonRequests(
          tmdbId,
          removedSeasonNumber,
        );

      if (hasRemainingRequests !== false) {
        return;
      }

      await sonarrApiClient.deleteShow(series.id, true, listExclusions);
      this.logger.log(
        `[Sonarr] Show '${series.title}' has no files and no remaining Seerr season requests - deleted from Sonarr`,
      );
      return;
    }

    if (!this.isShowEmptyAndEnded(series, 'monitored')) {
      return;
    }

    await sonarrApiClient.deleteShow(series.id, true, listExclusions);
    this.logger.log(
      `[Sonarr] Show '${series.title}' is ended with no files or monitored seasons remaining - deleted from Sonarr`,
    );
  }

  private async unmonitorShowIfEmptyAndEnded(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    lookupCandidate: { providerKey: string; id: number },
  ): Promise<void> {
    const series = await this.refetchSeries(sonarrApiClient, lookupCandidate);

    if (!series || !this.isShowEmptyAndEnded(series, 'monitored')) {
      return;
    }

    series.monitored = false;
    await sonarrApiClient.updateSeries(series);
    this.logger.log(
      `[Sonarr] Show '${series.title}' is ended with no monitored seasons - unmonitored show`,
    );
  }

  private async refetchSeries(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    lookupCandidate: { providerKey: string; id: number },
  ): Promise<SonarrSeries | undefined> {
    switch (lookupCandidate.providerKey) {
      case 'tmdb':
        return sonarrApiClient.getSeriesByTmdbId(lookupCandidate.id);
      case 'tvdb':
        return sonarrApiClient.getSeriesByTvdbId(lookupCandidate.id);
      default:
        return undefined;
    }
  }

  private isShowEmptyAndEnded(
    series: SonarrSeries,
    mode: 'files' | 'monitored',
  ): boolean {
    return series.status === 'ended' && this.isShowEmpty(series, mode);
  }

  private isShowEmpty(
    series: SonarrSeries,
    mode: 'files' | 'monitored',
  ): boolean {
    if (mode === 'files') {
      return (series.statistics?.episodeFileCount ?? 0) === 0;
    }

    return series.seasons.every((season) => !season.monitored);
  }
}
