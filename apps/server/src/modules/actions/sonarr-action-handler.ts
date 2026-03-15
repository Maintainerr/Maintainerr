import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { TmdbIdService } from '../api/tmdb-api/tmdb-id.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { MediaIdFinder } from './media-id-finder';

@Injectable()
export class SonarrActionHandler {
  constructor(
    private readonly servarrApi: ServarrService,
    private readonly tmdbIdService: TmdbIdService,
    private readonly mediaIdFinder: MediaIdFinder,
    private readonly logger: MaintainerrLogger,
    private readonly mediaServerFactory: MediaServerFactory,
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

    // get the tvdb id
    let tvdbId: number | undefined = undefined;
    switch (collection.type) {
      case 'season':
        mediaData = await mediaServer.getMetadata(media.mediaServerId);
        tvdbId = await this.mediaIdFinder.findTvdbId(
          mediaData?.parentId,
          media.tmdbId,
        );
        media.tmdbId = media.tmdbId
          ? media.tmdbId
          : (
              await this.tmdbIdService.getTmdbIdFromMediaServerId(
                mediaData?.parentId,
              )
            )?.id;
        break;
      case 'episode':
        mediaData = await mediaServer.getMetadata(media.mediaServerId);
        tvdbId = await this.mediaIdFinder.findTvdbId(
          mediaData?.grandparentId,
          media.tmdbId,
        );
        media.tmdbId = media.tmdbId
          ? media.tmdbId
          : (
              await this.tmdbIdService.getTmdbIdFromMediaServerId(
                mediaData?.grandparentId,
              )
            )?.id;
        break;
      default:
        tvdbId = await this.mediaIdFinder.findTvdbId(
          media.mediaServerId,
          media.tmdbId,
        );
        media.tmdbId = media.tmdbId
          ? media.tmdbId
          : (
              await this.tmdbIdService.getTmdbIdFromMediaServerId(
                media.mediaServerId,
              )
            )?.id;
        break;
    }

    if (!tvdbId) {
      this.logger.log(
        `Couldn't find correct tvdb id. No action was taken for show: https://www.themoviedb.org/tv/${media.tmdbId}. Please check this show manually`,
      );
      return false;
    }

    let sonarrMedia = await sonarrApiClient.getSeriesByTvdbId(tvdbId);

    if (!sonarrMedia?.id) {
      if (collection.arrAction !== ServarrAction.UNMONITOR) {
        this.logger.log(
          `Couldn't find correct tvdb id. No Sonarr action was taken for show: https://www.themoviedb.org/tv/${media.tmdbId}. Attempting to remove from the filesystem via media server.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
        return true;
      } else {
        this.logger.log(
          `Couldn't find correct tvdb id. No unmonitor action was taken for show: https://www.themoviedb.org/tv/${media.tmdbId}`,
        );
        return false;
      }
    }

    switch (collection.arrAction) {
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
          case 'episode': {
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
            const deleted = await sonarrApiClient.deleteShow(
              sonarrMedia.id,
              true,
              collection.listExclusions,
            );
            if (!deleted) return false;

            this.logger.log(`Removed show ${sonarrMedia.title}' from Sonarr`);
            return true;
          }
        }
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
          case 'episode': {
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
              `[Sonarr] Removed exisiting episodes from season ${mediaData?.index} from show '${sonarrMedia.title}'`,
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
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and Removed exisiting episodes`,
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
}
