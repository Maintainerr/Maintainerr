// One home for the outbound HTTP timeouts, as httpRetry.ts is for retries.
// axios's timeout is an inactivity timer on the socket, so it fires while a
// server that is still working has simply not answered yet.

/** ExternalApiService's default for every request that sets nothing else. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/** Connection tests and settings probes. */
export const CONNECTION_TEST_TIMEOUT_MS = 5_000;

/**
 * Uncached arr reads whose failure would change action or rule behaviour.
 * Slow or underpowered instances take more than the default even for simple
 * reads (#3181).
 */
export const SLOW_INSTANCE_TIMEOUT_MS = 20_000;

/**
 * The Plex and Emby runtime clients: bounds a wedged socket so it cannot stall
 * the rule executor indefinitely. The Jellyfin SDK client sets none.
 */
export const MEDIA_SERVER_REQUEST_TIMEOUT_MS = 30_000;

/**
 * axios reads 0 as "no timeout". Every delete waits like this: Radarr, Sonarr,
 * Sportarr and Jellyfin remove the file before they answer, so the wait is the
 * disk's (#3673 measured 4m23s for one 31.6 GB file), and a client that gives
 * up records as failed a delete the server then finishes. A peer that has died
 * still fails the request: Node's agent arms TCP keepalive on every socket, so
 * the kernel reports it within seconds.
 */
export const NO_TIMEOUT = 0;
