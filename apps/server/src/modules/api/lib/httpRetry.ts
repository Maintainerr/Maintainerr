import axios, { type AxiosError, type AxiosInstance } from 'axios';
import axiosRetry, { type IAxiosRetryConfig } from 'axios-retry';

// Past this the request would be held open too long, and on Discord count
// against its invalid-request ban threshold, so give up instead. This bounds
// every outbound client, not just the notification agents.
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

const retryCountOf = (error: AxiosError): number =>
  (error.config as { 'axios-retry'?: { retryCount?: number } } | undefined)?.[
    'axios-retry'
  ]?.retryCount ?? 0;

/**
 * A 429 is the server naming a wait, not a blip to back off from. axios-retry's
 * own default treats it as one: three attempts on the backoff curve, stretched
 * to whatever a raw Retry-After says with nothing capping it. Take it on its own
 * terms instead - wait what the limiter actually declared, once - and give up
 * rather than hold a request open past the cap.
 */
const transientOrRateLimited = (error: AxiosError): boolean =>
  error.response?.status === 429
    ? isRetryableRateLimit(error) && retryCountOf(error) === 0
    : axiosRetry.isNetworkOrIdempotentRequestError(error);

// exponentialDelay is deliberately called without the error: it quietly takes
// Math.max with a raw Retry-After, so a 5xx carrying one would hold the request
// open for however long that header says, with nothing to cap it.
const declaredWaitOrBackoff = (retryCount: number, error: AxiosError): number =>
  (error.response?.status === 429 ? rateLimitWaitMs(error) : 0) ||
  axiosRetry.exponentialDelay(retryCount);

/**
 * Apply Maintainerr's standard transient-failure retry policy - 3 attempts with
 * exponential backoff, or a single wait of the length a rate limiter asked for -
 * to an Axios instance. One home for the policy so every outbound HTTP client
 * (Plex, Emby, the Jellyfin SDK, external-api) retries identically.
 */
export function applyHttpRetry(
  instance: AxiosInstance,
  overrides?: Pick<IAxiosRetryConfig, 'retryCondition' | 'retryDelay'>,
): void {
  axiosRetry(instance, {
    retries: 3,
    retryCondition: transientOrRateLimited,
    retryDelay: declaredWaitOrBackoff,
    ...overrides,
  });
}

/**
 * For the calls that cannot go through ExternalApiService - an auth bootstrap
 * that has no token yet, a binary download, a one-off write. They were reaching
 * for the bare global axios, which carries no retry policy at all, so they were
 * the only outbound requests in the app that never retried anything.
 */
export const retryingHttp = axios.create();

applyHttpRetry(retryingHttp);

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
