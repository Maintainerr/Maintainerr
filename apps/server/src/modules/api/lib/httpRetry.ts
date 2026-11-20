import axios, {
  type AxiosError,
  type AxiosInstance,
  type GenericAbortSignal,
} from 'axios';

/** Per-request state; `httpRetry: { retries: 0 }` turns retrying off. */
interface HttpRetryState {
  retries?: number;
  retryCount?: number;
  lastRequestTime?: number;
}

declare module 'axios' {
  interface AxiosRequestConfig {
    httpRetry?: HttpRetryState;
  }
}

interface HttpRetryPolicy {
  retryCondition: (error: AxiosError) => boolean;
  retryDelay: (retryCount: number, error: AxiosError) => number;
}

// Past this the request would be held open too long, and on Discord count
// against its invalid-request ban threshold, so give up instead. It bounds one
// wait, not the request: a retry charges its delay against `timeout`, so a
// client that sets one drops the retry outright when the declared wait will not
// fit in what is left. Only the timeout-less clients below reach this cap.
const MAX_RATE_LIMIT_WAIT_MS = 60000;
const RETRY_PADDING_MS = 250;
const RETRIES = 3;

// DNS and TLS failures a reconnect cannot fix: the list axios-retry 4.5.0 took
// from is-retry-allowed, so the same requests retry as before.
const NOT_RETRYABLE_CODES = new Set([
  'ENOTFOUND',
  'ENETUNREACH',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_CRL',
  'UNABLE_TO_DECRYPT_CERT_SIGNATURE',
  'UNABLE_TO_DECRYPT_CRL_SIGNATURE',
  'UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY',
  'CERT_SIGNATURE_FAILURE',
  'CRL_SIGNATURE_FAILURE',
  'CERT_NOT_YET_VALID',
  'CERT_HAS_EXPIRED',
  'CRL_NOT_YET_VALID',
  'CRL_HAS_EXPIRED',
  'ERROR_IN_CERT_NOT_BEFORE_FIELD',
  'ERROR_IN_CERT_NOT_AFTER_FIELD',
  'ERROR_IN_CRL_LAST_UPDATE_FIELD',
  'ERROR_IN_CRL_NEXT_UPDATE_FIELD',
  'OUT_OF_MEM',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_CHAIN_TOO_LONG',
  'CERT_REVOKED',
  'INVALID_CA',
  'PATH_LENGTH_EXCEEDED',
  'INVALID_PURPOSE',
  'CERT_UNTRUSTED',
  'CERT_REJECTED',
  'HOSTNAME_MISMATCH',
]);
const IDEMPOTENT_METHODS = ['get', 'head', 'options', 'put', 'delete'];

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
 * seconds turns a sub-second wait into 28 minutes. Take the longest of the
 * fields that agree, since retrying inside a window that is still open only
 * earns another 429.
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
  error.config?.httpRetry?.retryCount ?? 0;

// No response at all, or an idempotent request the server failed with a 5xx or
// 429. Never a timeout (ECONNABORTED), and never a write the server answered.
const isNetworkOrIdempotentRequestError = (error: AxiosError): boolean => {
  const { code, config, response } = error;
  if (code === 'ECONNABORTED') return false;
  if (
    !response &&
    code &&
    code !== 'ERR_CANCELED' &&
    !NOT_RETRYABLE_CODES.has(code)
  ) {
    return true;
  }
  return (
    IDEMPOTENT_METHODS.includes(config?.method ?? '') &&
    (!response ||
      response.status === 429 ||
      (response.status >= 500 && response.status <= 599))
  );
};

/**
 * A 429 is the server naming a wait, not a blip to back off from: wait what the
 * limiter actually declared, once, and give up rather than hold a request open
 * past the cap.
 */
const transientOrRateLimited = (error: AxiosError): boolean =>
  error.response?.status === 429
    ? isRetryableRateLimit(error) && retryCountOf(error) === 0
    : isNetworkOrIdempotentRequestError(error);

// 200, 400 and 800 ms, each plus up to 20%. It never reads Retry-After, so a
// 5xx carrying one cannot hold the request open for however long it says.
const exponentialDelay = (retryCount: number): number => {
  const delay = 2 ** retryCount * 100;
  return delay + delay * 0.2 * Math.random();
};

const declaredWaitOrBackoff = (retryCount: number, error: AxiosError): number =>
  (error.response?.status === 429 ? rateLimitWaitMs(error) : 0) ||
  exponentialDelay(retryCount);

// An aborted request stops waiting, so its retry fails at once with the abort.
const waitUnlessAborted = (
  ms: number,
  signal?: GenericAbortSignal,
): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });

/**
 * Apply Maintainerr's standard transient-failure retry policy - 3 attempts with
 * exponential backoff, or a single wait of the length a rate limiter asked for -
 * to an Axios instance. One home for the policy so every outbound HTTP client
 * (Plex, Emby, the Jellyfin SDK, external-api) retries identically.
 */
export function applyHttpRetry(
  instance: AxiosInstance,
  {
    retryCondition = transientOrRateLimited,
    retryDelay = declaredWaitOrBackoff,
  }: Partial<HttpRetryPolicy> = {},
): void {
  instance.interceptors.request.use((config) => {
    config.httpRetry = { ...config.httpRetry, lastRequestTime: Date.now() };
    return config;
  });

  instance.interceptors.response.use(undefined, async (error: AxiosError) => {
    const { config } = error;
    const {
      retries = RETRIES,
      retryCount = 0,
      lastRequestTime,
    } = config?.httpRetry ?? {};
    if (!config || retryCount >= retries || !retryCondition(error)) {
      throw error;
    }

    const delay = retryDelay(retryCount + 1, error);
    // The attempts share one timeout: a retry gets what the last attempt and
    // the wait left of it, and is dropped when nothing is left.
    if (config.timeout) {
      const timeout =
        config.timeout -
        (lastRequestTime ? Date.now() - lastRequestTime : 0) -
        delay;
      if (timeout <= 0) throw error;
      config.timeout = timeout;
    }
    config.httpRetry = { ...config.httpRetry, retryCount: retryCount + 1 };
    // The first attempt already serialized the body.
    config.transformRequest = [(data: unknown) => data];

    await waitUnlessAborted(delay, config.signal);
    return instance(config);
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
 *
 * One attempt, like the shared policy. This sets no timeout, so nothing else
 * bounds it: three attempts against a limiter asking for the full 60s measured
 * at 181s of a held-open send, and the test endpoint answers synchronously.
 */
export const rateLimitAwareHttp = axios.create();

applyHttpRetry(rateLimitAwareHttp, {
  retryCondition: (error) =>
    isRetryableRateLimit(error) && retryCountOf(error) === 0,
  retryDelay: (retryCount, error) =>
    rateLimitWaitMs(error) + RETRY_PADDING_MS * retryCount,
});
