import { BasicResponseDto } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { cloneDeep } from 'lodash';
import { SettingsDataService } from '../../../modules/settings/settings-data.service';
import {
  CONNECTION_TEST_TIMEOUT_MS,
  formatConnectionFailureMessage,
  logConnectionTestError,
} from '../../../utils/connection-error';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import cacheManager from '../lib/cache';
import {
  SEERR_REQUESTS_CACHE_ID,
  SEERR_REQUESTS_CACHE_KEY,
  SEERR_REQUESTS_PAGE_SIZE,
} from './seerr-api.constants';
import { SeerrApi } from './helpers/seerr-api.helper';

interface SeerrMediaInfo {
  id: number;
  tmdbId: number;
  tvdbId: number;
  status: number;
  updatedAt: string;
  mediaAddedAt: string;
  externalServiceId: number;
  externalServiceId4k: number;
}

export interface SeerrMovieResponse {
  id: number;
  mediaInfo?: SeerrMovieInfo;
  releaseDate?: Date;
}

interface SeerrMovieInfo extends SeerrMediaInfo {
  mediaType: 'movie';
  requests?: SeerrMovieRequest[];
}

export interface SeerrTVResponse {
  id: number;
  mediaInfo?: SeerrTVInfo;
  firstAirDate?: Date;
}

interface SeerrTVInfo extends SeerrMediaInfo {
  mediaType: 'tv';
  requests?: SeerrTVRequest[];
  seasons?: SeerrSeasonResponse[];
}

export interface SeerrSeasonResponse {
  id: number;
  name: string;
  airDate?: string;
  seasonNumber: number;
  episodes: SeerrEpisode[];
}

interface SeerrEpisode {
  id: number;
  name: string;
  airDate?: string;
  seasonNumber: number;
  episodeNumber: number;
}

export enum SeerrRequestStatus {
  PENDING = 1,
  APPROVED,
  DECLINED,
  FAILED,
  COMPLETED,
}

export type SeerrBaseRequest = {
  id: number;
  status: SeerrRequestStatus | number;
  createdAt: string;
  updatedAt: string;
  requestedBy: SeerrUser;
  modifiedBy: SeerrUser;
  is4k: false;
  serverId: number;
  profileId: number;
  rootFolder: string;
};

export type SeerrTVRequest = SeerrBaseRequest & {
  type: 'tv';
  media: SeerrTVInfo;
  seasons: SeerrSeasonRequest[];
};

export type SeerrMovieRequest = SeerrBaseRequest & {
  type: 'movie';
  media: SeerrMovieInfo;
};

export type SeerrRequest = SeerrMovieRequest | SeerrTVRequest;

interface SeerrUser {
  id: number;
  email: string;
  username: string;
  plexToken: string;
  plexId?: number;
  plexUsername: string;
  jellyfinUsername?: string;
  userType: number;
  permissions: number;
  avatar: string;
  createdAt: string;
  updatedAt: string;
  requestCount: number;
}

export interface SeerrSeasonRequest {
  id: number;
  name: string;
  seasonNumber: number;
  status?: SeerrRequestStatus | number;
}

interface SeerrStatus {
  version: string;
  commitTag: string;
  updateAvailable: boolean;
  commitsBehind: number;
}

interface SeerrAbout {
  version: string;
}

export interface SeerrBasicApiResponse {
  code: string;
  description: string;
}

interface SeerrUserResponse {
  pageInfo: {
    pages: number;
    pageSize: number;
    results: number;
    page: number;
  };
  results: SeerrUserResponseResult[];
}

interface SeerrUserResponseResult {
  permissions: number;
  id: number;
  email: string;
  plexUsername: string;
  username: string;
  userType: number;
  plexId: number;
  avatar: string;
  createdAt: string;
  updatedAt: string;
  requestCount: number;
  displayName: string;
}

interface SeerrRequestPageResponse {
  pageInfo: {
    pages: number;
    pageSize: number;
    results: number;
    page: number;
  };
  results: SeerrRequest[];
}

@Injectable()
export class SeerrApiService {
  api: SeerrApi;

