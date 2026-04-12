import axios, { AxiosError, AxiosInstance, RawAxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import NodeCache from 'node-cache';
import { MaintainerrLogger } from '../../logging/logs.service';
import { describeRequestTarget } from '../lib/requestLogging';

// 20 minute default TTL (in seconds)
const DEFAULT_TTL = 1200;

// 10 seconds default rolling buffer (in ms)
const DEFAULT_ROLLING_BUFFER = 10000;

interface ExternalAPIOptions {
  nodeCache?: NodeCache;
  headers?: Record<string, unknown>;
}

export class ExternalApiService {
  protected axios: AxiosInstance;
  private baseUrl: string;
  private cache?: NodeCache;

  constructor(
    baseUrl: string,
    params: Record<string, unknown>,
    protected readonly logger: MaintainerrLogger,
    options: ExternalAPIOptions = {},
  ) {
    this.axios = axios.create({
      baseURL: baseUrl,
      params,
      timeout: 10000, // timeout after 10s
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });
    axiosRetry(this.axios, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
    });
    this.baseUrl = baseUrl;
    this.cache = options.nodeCache;
  }

  public async get<T>(
    endpoint: string,
    config?: RawAxiosRequestConfig,
    ttl?: number,
  ): Promise<T> {
    try {
      const cacheKey = this.serializeCacheKey(endpoint, config?.params);
      const cachedItem = this.cache?.get<T>(cacheKey);
      if (cachedItem) {
        return cachedItem;
      }
      const response = await this.axios.get<T>(endpoint, config);

      if (this.cache) {
        this.cache.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
      }

      return response.data;
    } catch (error) {
      this.logRequestFailure('GET', endpoint, config, error);
      return undefined;
    }
  }

  public async getWithoutCache<T>(
    endpoint: string,
    config?: RawAxiosRequestConfig,
  ): Promise<T> {
    try {
      return (await this.axios.get<T>(endpoint, config)).data;
    } catch (error) {
      this.logRequestFailure('GET', endpoint, config, error);
      return undefined;
    }
  }

  public async getRawWithoutCache<T>(
    endpoint: string,
    config?: RawAxiosRequestConfig,
  ) {
    return this.axios.get<T>(endpoint, config);
  }

  public async delete<T>(
    endpoint: string,
    config?: RawAxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await this.axios.delete<T>(endpoint, config);
      return response.data;
    } catch (error) {
      this.logRequestFailure('DELETE', endpoint, config, error);
      return undefined;
    }
  }

  public async put<T>(
    endpoint: string,
    data: string,
    config?: RawAxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await this.axios.put<T>(endpoint, data, config);
      return response.data;
    } catch (error) {
      this.logRequestFailure('PUT', endpoint, config, error);
      return undefined;
    }
  }

  public async post<T>(
    endpoint: string,
    data?: any,
    config?: RawAxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await this.axios.post<T>(endpoint, data, config);
      return response.data;
    } catch (error) {
      this.logRequestFailure('POST', endpoint, config, error);
      return undefined;
    }
  }

  public async getRolling<T>(
    endpoint: string,
    config?: RawAxiosRequestConfig,
    ttl?: number,
  ): Promise<T> {
    try {
      const cacheKey = this.serializeCacheKey(endpoint, config?.params);
      const cachedItem = this.cache?.get<T>(cacheKey);

      if (cachedItem) {
        const keyTtl = this.cache?.getTtl(cacheKey) ?? 0;

        // If the item has passed our rolling check, fetch again in background
        if (
          keyTtl - (ttl ?? DEFAULT_TTL) * 1000 <
          Date.now() - DEFAULT_ROLLING_BUFFER
        ) {
          void this.axios.get<T>(endpoint, config).then((response) => {
            this.cache?.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
          });
        }
        return cachedItem;
      }

      const response = await this.axios.get<T>(endpoint, config);

      if (this.cache) {
        this.cache.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
      }

      return response.data;
    } catch (error) {
      this.logRequestFailure('GET', endpoint, config, error);
      return undefined;
    }
  }

  public async postRolling<T>(
    endpoint: string,
    data?: string,
    config?: RawAxiosRequestConfig,
    ttl?: number,
  ): Promise<T | undefined> {
    const url = describeRequestTarget(this.baseUrl, endpoint, config);

    try {
      const cacheKey = this.serializeCacheKey(
        endpoint + data ? data.replace(/\s/g, '').trim() : '',
        config?.params,
      );
      const cachedItem = this.cache?.get<T>(cacheKey);

      if (cachedItem) {
        const keyTtl = this.cache?.getTtl(cacheKey) ?? 0;

        // If the item has passed our rolling check, fetch again in background
        if (keyTtl < Date.now() - DEFAULT_ROLLING_BUFFER) {
          this.axios
            .post<T>(endpoint, data, config)
            .then((response) => {
              this.cache?.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
            })
            .catch((error: AxiosError) => {
              if (error.response?.status === 429) {
                const retryAfter =
                  error.response.headers['retry-after'] || 'unknown';
                this.logger.warn(
                  `${url} Rate limit hit. Retry after: ${retryAfter} seconds.`,
                );
              } else {
                this.logger.warn(this.formatRequestFailure('POST', url, error));
              }
            });
        }
        return cachedItem;
      }

      const response = await this.axios
        .post<T>(endpoint, data, config)
        .catch((error: AxiosError) => {
          if (error.response?.status === 429) {
            const retryAfter =
              error.response.headers['retry-after'] || 'unknown';
            this.logger.warn(
              `${url} Rate limit hit. Retry after: ${retryAfter} seconds.`,
            );
          } else {
            this.logger.warn(this.formatRequestFailure('POST', url, error));
          }
          return undefined;
        });

      if (this.cache) {
        this.cache.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
      }

      return response.data;
    } catch (error: any) {
      this.logger.warn(this.formatRequestFailure('POST', url, error));
      return undefined;
    }
  }

  private logRequestFailure(
    method: string,
    endpoint: string,
    config: RawAxiosRequestConfig | undefined,
    error: unknown,
  ) {
    const url = describeRequestTarget(this.baseUrl, endpoint, config);
    this.logger.debug(this.formatRequestFailure(method, url, error));
  }

  private formatRequestFailure(
    method: string,
    url: string,
    error: unknown,
  ): string {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const code = error.code;

      if (status !== undefined) {
        return `${method} ${url} failed with status ${status}${statusText ? ` ${statusText}` : ''}`;
      }

      return `${method} ${url} failed${code ? ` (code=${code})` : ''}`;
    }

    if (error instanceof Error) {
      return `${method} ${url} failed: ${error.message}`;
    }

    return `${method} ${url} failed`;
  }

  private serializeCacheKey(
    endpoint: string,
    params?: Record<string, unknown>,
  ) {
    try {
      if (!params) {
        return `${this.baseUrl}${endpoint}`;
      }

      return `${this.baseUrl}${endpoint}${JSON.stringify(params)}`;
    } catch (error) {
      this.logger.debug('Failed serializing cache key');
      this.logger.debug(error);
      return undefined;
    }
  }
}
