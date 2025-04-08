import { Injectable, Logger } from '@nestjs/common';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { TmdbIdService } from '../api/tmdb-api/tmdb-id.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { ServarrAction } from '../collections/interfaces/collection.interface';

@Injectable()
export class RadarrActionHandler {
  private readonly logger = new Logger(RadarrActionHandler.name);

  constructor(
    private readonly servarrApi: ServarrService,
    private readonly plexApi: PlexApiService,
    private readonly tmdbIdService: TmdbIdService,
  ) {}

  public async handleAction(
    collection: Collection,
    media: CollectionMedia,
  ): Promise<void> {
    const radarrApiClient = await this.servarrApi.getRadarrApiClient(
      collection.radarrSettingsId,
    );

    // find tmdbid
    const tmdbid = media.tmdbId
      ? media.tmdbId
      : (
          await this.tmdbIdService.getTmdbIdFromPlexRatingKey(
            media.plexId.toString(),
          )
        )?.id;

    if (tmdbid) {
      const radarrMedia = await radarrApiClient.getMovieByTmdbId(tmdbid);
      if (radarrMedia && radarrMedia.id) {
        switch (collection.arrAction) {
          case ServarrAction.DELETE:
          case ServarrAction.UNMONITOR_DELETE_EXISTING:
            await radarrApiClient.deleteMovie(
              radarrMedia.id,
              true,
              collection.listExclusions,
            );
            this.logger.log('Removed movie from filesystem & Radarr');
            break;
          case ServarrAction.UNMONITOR:
            await radarrApiClient.unmonitorMovie(radarrMedia.id, false);
            this.logger.log('Unmonitored movie in Radarr');
            break;
          case ServarrAction.UNMONITOR_DELETE_ALL:
            await radarrApiClient.unmonitorMovie(radarrMedia.id, true);
            this.logger.log('Unmonitored movie in Radarr & removed files');
            break;
        }
      } else {
        if (collection.arrAction !== ServarrAction.UNMONITOR) {
          this.logger.log(
            `Couldn't find movie with tmdb id ${tmdbid} in Radarr, so no Radarr action was taken for movie with Plex ID ${media.plexId}. Attempting to remove from the filesystem via Plex.`,
          );
          await this.plexApi.deleteMediaFromDisk(media.plexId.toString());
        } else {
          this.logger.log(
            `Radarr unmonitor action was not possible, couldn't find movie with tmdb id ${tmdbid} in Radarr. No action was taken for movie with Plex ID ${media.plexId}`,
          );
        }
      }
    } else {
      this.logger.log(
        `Couldn't find correct tmdb id. No action taken for movie with Plex ID: ${media.plexId}. Please check this movie manually`,
      );
    }
  }
}
