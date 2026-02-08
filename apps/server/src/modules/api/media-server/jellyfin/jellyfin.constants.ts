export const JELLYFIN_CACHE_TTL = {
  WATCH_HISTORY: 300000,
  WATCHED_LIBRARY: 600000,
  USERS: 1800000,
  LIBRARIES: 1800000,
  STATUS: 60000,
} as const;

export const JELLYFIN_BATCH_SIZE = {
  USER_WATCH_HISTORY: 5,
  DEFAULT_PAGE_SIZE: 100,
  MAX_PAGE_SIZE: 500,
} as const;

export const JELLYFIN_CACHE_KEYS = {
  WATCH_HISTORY: 'jellyfin:watch',
  WATCHED_LIBRARY: 'jellyfin:watched:library',
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
