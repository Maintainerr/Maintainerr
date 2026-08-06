import { BasicResponseDto, stripTrailingSlashes } from '@maintainerr/contracts';
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
import { createPrefetchProgressReporter } from '../../../utils/prefetch-progress';
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

/**
 * Reads the name off the request rather than looking the user up on the media
 * server: media server user IDs don't match Seerr's plexId. Seerr stores the
 * name per user type - Plex in plexUsername, local in username, Jellyfin/Emby
 * in jellyfinUsername.
 */
export const resolveRequestUsername = (request: {
  requestedBy?: {
    plexUsername?: string;
    jellyfinUsername?: string;
    username?: string;
  };
}): string | undefined => {
  const user = request.requestedBy;
  if (!user) return undefined;

  return (
    user.plexUsername || user.jellyfinUsername || user.username || undefined
  );
};

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
    // Drop the previous client first, so removing Seerr from settings stops
    // the app querying it rather than leaving the old one live until restart.
    this.api = undefined;

    if (!this.settings.seerr_url) {
      return;
    }

    this.api = new SeerrApi(
      {
        // Settings saved before the URL schema normalised them can still hold
        // a trailing slash.
        url: `${stripTrailingSlashes(this.settings.seerr_url)}/api/v1`,
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
      // Bracket the sweep like the media-server ones do: with only the decile
      // lines, a sweep that fits in one page said nothing at all, and a slow
      // one had no line to attribute the wait to.
      this.logger.log('Prefetching Seerr requests...');
      const reportProgress = createPrefetchProgressReporter(
        (message) => this.logger.log(message),
        'Prefetching Seerr requests',
        'requests',
      );

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
        // the sweep failed - surface that (transient), don't read it as empty.
        if (!resp?.pageInfo) {
          return undefined;
        }

        requests.push(...(resp.results ?? []));
        reportProgress(requests.length, resp.pageInfo.results);

        if (resp.pageInfo.page < resp.pageInfo.pages) {
          skip = skip + size;
        } else {
          hasNext = false;
        }
      }
      // The completion line belongs to buildRequestIndex, this method's only
      // caller: it reports the same sweep plus the title count, so logging it
      // here too reads as two prefetches.
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
   * title has no request (definitive). `undefined` means the sweep failed -
   * Seerr is unreachable - so the getter returns `undefined` (transient) and the
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

  /**
   * Usernames of everyone who requested a title. Unlike the rule getter's
   * contract, an unreachable Seerr yields `[]` rather than `undefined`: failing
   * to name the requester must never suppress the pre-deletion warning itself.
   *
   * `season` is required for TV, since Seerr tracks requests per season -
   * without it a season-level item credits whoever requested a different season.
   */
  public async getRequestedByUsernames(
    tmdbId: number,
    season?: number,
  ): Promise<string[]> {
    if (!this.isConfigured() || !tmdbId) {
      return [];
    }

    const requests = await this.getRequestsForMedia(tmdbId);
    if (!requests?.length) {
      return [];
    }

    const usernames = requests
      .filter(
        (request) =>
          season === undefined ||
          request.type !== 'tv' ||
          request.seasons?.some((s) => Number(s.seasonNumber) === season),
      )
      .map((request) => resolveRequestUsername(request))
      .filter((username): username is string => username !== undefined);

    return [...new Set(usernames)];
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
    // on id) - requestDate, addUser and the season ordering then match the
    // pre-#3152 behaviour regardless of how Seerr happened to page the sweep.
    requests.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.id - b.id,
    );

    // Group by media.tmdbId: Seerr keys every media row by tmdbId (non-null,
    // indexed - tvdbId/imdbId are optional extras), and the metadata service
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

  /**
   * Whether the season's requests were removed. `undefined` when that could not
   * be established, the same contract as {@link hasRemainingSeasonRequests}, so
   * a caller never reports a removal that did not happen. The writes rethrow
   * rather than answering their body: a 204 carries an empty one, so success
   * and failure are both falsy.
   */
  public async removeSeasonRequest(
    tmdbid: string | number,
    season: number,
  ): Promise<boolean | undefined> {
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

      const requests = (media.mediaInfo.requests ?? []).filter((el) =>
        el.seasons.find((s) => s.seasonNumber === season),
      );
      if (requests.length > 0) {
        for (const el of requests) {
          await this.api.delete(`/request/${el.id}`, undefined, {
            rethrow: true,
          });
        }
      } else {
        // No requests? Clear the media record and let Seerr refetch. Keyed on
        // Seerr's own media id, not `media.id`, which is the TMDB id: Seerr
        // answers 204 for an id it does not hold, so the wrong one was a no-op
        // that reported success.
        await this.api.delete(`/media/${media.mediaInfo.id}`, undefined, {
          rethrow: true,
        });
      }

      return true;
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

  /** Whether the media record was cleared, with the same contract as
   * {@link removeSeasonRequest}. */
  public async removeMediaByTmdbId(
    id: string | number,
    type: 'movie' | 'tv',
  ): Promise<boolean | undefined> {
    try {
      const media: SeerrMovieResponse | SeerrTVResponse =
        type === 'movie' ? await this.getMovie(id) : await this.getShow(id);

      // Reading through an undefined media used to throw, which the catch
      // below then reported as a communication failure. Answer it directly.
      if (!media) {
        return undefined;
      }

      if (!media.mediaInfo?.id) {
        return false;
      }

      await this.api.delete(`/media/${media.mediaInfo.id}`, undefined, {
        rethrow: true,
      });

      return true;
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
            url: `${stripTrailingSlashes(params.url)}/api/v1`,
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
