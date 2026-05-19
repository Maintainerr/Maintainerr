// Emby cache and batching tuning. Values mirror Jellyfin defaults until tuned
// against a live Emby server.

export const EMBY_CACHE_TTL = {
  WATCH_HISTORY: 300000,
  USER_DATA: 300000,
  PLAYED_THRESHOLD: 300000,
  USERS: 1800000,
  LIBRARIES: 1800000,
  STATUS: 60000,
  COLLECTIONS: 600,
} as const;

export const EMBY_BATCH_SIZE = {
  USER_WATCH_HISTORY: 5,
  COLLECTION_MUTATION: 8,
  DEFAULT_PAGE_SIZE: 100,
  MAX_PAGE_SIZE: 500,
} as const;

export const EMBY_CACHE_KEYS = {
  USERS: 'emby:users',
  LIBRARIES: 'emby:libraries',
  STATUS: 'emby:status',
} as const;

// Emby uses the same .NET DateTime tick convention as Jellyfin.
// 1 tick = 100 nanoseconds; 1 millisecond = 10,000 ticks.
export const EMBY_TICKS_PER_MS = 10000;

// Emby's authorization header requires a pinned client Version string of
// '1.0.0'. Newer values are rejected by some endpoints. See Jellyseerr
// server/api/jellyfin.ts where mediaServerType === 'emby' hardcodes the same.
export const EMBY_CLIENT_INFO = {
  name: 'Maintainerr',
  version: '1.0.0',
} as const;

export const EMBY_DEVICE_INFO = {
  name: 'Maintainerr-Server',
  idPrefix: 'maintainerr',
} as const;
