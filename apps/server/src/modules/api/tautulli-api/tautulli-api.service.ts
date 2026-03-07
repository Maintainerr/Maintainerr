import { BasicResponseDto } from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { AxiosError, CanceledError } from 'axios';
import _ from 'lodash';
import { SettingsService } from '../../..//modules/settings/settings.service';
import {
  formatConnectionFailureMessage,
  logConnectionTestError,
} from '../../../utils/connection-error';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import { TautulliApi } from './helpers/tautulli-api.helper';

interface TautulliInfo {
  tautulli_version: string;
}

export interface TautulliUser {
  user_id: number;
  username: string;
}

export interface TautulliMetadata {
  media_type:
    | 'season'
    | 'episode'
    | 'movie'
    | 'track'
    | 'album'
    | 'artist'
    | 'show';
  rating_key: string;
  parent_rating_key: string;
  grandparent_rating_key: string;
  added_at: string;
}

interface TautulliChildrenMetadata {
  children_count: number;
  children_list: TautulliMetadata[];
}

interface TautulliHistory {
  recordsFiltered: number;
  recordsTotal: number;
  data: TautulliHistoryItem[];
  draw: number;
  filter_duration: string;
  total_duration: string;
}

interface TautulliHistoryItem {
  user_id: number;
  user: string;
  watched_status: number;
  percent_complete: number;
  stopped: number;
  rating_key: number;
  media_index: number;
  parent_media_index: number;
}

export interface TautulliHistoryRequestOptions {
  grouping?: 0 | 1;
  include_activity?: 0 | 1;
  user?: string;
  user_id?: number;
  rating_key?: number | string;
  parent_rating_key?: number | string;
  grandparent_rating_key?: number | string;
  start_date?: string;
  before?: string;
  after?: string;
  section_id?: number;
  media_type?: 'movie' | 'episode' | 'track' | 'live';
  transcode_decision?: 'direct play' | 'transcode' | 'copy';
  guid?: string;
  order_column?: string;
  order_dir?: 'desc' | 'asc';
  start?: number;
  length?: number;
  search?: string;
}

interface Response<T> {
  response:
    | {
        message: string | null;
        result: 'success';
        data: T;
      }
    | {
        message: string | null;
        result: 'error';
        data: object;
      };
}

const MAX_PAGE_SIZE = 100;

@Injectable()
export class TautulliApiService {
  api: TautulliApi;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
    private readonly logger: MaintainerrLogger,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {
    logger.setContext(TautulliApiService.name);
  }

  public init() {
    if (!this.settings.tautulli_url) {
      return;
    }

    this.api = new TautulliApi(
      {
        url: `${this.settings.tautulli_url}/api/v2`,
        apiKey: this.settings.tautulli_api_key,
      },
      this.loggerFactory.createLogger(),
    );
  }

  public async info(): Promise<Response<TautulliInfo> | null> {
    try {
      const response: Response<TautulliInfo> = await this.api.getWithoutCache(
        '',
        {
          signal: AbortSignal.timeout(10000),
          params: {
            cmd: 'get_tautulli_info',
          },
        },
      );
      return response;
    } catch (e) {
      this.logger.log(`Couldn't fetch Tautulli info: ${e.message}`);
      this.logger.debug(e);
      return null;
    }
  }

  public async getPaginatedHistory(
    options?: TautulliHistoryRequestOptions,
  ): Promise<TautulliHistory | null> {
    try {
      options.length = options.length ? options.length : MAX_PAGE_SIZE;
      options.start = options.start || options.start === 0 ? options.start : 0;

      const response: Response<TautulliHistory> = await this.api.get('', {
        params: {
          cmd: 'get_history',
          ...options,
        },
      });

      if (response.response.result !== 'success') {
        throw new Error(
          'Non-success response when fetching Tautulli paginated history',
        );
      }

      return response.response.data;
    } catch (e) {
      this.logger.log(
        `Couldn't fetch Tautulli paginated history: ${e.message}`,
      );
      this.logger.debug(e);
      return null;
    }
  }

