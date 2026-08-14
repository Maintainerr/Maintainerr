import axios, { type AxiosError, type AxiosInstance } from 'axios';
import axiosRetry, { type IAxiosRetryConfig } from 'axios-retry';

// Past this the send would be held open too long, and on Discord count against
// its invalid-request ban threshold, so give up instead.
const MAX_RATE_LIMIT_WAIT_MS = 60000;
const RETRY_PADDING_MS = 250;

const toMs = (seconds: unknown): number | undefined => {
  const value = Number(seconds);
  return Number.isFinite(value) && value >= 0 ? value * 1000 : undefined;
};

// RFC 9110 allows an HTTP-date in place of a delta-seconds value.
const untilMs = (httpDate: unknown): number | undefined => {
  const at = new Date(String(httpDate)).valueOf();
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
};

/**
 * How long a rate limiter wants us to wait, in ms.
 *
 * `Retry-After` is the last resort on purpose: Discord's live webhook 429s send
 * one that is neither seconds nor a countdown (~1700 while the body says 0.3 and
 * `x-ratelimit-reset-after` says 2, and it grows while idle). Reading it as
 * seconds, which is what axios-retry's own `retryAfter` does, turns a sub-second
 * wait into 28 minutes. Take the longest of the fields that agree, since
 * retrying inside a window that is still open only earns another 429.
 */
export const rateLimitWaitMs = (error: AxiosError): number => {
  const body =
    typeof error.response?.data === 'object'
      ? (error.response.data as {
          retry_after?: unknown;
          parameters?: { retry_after?: unknown };
        })
      : undefined;
  const headers = error.response?.headers;

  const declared = Math.max(
    toMs(body?.retry_after) ?? 0,
    // Telegram nests it.
    toMs(body?.parameters?.retry_after) ?? 0,
    toMs(headers?.['x-ratelimit-reset-after']) ?? 0,
  );
  if (declared > 0) return declared;

  // Slack, ntfy and operator-supplied webhooks send a plain one.
  const header = headers?.['retry-after'];
  return toMs(header) ?? untilMs(header) ?? 0;
};

export const isRetryableRateLimit = (error: AxiosError): boolean =>
  error.response?.status === 429 &&
  rateLimitWaitMs(error) <= MAX_RATE_LIMIT_WAIT_MS;

/**
 * Apply Maintainerr's standard transient-failure retry policy - 3 attempts
 * with exponential backoff - to an Axios instance. One home for the policy so
 * every outbound HTTP client (Plex, Emby, the Jellyfin SDK, external-api)
 * retries identically.
 */
export function applyHttpRetry(
  instance: AxiosInstance,
  overrides?: Pick<IAxiosRetryConfig, 'retryCondition' | 'retryDelay'>,
): void {
  axiosRetry(instance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    ...overrides,
  });
}

/**
 * The client every notification agent posts through. A rule run can produce a
 * burst of sends, and a rate-limited one is otherwise logged and lost - so
 * retry 429 here, once, rather than per agent.
 */
export const rateLimitAwareHttp = axios.create();

applyHttpRetry(rateLimitAwareHttp, {
  retryCondition: isRetryableRateLimit,
  retryDelay: (retryCount, error) =>
    (error ? rateLimitWaitMs(error) : 0) + RETRY_PADDING_MS * retryCount,
});
