import { EMediaDataType } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { RadarrActionHandler } from '../actions/radarr-action-handler';
import { SonarrActionHandler } from '../actions/sonarr-action-handler';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { OverseerrApiService } from '../api/overseerr-api/overseerr-api.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsService } from '../settings/settings.service';
import { CollectionsService } from './collections.service';
import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';
import { ServarrAction } from './interfaces/collection.interface';

@Injectable()
export class CollectionHandler {
  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly collectionService: CollectionsService,
    private readonly overseerrApi: OverseerrApiService,
    private readonly settings: SettingsService,
    private readonly radarrActionHandler: RadarrActionHandler,
    private readonly sonarrActionHandler: SonarrActionHandler,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(CollectionHandler.name);
  }

  /**
   * Get the appropriate media server service based on current settings
   */
  private async getMediaServer(): Promise<IMediaServerService> {
    return this.mediaServerFactory.getService();
  }

  public async handleMedia(collection: Collection, media: CollectionMedia) {
    if (collection.arrAction === ServarrAction.DO_NOTHING) {
      return;
    }

    const mediaServer = await this.getMediaServer();
    const libraries = await mediaServer.getLibraries();
    const library = libraries.find((e) => e.id === collection.libraryId.toString());

    // TODO Media should only be removed from the collection if the handle action is performed successfully
    await this.collectionService.removeFromCollection(collection.id, [
      {
        mediaServerId: media.mediaServerId,
      },
    ]);

    // update handled media amount
    collection.handledMediaAmount++;

    // save a log record for the handled media item
    await this.collectionService.CollectionLogRecordForChild(
      media.mediaServerId,
      collection.id,
      'handle',
    );

    await this.collectionService.saveCollection(collection);

    if (library?.type === 'movie' && collection.radarrSettingsId) {
      await this.radarrActionHandler.handleAction(collection, media);
    } else if (library?.type == 'show' && collection.sonarrSettingsId) {
      await this.sonarrActionHandler.handleAction(collection, media);
    } else if (!collection.radarrSettingsId && !collection.sonarrSettingsId) {
      if (collection.arrAction !== ServarrAction.UNMONITOR) {
        this.logger.log(
          `Couldn't utilize *arr to find and remove the media with id ${media.mediaServerId}. Attempting to remove from the filesystem via media server. No unmonitor action was taken.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
      } else {
        this.logger.log(
          `*arr unmonitor action isn't possible, since *arr is not available. Didn't unmonitor media with id ${media.mediaServerId}.}`,
        );
      }
    }

    // Only remove requests & file if needed
    if (collection.arrAction !== ServarrAction.UNMONITOR) {
      // overseerr, if forced. Otherwise rely on media sync
      if (this.settings.overseerrConfigured() && collection.forceOverseerr) {
        switch (collection.type) {
          case EMediaDataType.SEASONS:
            const mediaDataSeason = await mediaServer.getMetadata(
              media.mediaServerId,
            );

            if (mediaDataSeason?.index !== undefined) {
              await this.overseerrApi.removeSeasonRequest(
                media.tmdbId,
                mediaDataSeason.index,
              );

              this.logger.log(
                `[Overseerr] Removed request of season ${mediaDataSeason.index} from show with tmdbid '${media.tmdbId}'`,
              );
            }
            break;
          case EMediaDataType.EPISODES:
            const mediaDataEpisode = await mediaServer.getMetadata(
              media.mediaServerId,
            );

            if (mediaDataEpisode?.parentIndex !== undefined) {
              await this.overseerrApi.removeSeasonRequest(
                media.tmdbId,
                mediaDataEpisode.parentIndex,
              );

              this.logger.log(
                `[Overseerr] Removed request of season ${mediaDataEpisode.parentIndex} from show with tmdbid '${media.tmdbId}'. Because episode ${mediaDataEpisode.index} was removed.'`,
              );
            }
            break;
          default:
            await this.overseerrApi.removeMediaByTmdbId(
              media.tmdbId,
              library?.type === 'show' ? 'tv' : 'movie',
            );
            this.logger.log(
              `[Overseerr] Removed requests of media with tmdbid '${media.tmdbId}'`,
            );
            break;
        }
      }
    }
  }
}
