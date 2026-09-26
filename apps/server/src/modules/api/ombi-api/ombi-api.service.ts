import { BasicResponseDto, stripTrailingSlashes } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { cloneDeep } from 'lodash';
import { SettingsDataService } from '../../../modules/settings/settings-data.service';
import {
  formatConnectionFailureMessage,
  logConnectionTestError,
} from '../../../utils/connection-error';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import cacheManager from '../lib/cache';
import { CONNECTION_TEST_TIMEOUT_MS } from '../lib/httpTimeouts';
import { OmbiApi } from './helpers/ombi-api.helper';
import {
  OMBI_REQUESTS_CACHE_ID,
  OMBI_REQUESTS_CACHE_KEY,
} from './ombi-api.constants';

export type OmbiRequestType = 'movie' | 'tv';

interface OmbiBaseRequest {
  id: number;
  approved: boolean;
  markedAsApproved: string;
  requestedDate: string;
  available: boolean;
  markedAsAvailable: string | null;
  denied: boolean | null;
  // Set when the request came in through the API key (a bot, for instance);
  // the user it is then recorded under is Ombi's system user.
  requestedByAlias: string | null;
  requestedUser?: { userName: string } | null;
}

export interface OmbiMovieRequest extends OmbiBaseRequest {
  theMovieDbId: number;
  title: string;
  releaseDate: string;
  // A 4K request lives on the same row with its own state.
  has4KRequest: boolean;
  requestedDate4k: string;
  approved4K: boolean;
  markedAsApproved4K: string;
  available4K: boolean;
  markedAsAvailable4K: string | null;
}

export interface OmbiEpisodeRequest {
  episodeNumber: number;
  airDate: string;
  available: boolean;
}

export interface OmbiSeasonRequest {
  seasonNumber: number;
  episodes: OmbiEpisodeRequest[];
}

export interface OmbiChildRequest extends OmbiBaseRequest {
  parentRequestId: number;
  seasonRequests: OmbiSeasonRequest[];
}

export interface OmbiTvRequest {
  id: number;
  tvDbId: number;
  // The TMDB id, since Ombi moved its show lookups to TMDB.
  externalProviderId: number;
  title: string;
  releaseDate: string;
  childRequests: OmbiChildRequest[];
}

interface OmbiSearchResult {
  requestId: number;
}

interface OmbiRequestEngineResult {
  result: boolean;
  isError: boolean;
  errorMessage: string | null;
}

interface OmbiAbout {
  version: string;
}

interface OmbiRequestIndex {
  movies: Map<number, OmbiMovieRequest>;
  shows: Map<number, OmbiTvRequest>;
}

