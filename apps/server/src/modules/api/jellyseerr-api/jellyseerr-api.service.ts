import { BasicResponseDto } from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import { JellyseerrApi } from './helpers/jellyseerr-api.helper';

interface JellyseerrMediaInfo {
  id: number;
  tmdbId: number;
  tvdbId: number;
  status: number;
  updatedAt: string;
  mediaAddedAt: string;
  externalServiceId: number;
  externalServiceId4k: number;
}

export interface JellyseerrMovieResponse {
  id: number;
  mediaInfo?: JellyseerrMovieInfo;
  releaseDate?: Date;
}

interface JellyseerrMovieInfo extends JellyseerrMediaInfo {
  mediaType: 'movie';
  requests?: JellyseerrMovieRequest[];
}

export interface JellyseerrTVResponse {
  id: number;
  mediaInfo?: JellyseerrTVInfo;
  firstAirDate?: Date;
}

interface JellyseerrTVInfo extends JellyseerrMediaInfo {
  mediaType: 'tv';
  requests?: JellyseerrTVRequest[];
  seasons?: JellyseerrSeasonResponse[];
}

export interface JellyseerrSeasonResponse {
  id: number;
  name: string;
  airDate?: string;
  seasonNumber: number;
  episodes: JellyseerrEpisode[];
}

interface JellyseerrEpisode {
  id: number;
  name: string;
  airDate?: string;
  seasonNumber: number;
  episodeNumber: number;
}

export type JellyseerrBaseRequest = {
  id: number;
  status: number;
  createdAt: string;
  updatedAt: string;
  requestedBy: JellyseerrUser;
  modifiedBy: JellyseerrUser;
  is4k: false;
  serverId: number;
  profileId: number;
  rootFolder: string;
};

export type JellyseerrTVRequest = JellyseerrBaseRequest & {
  type: 'tv';
  media: JellyseerrTVInfo;
  seasons: JellyseerrSeasonRequest[];
};

export type JellyseerrMovieRequest = JellyseerrBaseRequest & {
  type: 'movie';
  media: JellyseerrMovieInfo;
};

export type JellyseerrRequest = JellyseerrMovieRequest | JellyseerrTVRequest;

interface JellyseerrUser {
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

export interface JellyseerrSeasonRequest {
  id: number;
  name: string;
  seasonNumber: number;
}

interface JellyseerrStatus {
  version: string;
  commitTag: string;
  updateAvailable: boolean;
  commitsBehind: number;
}

interface JellyseerrAbout {
  version: string;
}

export interface JellyseerrBasicApiResponse {
  code: string;
  description: string;
}

interface JellyseerrUserResponse {
  pageInfo: {
    pages: number;
    pageSize: number;
    results: number;
    page: number;
  };
  results: JellyseerrUserResponseResult[];
}

interface JellyseerrUserResponseResult {
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

@Injectable()
export class JellyseerrApiService {
  api: JellyseerrApi;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(JellyseerrApiService.name);
  }

  public init() {
    if (!this.settings.jellyseerr_url) {
      return;
    }

    this.api = new JellyseerrApi(
      {
        url: `${this.settings.jellyseerr_url.replace(/\/$/, '')}/api/v1`,
        apiKey: `${this.settings.jellyseerr_api_key}`,
      },
      this.logger,
    );
  }