  // Deduplicates concurrent callers (the first batch of rule-evaluation items)
  // onto a single /request sweep while the run-scoped index is being built.
  private requestIndexPromise?: Promise<
    Map<number, SeerrRequest[]> | undefined
  >;

  constructor(
    private readonly settings: SettingsDataService,
    private readonly logger: MaintainerrLogger,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {
    this.logger.setContext(SeerrApiService.name);
  }

  public init() {
    if (!this.settings.seerr_url) {
      return;
    }

    this.api = new SeerrApi(
      {
        url: `${this.settings.seerr_url.endsWith('/') ? this.settings.seerr_url.slice(0, -1) : this.settings.seerr_url}/api/v1`,
        apiKey: `${this.settings.seerr_api_key}`,
      },
      this.loggerFactory.createLogger(),
    );
  }

  public isConfigured(): boolean {
    return this.settings.seerrConfigured();
  }

  public async getMovie(id: string | number): Promise<SeerrMovieResponse> {
    try {
      const response: SeerrMovieResponse = await this.api.get(`/movie/${id}`);
      return response;
    } catch (error) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(
        'Seerr communication failed. Is the application running?',
        error,
      );
      return undefined;
    }
  }

  public async getShow(showId: string | number): Promise<SeerrTVResponse> {
    try {
      if (showId) {
        const response: SeerrTVResponse = await this.api.get(`/tv/${showId}`);
        return response;
      }
      return undefined;
    } catch (error) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(
        'Seerr communication failed. Is the application running?',
        error,
      );
      return undefined;
    }
  }

  public async getSeason(
    showId: string | number,
    season: string,
  ): Promise<SeerrSeasonResponse> {
    try {
      if (showId) {
        const response: SeerrSeasonResponse = await this.api.get(
          `/tv/${showId}/season/${season}`,
        );
        return response;
      }
      return undefined;
    } catch (error) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(
        'Seerr communication failed. Is the application running?',
        error,
      );
      return undefined;
    }
  }

  public async getUsers(): Promise<SeerrUserResponseResult[]> {
    try {
      const size = 50;
      let hasNext = true;
      let skip = 0;

      const users: SeerrUserResponseResult[] = [];

      while (hasNext) {
        const resp: SeerrUserResponse = await this.api.get(
          `/user?take=${size}&skip=${skip}`,
        );

        users.push(...resp.results);

        if (resp?.pageInfo?.page < resp?.pageInfo?.pages) {
          skip = skip + size;
        } else {
          hasNext = false;
        }
      }
      return users;
    } catch (error) {
      this.logger.warn(
        `Couldn't fetch Seerr users. Is the application running?`,
      );
      this.logger.debug(
        `Couldn't fetch Seerr users. Is the application running?`,
        error,
      );
      return [];
    }
  }

  /**
   * Fetches every request in a single paginated sweep, mirroring getUsers()'s
   * pagination. Unlike getUsers() (which collapses errors to []), this returns
   * `undefined` on failure so the index build can tell a genuinely empty Seerr
   * (definitive: nothing requested) from an unreachable one (transient: protect
   * items). `[]` therefore means "Seerr reachable, no requests".
   */
  public async getRequests(): Promise<SeerrRequest[] | undefined> {
    try {
      const size = SEERR_REQUESTS_PAGE_SIZE;
      let hasNext = true;
      let skip = 0;

      const requests: SeerrRequest[] = [];

      while (hasNext) {
        // Seerr has no `added` sort value (only `modified` → request.updatedAt;
        // anything else falls back to the default `request.id DESC`), so we omit
        // `sort` and let buildRequestIndex normalise ordering instead of relying
        // on the sweep order. `filter=all` keeps every request status.
        const resp = await this.api.getWithoutCache<SeerrRequestPageResponse>(
          `/request?take=${size}&skip=${skip}&filter=all`,
        );

        // The HTTP helper swallows request failures and returns undefined; a
        // genuine empty result still carries pageInfo. A missing pageInfo means
        // the sweep failed — surface that (transient), don't read it as empty.
        if (!resp?.pageInfo) {
          return undefined;
        }

        requests.push(...(resp.results ?? []));

        if (resp.pageInfo.page < resp.pageInfo.pages) {
          skip = skip + size;
        } else {
          hasNext = false;
        }
      }
      return requests;
    } catch (error) {
      this.logger.warn(
        `Couldn't fetch Seerr requests. Is the application running?`,
      );
      this.logger.debug(
        `Couldn't fetch Seerr requests. Is the application running?`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Run-scoped lookup of the Seerr requests for a single tmdbId, backed by one
   * bulk /request sweep per rule-group run (issue #3152). The per-item
   * getMovie/getShow calls this replaces rate-limited under whole-library runs,
   * making Seerr-seeded rules silently match almost nothing.
   *
   * Returns a deep copy of the title's request list (the cache holds the Map by
   * reference with useClones off), so callers may read or mutate it freely
   * without corrupting the shared index. `[]` means the sweep succeeded and the
   * title has no request (definitive). `undefined` means the sweep failed —
   * Seerr is unreachable — so the getter returns `undefined` (transient) and the
   * comparator protects the item rather than treating it as "not requested".
   */
  public async getRequestsForMedia(
    tmdbId: number,
  ): Promise<SeerrRequest[] | undefined> {
    const index = await this.getRequestIndex();
    if (index === undefined) {
      return undefined;
    }
    const requests = index.get(tmdbId);
    // cloneDeep, not structuredClone: it never throws on an unexpected
    // non-cloneable value (which would surface as a per-item warn + skip).
    return requests ? cloneDeep(requests) : [];
  }

  private async getRequestIndex(): Promise<
    Map<number, SeerrRequest[]> | undefined
  > {
    const cache = cacheManager.getCache(SEERR_REQUESTS_CACHE_ID)?.data;
    const cached = cache?.get<Map<number, SeerrRequest[]>>(
      SEERR_REQUESTS_CACHE_KEY,
    );
    if (cached) {
      return cached;
    }

    // Collapse the first concurrent batch of callers onto one sweep.
    this.requestIndexPromise ??= this.buildRequestIndex().finally(() => {
      this.requestIndexPromise = undefined;
    });
    return this.requestIndexPromise;
  }

  private async buildRequestIndex(): Promise<
    Map<number, SeerrRequest[]> | undefined
  > {
    const requests = await this.getRequests();
    // Don't cache a failed sweep: a later batch in the same run retries, giving
    // a transient Seerr blip a chance to recover instead of poisoning the run.
    if (requests === undefined) {
      return undefined;
    }

    // requestDate reads requests[0].createdAt and the legacy per-item
    // getMovie/getShow path returned mediaInfo.requests oldest-first. The bulk
    // /request sweep is newest-first, so sort ascending by createdAt (tie-break
    // on id) — requestDate, addUser and the season ordering then match the
    // pre-#3152 behaviour regardless of how Seerr happened to page the sweep.
    requests.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.id - b.id,
    );

    // Group by media.tmdbId: Seerr keys every media row by tmdbId (non-null,
    // indexed — tvdbId/imdbId are optional extras), and the metadata service
    // resolves each library item to that tmdbId via all its providers (with
    // tvdb/imdb -> tmdb bridging), so tmdbId is the canonical join key (and
    // matches the per-item getMovie/getShow path this replaces). media.requests
    // is not populated on the list endpoint (it would be circular), so each
    // title's request set is rebuilt here.
    const index = new Map<number, SeerrRequest[]>();
    for (const request of requests) {
      const tmdbId = request.media?.tmdbId;
      if (typeof tmdbId !== 'number') {
        continue;
      }
      const existing = index.get(tmdbId);
      if (existing) {
        existing.push(request);
      } else {
        index.set(tmdbId, [request]);
      }
    }

    cacheManager
      .getCache(SEERR_REQUESTS_CACHE_ID)
      ?.data.set(SEERR_REQUESTS_CACHE_KEY, index);
    this.logger.log(
      `Seerr request prefetch complete: ${requests.length} requests across ${index.size} titles.`,
    );
    return index;
  }

  public async deleteRequest(requestId: string) {
    try {
      const response: SeerrBasicApiResponse = await this.api.delete(
        `/request/${requestId}`,
      );
      return response;
    } catch (error) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(
        'Seerr communication failed. Is the application running?',
        error,
      );
      return undefined;
    }
  }

  public async removeSeasonRequest(tmdbid: string | number, season: number) {
    try {
      const media = await this.getShow(tmdbid);

      if (media?.mediaInfo) {
        const requests = (media.mediaInfo.requests ?? []).filter((el) =>
          el.seasons.find((s) => s.seasonNumber === season),
        );
        if (requests.length > 0) {
          for (const el of requests) {
            await this.deleteRequest(el.id.toString());
          }
        } else {
          // no requests? clear data and let Seerr refetch.
          await this.api.delete(`/media/${media.id}`);
        }
      }
    } catch (error) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(
        'Seerr communication failed. Is the application running?',
        error,
      );
      return undefined;
    }
  }

  public async hasRemainingSeasonRequests(
    tmdbid: string | number,
    removedSeasonNumber: number,
  ): Promise<boolean | undefined> {
    if (!this.settings.seerrConfigured()) {
      return undefined;
    }

    try {
      const media = await this.getShow(tmdbid);

      // getShow returns undefined only on communication failure or falsy id;
      // the show being untracked still yields a response with mediaInfo == null.
      if (!media) {
        return undefined;
      }

      if (!media.mediaInfo) {
        return false;
      }

      const requests = media.mediaInfo.requests ?? [];

      return requests
        .filter(
          (request) =>
            request.status !== SeerrRequestStatus.DECLINED &&
            request.status !== SeerrRequestStatus.COMPLETED,
        )
        .some((request) =>
          request.seasons.some(
            (season) =>
              season.seasonNumber !== removedSeasonNumber &&
              season.status !== SeerrRequestStatus.COMPLETED,
          ),
        );
    } catch (error) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async deleteMediaItem(mediaId: string | number) {
    try {
      const response: SeerrBasicApiResponse = await this.api.delete(
        `/media/${mediaId}`,
      );
      return response;
    } catch (error) {
      this.logger.log(
        `Couldn't delete media ${mediaId}. Does it exist in Seerr?`,
      );
      this.logger.debug(
        `Couldn't delete media ${mediaId}. Does it exist in Seerr?`,
        error,
      );
      return null;
    }
  }

  public async removeMediaByTmdbId(id: string | number, type: 'movie' | 'tv') {
    try {
      let media: SeerrMovieResponse | SeerrTVResponse;
      if (type === 'movie') {
        media = await this.getMovie(id);
      } else {
        media = await this.getShow(id);
      }

      if (!media.mediaInfo?.id) {
        return undefined;
      }

      try {
        await this.deleteMediaItem(media.mediaInfo.id.toString());
      } catch (error) {
        this.logger.log(
          `Couldn't delete media by TMDB ID ${id}. Does it exist in Seerr?`,
        );
        this.logger.debug(
          `Couldn't delete media by TMDB ID ${id}. Does it exist in Seerr?`,
          error,
        );
      }
    } catch (error) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(
        'Seerr communication failed. Is the application running?',
        error,
      );
      return undefined;
    }
  }

  public async status(): Promise<SeerrStatus> {
    try {
      const response: SeerrStatus = await this.api.getWithoutCache(`/status`, {
        signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
      });
      return response;
    } catch (error) {
      this.logger.log("Couldn't fetch Seerr status");
      this.logger.debug(error);
      return null;
    }
  }

  public async testConnection(
    params?: ConstructorParameters<typeof SeerrApi>[0],
  ): Promise<BasicResponseDto> {
    const api = params
      ? new SeerrApi(
          {
            apiKey: params.apiKey,
            url: `${params.url?.endsWith('/') ? params.url.slice(0, -1) : params.url}/api/v1`,
          },
          this.loggerFactory.createLogger(),
        )
      : this.api;

    try {
      const response = await api.getRawWithoutCache<SeerrAbout>(
        `/settings/about`,
        {
          signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
        },
      );

      if (!response.data?.version) {
        return {
          status: 'NOK',
          code: 0,
          message:
            'Failure, an unexpected response was returned. The URL is likely incorrect.',
        };
      }

      return {
        status: 'OK',
        code: 1,
        message: response.data.version,
      };
    } catch (error) {
      logConnectionTestError(this.logger, 'Seerr');

      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to Seerr. Verify URL and API key.',
        ),
      };
    }
  }
}
