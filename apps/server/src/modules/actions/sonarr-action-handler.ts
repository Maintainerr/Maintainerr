import { MediaItem, ServarrAction } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { SonarrSeries } from '../api/servarr-api/interfaces/sonarr.interface';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';

@Injectable()
export class SonarrActionHandler {
  constructor(
    private readonly servarrApi: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly metadataService: MetadataService,
    private readonly logger: MaintainerrLogger,
    private readonly seerrApi: SeerrApiService,
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

    // Fetch media data for index info (needed for season/episode actions)
    let mediaData: MediaItem | undefined = undefined;
    if (['season', 'episode'].includes(collection.type)) {
      mediaData = await mediaServer.getMetadata(media.mediaServerId);
    }

    // resolveIds() handles the hierarchy walk (episode→season→show) internally
    const ids = await this.metadataService.resolveIds(media.mediaServerId);
    const tvdbId = (ids?.['tvdb'] as number | undefined) ?? media.tvdbId;
    const tmdbId = (ids?.['tmdb'] as number | undefined) ?? media.tmdbId;

    if (!tvdbId) {
      this.logger.log(
        `Couldn't find correct TVDB ID for media server item ${media.mediaServerId}${tmdbId ? ` (TMDB: ${tmdbId})` : ''}. No action was taken. Please check this show manually`,
      );
      return false;
    }

    let sonarrMedia = await sonarrApiClient.getSeriesByTvdbId(tvdbId);

    if (!sonarrMedia?.id) {
      if (
        collection.arrAction !== ServarrAction.UNMONITOR &&
        collection.arrAction !== ServarrAction.UNMONITOR_SHOW_IF_EMPTY
      ) {
        this.logger.log(
          `Couldn't find show with TVDB ID ${tvdbId} in Sonarr for media server item ${media.mediaServerId}. Attempting to remove from the filesystem via media server.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
        return true;
      } else {
        this.logger.log(
          `Couldn't find show with TVDB ID ${tvdbId} in Sonarr for media server item ${media.mediaServerId}. No unmonitor action was taken.`,
        );
        return false;
      }
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

            if (!sonarrMedia) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );

            if (collection.arrAction === ServarrAction.DELETE_SHOW_IF_EMPTY) {
              await this.deleteShowIfEmpty(
                sonarrApiClient,
                collection.forceSeerr,
                media.tmdbId,
                tvdbId,
                mediaData?.index,
                collection.listExclusions,
              );
            }
            return true;
          case 'episode': {
            if (collection.arrAction === ServarrAction.DELETE_SHOW_IF_EMPTY) {
              this.logger.warn(
                `[Sonarr] DELETE_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
              );
              return false;
            }

            const episodeLookup = this.getEpisodeLookup(mediaData);

            if (!episodeLookup) {
              this.logger.warn(
                `[Sonarr] Couldn't identify episode '${mediaData?.title ?? media.mediaServerId}' for show '${sonarrMedia.title}'. No delete action was taken.`,
              );
              return false;
            }

            const deleted = await sonarrApiClient.UnmonitorDeleteEpisodes(
              sonarrMedia.id,
              episodeLookup.seasonNumber,
              episodeLookup.episodeNumbers,
              true,
              episodeLookup.airDate,
            );
            if (!deleted) return false;

            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.parentIndex} ${this.getEpisodeLogLabel(mediaData)} from show '${sonarrMedia.title}'`,
            );
            return true;
          }
          default: {
            if (collection.arrAction === ServarrAction.DELETE_SHOW_IF_EMPTY) {
              this.logger.warn(
                `[Sonarr] DELETE_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
              );
              return false;
            }
            const deleted = await sonarrApiClient.deleteShow(
              sonarrMedia.id,
              true,
              collection.listExclusions,
            );
            if (!deleted) return false;

            this.logger.log(`Removed show '${sonarrMedia.title}' from Sonarr`);
            return true;
          }
        }
      case ServarrAction.UNMONITOR:
      case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
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

            if (
              collection.arrAction === ServarrAction.UNMONITOR_SHOW_IF_EMPTY
            ) {
              await this.unmonitorShowIfEmptyAndEnded(sonarrApiClient, tvdbId);
            }
            return true;
          case 'episode': {
            if (
              collection.arrAction === ServarrAction.UNMONITOR_SHOW_IF_EMPTY
            ) {
              this.logger.warn(
                `[Sonarr] UNMONITOR_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
              );
              return false;
            }

            const episodeLookup = this.getEpisodeLookup(mediaData);

            if (!episodeLookup) {
              this.logger.warn(
                `[Sonarr] Couldn't identify episode '${mediaData?.title ?? media.mediaServerId}' for show '${sonarrMedia.title}'. No unmonitor action was taken.`,
              );
              return false;
            }

            const unmonitored = await sonarrApiClient.UnmonitorDeleteEpisodes(
              sonarrMedia.id,
              episodeLookup.seasonNumber,
              episodeLookup.episodeNumbers,
              false,
              episodeLookup.airDate,
            );
            if (!unmonitored) return false;

            this.logger.log(
              `[Sonarr] Unmonitored season ${mediaData?.parentIndex} ${this.getEpisodeLogLabel(mediaData)} from show '${sonarrMedia.title}'`,
            );
            return true;
          }
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
              // unmonitor show
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
              // unmonitor show
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

  private getEpisodeLookup(mediaData?: MediaItem):
    | {
        seasonNumber: number;
        episodeNumbers: number[];
        airDate?: Date;
      }
    | undefined {
    if (mediaData?.parentIndex === undefined) {
      return undefined;
    }

    if (mediaData.index !== undefined) {
      return {
        seasonNumber: mediaData.parentIndex,
        episodeNumbers: [mediaData.index],
      };
    }

    if (mediaData.originallyAvailableAt) {
      return {
        seasonNumber: mediaData.parentIndex,
        episodeNumbers: [],
        airDate: mediaData.originallyAvailableAt,
      };
    }

    return undefined;
  }

  private getEpisodeLogLabel(mediaData?: MediaItem): string {
    if (mediaData?.index !== undefined) {
      return `episode ${mediaData.index}`;
    }

    if (mediaData?.originallyAvailableAt) {
      return `episode airing ${
        mediaData.originallyAvailableAt.toISOString().split('T')[0]
      }`;
    }

    return 'episode';
  }

  /**
   * After a season deletion, re-fetches the series and deletes the show
   * from Sonarr if it is either ended with no remaining files, or if a
   * Seerr-managed continuing show has no remaining season requests.
   */
  private async deleteShowIfEmpty(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    forceSeerr: boolean,
    tmdbId: number,
    tvdbId: number,
    removedSeasonNumber: number | undefined,
    listExclusions: boolean | undefined,
  ): Promise<void> {
    const series = await sonarrApiClient.getSeriesByTvdbId(tvdbId);

    if (!series || (series.statistics?.episodeFileCount ?? 0) !== 0) return;

    if (series.status === 'ended') {
      await sonarrApiClient.deleteShow(series.id, true, listExclusions);
      this.logger.log(
        `[Sonarr] Show '${series.title}' is ended with no files remaining — deleted from Sonarr`,
      );
      return;
    }

    if (!forceSeerr || tmdbId == null || removedSeasonNumber == null) {
      return;
    }

    const hasRemainingSeerrRequests =
      await this.seerrApi.hasRemainingSeasonRequests(
        tmdbId,
        removedSeasonNumber,
      );

    if (hasRemainingSeerrRequests !== false) {
      return;
    }

    await sonarrApiClient.deleteShow(series.id, true, listExclusions);
    this.logger.log(
      `[Sonarr] Show '${series.title}' has no files and no remaining Seerr season requests — deleted from Sonarr`,
    );
  }

  /**
   * After a season unmonitor, re-fetches the series and unmonitors the show
   * if it has ended and has no remaining monitored seasons.
   */
  private async unmonitorShowIfEmptyAndEnded(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    tvdbId: number,
  ): Promise<void> {
    const series = await sonarrApiClient.getSeriesByTvdbId(tvdbId);

    if (!series || !this.isShowEmptyAndEnded(series, 'monitored')) return;

    series.monitored = false;
    await sonarrApiClient.updateSeries(series);
    this.logger.log(
      `[Sonarr] Show '${series.title}' is ended with no monitored seasons — unmonitored show`,
    );
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

    // mode === 'monitored'
    return series.seasons.every((s) => !s.monitored);
  }
}
