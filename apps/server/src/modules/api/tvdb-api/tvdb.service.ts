import { BasicResponseDto, MaintainerrEvent } from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import axios, { AxiosError } from 'axios';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
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

  /**
   * Called after all onModuleInit hooks have run (including AppModule which
   * loads settings from the DB). Using onApplicationBootstrap instead of
   * onModuleInit ensures the TVDB API key is available from SettingsService.
   */
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
        this.logger.log('TVDB API key removed — cleared authentication');
      }
    }
  }

  /**
   * Authenticate with the TVDB v4 API.
   * POST /login with { apikey } → returns a bearer token valid for 1 month.
   */
  private async requestToken(apiKey: string): Promise<string | undefined> {
    try {
      const resp = await axios.post<{
        status: string;
        data: { token: string };
      }>(`${TVDB_BASE_URL}/login`, { apikey: apiKey });

      return resp.data?.data?.token;
    } catch (e) {
      this.logger.warn(`TVDB authentication failed: ${e.message}`);
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
    if (this.refreshPromise) {
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
    const cache = cacheManager.getCache('tvdb').data;
    const cachedItem = cache.get<T>(endpoint);
    if (cachedItem) {
      return cachedItem;
    }

    const request = async () => (await this.axios.get<T>(endpoint)).data;

    try {
      const data = await request();
      cache.set(endpoint, data, ttl);
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
      cache.set(endpoint, data, ttl);
      return data;
    }
  }

  private updateBearerToken(token: string) {
    this.bearerToken = token;
    this.axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  private clearAuth() {
    this.bearerToken = undefined;
    delete this.axios.defaults.headers.common['Authorization'];
  }

  /**
   * Test connectivity to the TVDB v4 API.
   * When an API key is provided, it performs a fresh login to verify the key.
   * Otherwise tests using the current bearer token.
   */
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
      // Always perform a fresh login to validate the key
      const resp = await axios.post<{
        status: string;
        data: { token: string };
      }>(`${TVDB_BASE_URL}/login`, { apikey: keyToTest });

      if (resp.data?.data?.token) {
        return { status: 'OK', code: 1, message: 'Success' };
      }

      return { status: 'NOK', code: 0, message: 'Unexpected response' };
    } catch (e) {
      this.logger.warn(`A failure occurred testing TVDB connectivity: ${e}`);

      const message =
        e.response?.status === 401
          ? 'Invalid API key'
          : `Connection failed: ${e.message}`;
      return { status: 'NOK', code: 0, message };
    }
  }

  /**
   * Whether the TVDB service is authenticated and ready for API calls.
   */
  public isAvailable(): boolean {
    return !!this.bearerToken;
  }

  /**
   * Fetch a movie by its TVDB ID.
   */
  public async getMovie(tvdbId: number): Promise<TvdbMovieBase | undefined> {
    try {
      const resp = await this.getWithAuthRetry<TvdbApiResponse<TvdbMovieBase>>(
        `/movies/${tvdbId}/extended`,
        3600,
      );
      return resp?.data;
    } catch (e) {
      this.logger.warn(`Failed to fetch TVDB movie ${tvdbId}: ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }

  /**
   * Fetch a TV series by its TVDB ID.
   */
  public async getSeries(tvdbId: number): Promise<TvdbSeriesBase | undefined> {
    try {
      const resp = await this.getWithAuthRetry<TvdbApiResponse<TvdbSeriesBase>>(
        `/series/${tvdbId}/extended`,
        3600,
      );
      return resp?.data;
    } catch (e) {
      this.logger.warn(`Failed to fetch TVDB series ${tvdbId}: ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }

  /**
   * Fetch a person by their TVDB ID (extended record includes biographies & remote IDs).
   */
  public async getPerson(
    tvdbId: number,
  ): Promise<TvdbPersonExtended | undefined> {
    try {
      const resp = await this.getWithAuthRetry<
        TvdbApiResponse<TvdbPersonExtended>
      >(`/people/${tvdbId}/extended`, 3600);
      return resp?.data;
    } catch (e) {
      this.logger.warn(`Failed to fetch TVDB person ${tvdbId}: ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }

  /**
   * Search by a remote ID (e.g. IMDB ID) to find the corresponding TVDB records.
   * Returns an array of results, each potentially containing a series or movie.
   */
  public async searchByRemoteId(
    remoteId: string,
  ): Promise<TvdbRemoteIdResult[] | undefined> {
    try {
      const resp = await this.getWithAuthRetry<
        TvdbApiResponse<TvdbRemoteIdResult[]>
      >(`/search/remoteid/${remoteId}`);
      return resp?.data;
    } catch (e) {
      this.logger.warn(
        `Failed to search TVDB by remote ID ${remoteId}: ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }

  /** Artwork type mapping keyed by media type and artwork kind. */
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

  /**
   * Get the poster URL for a series or movie.
   * Returns the primary image from the base record, or the highest-scored poster artwork.
   */
  public getPosterUrl(
    record: TvdbSeriesBase | TvdbMovieBase | undefined,
    type: 'movie' | 'tv' = 'tv',
  ): string | undefined {
    if (!record) return undefined;

    // The base record `image` field is typically the poster
    if (record.image) return record.image;

    // Fallback: find the highest-scored poster artwork
    return this.findBestArtwork(
      record.artworks,
      TvdbApiService.artworkTypeMap[type].poster,
    )?.image;
  }

  /**
   * Get a backdrop/fanart URL for a series or movie.
   * Returns the highest-scored background artwork.
   */
  public getBackdropUrl(
    record: TvdbSeriesBase | TvdbMovieBase | undefined,
    type: 'movie' | 'tv' = 'tv',
  ): string | undefined {
    if (!record) return undefined;

    return this.findBestArtwork(
      record.artworks,
      TvdbApiService.artworkTypeMap[type].background,
    )?.image;
  }

  /**
   * Find the IMDB ID from a TVDB record's remote IDs.
   */
  public getImdbId(
    record: TvdbSeriesBase | TvdbMovieBase | undefined,
  ): string | undefined {
    if (!record?.remoteIds) return undefined;
    const imdbRemote = record.remoteIds.find(
      (r) => r.sourceName === 'IMDB' || r.id?.startsWith('tt'),
    );
    return imdbRemote?.id;
  }

  /**
   * Find the TMDB ID from a TVDB record's remote IDs.
   */
  public getTmdbId(
    record: TvdbSeriesBase | TvdbMovieBase | undefined,
  ): number | undefined {
    if (!record?.remoteIds) return undefined;
    const tmdbRemote = record.remoteIds.find(
      (r) =>
        r.sourceName === 'TheMovieDB.com' ||
        r.sourceName === 'TMDB' ||
        r.sourceName === 'themoviedb',
    );
    const id = tmdbRemote ? Number(tmdbRemote.id) : undefined;
    return id && !isNaN(id) ? id : undefined;
  }

  private findBestArtwork(
    artworks: TvdbArtwork[] | undefined,
    type: TvdbArtworkType,
  ): TvdbArtwork | undefined {
    if (!artworks?.length) return undefined;
    return artworks
      .filter((a) => a.type === type)
      .sort((a, b) => b.score - a.score)[0];
  }
}
