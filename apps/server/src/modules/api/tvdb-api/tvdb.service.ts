import { BasicResponseDto, MaintainerrEvent } from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import axios, { AxiosError } from 'axios';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import {
  formatConnectionFailureMessage,
  logConnectionTestError,
} from '../../../utils/connection-error';
import { ExternalApiService } from '../external-api/external-api.service';
import cacheManager from '../lib/cache';
import {
  TvdbApiResponse,
  TvdbArtwork,
  TvdbArtworkType,
  TvdbMovieBase,
  TvdbPersonExtended,
  TvdbRemoteIdResult,
  TvdbSeriesBase,
} from './interfaces/tvdb.interface';

const TVDB_BASE_URL = 'https://api4.thetvdb.com/v4';

@Injectable()
export class TvdbApiService extends ExternalApiService {
  private bearerToken: string | undefined;
  private refreshPromise: Promise<boolean> | undefined;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TvdbApiService.name);
    super(TVDB_BASE_URL, {}, logger, {
      nodeCache: cacheManager.getCache('tvdb').data,
    });
  }

  async onApplicationBootstrap() {
    const customKey = this.settings.tvdb_api_key;
    if (customKey) {
      await this.authenticate(customKey);
    }
  }

  @OnEvent(MaintainerrEvent.Settings_Updated)
  async handleSettingsUpdate(payload: {
    oldSettings: { tvdb_api_key?: string };
    settings: { tvdb_api_key?: string };
  }) {
    const newKey = payload.settings.tvdb_api_key;
    const oldKey = payload.oldSettings.tvdb_api_key;

    if (newKey !== oldKey) {
      if (newKey) {
        const authenticated = await this.authenticate(newKey, {
          preserveAuthOnFailure: true,
        });

        if (authenticated) {
          this.logger.log('TVDB API key updated and authenticated');
        } else {
          this.logger.warn(
            'TVDB API key update failed authentication. Keeping the existing TVDB token until a valid key is saved or the current token expires.',
          );
        }
      } else {
        this.clearAuth();
        this.logger.log('TVDB API key removed and authentication cleared');
      }
    }
  }

  private async requestToken(apiKey: string): Promise<string | undefined> {
    try {
      const response = await axios.post<{
        status: string;
        data: { token: string };
      }>(`${TVDB_BASE_URL}/login`, { apikey: apiKey });

      return response.data?.data?.token;
    } catch (error) {
      this.logger.warn('TVDB authentication failed');
      this.logger.debug(error);
      return undefined;
    }
  }

  private async authenticate(
    apiKey: string,
    options?: { preserveAuthOnFailure?: boolean },
  ): Promise<boolean> {
    const token = await this.requestToken(apiKey);

    if (token) {
      this.updateBearerToken(token);
      return true;
    }

    if (!options?.preserveAuthOnFailure) {
      this.clearAuth();
    }

    return false;
  }

  private async refreshAuthentication(): Promise<boolean> {
    if (this.refreshPromise !== undefined) {
      return this.refreshPromise;
    }

    const apiKey = this.settings.tvdb_api_key;
    if (!apiKey) {
      this.clearAuth();
      return false;
    }

    this.refreshPromise = this.authenticate(apiKey).finally(() => {
      this.refreshPromise = undefined;
    });

    return this.refreshPromise;
  }

  private isUnauthorizedError(error: unknown): error is AxiosError {
    return error instanceof AxiosError && error.response?.status === 401;
  }

  private async getWithAuthRetry<T>(
    endpoint: string,
    ttl = 3600,
  ): Promise<T | undefined> {
    const cache = cacheManager.getCache('tvdb')?.data;
    const cachedItem = cache?.get<T>(endpoint);
    if (cachedItem) {
      return cachedItem;
    }

    const request = async () => (await this.axios.get<T>(endpoint)).data;

    try {
      const data = await request();
      cache?.set(endpoint, data, ttl);
      return data;
    } catch (error) {
      if (!this.isUnauthorizedError(error)) {
        throw error;
      }

      const refreshed = await this.refreshAuthentication();
      if (!refreshed) {
        throw error;
      }

      const data = await request();
      cache?.set(endpoint, data, ttl);
      return data;
    }
  }

  private updateBearerToken(token: string) {
    this.bearerToken = token;
    this.axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  private clearAuth() {
    this.bearerToken = undefined;
    delete this.axios.defaults.headers.common.Authorization;
  }

  public async testConnection(apiKey?: string): Promise<BasicResponseDto> {
    const keyToTest = apiKey || this.settings.tvdb_api_key;

    if (!keyToTest) {
      return {
        status: 'NOK',
        code: 0,
        message: 'No TVDB API key configured',
      };
    }

    try {
      const response = await axios.post<{
        status: string;
        data: { token: string };
      }>(`${TVDB_BASE_URL}/login`, { apikey: keyToTest });

      return response.data?.data?.token
        ? { status: 'OK', code: 1, message: 'Success' }
        : { status: 'NOK', code: 0, message: 'Unexpected response' };
    } catch (error) {
      logConnectionTestError(this.logger, 'TVDB');
      this.logger.debug(error);

      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to TVDB. Verify API key.',
        ),
      };
    }
  }

  public isAvailable(): boolean {
    return this.bearerToken !== undefined;
  }

  public async getMovie(tvdbId: number): Promise<TvdbMovieBase | undefined> {
    try {
      const response = await this.getWithAuthRetry<
        TvdbApiResponse<TvdbMovieBase>
      >(`/movies/${tvdbId}/extended`, 3600);
      return response?.data;
    } catch (error) {
      this.logger.warn(`Failed to fetch TVDB movie ${tvdbId}`);
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getSeries(tvdbId: number): Promise<TvdbSeriesBase | undefined> {
    try {
      const response = await this.getWithAuthRetry<
        TvdbApiResponse<TvdbSeriesBase>
      >(`/series/${tvdbId}/extended`, 3600);
      return response?.data;
    } catch (error) {
      this.logger.warn(`Failed to fetch TVDB series ${tvdbId}`);
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getPerson(
    tvdbId: number,
  ): Promise<TvdbPersonExtended | undefined> {
    try {
      const response = await this.getWithAuthRetry<
        TvdbApiResponse<TvdbPersonExtended>
      >(`/people/${tvdbId}/extended`, 3600);
      return response?.data;
    } catch (error) {
      this.logger.warn(`Failed to fetch TVDB person ${tvdbId}`);
      this.logger.debug(error);
      return undefined;
    }
  }

  public async searchByRemoteId(
    remoteId: string,
  ): Promise<TvdbRemoteIdResult[] | undefined> {
    try {
      const response = await this.getWithAuthRetry<
        TvdbApiResponse<TvdbRemoteIdResult[]>
      >(`/search/remoteid/${remoteId}`);
      return response?.data;
    } catch (error) {
      this.logger.warn(`Failed to search TVDB by remote ID ${remoteId}`);
      this.logger.debug(error);
      return undefined;
    }
  }

  private static readonly artworkTypeMap: Record<
    'movie' | 'tv',
    Record<string, TvdbArtworkType>
  > = {
    tv: {
      poster: TvdbArtworkType.SERIES_POSTER,
      background: TvdbArtworkType.SERIES_BACKGROUND,
      banner: TvdbArtworkType.SERIES_BANNER,
      icon: TvdbArtworkType.SERIES_ICON,
      clearart: TvdbArtworkType.SERIES_CLEAR_ART,
      clearlogo: TvdbArtworkType.SERIES_CLEAR_LOGO,
    },
    movie: {
      poster: TvdbArtworkType.MOVIE_POSTER,
      background: TvdbArtworkType.MOVIE_BACKGROUND,
      banner: TvdbArtworkType.MOVIE_BANNER,
      icon: TvdbArtworkType.MOVIE_ICON,
      clearart: TvdbArtworkType.MOVIE_CLEAR_ART,
      clearlogo: TvdbArtworkType.MOVIE_CLEAR_LOGO,
    },
  };

  public getPosterUrl(
    record: TvdbSeriesBase | TvdbMovieBase | undefined,
    type: 'movie' | 'tv' = 'tv',
  ): string | undefined {
    if (!record) {
      return undefined;
    }

    if (record.image) {
      return record.image;
    }

    return this.findBestArtwork(
      record.artworks,
      TvdbApiService.artworkTypeMap[type].poster,
    )?.image;
  }

  public getBackdropUrl(
    record: TvdbSeriesBase | TvdbMovieBase | undefined,
    type: 'movie' | 'tv' = 'tv',
  ): string | undefined {
    if (!record) {
      return undefined;
    }

    return this.findBestArtwork(
      record.artworks,
      TvdbApiService.artworkTypeMap[type].background,
    )?.image;
  }

  public getImdbId(
    record: TvdbSeriesBase | TvdbMovieBase | undefined,
  ): string | undefined {
    if (!record?.remoteIds) {
      return undefined;
    }

    const imdbRemote = record.remoteIds.find(
      (remoteId) =>
        remoteId.sourceName === 'IMDB' || remoteId.id?.startsWith('tt'),
    );
    return imdbRemote?.id;
  }

  public getTmdbId(
    record: TvdbSeriesBase | TvdbMovieBase | undefined,
  ): number | undefined {
    if (!record?.remoteIds) {
      return undefined;
    }

    const tmdbRemote = record.remoteIds.find(
      (remoteId) =>
        remoteId.sourceName === 'TheMovieDB.com' ||
        remoteId.sourceName === 'TMDB' ||
        remoteId.sourceName === 'themoviedb',
    );
    const id = tmdbRemote ? Number(tmdbRemote.id) : undefined;
    return id && !Number.isNaN(id) ? id : undefined;
  }

  private findBestArtwork(
    artworks: TvdbArtwork[] | undefined,
    type: TvdbArtworkType,
  ): TvdbArtwork | undefined {
    if (!artworks?.length) {
      return undefined;
    }

    return artworks
      .filter((artwork) => artwork.type === type)
      .sort((left, right) => right.score - left.score)[0];
  }
}
