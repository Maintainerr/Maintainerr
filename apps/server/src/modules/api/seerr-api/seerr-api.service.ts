import { BasicResponseDto } from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { SettingsService } from '../../../modules/settings/settings.service';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
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

export type SeerrBaseRequest = {
  id: number;
  status: number;
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

@Injectable()
export class SeerrApiService {
  api: SeerrApi;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
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
        url: `${this.settings.seerr_url.replace(/\/$/, '')}/api/v1`,
        apiKey: `${this.settings.seerr_api_key}`,
      },
      this.loggerFactory.createLogger(),
    );
  }

  public async getMovie(id: string | number): Promise<SeerrMovieResponse> {
    try {
      const response: SeerrMovieResponse = await this.api.get(`/movie/${id}`);
      return response;
    } catch (err) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.warn(
        `Couldn't fetch Seerr users. Is the application running?`,
      );
      this.logger.debug(err);
      return [];
    }
  }

  public async deleteRequest(requestId: string) {
    try {
      const response: SeerrBasicApiResponse = await this.api.delete(
        `/request/${requestId}`,
      );
      return response;
    } catch (err) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async removeSeasonRequest(tmdbid: string | number, season: number) {
    try {
      const media = await this.getShow(tmdbid);

      if (media?.mediaInfo) {
        const requests = media.mediaInfo.requests.filter((el) =>
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
    } catch (err) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async deleteMediaItem(mediaId: string | number) {
    try {
      const response: SeerrBasicApiResponse = await this.api.delete(
        `/media/${mediaId}`,
      );
      return response;
    } catch (e) {
      this.logger.log(
        `Couldn't delete media ${mediaId}. Does it exist in Seerr? ${e.message}`,
      );
      this.logger.debug(e);
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
      } catch (e) {
        this.logger.log(
          `Couldn't delete media by TMDB ID ${id}. Does it exist in Seerr? ${e.message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        'Seerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async status(): Promise<SeerrStatus> {
    try {
      const response: SeerrStatus = await this.api.getWithoutCache(`/status`, {
        signal: AbortSignal.timeout(10000),
      });
      return response;
    } catch (e) {
      this.logger.log(`Couldn't fetch Seerr status: ${e.message}`);
      this.logger.debug(e);
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
            url: `${params.url?.replace(/\/$/, '')}/api/v1`,
          },
          this.loggerFactory.createLogger(),
        )
      : this.api;

    try {
      const response = await api.getRawWithoutCache<SeerrAbout>(
        `/settings/about`,
        {
          signal: AbortSignal.timeout(10000),
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
      this.logger.warn(`A failure occurred testing Seerr connectivity: ${e}`);

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