/** Ombi serialises an unset DateTime as year 1 rather than null. */
export const ombiDate = (value: string | null | undefined): Date | null => {
  if (!value || value.startsWith('0001-')) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const resolveOmbiRequester = (
  request: Pick<OmbiBaseRequest, 'requestedByAlias' | 'requestedUser'>,
): string | undefined =>
  request.requestedByAlias || request.requestedUser?.userName || undefined;

/** The child requests covering the season, or the episode when given. */
export const childRequestsFor = (
  show: OmbiTvRequest | null | undefined,
  season?: number,
  episode?: number,
): OmbiChildRequest[] =>
  (show?.childRequests ?? []).filter(
    (child) =>
      season === undefined ||
      child.seasonRequests.some(
        (s) =>
          s.seasonNumber === season &&
          (episode === undefined ||
            s.episodes.some((e) => e.episodeNumber === episode)),
      ),
  );

@Injectable()
export class OmbiApiService {
  api: OmbiApi;

  // Collapses the first concurrent batch of rule-evaluation items onto one
  // sweep while the run-scoped index is being built.
  private requestIndexPromise?: Promise<OmbiRequestIndex | undefined>;

  constructor(
    private readonly settings: SettingsDataService,
    private readonly logger: MaintainerrLogger,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {
    this.logger.setContext(OmbiApiService.name);
  }

  public init() {
    this.api = undefined;

    if (!this.settings.ombi_url) {
      return;
    }

    this.api = new OmbiApi(
      {
        url: stripTrailingSlashes(this.settings.ombi_url),
        apiKey: `${this.settings.ombi_api_key}`,
      },
      this.loggerFactory.createLogger(),
    );
  }

  public isConfigured(): boolean {
    return this.settings.ombiConfigured();
  }

  /**
   * `null`: Ombi answered and holds no request. `undefined`: the sweep failed,
   * so the getter treats it as transient. Copies, the index is shared.
   */
  public async getMovieRequest(
    tmdbId: number,
  ): Promise<OmbiMovieRequest | null | undefined> {
    const index = await this.getRequestIndex();
    if (!index) {
      return undefined;
    }
    const request = index.movies.get(tmdbId);
    return request ? cloneDeep(request) : null;
  }

  public async getShowRequest(
    tmdbId: number,
  ): Promise<OmbiTvRequest | null | undefined> {
    const index = await this.getRequestIndex();
    if (!index) {
      return undefined;
    }
    const request = index.shows.get(tmdbId);
    return request ? cloneDeep(request) : null;
  }

  /** `[]` when unreachable: a missing name must not suppress the warning. */
  public async getRequestedByUsernames(
    tmdbId: number,
    type: OmbiRequestType,
    season?: number,
    episode?: number,
  ): Promise<string[]> {
    if (!this.isConfigured() || !tmdbId) {
      return [];
    }

    const requests =
      type === 'movie'
        ? [await this.getMovieRequest(tmdbId)]
        : childRequestsFor(await this.getShowRequest(tmdbId), season, episode);

    const usernames = requests
      .map((request) => request && resolveOmbiRequester(request))
      .filter((username): username is string => !!username);

    return [...new Set(usernames)];
  }

  /** `undefined` when the outcome is unknown, never a removal that did not happen. */
  public async removeMediaByTmdbId(
    tmdbId: number,
    type: OmbiRequestType,
  ): Promise<boolean | undefined> {
    try {
      const requestId = await this.findRequestId(tmdbId, type);
      if (requestId === undefined) {
        return undefined;
      }
      if (!requestId) {
        return false;
      }

      await this.deleteRequest(
        type === 'movie'
          ? `/v1/Request/movie/${requestId}`
          : `/v1/Request/tv/${requestId}`,
      );
      return true;
    } catch (error) {
      this.logCommunicationFailure(error);
      return undefined;
    }
  }

  /**
   * A child request can only be deleted whole (Ombi's child update cannot
   * drop a season), so one that also covers other seasons is kept rather than
   * taking their requests down with it. Ombi drops the show request itself
   * with its last child.
   */
  public async removeSeasonRequest(
    tmdbId: number,
    season: number,
  ): Promise<boolean | undefined> {
    try {
      const covering = await this.getChildRequests(tmdbId, season);
      if (covering === undefined) {
        return undefined;
      }

      const shared = covering.filter((child) =>
        child.seasonRequests.some((s) => s.seasonNumber !== season),
      );
      if (shared.length > 0) {
        this.logger.log(
          `Kept ${shared.length} Ombi request(s) covering season ${season} of show with TMDB ID '${tmdbId}': they also cover other seasons`,
        );
      }

      const own = covering.filter((child) => !shared.includes(child));
      if (own.length === 0) {
        return false;
      }

      for (const child of own) {
        await this.deleteRequest(`/v1/Request/tv/child/${child.id}`);
      }
      return true;
    } catch (error) {
      this.logCommunicationFailure(error);
      return undefined;
    }
  }

  /** Whether another season is still waiting to arrive. */
  public async hasRemainingSeasonRequests(
    tmdbId: number,
    removedSeasonNumber: number,
  ): Promise<boolean | undefined> {
    if (!this.isConfigured()) {
      return undefined;
    }

    try {
      const children = await this.getChildRequests(tmdbId);
      if (children === undefined) {
        return undefined;
      }

      return children.some(
        (child) =>
          !child.denied &&
          child.seasonRequests.some(
            (s) =>
              s.seasonNumber !== removedSeasonNumber &&
              s.episodes.some((episode) => !episode.available),
          ),
      );
    } catch (error) {
      this.logCommunicationFailure(error);
      return undefined;
    }
  }

  public async testConnection(
    params?: ConstructorParameters<typeof OmbiApi>[0],
  ): Promise<BasicResponseDto> {
    const api = params
      ? new OmbiApi(
          { apiKey: params.apiKey, url: stripTrailingSlashes(params.url) },
          this.loggerFactory.createLogger(),
        )
      : this.api;

    try {
      const response = await api.getRawWithoutCache<OmbiAbout>(
        '/v1/Settings/about',
        { signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS) },
      );

      if (!response.data?.version) {
        return {
          status: 'NOK',
          code: 0,
          message:
            'Failure, an unexpected response was returned. The URL is likely incorrect.',
        };
      }

      return { status: 'OK', code: 1, message: response.data.version };
    } catch (error) {
      logConnectionTestError(this.logger, 'Ombi', error);

      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to Ombi. Verify URL and API key.',
        ),
      };
    }
  }

  private async getRequestIndex(): Promise<OmbiRequestIndex | undefined> {
    const cache = cacheManager.getCache(OMBI_REQUESTS_CACHE_ID)?.data;
    const cached = cache?.get<OmbiRequestIndex>(OMBI_REQUESTS_CACHE_KEY);
    if (cached) {
      return cached;
    }

    this.requestIndexPromise ??= this.buildRequestIndex().finally(() => {
      this.requestIndexPromise = undefined;
    });
    return this.requestIndexPromise;
  }

  private async buildRequestIndex(): Promise<OmbiRequestIndex | undefined> {
    this.logger.log('Prefetching Ombi requests...');
    const [movies, shows] = await Promise.all([
      this.api.getWithoutCache<OmbiMovieRequest[]>('/v1/Request/movie'),
      this.api.getWithoutCache<OmbiTvRequest[]>('/v1/Request/tv'),
    ]);

    // A failed sweep is not cached: the next batch retries it.
    if (!Array.isArray(movies) || !Array.isArray(shows)) {
      this.logger.warn(
        "Couldn't fetch Ombi requests. Is the application running?",
      );
      return undefined;
    }

    const index: OmbiRequestIndex = {
      movies: new Map(movies.map((movie) => [movie.theMovieDbId, movie])),
      shows: new Map(
        shows
          .filter((show) => show.externalProviderId > 0)
          .map((show) => [show.externalProviderId, show]),
      ),
    };

    cacheManager
      .getCache(OMBI_REQUESTS_CACHE_ID)
      ?.data.set(OMBI_REQUESTS_CACHE_KEY, index);
    this.logger.log(
      `Ombi request prefetch complete: ${movies.length} movie and ${shows.length} show requests.`,
    );
    return index;
  }

  /** Only the search view maps a TMDB id to Ombi's request id; 0 = unrequested. */
  private async findRequestId(
    tmdbId: number,
    type: OmbiRequestType,
  ): Promise<number | undefined> {
    const result = await this.api.getWithoutCache<OmbiSearchResult>(
      type === 'movie'
        ? `/v2/Search/movie/${tmdbId}`
        : `/v2/Search/tv/moviedb/${tmdbId}`,
    );
    return result ? (result.requestId ?? 0) : undefined;
  }

  private async getChildRequests(
    tmdbId: number,
    season?: number,
  ): Promise<OmbiChildRequest[] | undefined> {
    const requestId = await this.findRequestId(tmdbId, 'tv');
    if (requestId === undefined) {
      return undefined;
    }
    if (!requestId) {
      return [];
    }

    const children = await this.api.getWithoutCache<OmbiChildRequest[]>(
      `/v1/Request/tv/${requestId}/child`,
    );
    return Array.isArray(children)
      ? childRequestsFor({ childRequests: children } as OmbiTvRequest, season)
      : undefined;
  }

  // Movie and child deletes answer 200 with a result body even when refused;
  // the show delete answers an empty body.
  private async deleteRequest(path: string): Promise<void> {
    const result = await this.api.delete<OmbiRequestEngineResult | ''>(
      path,
      undefined,
      { rethrow: true },
    );
    if (result && typeof result === 'object' && result.isError) {
      throw new Error(result.errorMessage ?? 'Ombi refused the removal');
    }
  }

  private logCommunicationFailure(error: unknown) {
    this.logger.warn('Ombi communication failed. Is the application running?');
    this.logger.debug(error);
  }
}
