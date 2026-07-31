// TTLs are in SECONDS - node-cache takes ttl in seconds, not milliseconds (see
// api/lib/cache.ts, DEFAULT_TTL = 300). These were previously written in
// milliseconds, so watch history lived ~83h instead of 5min and a season's
// watched-state stayed stale for hours after a manual mark in Jellyfin (#3274).
export const JELLYFIN_CACHE_TTL = {
  WATCH_HISTORY: 300, // 5 min
  USER_DATA: 300, // 5 min
  METADATA: 300, // 5 min
  PLAYED_THRESHOLD: 300, // 5 min
  USERS: 1800, // 30 min
  LIBRARIES: 1800, // 30 min
  STATUS: 60, // 1 min
  COLLECTIONS: 600, // 10 min
} as const;

export const JELLYFIN_BATCH_SIZE = {
  USER_WATCH_HISTORY: 5,
  // Collection item ids are sent in the query string by the Jellyfin SDK.
  // Keep Jellyfin collection writes small enough for URL limits and slower hosts.
  COLLECTION_MUTATION: 8,
  DEFAULT_PAGE_SIZE: 100,
  MAX_PAGE_SIZE: 500,
} as const;

/**
 * Default query options for every library-scoped getItems() call - i.e.
 * any call whose parentId is a library (or no parentId for a global recursive
 * search) and that expects to surface real media items.
 *
 * collapseBoxSetItems: false always includes BoxSet members. Jellyfin libraries
 * with "Group films into collections" hide them by default, which caused an
 * add/remove loop on Maintainerr-managed BoxSets and silently under-counted
 * library size/recent items (#2554).
 */
export const JELLYFIN_LIBRARY_QUERY_DEFAULTS = {
  collapseBoxSetItems: false,
} as const;

export const JELLYFIN_LIBRARY_RETRY_DELAY_MS = 300;

export const JELLYFIN_RETRYABLE_LIBRARY_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
]);

export const JELLYFIN_RETRYABLE_LIBRARY_STATUS_CODES = new Set([502, 503, 504]);

// Key prefix in the 'jellyfinwatchhistory' cache for the per-library snapshots
// built by prefetchWatchHistory(). TTL and flush behaviour live on the cache
// definition in lib/cache.ts.
//
// Keyed per library so each rule group's library gets its own sweep. A single
// shared key would let the first group's snapshot satisfy the cache check for
// every later group, leaving their items to miss it and read live one by one.
const JELLYFIN_WATCH_SNAPSHOT_KEY_PREFIX = 'watch-snapshot';
export const jellyfinWatchSnapshotCacheKey = (libraryId: string): string =>
  `${JELLYFIN_WATCH_SNAPSHOT_KEY_PREFIX}:${libraryId}`;

// Ceiling on watch records held in one library's snapshot. The snapshot lives
// for a whole run, and a (item x user) matrix grows with both; 500k records
// measured ~60MB, which stays clear of the 512MB heap the key-count bound
// protects (#3284). Above it the prefetch is abandoned and callers fall back to
// the per-show sweep, which is bounded by one show at a time. Sweeping per
// library rather than per server keeps large multi-library servers under it.
export const JELLYFIN_WATCH_SNAPSHOT_MAX_RECORDS = 500_000;

export const JELLYFIN_CACHE_KEYS = {
  WATCH_HISTORY: 'jellyfin:watch',
  METADATA: 'jellyfin:metadata',
  CHILDREN: 'jellyfin:children',
  FAVORITED_BY: 'jellyfin:favorited-by',
  TOTAL_PLAY_COUNT: 'jellyfin:total-play-count',
  PLAYED_THRESHOLD: 'jellyfin:played-threshold',
  USERS: 'jellyfin:users',
  LIBRARIES: 'jellyfin:libraries',
  STATUS: 'jellyfin:status',
  COLLECTIONS: 'jellyfin:collections',
} as const;

/**
 * Jellyfin ticks to milliseconds conversion factor.
 * 1 Jellyfin tick = 100 nanoseconds
 * 1 millisecond = 10,000 ticks
 */
export const JELLYFIN_TICKS_PER_MS = 10000;

/**
 * Client information for Jellyfin API authentication
 */
export const JELLYFIN_CLIENT_INFO = {
  name: 'Maintainerr',
  version: process.env.npm_package_version || '2.0.0',
} as const;

/**
 * Device information for Jellyfin API authentication
 */
export const JELLYFIN_DEVICE_INFO = {
  name: 'Maintainerr-Server',
  idPrefix: 'maintainerr',
} as const;
