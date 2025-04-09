import {
  isPlexEpisode,
  isPlexSeason,
  PlexMetadata,
} from '@maintainerr/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { warn } from 'console';
import { PlexApiService } from '../../../modules/api/plex-api/plex-api.service';
import { TmdbApiService } from '../../../modules/api/tmdb-api/tmdb.service';

@Injectable()
export class TmdbIdService {
  constructor(
    private readonly tmdbApi: TmdbApiService,
    private readonly plexApi: PlexApiService,
  ) {}
  async getTmdbIdFromPlexRatingKey(
    ratingKey: string,
  ): Promise<{ type: 'movie' | 'tv'; id: number | undefined }> {
    try {
      let libItem: PlexMetadata = await this.plexApi.getMetadata(ratingKey);
      if (libItem) {
        // fetch show in case of season / episode
        libItem = isPlexEpisode(libItem)
          ? await this.plexApi.getMetadata(
              libItem.grandparentRatingKey.toString(),
            )
          : isPlexSeason(libItem)
            ? await this.plexApi.getMetadata(libItem.parentRatingKey.toString())
            : libItem;

        return this.getTmdbIdFromPlexData(libItem);
      } else {
        warn(
          `[TMDb] Failed to fetch metadata of Plex rating key : ${ratingKey}`,
        );
      }
    } catch (e) {
      warn(`[TMDb] Failed to fetch id : ${e.message}`);
      Logger.debug(e);
      return undefined;
    }
  }

  async getTmdbIdFromPlexData(
    libItem: PlexMetadata,
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
      warn(`[TMDb] Failed to fetch id : ${e.message}`);
      Logger.debug(e);
      return undefined;
    }
  }
}
