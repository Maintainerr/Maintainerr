export const PLEX_PAGE_SIZE = {
  DEFAULT: 50,
  WATCHLIST: 100,
} as const;

// Bounds runtime Plex socket reads so a wedged request can't stall the rule
// executor indefinitely. Connection probes use the shorter
// CONNECTION_TEST_TIMEOUT_MS; this applies to the long-lived runtime client.
export const PLEX_REQUEST_TIMEOUT_MS = 30_000;

// NodeCache keys and TTL for the bulk watch-history maps built by
// prefetchWatchHistory(). Three maps are written in a single sweep:
//   BULK     — leaf items (movies + episodes) keyed by own ratingKey
//   SHOW     — shows keyed by show ratingKey (derived from episode grandparentKey)
//   SEASON   — seasons keyed by season ratingKey (derived from episode parentKey)
// The plexguid cache is persistent so all three maps survive flushAll()
// between rule groups within the same cron window.
export const WATCH_HISTORY_BULK_CACHE_KEY = 'watch-history-bulk';
export const WATCH_HISTORY_SHOW_BULK_CACHE_KEY = 'watch-history-show-bulk';
export const WATCH_HISTORY_SEASON_BULK_CACHE_KEY = 'watch-history-season-bulk';
export const WATCH_HISTORY_BULK_TTL_SECONDS = 60 * 60; // 1 hour