  public async getMovie(id: string | number): Promise<JellyseerrMovieResponse> {
    try {
      const response: JellyseerrMovieResponse = await this.api.get(
        `/movie/${id}`,
      );
      return response;
    } catch (err) {
      this.logger.warn(
        'Jellyseerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getShow(showId: string | number): Promise<JellyseerrTVResponse> {
    try {
      if (showId) {
        const response: JellyseerrTVResponse = await this.api.get(
          `/tv/${showId}`,
        );
        return response;
      }
      return undefined;
    } catch (err) {
      this.logger.warn(
        'Jellyseerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getSeason(
    showId: string | number,
    season: string,
  ): Promise<JellyseerrSeasonResponse> {
    try {
      if (showId) {
        const response: JellyseerrSeasonResponse = await this.api.get(
          `/tv/${showId}/season/${season}`,
        );
        return response;
      }
      return undefined;
    } catch (err) {
      this.logger.warn(
        'Jellyseerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getUsers(): Promise<any> {
    try {
      const size = 50;
      let hasNext = true;
      let skip = 0;

      const users: JellyseerrUserResponseResult[] = [];

      while (hasNext) {
        const resp: JellyseerrUserResponse = await this.api.get(
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
    } catch (err) {
      this.logger.warn(
        `Couldn't fetch Jellyseerr users. Is the application running?`,
      );
      this.logger.debug(err);
      return [];
    }
  }

  public async deleteRequest(requestId: string) {
    try {
      const response: JellyseerrBasicApiResponse = await this.api.delete(
        `/request/${requestId}`,
      );
      return response;
    } catch (err) {
      this.logger.warn(
        'Jellyseerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async removeSeasonRequest(tmdbid: string | number, season: number) {
    try {
      const media = await this.getShow(tmdbid);

      if (media && media.mediaInfo) {
        const requests = media.mediaInfo.requests.filter((el) =>
          el.seasons.find((s) => s.seasonNumber === season),
        );
        if (requests.length > 0) {
          for (const el of requests) {
            await this.deleteRequest(el.id.toString());
          }
        } else {
          // no requests ? clear data and let Jellyseerr refetch.
          await this.api.delete(`/media/${media.id}`);
        }

        // can't clear season data. Overserr doesn't have media ID's for seasons...

        // const seasons = media.mediaInfo.seasons?.filter(
        //   (el) => el.seasonNumber === season,
        // );

        // if (seasons.length > 0) {
        //   for (const el of seasons) {
        //     const resp = await this.api.post(`/media/${el.id}/unknown`);
        //     console.log(resp);
        //   }
        // }
      }
    } catch (err) {
      this.logger.warn(
        'Jellyseerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async deleteMediaItem(mediaId: string | number) {
    try {
      const response: JellyseerrBasicApiResponse = await this.api.delete(
        `/media/${mediaId}`,
      );
      return response;
    } catch (e) {
      this.logger.log(
        `Couldn't delete media ${mediaId}. Does it exist in Jellyseerr? ${e.message}`,
      );
      this.logger.debug(e);
      return null;
    }
  }

  public async removeMediaByTmdbId(id: string | number, type: 'movie' | 'tv') {
    try {
      let media: JellyseerrMovieResponse | JellyseerrTVResponse;
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
      } catch (e) {
        this.logger.log(
          `Couldn't delete media by TMDB ID ${id}. Does it exist in Jellyseerr? ${e.message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        'Jellyseerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async status(): Promise<JellyseerrStatus> {
    try {
      const response: JellyseerrStatus = await this.api.getWithoutCache(
        `/status`,
        {
          signal: AbortSignal.timeout(10000), // aborts request after 10 seconds
        },
      );
      return response;
    } catch (e) {
      this.logger.log(`Couldn't fetch Jellyseerr status: ${e.message}`);
      this.logger.debug(e);
      return null;
    }
  }

  public async testConnection(
    params?: ConstructorParameters<typeof JellyseerrApi>[0],
  ): Promise<BasicResponseDto> {
    const api = params
      ? new JellyseerrApi(
          {
            apiKey: params.apiKey,
            url: `${params.url?.replace(/\/$/, '')}/api/v1`,
          },
          this.logger,
        )
      : this.api;

    try {
      const response = await api.getRawWithoutCache<JellyseerrAbout>(
        `/settings/about`,
        {
          signal: AbortSignal.timeout(10000), // aborts request after 10 seconds
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
    } catch (e) {
      this.logger.warn(
        `A failure occurred testing Jellyseerr connectivity: ${e}`,
      );

      if (e instanceof AxiosError) {
        if (e.response?.status === 403) {
          return {
            status: 'NOK',
            code: 0,
            message: 'Invalid API key',
          };
        } else if (e.response?.status) {
          return {
            status: 'NOK',
            code: 0,
            message: `Failure, received response: ${e.response?.status} ${e.response?.statusText}.`,
          };
        }
      }

      return {
        status: 'NOK',
        code: 0,
        message: `Failure: ${e.message}`,
      };
    }
  }
}
