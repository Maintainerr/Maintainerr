import { ServarrAction } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { RadarrActionHandler } from '../actions/radarr-action-handler';
import { SonarrActionHandler } from '../actions/sonarr-action-handler';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';
import { SettingsService } from '../settings/settings.service';
import { CollectionsService } from './collections.service';
import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';

@Injectable()
export class CollectionHandler {
  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly collectionService: CollectionsService,
    private readonly seerrApi: SeerrApiService,
    private readonly settings: SettingsService,
    private readonly metadataService: MetadataService,
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

  private async handleSeerrCleanup(
    collection: Collection,
    media: CollectionMedia,
    mediaServer: IMediaServerService,
    libraryType?: 'movie' | 'show',
  ): Promise<void> {
    if (
      collection.arrAction === ServarrAction.UNMONITOR ||
      collection.arrAction === ServarrAction.UNMONITOR_SHOW_IF_EMPTY ||
      collection.arrAction === ServarrAction.DELETE_SHOW_IF_EMPTY ||
      !this.settings.seerrConfigured() ||
      !collection.forceSeerr
    ) {
      return;
    }

    switch (collection.type) {
      case 'season': {
        const mediaDataSeason = await mediaServer.getMetadata(
          media.mediaServerId,
        );

        if (mediaDataSeason?.index !== undefined) {
          await this.seerrApi.removeSeasonRequest(
            media.tmdbId,
            mediaDataSeason.index,
          );

          this.logger.log(
            `[Seerr] Removed request of season ${mediaDataSeason.index} from show with tmdbid '${media.tmdbId}'`,
          );
        }
        break;
      }
      case 'episode': {
        const mediaDataEpisode = await mediaServer.getMetadata(
          media.mediaServerId,
        );

        if (mediaDataEpisode?.parentIndex !== undefined) {
          await this.seerrApi.removeSeasonRequest(
            media.tmdbId,
            mediaDataEpisode.parentIndex,
          );

          this.logger.log(
            `[Seerr] Removed request of season ${mediaDataEpisode.parentIndex} from show with tmdbid '${media.tmdbId}'. Because episode ${mediaDataEpisode.index} was removed.'`,
          );
        }
        break;
      }
      default:
        await this.seerrApi.removeMediaByTmdbId(
          media.tmdbId,
          libraryType === 'show' ? 'tv' : 'movie',
        );
        this.logger.log(
          `[Seerr] Removed requests of media with tmdbid '${media.tmdbId}'`,
        );
        break;
    }
  }

  public async handleMedia(
    collection: Collection,
    media: CollectionMedia,
  ): Promise<boolean> {
    if (collection.arrAction === ServarrAction.DO_NOTHING) {
      return false;
    }

    const mediaServer = await this.getMediaServer();
    const libraries = await mediaServer.getLibraries();
    const library = libraries.find(
      (e) => e.id === collection.libraryId.toString(),
    );

    let actionHandled = false;

    if (library?.type === 'movie' && collection.radarrSettingsId) {
      actionHandled = await this.radarrActionHandler.handleAction(
        collection,
        media,
      );
    } else if (library?.type == 'show' && collection.sonarrSettingsId) {
      actionHandled = await this.sonarrActionHandler.handleAction(
        collection,
        media,
      );
    } else if (!collection.radarrSettingsId && !collection.sonarrSettingsId) {
      if (
        collection.arrAction !== ServarrAction.UNMONITOR &&
        collection.arrAction !== ServarrAction.UNMONITOR_SHOW_IF_EMPTY
      ) {
        this.logger.log(
          `Couldn't utilize *arr to find and remove the media with id ${media.mediaServerId}. Attempting to remove from the filesystem via media server. No unmonitor action was taken.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
        actionHandled = true;
      } else {
        this.logger.log(
          `*arr unmonitor action isn't possible, since *arr is not available. Didn't unmonitor media with id ${media.mediaServerId}.}`,
        );
      }
    }

    if (!actionHandled) {
      return false;
    }

    await this.handleSeerrCleanup(
      collection,
      media,
      mediaServer,
      library?.type,
    );

    await this.collectionService.removeFromCollection(collection.id, [
      {
        mediaServerId: media.mediaServerId,
      },
    ]);

    collection.handledMediaAmount++;

    await this.collectionService.CollectionLogRecordForChild(
      media.mediaServerId,
      collection.id,
      'handle',
    );

    await this.collectionService.saveCollection(collection);

    return true;
  }
}
