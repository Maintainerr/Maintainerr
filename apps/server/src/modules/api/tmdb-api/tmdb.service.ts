import { Injectable } from '@nestjs/common';
import { MaintainerrLogger } from '../../logging/logs.service';
import { ExternalApiService } from '../external-api/external-api.service';
import cacheManager from '../lib/cache';
import {
  TmdbExternalIdResponse,
  TmdbMovieDetails,
  TmdbPersonDetail,
  TmdbTvDetails,
} from './interfaces/tmdb.interface';

@Injectable()
export class TmdbApiService extends ExternalApiService {
  constructor(protected readonly logger: MaintainerrLogger) {
    logger.setContext(TmdbApiService.name);
    super(
      'https://api.themoviedb.org/3',
      {
        api_key: 'db55323b8d3e4154498498a75642b381',
      },
      logger,
      {
        nodeCache: cacheManager.getCache('tmdb').data,
      },
    );
  }

  public getPerson = async ({
    personId,
    language = 'en',
  }: {
    personId: number;
    language?: string;
  }): Promise<TmdbPersonDetail> => {
    try {
      const data = await this.get<TmdbPersonDetail>(`/person/${personId}`, {
        params: { language },
      });

      return data;
    } catch (e) {
      this.logger.warn(`Failed to fetch person details: ${e.message}`);
      this.logger.debug(e);
    }
  };

  public getMovie = async ({
    movieId,
    language = 'en',
  }: {
    movieId: number;
    language?: string;
  }): Promise<TmdbMovieDetails> => {
    try {
      const data = await this.get<TmdbMovieDetails>(
        `/movie/${movieId}`,
        {
          params: {
            language,
            append_to_response:
              'credits,external_ids,videos,release_dates,watch/providers',
          },
        },
        43200,
      );

      return data;
    } catch (e) {
      this.logger.warn(`Failed to fetch movie details: ${e.message}`);
      this.logger.debug(e);
    }
  };

  public getTvShow = async ({
    tvId,
    language = 'en',
  }: {
    tvId: number;
    language?: string;
  }): Promise<TmdbTvDetails> => {
    try {
      const data = await this.get<TmdbTvDetails>(
        `/tv/${tvId}`,
        {
          params: {
            language,
            append_to_response:
              'aggregate_credits,credits,external_ids,keywords,videos,content_ratings,watch/providers',
          },
        },
        43200,
      );

      return data;
    } catch (e) {
      this.logger.warn(`Failed to fetch TV show details: ${e.message}`);
      this.logger.debug(e);
    }
  };

  // TODO: ADD CACHING!!!!
  public getImagePath = async ({
    tmdbId,
    type,
  }: {
    tmdbId: number;
    type: 'movie' | 'show';
  }): Promise<string> => {
    try {
      if (type === 'movie') {
        return (await this.getMovie({ movieId: tmdbId }))?.poster_path;
      } else {
        return (await this.getTvShow({ tvId: tmdbId }))?.poster_path;
      }
    } catch (e) {
      this.logger.warn(`Failed to fetch image path: ${e.message}`);
      this.logger.debug(e);
    }
  };

  public getBackdropImagePath = async ({
    tmdbId,
    type,
  }: {
    tmdbId: number;
    type: 'movie' | 'show';
  }): Promise<string> => {
    try {
      if (type === 'movie') {
        return (await this.getMovie({ movieId: tmdbId }))?.backdrop_path;
      } else {
        return (await this.getTvShow({ tvId: tmdbId }))?.backdrop_path;
      }
    } catch (e) {
      this.logger.warn(`Failed to fetch backdrop image path: ${e.message}`);
      this.logger.debug(e);
    }
  };

  public async getByExternalId({
    externalId,
    type,
    language = 'en',
  }:
    | {
        externalId: string;
        type: 'imdb';
        language?: string;
      }
    | {
        externalId: number;
        type: 'tvdb';
        language?: string;
      }): Promise<TmdbExternalIdResponse> {
    try {
      const data = await this.get<TmdbExternalIdResponse>(
        `/find/${externalId}`,
        {
          params: {
            external_source: type === 'imdb' ? 'imdb_id' : 'tvdb_id',
            language,
          },
        },
      );
      return data;
    } catch (e) {
      this.logger.warn(`Failed to find by external ID: ${e.message}`);
      this.logger.debug(e);
    }
  }
}
