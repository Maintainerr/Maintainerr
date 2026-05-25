// Shared id of the Streamystats NodeCache (see modules/api/lib/cache.ts).
export const STREAMYSTATS_CACHE_ID = 'streamystats';

// HTTP cache TTL (seconds) for the watchlist endpoints, aligned with the
// Streamystats NodeCache's default TTL.
export const WATCHLIST_HTTP_TTL_S = 300;

// Key under which the assembled public-watchlist membership snapshot is stored
// in the Streamystats NodeCache. That cache is flushed between rule-group runs
// (CacheManager.flushAll), so the snapshot is rebuilt each run and reused
// across items within the run.
export const WATCHLIST_MEMBERSHIP_CACHE_KEY = 'watchlist-membership';
