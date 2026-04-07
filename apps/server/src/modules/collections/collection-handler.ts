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
import { ServarrAction } from './interfaces/collection.interface';

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
        collection.arrAction !== ServarrAction.UNMONITOR_SHOW_IF_EMPTY &&
        collection.arrAction !== ServarrAction.CHANGE_QUALITY_PROFILE
      ) {
        this.logger.log(
          `Couldn't utilize *arr to find and remove the media with id ${media.mediaServerId}. Attempting to remove from the filesystem via media server. No unmonitor action was taken.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
        actionHandled = true;
      } else {
        this.logger.log(
          `*arr action isn't possible without *arr configured. No action was taken for media with id ${media.mediaServerId}.`,
        );
      }
    }

    if (!actionHandled) {
      return false;
    }

    // Only remove requests & file if needed
    if (
      collection.arrAction !== ServarrAction.UNMONITOR &&
      collection.arrAction !== ServarrAction.UNMONITOR_SHOW_IF_EMPTY &&
      collection.arrAction !== ServarrAction.DELETE_SHOW_IF_EMPTY &&
      collection.arrAction !== ServarrAction.CHANGE_QUALITY_PROFILE
    ) {
      // Seerr, if forced. Otherwise rely on media sync
      if (this.settings.seerrConfigured() && collection.forceSeerr) {
        const ids = await this.metadataService.resolveIdsForService(
          media.mediaServerId,
          'seerr',
        );
        const tmdbId = (ids?.tmdb as number | undefined) ?? media.tmdbId;

        if (!tmdbId) {
          this.logger.warn(
            `[Seerr] Could not resolve TMDB ID for media server ID ${media.mediaServerId}. Skipping Seerr request removal.`,
          );
        } else {
          switch (collection.type) {
            case 'season': {
              const mediaDataSeason = await mediaServer.getMetadata(
                media.mediaServerId,
              );

              if (mediaDataSeason?.index !== undefined) {
                await this.seerrApi.removeSeasonRequest(
                  tmdbId,
                  mediaDataSeason.index,
                );

                this.logger.log(
                  `[Seerr] Removed request of season ${mediaDataSeason.index} from show with TMDB ID '${tmdbId}'`,
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
                  tmdbId,
                  mediaDataEpisode.parentIndex,
                );

                this.logger.log(
                  `[Seerr] Removed request of season ${mediaDataEpisode.parentIndex} from show with TMDB ID '${tmdbId}'. Because episode ${mediaDataEpisode.index} was removed.`,
                );
              }
              break;
            }
            default:
              await this.seerrApi.removeMediaByTmdbId(
                tmdbId,
                library?.type === 'show' ? 'tv' : 'movie',
              );
              this.logger.log(
                `[Seerr] Removed requests of media with TMDB ID '${tmdbId}'`,
              );
              break;
          }
        }
      }
    }

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
