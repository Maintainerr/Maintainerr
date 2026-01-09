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
  ): Promise<void> {
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
      return;
    }

    let sonarrMedia = await sonarrApiClient.getSeriesByTvdbId(tvdbId);

    if (!sonarrMedia?.id) {
      if (collection.arrAction !== ServarrAction.UNMONITOR) {
        this.logger.log(
          `Couldn't find correct tvdb id. No Sonarr action was taken for show: https://www.themoviedb.org/tv/${media.tmdbId}. Attempting to remove from the filesystem via media server.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
      } else {
        this.logger.log(
          `Couldn't find correct tvdb id. No unmonitor action was taken for show: https://www.themoviedb.org/tv/${media.tmdbId}`,
        );
      }
      return;
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
            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            break;
          case 'episode':
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
            await sonarrApiClient.deleteShow(
              sonarrMedia.id,
              true,
              collection.listExclusions,
            );
            this.logger.log(`Removed show ${sonarrMedia.title}' from Sonarr`);
            break;
        }
        break;
      case ServarrAction.UNMONITOR:
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
            break;
          case 'episode':
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
              `[Sonarr] Removed exisiting episodes from season ${mediaData?.index} from show '${sonarrMedia.title}'`,
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
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and Removed exisiting episodes`,
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
}
