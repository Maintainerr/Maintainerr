import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';

@Injectable()
export class RadarrActionHandler {
  constructor(
    private readonly servarrApi: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly metadataService: MetadataService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(RadarrActionHandler.name);
  }

  public async handleAction(
    collection: Collection,
    media: CollectionMedia,
  ): Promise<void> {
    const radarrApiClient = await this.servarrApi.getRadarrApiClient(
      collection.radarrSettingsId,
    );

    // Always resolve IDs through the metadata layer
    const ids = await this.metadataService.resolveIds(
      media.mediaServerId,
      'tmdb',
    );
    const tmdbId = (ids?.['tmdb'] as number | undefined) ?? media.tmdbId;

    if (tmdbId) {
      const radarrMedia = await radarrApiClient.getMovieByTmdbId(tmdbId);
      if (radarrMedia?.id) {
        switch (collection.arrAction) {
          case ServarrAction.DELETE:
          case ServarrAction.UNMONITOR_DELETE_EXISTING:
            await radarrApiClient.deleteMovie(
              radarrMedia.id,
              true,
              collection.listExclusions,
            );
            this.logger.log(
              `Removed movie with TMDB ID ${tmdbId} from filesystem & Radarr`,
            );
            break;
          case ServarrAction.UNMONITOR:
            await radarrApiClient.updateMovie(radarrMedia.id, {
              monitored: false,
              addImportExclusion: collection.listExclusions,
            });
            this.logger.log(
              `Unmonitored movie with TMDB ID ${tmdbId}${collection.listExclusions ? ' & added to import exclusion list' : ''} in Radarr`,
            );
            break;
          case ServarrAction.UNMONITOR_DELETE_ALL:
            await radarrApiClient.updateMovie(radarrMedia.id, {
              monitored: false,
              deleteFiles: true,
              addImportExclusion: collection.listExclusions,
            });
            this.logger.log(
              `Unmonitored movie with TMDB ID ${tmdbId}${collection.listExclusions ? ', added to import exclusion list' : ''} & removed files from filesystem in Radarr`,
            );
            break;
        }
      } else {
        if (collection.arrAction !== ServarrAction.UNMONITOR) {
          this.logger.log(
            `Couldn't find movie with TMDB ID ${tmdbId} in Radarr, so no Radarr action was taken for movie with media server ID ${media.mediaServerId}. Attempting to remove from the filesystem via media server.`,
          );
          const mediaServer = await this.mediaServerFactory.getService();
          await mediaServer.deleteFromDisk(media.mediaServerId);
        } else {
          this.logger.log(
            `Radarr unmonitor action was not possible, couldn't find movie with TMDB ID ${tmdbId} in Radarr. No action was taken for movie with media server ID ${media.mediaServerId}`,
          );
        }
      }
    } else {
      this.logger.log(
        `Couldn't find correct TMDB ID. No action taken for movie with media server ID: ${media.mediaServerId}. Please check this movie manually`,
      );
    }
  }
}
