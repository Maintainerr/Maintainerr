export const JELLYFIN_CACHE_TTL = {
  WATCH_HISTORY: 300000,
  USER_DATA: 300000,
  PLAYED_THRESHOLD: 300000,
  USERS: 1800000,
  LIBRARIES: 1800000,
  STATUS: 60000,
} as const;

export const JELLYFIN_BATCH_SIZE = {
  USER_WATCH_HISTORY: 5,
  // Collection item ids are sent in the query string by the Jellyfin SDK.
  // Keep mutation batches comfortably below common 8 KB request-line limits.
  COLLECTION_MUTATION: 50,
  DEFAULT_PAGE_SIZE: 100,
  MAX_PAGE_SIZE: 500,
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

export const JELLYFIN_CACHE_KEYS = {
  WATCH_HISTORY: 'jellyfin:watch',
  FAVORITED_BY: 'jellyfin:favorited-by',
  TOTAL_PLAY_COUNT: 'jellyfin:total-play-count',
  PLAYED_THRESHOLD: 'jellyfin:played-threshold',
  USERS: 'jellyfin:users',
  LIBRARIES: 'jellyfin:libraries',
  STATUS: 'jellyfin:status',
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
