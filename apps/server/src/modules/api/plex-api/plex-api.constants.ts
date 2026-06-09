export const PLEX_PAGE_SIZE = {
  DEFAULT: 50,
  WATCHLIST: 100,
} as const;

// Bounds runtime Plex socket reads so a wedged request can't stall the rule
// executor indefinitely. Connection probes use the shorter
// CONNECTION_TEST_TIMEOUT_MS; this applies to the long-lived runtime client.
export const PLEX_REQUEST_TIMEOUT_MS = 30_000;

// Keys in the 'plexwatchhistory' cache for the bulk maps built by
// prefetchWatchHistory(). Three maps are written in a single sweep:
//   BULK     — leaf items (movies + episodes) keyed by own ratingKey
//   SHOW     — episode records grouped by show ratingKey (from grandparentKey)
//   SEASON   — episode records grouped by season ratingKey (from parentKey)
// TTL and flush behaviour live on the cache definition in lib/cache.ts.
export const WATCH_HISTORY_BULK_CACHE_KEY = 'watch-history-bulk';
export const WATCH_HISTORY_SHOW_BULK_CACHE_KEY = 'watch-history-show-bulk';
export const WATCH_HISTORY_SEASON_BULK_CACHE_KEY = 'watch-history-season-bulk';
