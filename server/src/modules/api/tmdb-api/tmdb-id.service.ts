import { Injectable } from '@nestjs/common';
import { PlexMetadata } from '../../../modules/api/plex-api/interfaces/media.interface';
import { PlexApiService } from '../../../modules/api/plex-api/plex-api.service';
import { TmdbApiService } from '../../../modules/api/tmdb-api/tmdb.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import { PlexLibraryItem } from '../plex-api/interfaces/library.interfaces';

@Injectable()
export class TmdbIdService {
  constructor(
    private readonly tmdbApi: TmdbApiService,
    private readonly plexApi: PlexApiService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TmdbIdService.name);
  }

  async getTmdbIdFromPlexRatingKey(
    ratingKey: string,
  ): Promise<{ type: 'movie' | 'tv'; id: number | undefined }> {
    try {
      let libItem: PlexMetadata = await this.plexApi.getMetadata(ratingKey);
      if (libItem) {
        // fetch show in case of season / episode
        libItem = libItem.grandparentRatingKey
          ? await this.plexApi.getMetadata(
              libItem.grandparentRatingKey.toString(),
            )
          : libItem.parentRatingKey
            ? await this.plexApi.getMetadata(libItem.parentRatingKey.toString())
            : libItem;

        return this.getTmdbIdFromPlexData(libItem);
      } else {
        this.logger.warn(
          `Failed to fetch metadata of Plex rating key : ${ratingKey}`,
        );
      }
    } catch (e) {
      this.logger.warn(`Failed to fetch id : ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }

  async getTmdbIdFromPlexData(
    libItem: PlexMetadata | PlexLibraryItem,
  ): Promise<{ type: 'movie' | 'tv'; id: number | undefined }> {
    try {
      let id: number = undefined;

      if (libItem.Guid) {
        if (libItem.Guid.find((el) => el.id.includes('tmdb'))) {
          id = +libItem.Guid.find((el) => el.id.includes('tmdb')).id.split(
            '://',
          )[1];
        }

        if (!id && libItem.Guid.find((el) => el.id.includes('tvdb'))) {
          const resp = await this.tmdbApi.getByExternalId({
            externalId: +libItem.Guid.find((el) => el.id.includes('tvdb'))
              ?.id.split('://')[1]
              ?.split('?')[0],
            type: 'tvdb',
          });

          if (resp) {
            id =
              resp.movie_results?.length > 0
                ? resp.movie_results[0]?.id
                : resp.tv_results[0]?.id;
          }
        }

        if (!id && libItem.Guid.find((el) => el.id.includes('imdb'))) {
          const resp = await this.tmdbApi.getByExternalId({
            externalId: libItem.Guid.find((el) => el.id.includes('imdb'))
              ?.id.split('://')[1]
              ?.split('?')[0],
            type: 'imdb',
          });

          if (resp) {
            id =
              resp.movie_results?.length > 0
                ? resp.movie_results[0]?.id
                : resp.tv_results[0]?.id;
          }
        }
      }
      return {
        type: ['show', 'season', 'episode'].includes(libItem.type)
          ? 'tv'
          : 'movie',
        id: id,
      };
    } catch (e) {
      this.logger.warn(`Failed to fetch id : ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }
}
