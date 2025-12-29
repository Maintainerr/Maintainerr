/**
 * Jellyfin-specific constants for API operations and configuration.
 */

/**
 * Default cache TTL values (in milliseconds)
 */
export const JELLYFIN_CACHE_TTL = {
  /** Watch history cache TTL - 5 minutes */
  WATCH_HISTORY: 300000,
  /** Watched library cache TTL - 10 minutes */
  WATCHED_LIBRARY: 600000,
  /** User list cache TTL - 30 minutes */
  USERS: 1800000,
  /** Libraries cache TTL - 30 minutes */
  LIBRARIES: 1800000,
  /** Server status cache TTL - 1 minute */
  STATUS: 60000,
} as const;

/**
 * Batch sizes for API operations
 */
export const JELLYFIN_BATCH_SIZE = {
  /** Batch size for user watch history queries */
  USER_WATCH_HISTORY: 5,
  /** Default page size for item queries */
  DEFAULT_PAGE_SIZE: 100,
  /** Maximum page size for item queries */
  MAX_PAGE_SIZE: 500,
} as const;

/**
 * Cache key prefixes for Jellyfin-related cache entries
 */
export const JELLYFIN_CACHE_KEYS = {
  /** Prefix for watch history cache */
  WATCH_HISTORY: 'jellyfin:watch',
  /** Prefix for watched library cache */
  WATCHED_LIBRARY: 'jellyfin:watched:library',
  /** Prefix for user cache */
  USERS: 'jellyfin:users',
  /** Prefix for library cache */
  LIBRARIES: 'jellyfin:libraries',
  /** Prefix for server status cache */
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
