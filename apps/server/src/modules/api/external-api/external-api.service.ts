import axios, { AxiosError, AxiosInstance, RawAxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import NodeCache from 'node-cache';
import { MaintainerrLogger } from '../../logging/logs.service';

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
      onRetry: (_, error, requestConfig) => {
        const url = this.axios.getUri(requestConfig);
        this.logger.debug(
          `Retrying ${requestConfig.method.toUpperCase()} ${url}: ${error}`,
        );
      },
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
    } catch (err) {
      const url = this.axios.getUri({ ...config, url: endpoint });
      this.logger.debug(`GET ${url} failed: ${err}`);
      return undefined;
    }
  }

  public async getWithoutCache<T>(
    endpoint: string,
    config?: RawAxiosRequestConfig,
  ): Promise<T> {
    try {
      return (await this.axios.get<T>(endpoint, config)).data;
    } catch (err) {
      const url = this.axios.getUri({ ...config, url: endpoint });
      this.logger.debug(`GET ${url} failed: ${err}`);
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
    } catch (err) {
      const url = this.axios.getUri({ ...config, url: endpoint });
      this.logger.debug(`DELETE ${url} failed: ${err}`);
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
    } catch (err) {
      const url = this.axios.getUri({ ...config, url: endpoint });
      this.logger.debug(`PUT ${url} failed: ${err}`);
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
    } catch (err) {
      const url = this.axios.getUri({ ...config, url: endpoint });
      this.logger.debug(`POST ${url} failed: ${err}`);
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
    } catch (err) {
      const url = this.axios.getUri({ ...config, url: endpoint });
      this.logger.debug(`GET ${url} failed: ${err}`);
      return undefined;
    }
  }

  public async postRolling<T>(
    endpoint: string,
    data?: string,
    config?: RawAxiosRequestConfig,
    ttl?: number,
  ): Promise<T | undefined> {
    const url = this.axios.getUri({ ...config, url: endpoint });

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
            .catch((err: AxiosError) => {
              if (err.response?.status === 429) {
                const retryAfter =
                  err.response.headers['retry-after'] || 'unknown';
                this.logger.warn(
                  `${url} Rate limit hit. Retry after: ${retryAfter} seconds.`,
                );
              } else {
                this.logger.warn(`POST ${url} failed: ${err.message}`);
                this.logger.debug(err);
              }
            });
        }
        return cachedItem;
      }

      const response = await this.axios
        .post<T>(endpoint, data, config)
        .catch((err: AxiosError) => {
          if (err.response?.status === 429) {
            const retryAfter = err.response.headers['retry-after'] || 'unknown';
            this.logger.warn(
              `${url} Rate limit hit. Retry after: ${retryAfter} seconds.`,
            );
          } else {
            this.logger.warn(`POST ${url} failed: ${err.message}`);
            this.logger.debug(err);
          }
          return undefined;
        });

      if (this.cache) {
        this.cache.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
      }

      return response.data;
    } catch (err: any) {
      this.logger.warn(`POST ${url} failed: ${err.message}`);
      this.logger.debug(err);
      return undefined;
    }
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
    } catch (err) {
      this.logger.debug(`Failed serializing cache key: ${err}`);
      return undefined;
    }
  }
}
