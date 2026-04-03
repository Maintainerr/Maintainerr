import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
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

    const ids = await this.metadataService.resolveIds(media.mediaServerId);
    const resolvedIds = {
      tmdb: (ids?.tmdb as number | undefined) ?? media.tmdbId,
      tvdb: (ids?.tvdb as number | undefined) ?? media.tvdbId,
    };
    const lookupCandidates =
      this.metadataService.buildServarrLookupCandidates(resolvedIds);

    if (lookupCandidates.length > 0) {
      const matchedResult = await findServarrLookupMatch(lookupCandidates, {
        tmdb: (id) => radarrApiClient.getMovieByTmdbId(id),
        tvdb: (id) => radarrApiClient.getMovieByTvdbId(id),
      });
      const radarrMedia = matchedResult?.result;

      if (radarrMedia?.id) {
        const matchedProvider =
          matchedResult.candidate.providerKey.toUpperCase();
        const matchedId = matchedResult.candidate.id;

        switch (collection.arrAction) {
          case ServarrAction.DELETE:
          case ServarrAction.UNMONITOR_DELETE_EXISTING:
            await radarrApiClient.deleteMovie(
              radarrMedia.id,
              true,
              collection.listExclusions,
            );
            this.logger.log(
              `Removed movie with ${matchedProvider} ID ${matchedId} from filesystem & Radarr`,
            );
            break;
          case ServarrAction.UNMONITOR:
            await radarrApiClient.updateMovie(radarrMedia.id, {
              monitored: false,
              addImportExclusion: collection.listExclusions,
            });
            this.logger.log(
              `Unmonitored movie with ${matchedProvider} ID ${matchedId}${collection.listExclusions ? ' & added to import exclusion list' : ''} in Radarr`,
            );
            break;
          case ServarrAction.UNMONITOR_DELETE_ALL:
            await radarrApiClient.updateMovie(radarrMedia.id, {
              monitored: false,
              deleteFiles: true,
              addImportExclusion: collection.listExclusions,
            });
            this.logger.log(
              `Unmonitored movie with ${matchedProvider} ID ${matchedId}${collection.listExclusions ? ', added to import exclusion list' : ''} & removed files from filesystem in Radarr`,
            );
            break;
        }
      } else {
        const attemptedIds = formatServarrLookupCandidates(lookupCandidates);

        if (collection.arrAction !== ServarrAction.UNMONITOR) {
          this.logger.log(
            `Couldn't find movie in Radarr using resolved external IDs [${attemptedIds}] for media server ID ${media.mediaServerId}. Attempting to remove from the filesystem via media server.`,
          );
          const mediaServer = await this.mediaServerFactory.getService();
          await mediaServer.deleteFromDisk(media.mediaServerId);
        } else {
          this.logger.log(
            `Radarr unmonitor action was not possible because no resolved external ID [${attemptedIds}] matched a movie in Radarr for media server ID ${media.mediaServerId}.`,
          );
        }
      }
    } else {
      this.logger.log(
        `Couldn't resolve any supported external IDs for movie with media server ID ${media.mediaServerId}. Please check this movie manually.`,
      );
    }
  }
}
