import { BasicResponseDto, MaintainerrEvent } from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import { ExternalApiService } from '../external-api/external-api.service';
import cacheManager from '../lib/cache';
import {
  TmdbExternalIdResponse,
  TmdbMovieDetails,
  TmdbPersonDetail,
  TmdbTvDetails,
} from './interfaces/tmdb.interface';

const TMDB_DEFAULT_API_KEY = 'db55323b8d3e4154498498a75642b381';

@Injectable()
export class TmdbApiService extends ExternalApiService {
  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TmdbApiService.name);
    super(
      'https://api.themoviedb.org/3',
      {
        api_key: TMDB_DEFAULT_API_KEY,
      },
      logger,
      {
        nodeCache: cacheManager.getCache('tmdb').data,
      },
    );
  }

  /**
   * Called after NestJS has resolved all dependencies.
   * Sets the API key from settings if one is configured.
   */
  onModuleInit() {
    const customKey = this.settings.tmdb_api_key;
    if (customKey) {
      this.updateApiKey(customKey);
    }
  }

  @OnEvent(MaintainerrEvent.Settings_Updated)
  handleSettingsUpdate(payload: {
    oldSettings: { tmdb_api_key?: string };
    settings: { tmdb_api_key?: string };
  }) {
    const newKey = payload.settings.tmdb_api_key;
    const oldKey = payload.oldSettings.tmdb_api_key;

    if (newKey !== oldKey) {
      this.updateApiKey(newKey || TMDB_DEFAULT_API_KEY);
      this.logger.log(
        newKey
          ? 'TMDB API key updated to user-configured key'
          : 'TMDB API key reset to default',
      );
    }
  }

  private updateApiKey(apiKey: string) {
    this.axios.defaults.params = {
      ...this.axios.defaults.params,
      api_key: apiKey,
    };
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

  /**
   * Test connectivity to the TMDB API.
   * Uses a direct request that bypasses the cache so we actually validate
   * the supplied key against the upstream API.
   */
  public async testConnection(apiKey?: string): Promise<BasicResponseDto> {
    const testKey = apiKey || this.axios.defaults.params?.api_key;

    if (!testKey) {
      return { status: 'NOK', code: 0, message: 'No TMDB API key configured' };
    }

    try {
      // Use a direct axios call — bypasses the node-cache and lets errors
      // propagate so we can inspect the HTTP status code.
      const response = await this.axios.get<{ id: number }>('/movie/550', {
        params: { api_key: testKey },
      });

      return response.data?.id
        ? { status: 'OK', code: 1, message: 'Success' }
        : { status: 'NOK', code: 0, message: 'Unexpected response' };
    } catch (e) {
      this.logger.warn(`A failure occurred testing TMDB connectivity: ${e}`);

      const message =
        e.response?.status === 401
          ? 'Invalid API key'
          : `Connection failed: ${e.message}`;
      return { status: 'NOK', code: 0, message };
    }
  }

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
