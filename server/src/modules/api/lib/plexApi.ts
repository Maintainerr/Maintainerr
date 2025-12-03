import { Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { PlexLibraryResponse } from '../plex-api/interfaces/library.interfaces';
import cacheManager, { Cache } from './cache';

type PlexApiOptions = {
  hostname: string;
  port: number;
  https?: boolean;
  token: string;
  timeout?: number;
};

type RequestOptions = {
  uri: string;
  extraHeaders?: Record<string, string>;
};

class PlexApi {
  private logger = new Logger(PlexApi.name);
  private cache: Cache;
  private options: PlexApiOptions;
  private axios: AxiosInstance;

  constructor(options: PlexApiOptions) {
    this.options = options;
    this.cache = cacheManager.getCache('plexguid');

    const baseURL =
      this.getServerScheme() + options.hostname + ':' + options.port;

    this.axios = axios.create({
      baseURL,
      timeout: options.timeout,
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': this.options.token,
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
  }

  async query<T>(
    options: RequestOptions | string,
    useCache: boolean = true,
  ): Promise<T> {
    if (typeof options === 'string') {
      options = {
        uri: options,
      };
    }

    const cacheKey = this.serializeCacheKey(options);

    if (useCache && this.cache.data.has(cacheKey)) {
      return this.cache.data.get<T>(cacheKey);
    } else {
      const response = await this.getQuery<T>(options);
      if (useCache && response) this.cache.data.set(cacheKey, response);
      return response;
    }
  }

  /**
   * Queries all items with the given options, will fetch all pages.
   *
   * @param {RequestOptions} options - The options for the query.
   * @param {boolean} [useCache=true] - Whether to use the cache for the query.
   * @return {Promise<T[]>} - A promise that resolves to an array of T.
   */
  async queryAll<T>(
    options: RequestOptions,
    useCache: boolean = true,
  ): Promise<T> {
    // vars
    let result = undefined;
    let next = true;
    let page = 0;
    const size = 120;
    options = {
      ...options,
      extraHeaders: {
        ...options.extraHeaders,
        'X-Plex-Container-Start': `${page}`,
        'X-Plex-Container-Size': `${size}`,
      },
    };

    // loop responses
    while (next) {
      const query: PlexLibraryResponse = await this.query(options, useCache);
      if (result === undefined) {
        // if first response, replace result
        result = query;
      } else {
        // if next response, add to previous result
        const items = this.getDataValue(query.MediaContainer);

        // if response is an array
        if (items) {
          this.appendToData(result.MediaContainer, items as any[]);
        }
      }

      // fetch all if more than 120
      if (query?.MediaContainer?.totalSize > size * (page + 1)) {
        options.extraHeaders['X-Plex-Container-Start'] = `${size * (page + 1)}`;
        page++;
      } else {
        next = false;
      }
    }
    return result as unknown as T;
  }

  private getQuery<T>(options: RequestOptions) {
    return this._request<T>('GET', options);
  }

  deleteQuery(options: RequestOptions) {
    return this._request('DELETE', options);
  }

  postQuery<T>(options: RequestOptions) {
    return this._request<T>('POST', options);
  }

  putQuery<T>(options: RequestOptions) {
    return this._request<T>('PUT', options);
  }

  private getServerScheme() {
    if (this.options.https != null) {
      return this.options.https ? 'https://' : 'http://';
    }
    return this.options.port === 443 ? 'https://' : 'http://';
  }

  private async _request<T>(method: string, options: RequestOptions) {
    const requestConfig: AxiosRequestConfig = {
      url: options.uri,
      method,
      headers: options.extraHeaders,
    };

    try {
      const response = await this.axios.request(requestConfig);
      return response.data as T;
    } catch (err) {
      const url = this.axios.getUri(requestConfig);

      if (err instanceof AxiosError) {
        if (err.response?.status === 403) {
          throw new Error(
            `${requestConfig.method} ${url} failed: Plex Server denied request due to lack of managed user permissions! In case of a delete request, delete content must be allowed in plex-media-server options.`,
            { cause: err },
          );
        } else if (err.response?.status === 401) {
          throw new Error(
            `${requestConfig.method} ${url} failed: Plex Server denied request`,
            { cause: err },
          );
        } else if (err.response?.status) {
          throw new Error(
            `${requestConfig.method} ${url} failed with exception: Plex Server didnt respond with a valid 2xx status code, response code: ${err.response?.status}`,
            { cause: err },
          );
        } else {
          throw new Error(
            `${requestConfig.method} ${url} failed with exception: ${err}`,
            { cause: err },
          );
        }
      } else {
        throw new Error(
          `${requestConfig.method} ${url} failed with exception: ${err}${err.cause?.code ? `, error code: ${err.cause.code}` : ''}`,
          { cause: err },
        );
      }
    }
  }

  private serializeCacheKey(params: Record<string, unknown>) {
    try {
      return `${JSON.stringify(params)}`;
    } catch (err) {
      return undefined;
    }
  }

  /**
   * Retrieves the first array value from an object.
   *
   * @param {Record<string, T>} obj - The object to retrieve the value from.
   * @returns {T | undefined} - The first array value found in the object, or undefined if no array value is found.
   */
  private getDataValue<T>(obj: Record<string, T>): T | undefined {
    const keys = Object.keys(obj);

    // Find the first key that has an array value
    const arrayKey = keys.find((key) => Array.isArray(obj[key]));

    // If a key with an array value is found, return the corresponding value
    if (arrayKey !== undefined) {
      return obj[arrayKey];
    } else {
      return undefined; // No key with an array value found
    }
  }

  /**
   * Appends an array of items to the first array property in a given object.
   *
   * @param {Record<string, T>} obj - The object to append the items to.
   * @param {T[]} newItem - The items to append to the object.
   * @returns {Record<string, T>} - The object with the items appended to the specified property.
   */
  private appendToData<T>(
    obj: Record<string, T>,
    newItem: T[],
  ): Record<string, T> {
    const keys = Object.keys(obj);

    // Find the first key that has an array value
    const arrayKey = keys.find((key) => Array.isArray(obj[key]));

    if (arrayKey !== undefined) {
      const arrayValue = obj[arrayKey];

      // Ensure that the value is an array
      if (Array.isArray(arrayValue)) {
        // If it's an array, append the new item
        obj[arrayKey] = [...arrayValue, ...newItem] as T;
      }
    }
    return obj;
  }

  public async getStatus(): Promise<boolean> {
    try {
      const status: { MediaContainer: any } = await this.query(
        { uri: `/` },
        false,
      );
      return status?.MediaContainer ? true : false;
    } catch (err) {
      return false;
    }
  }
}

export default PlexApi;
