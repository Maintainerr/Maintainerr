export const PLEX_PAGE_SIZE = {
  DEFAULT: 50,
  WATCHLIST: 100,
  // X-Plex-Container-Size for queryAll's paginated sweeps. Plex may return a
  // shorter page than asked; queryAll advances by what actually arrived, so an
  // unknown server-side cap costs round trips, never records.
  QUERY_ALL: 120,
  // Ceiling for bulk sweeps that page through a whole library. Matches
  // JELLYFIN_BATCH_SIZE/EMBY_BATCH_SIZE.MAX_PAGE_SIZE - the sweeps cost per
  // record, not per request, so paging past this buys almost nothing: on an
  // 88k-entry history, 1000 instead of 500 saves ~36s of the ~16min sweep.
  MAX_PAGE_SIZE: 500,
} as const;

// Bounds runtime Plex socket reads so a wedged request can't stall the rule
// executor indefinitely. Connection probes use the shorter
// CONNECTION_TEST_TIMEOUT_MS; this applies to the long-lived runtime client.
export const PLEX_REQUEST_TIMEOUT_MS = 30_000;

// Key prefix in the 'plexwatchhistory' cache for the watch-history snapshots
// built by prefetchWatchHistory(). TTL and flush behaviour live on the cache
// definition in lib/cache.ts.
//
// Keyed per library, never globally: a snapshot is authoritative for "never
// watched" only inside the library it swept. Under one shared key, an item from
// a library we never swept would miss the map and read as a confirmed empty
// history - a false never-watched on a tool that deletes media. A miss on an
// unswept library has to fall through to a per-item read instead.
const WATCH_HISTORY_CACHE_KEY_PREFIX = 'watch-history-bulk';
export const watchHistoryCacheKey = (libraryId: string): string =>
  `${WATCH_HISTORY_CACHE_KEY_PREFIX}:${libraryId}`;

// Ceiling on entries held in one library's snapshot. Mirrors
// JELLYFIN_WATCH_SNAPSHOT_MAX_RECORDS: 500k trimmed rows measured ~74MB
// retained, which stays clear of the 512MB heap the key-count bound protects
// (#3284), and nothing else bounds this map. Plex reports totalSize on the
// first page, so an oversized history is abandoned after one request rather
// than paged through in full; callers fall back to per-item reads.
export const WATCH_HISTORY_MAX_ENTRIES = 500_000;

// A history row is only ever read for its identity, its timing and the account
// that watched it. Plex sends artwork, titles and summaries by default;
// dropping them measured 405 -> 148 bytes per row on PMS 1.43.3, and the
// sweep's cost is per record. `index`/`parentIndex` stay - sw_lastWatched sorts
// on them.
export const WATCH_HISTORY_EXCLUDE_FIELDS = [
  'art',
  'banner',
  'deviceID',
  'grandparentArt',
  'grandparentThumb',
  'grandparentTitle',
  'guid',
  'historyKey',
  'key',
  'originallyAvailableAt',
  'parentThumb',
  'parentTitle',
  'summary',
  'theme',
  'thumb',
  'title',
].join(',');
