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
  findMetadataLookupMatch,
  formatMetadataLookupCandidates,
} from '../metadata/metadata-lookup.util';

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
  ): Promise<boolean> {
    const mediaServer = await this.mediaServerFactory.getService();
    const sonarrApiClient = await this.servarrApi.getSonarrApiClient(
      collection.sonarrSettingsId,
    );

    let mediaData: MediaItem | undefined = undefined;

    if (['season', 'episode'].includes(collection.type)) {
      mediaData = await mediaServer.getMetadata(media.mediaServerId);
    }

    const lookupCandidates =
      await this.metadataService.resolveLookupCandidatesForService(
        media.mediaServerId,
        'sonarr',
        {
          tvdb: media.tvdbId,
          tmdb: media.tmdbId,
        },
      );

    if (lookupCandidates.length === 0) {
      this.logger.log(
        `Couldn't resolve any supported external IDs for media server item ${media.mediaServerId}. No action was taken. Please check this show manually.`,
      );
      return false;
    }

    const matchedResult = await findMetadataLookupMatch(lookupCandidates, {
      tvdb: (id) => sonarrApiClient.getSeriesByTvdbId(id),
    });
    let sonarrMedia = matchedResult?.result;

    if (!sonarrMedia?.id) {
      const attemptedIds = formatMetadataLookupCandidates(lookupCandidates);

      if (
        collection.arrAction !== ServarrAction.UNMONITOR &&
        collection.arrAction !== ServarrAction.UNMONITOR_SHOW_IF_EMPTY
      ) {
        this.logger.log(
          `Couldn't find show in Sonarr using resolved external IDs [${attemptedIds}] for media server item ${media.mediaServerId}. Attempting to remove from the filesystem via media server.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
        return true;
      } else {
        this.logger.log(
          `Couldn't find show in Sonarr using resolved external IDs [${attemptedIds}] for media server item ${media.mediaServerId}. No unmonitor action was taken.`,
        );
        return false;
      }
    }

    switch (collection.arrAction) {
      case ServarrAction.DELETE_SHOW_IF_EMPTY:
        if (collection.type !== 'season') {
          this.logger.warn(
            `[Sonarr] DELETE_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
          );
          break;
        }
        sonarrMedia = await sonarrApiClient.unmonitorSeasons(
          sonarrMedia.id,
          mediaData?.index,
          true,
        );

        if (!sonarrMedia) {
          return false;
        }

        this.logger.log(
          `[Sonarr] Removed season ${mediaData?.index} from show '${sonarrMedia.title}'`,
        );
        await this.deleteShowIfEmpty(
          sonarrApiClient,
          matchedResult.candidate,
          media.tmdbId,
          mediaData?.index,
          collection.listExclusions,
        );
        return true;
      case ServarrAction.DELETE:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              true,
            );

            if (!sonarrMedia) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            return true;
          case 'episode':
            if (
              !(await sonarrApiClient.UnmonitorDeleteEpisodes(
                sonarrMedia.id,
                mediaData?.parentIndex,
                [mediaData?.index],
                true,
              ))
            ) {
              return false;
            }
            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.parentIndex} episode ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            return true;
          default:
            if (
              !(await sonarrApiClient.deleteShow(
                sonarrMedia.id,
                true,
                collection.listExclusions,
              ))
            ) {
              return false;
            }
            this.logger.log(`Removed show '${sonarrMedia.title}' from Sonarr`);
            return true;
        }
        break;
      case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
        if (collection.type !== 'season') {
          this.logger.warn(
            `[Sonarr] UNMONITOR_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
          );
          break;
        }
        sonarrMedia = await sonarrApiClient.unmonitorSeasons(
          sonarrMedia.id,
          mediaData?.index,
          false,
        );

        if (!sonarrMedia) {
          return false;
        }

        this.logger.log(
          `[Sonarr] Unmonitored season ${mediaData?.index} from show '${sonarrMedia.title}'`,
        );
        await this.unmonitorShowIfEmptyAndEnded(
          sonarrApiClient,
          matchedResult.candidate,
        );
        return true;
      case ServarrAction.UNMONITOR:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              false,
            );

            if (!sonarrMedia) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Unmonitored season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            return true;
          case 'episode':
            if (
              !(await sonarrApiClient.UnmonitorDeleteEpisodes(
                sonarrMedia.id,
                mediaData?.parentIndex,
                [mediaData?.index],
                false,
              ))
            ) {
              return false;
            }
            this.logger.log(
              `[Sonarr] Unmonitored season ${mediaData?.parentIndex} episode ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            return true;
          default:
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'all',
              false,
            );

            if (sonarrMedia) {
              sonarrMedia.monitored = false;
              if (!(await sonarrApiClient.updateSeries(sonarrMedia))) {
                return false;
              }
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}'`,
              );
              return true;
            }

            return false;
        }
      case ServarrAction.UNMONITOR_DELETE_ALL:
        switch (collection.type) {
          case 'show':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'all',
              true,
            );

            if (sonarrMedia) {
              sonarrMedia.monitored = false;
              if (!(await sonarrApiClient.updateSeries(sonarrMedia))) {
                return false;
              }
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and removed all episodes`,
              );
              return true;
            }

            return false;
          default:
            this.logger.warn(
              `[Sonarr] UNMONITOR_DELETE_ALL is not supported for type: ${collection.type}`,
            );
            return false;
        }
      case ServarrAction.UNMONITOR_DELETE_EXISTING:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              true,
              true,
            );

            if (!sonarrMedia) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Removed existing episodes from season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            return true;
          case 'show':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'existing',
              true,
            );

            if (sonarrMedia) {
              sonarrMedia.monitored = false;
              if (!(await sonarrApiClient.updateSeries(sonarrMedia))) {
                return false;
              }
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and removed existing episodes`,
              );
              return true;
            }

            return false;
          default:
            this.logger.warn(
              `[Sonarr] UNMONITOR_DELETE_EXISTING is not supported for type: ${collection.type}`,
            );
            return false;
        }
    }

    return false;
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

      // Bail on true (remaining requests) or undefined (Seerr lookup failed) — only delete on explicit false
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
