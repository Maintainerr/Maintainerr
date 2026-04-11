import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
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
  ): Promise<boolean> {
    const radarrApiClient = await this.servarrApi.getRadarrApiClient(
      collection.radarrSettingsId,
    );

    const lookupCandidates =
      await this.metadataService.resolveLookupCandidatesForService(
        media.mediaServerId,
        'radarr',
        {
          tmdb: media.tmdbId,
          tvdb: media.tvdbId,
        },
      );

    if (lookupCandidates.length > 0) {
      const matchedResult = await findMetadataLookupMatch(lookupCandidates, {
        tmdb: (id) => radarrApiClient.getMovieByTmdbId(id),
      });
      const radarrMedia = matchedResult?.result;

      if (radarrMedia?.id) {
        const matchedProvider =
          matchedResult.candidate.providerKey.toUpperCase();
        const matchedId = matchedResult.candidate.id;

        switch (collection.arrAction) {
          case ServarrAction.DELETE:
          case ServarrAction.UNMONITOR_DELETE_EXISTING:
            if (
              !(await radarrApiClient.deleteMovie(
                radarrMedia.id,
                true,
                collection.listExclusions,
              ))
            ) {
              return false;
            }
            this.logger.log(
              `Removed movie with ${matchedProvider} ID ${matchedId} from filesystem & Radarr`,
            );
            return true;
          case ServarrAction.UNMONITOR:
            if (
              !(await radarrApiClient.updateMovie(radarrMedia.id, {
                monitored: false,
                addImportExclusion: collection.listExclusions,
              }))
            ) {
              return false;
            }
            this.logger.log(
              `Unmonitored movie with ${matchedProvider} ID ${matchedId}${collection.listExclusions ? ' & added to import exclusion list' : ''} in Radarr`,
            );
            return true;
          case ServarrAction.UNMONITOR_DELETE_ALL:
            if (
              !(await radarrApiClient.updateMovie(radarrMedia.id, {
                monitored: false,
                deleteFiles: true,
                addImportExclusion: collection.listExclusions,
              }))
            ) {
              return false;
            }
            this.logger.log(
              `Unmonitored movie with ${matchedProvider} ID ${matchedId}${collection.listExclusions ? ', added to import exclusion list' : ''} & removed files from filesystem in Radarr`,
            );
            return true;
          case ServarrAction.CHANGE_QUALITY_PROFILE: {
            const targetProfileId = collection.radarrQualityProfileId;

            if (!targetProfileId) {
              this.logger.warn(
                `No target quality profile configured for collection ${collection.title}`,
              );
              return false;
            }

            if (!Number.isInteger(targetProfileId) || targetProfileId <= 0) {
              this.logger.warn(
                `Invalid quality profile ID (${targetProfileId}) for collection ${collection.title}`,
              );
              return false;
            }

            if (
              !(await radarrApiClient.updateMovie(radarrMedia.id, {
                qualityProfileId: targetProfileId,
              }))
            ) {
              return false;
            }

            this.logger.log(
              `Changed quality profile for movie with ${matchedProvider} ID ${matchedId} to profile ID ${targetProfileId} in Radarr`,
            );

            await radarrApiClient.searchMovie(radarrMedia.id);
            return true;
          }
          default:
            return false;
        }
      } else {
        const attemptedIds = formatMetadataLookupCandidates(lookupCandidates);

        if (collection.arrAction !== ServarrAction.UNMONITOR) {
          this.logger.log(
            `Couldn't find movie in Radarr using resolved external IDs [${attemptedIds}] for media server ID ${media.mediaServerId}. Attempting to remove from the filesystem via media server.`,
          );
          const mediaServer = await this.mediaServerFactory.getService();
          await mediaServer.deleteFromDisk(media.mediaServerId);
          return true;
        } else {
          this.logger.log(
            `Radarr unmonitor action was not possible because no resolved external ID [${attemptedIds}] matched a movie in Radarr for media server ID ${media.mediaServerId}.`,
          );
          return false;
        }
      }
    } else {
      this.logger.log(
        `Couldn't resolve any supported external IDs for movie with media server ID ${media.mediaServerId}. Please check this movie manually.`,
      );
      return false;
    }

    return false;
  }
}
