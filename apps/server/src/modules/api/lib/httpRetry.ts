import { type AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

/**
 * Apply Maintainerr's standard transient-failure retry policy — 3 attempts
 * with exponential backoff — to an Axios instance. One home for the policy so
 * every outbound HTTP client (Plex, Emby, the Jellyfin SDK, external-api)
 * retries identically.
 */
export function applyHttpRetry(instance: AxiosInstance): void {
  axiosRetry(instance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
  });
}