  public async getHistory(
    options?: Omit<TautulliHistoryRequestOptions, 'length' | 'start'>,
  ): Promise<TautulliHistoryItem[] | null> {
    try {
      const newOptions: TautulliHistoryRequestOptions = {
        ...options,
        length: MAX_PAGE_SIZE,
        start: 0,
      };

      let data = await this.getPaginatedHistory(newOptions);
      const pageSize: number = MAX_PAGE_SIZE;

      const totalCount: number =
        data && data && data.recordsFiltered ? data.recordsFiltered : 0;
      const pageCount: number = Math.ceil(totalCount / pageSize);
      let currentPage = 1;

      let results: TautulliHistoryItem[] = [];
      results = _.unionBy(
        results,
        data && data.data && data.data && data.data.length ? data.data : [],
        'id',
      );

      if (results.length < totalCount) {
        while (currentPage < pageCount) {
          newOptions.start = currentPage * pageSize;
          data = await this.getPaginatedHistory(newOptions);

          currentPage++;

          results = _.unionBy(
            results,
            data && data.data && data.data && data.data.length ? data.data : [],
            'id',
          );

          if (results.length === totalCount) {
            break;
          }
        }
      }

      return results;
    } catch (e) {
      this.logger.log(`Couldn't fetch Tautulli history: ${e.message}`);
      this.logger.debug(e);
      return null;
    }
  }

  public async getMetadata(
    ratingKey: number | string,
  ): Promise<TautulliMetadata | null> {
    try {
      const response: Response<TautulliMetadata> = await this.api.get('', {
        params: {
          cmd: 'get_metadata',
          rating_key: ratingKey,
        },
      });

      if (response.response.result !== 'success') {
        throw new Error('Non-success response when fetching Tautulli metadata');
      }

      return response.response.data;
    } catch (e) {
      this.logger.log(`Couldn't fetch Tautulli metadata: ${e.message}`);
      this.logger.debug(e);
      return null;
    }
  }

  public async getChildrenMetadata(
    ratingKey: number | string,
  ): Promise<TautulliMetadata[] | null> {
    try {
      const response: Response<TautulliChildrenMetadata> = await this.api.get(
        '',
        {
          params: {
            cmd: 'get_children_metadata',
            rating_key: ratingKey,
          },
        },
      );

      if (response.response.result !== 'success') {
        throw new Error(
          'Non-success response when fetching Tautulli children metadata',
        );
      }

      return response.response.data.children_list;
    } catch (e) {
      this.logger.log(
        `Couldn't fetch Tautulli children metadata: ${e.message}`,
      );
      this.logger.debug(e);
      return null;
    }
  }

  public async getUsers(): Promise<TautulliUser[] | null> {
    try {
      const response: Response<TautulliUser[]> = await this.api.get('', {
        params: {
          cmd: 'get_users',
        },
      });

      if (response.response.result !== 'success') {
        throw new Error('Non-success response when fetching Tautulli users');
      }

      return response.response.data;
    } catch (e) {
      this.logger.log(`Couldn't fetch Tautulli users: ${e.message}`);
      this.logger.debug(e);
      return null;
    }
  }

  public async testConnection(
    params: ConstructorParameters<typeof TautulliApi>[0],
  ): Promise<BasicResponseDto> {
    const api = new TautulliApi(
      {
        apiKey: params.apiKey,
        url: `${params.url}/api/v2`,
      },
      this.loggerFactory.createLogger(),
    );

    try {
      const response = await api.getRawWithoutCache<
        Response<TautulliInfo> | string | undefined
      >('', {
        signal: AbortSignal.timeout(10000),
        params: {
          cmd: 'get_tautulli_info',
        },
      });

      if (
        typeof response.data !== 'object' ||
        response.data.response?.result === 'error' ||
        !response.data.response?.data?.tautulli_version
      ) {
        const message =
          typeof response.data === 'object'
            ? response.data.response?.message
            : undefined;

        return {
          status: 'NOK',
          code: 0,
          message:
            message ??
            'Failure, an unexpected response was returned. The URL is likely incorrect.',
        };
      } else {
        return {
          status: 'OK',
          code: 1,
          message: response.data.response.data.tautulli_version,
        };
      }
    } catch (e) {
      logConnectionTestError(this.logger, 'Tautulli', e);

      if (e instanceof CanceledError) {
        return {
          status: 'NOK',
          code: 0,
          message: 'Connection timed out after 10 seconds with no response.',
        };
      } else if (e instanceof AxiosError) {
        if (e.response?.status === 400) {
          const data = e.response.data as Response<unknown>;

          // Surface a Tautulli looking response to the user
          if (data.response?.message && data.response?.result === 'error') {
            return {
              status: 'NOK',
              code: 0,
              message: data.response.message,
            };
          }
        }
      }

      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          e,
          'Failed to connect to Tautulli. Verify URL and API key.',
        ),
      };
    }
  }
}
