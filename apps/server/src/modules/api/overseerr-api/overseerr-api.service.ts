import { BasicResponseDto } from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { SettingsService } from '../../../modules/settings/settings.service';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import { OverseerrApi } from './helpers/overseerr-api.helper';

interface OverseerrMediaInfo {
  id: number;
  tmdbId: number;
  tvdbId: number;
  status: number;
  updatedAt: string;
  mediaAddedAt: string;
  externalServiceId: number;
  externalServiceId4k: number;
}

export interface OverSeerrMovieResponse {
  id: number;
  mediaInfo?: OverseerrMovieInfo;
  releaseDate?: Date;
}

interface OverseerrMovieInfo extends OverseerrMediaInfo {
  mediaType: 'movie';
  requests?: OverseerrMovieRequest[];
}

export interface OverSeerrTVResponse {
  id: number;
  mediaInfo?: OverseerrTVInfo;
  firstAirDate?: Date;
}

interface OverseerrTVInfo extends OverseerrMediaInfo {
  mediaType: 'tv';
  requests?: OverseerrTVRequest[];
  seasons?: OverSeerrSeasonResponse[];
}

export interface OverSeerrSeasonResponse {
  id: number;
  name: string;
  airDate?: string;
  seasonNumber: number;
  episodes: OverseerrEpisode[];
}

interface OverseerrEpisode {
  id: number;
  name: string;
  airDate?: string;
  seasonNumber: number;
  episodeNumber: number;
}

export type OverseerrBaseRequest = {
  id: number;
  status: number;
  createdAt: string;
  updatedAt: string;
  requestedBy: OverseerrUser;
  modifiedBy: OverseerrUser;
  is4k: false;
  serverId: number;
  profileId: number;
  rootFolder: string;
};

export type OverseerrTVRequest = OverseerrBaseRequest & {
  type: 'tv';
  media: OverseerrTVInfo;
  seasons: OverseerrSeasonRequest[];
};

export type OverseerrMovieRequest = OverseerrBaseRequest & {
  type: 'movie';
  media: OverseerrMovieInfo;
};

export type OverseerrRequest = OverseerrMovieRequest | OverseerrTVRequest;

interface OverseerrUser {
  id: number;
  email: string;
  username: string;
  plexToken: string;
  plexId?: number;
  plexUsername: string;
  userType: number;
  permissions: number;
  avatar: string;
  createdAt: string;
  updatedAt: string;
  requestCount: number;
}

export interface OverseerrSeasonRequest {
  id: number;
  name: string;
  seasonNumber: number;
}

interface OverseerrStatus {
  version: string;
  commitTag: string;
  updateAvailable: boolean;
  commitsBehind: number;
}

interface OverseerrAbout {
  version: string;
}

export interface OverseerBasicApiResponse {
  code: string;
  description: string;
}

interface OverseerrUserResponse {
  pageInfo: {
    pages: number;
    pageSize: number;
    results: number;
    page: number;
  };
  results: OverseerrUserResponseResult[];
}

interface OverseerrUserResponseResult {
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
export class OverseerrApiService {
  api: OverseerrApi;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
    private readonly logger: MaintainerrLogger,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {
    this.logger.setContext(OverseerrApiService.name);
  }

  public init() {
    if (!this.settings.overseerr_url) {
      return;
    }

    this.api = new OverseerrApi(
      {
        url: `${this.settings.overseerr_url.replace(/\/$/, '')}/api/v1`,
        apiKey: `${this.settings.overseerr_api_key}`,
      },
      this.loggerFactory.createLogger(),
    );
  }

  public async getMovie(id: string | number): Promise<OverSeerrMovieResponse> {
    try {
      const response: OverSeerrMovieResponse = await this.api.get(
        `/movie/${id}`,
      );
      return response;
    } catch (err) {
      this.logger.warn(
        'Overseerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getShow(showId: string | number): Promise<OverSeerrTVResponse> {
    try {
      if (showId) {
        const response: OverSeerrTVResponse = await this.api.get(
          `/tv/${showId}`,
        );
        return response;
      }
      return undefined;
    } catch (err) {
      this.logger.warn(
        'Overseerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getSeason(
    showId: string | number,
    season: string,
  ): Promise<OverSeerrSeasonResponse> {
    try {
      if (showId) {
        const response: OverSeerrSeasonResponse = await this.api.get(
          `/tv/${showId}/season/${season}`,
        );
        return response;
      }
      return undefined;
    } catch (err) {
      this.logger.warn(
        'Overseerr communication failed. Is the application running?',
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

      const users: OverseerrUserResponseResult[] = [];

      while (hasNext) {
        const resp: OverseerrUserResponse = await this.api.get(
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
        `Couldn't fetch Overseerr users. Is the application running?`,
      );
      this.logger.debug(err);
      return [];
    }
  }

  public async deleteRequest(requestId: string) {
    try {
      const response: OverseerBasicApiResponse = await this.api.delete(
        `/request/${requestId}`,
      );
      return response;
    } catch (err) {
      this.logger.warn(
        'Overseerr communication failed. Is the application running?',
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
          // no requests ? clear data and let Overseerr refetch.
          await this.api.delete(`/media/${media.id}`);
        }
      }
    } catch (err) {
      this.logger.warn(
        'Overseerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async deleteMediaItem(mediaId: string | number) {
    try {
      const response: OverseerBasicApiResponse = await this.api.delete(
        `/media/${mediaId}`,
      );
      return response;
    } catch (e) {
      this.logger.log(
        `Couldn't delete media ${mediaId}. Does it exist in Overseerr? ${e.message}`,
      );
      this.logger.debug(e);
      return null;
    }
  }

  public async removeMediaByTmdbId(id: string | number, type: 'movie' | 'tv') {
    try {
      let media: OverSeerrMovieResponse | OverSeerrTVResponse;
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
          `Couldn't delete media by TMDB ID ${id}. Does it exist in Overseerr? ${e.message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        'Overseerr communication failed. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async status(): Promise<OverseerrStatus> {
    try {
      const response: OverseerrStatus = await this.api.getWithoutCache(
        `/status`,
        {
          signal: AbortSignal.timeout(10000), // aborts request after 10 seconds
        },
      );
      return response;
    } catch (e) {
      this.logger.log(`Couldn't fetch Overseerr status: ${e.message}`);
      this.logger.debug(e);
      return null;
    }
  }

  public async testConnection(
    params?: ConstructorParameters<typeof OverseerrApi>[0],
  ): Promise<BasicResponseDto> {
    const api = params
      ? new OverseerrApi(
          {
            apiKey: params.apiKey,
            url: `${params.url?.replace(/\/$/, '')}/api/v1`,
          },
          this.loggerFactory.createLogger(),
        )
      : this.api;

    try {
      const response = await api.getRawWithoutCache<OverseerrAbout>(
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
        `A failure occurred testing Overseerr connectivity: ${e}`,
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
