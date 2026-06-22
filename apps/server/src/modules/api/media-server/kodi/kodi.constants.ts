// Kodi adapter tuning and synthetic-identity constants.
//
// Kodi exposes a single global video library with no user or library
// partitions over JSON-RPC, so Maintainerr synthesizes both: two virtual
// libraries (movies, tvshows) and one user representing the single install.

export const KODI_CACHE_TTL = {
  STATUS: 60000,
  COLLECTIONS: 600,
} as const;

export const KODI_CACHE_KEYS = {
  STATUS: 'kodi:status',
  COLLECTIONS: 'kodi:collections',
} as const;

export const KODI_PAGE_SIZE = {
  DEFAULT: 100,
  MAX: 500,
} as const;

/** Read-modify-write of the `tag` array is per-item, so writes run in batches. */
export const KODI_BATCH_SIZE = {
  COLLECTION_MUTATION: 8,
} as const;

/**
 * Synthetic libraries. Kodi has no library sections — content is split only by
 * media kind — so Maintainerr presents one virtual library per kind.
 */
export const KODI_LIBRARIES = {
  MOVIES: { id: 'movies', title: 'Movies', type: 'movie' as const },
  TVSHOWS: { id: 'tvshows', title: 'TV Shows', type: 'show' as const },
} as const;

/**
 * The single synthetic user. Kodi has no multi-user model over JSON-RPC; watch
 * state is the install-wide playcount/lastplayed, attributed to this user.
 */
export const KODI_USER = { id: 'kodi', name: 'Kodi' } as const;

/**
 * Prefix marking a tag as a Maintainerr-managed collection. Tag-backed
 * collections (movie/show) are surfaced as a tag of the form
 * `Maintainerr: <title> [<token>]`; the token keeps the tag (and therefore the
 * collection id derived from it) stable and unique even if titles collide, so
 * the id survives a rename — collection ids must be stable (the update path
 * keeps the same mediaServerId).
 */
export const KODI_COLLECTION_TAG_PREFIX = 'Maintainerr:';

// Properties requested per item type. uniqueid/cast/streamdetails inflate
// response time (per the schema), so request them only where the mapper uses them.
export const KODI_MOVIE_PROPERTIES = [
  'title',
  'year',
  'playcount',
  'lastplayed',
  'dateadded',
  'premiered',
  'rating',
  'userrating',
  'runtime',
  'genre',
  'tag',
  'uniqueid',
  'cast',
  'streamdetails',
  'file',
] as const;

export const KODI_TVSHOW_PROPERTIES = [
  'title',
  'year',
  'playcount',
  'lastplayed',
  'dateadded',
  'premiered',
  'rating',
  'userrating',
  'genre',
  'tag',
  'uniqueid',
  'cast',
  'episode',
  'watchedepisodes',
] as const;

export const KODI_SEASON_PROPERTIES = [
  'season',
  'showtitle',
  'tvshowid',
  'playcount',
  'episode',
  'watchedepisodes',
] as const;

export const KODI_EPISODE_PROPERTIES = [
  'title',
  'playcount',
  'lastplayed',
  'dateadded',
  'firstaired',
  'rating',
  'userrating',
  'runtime',
  'season',
  'episode',
  'showtitle',
  'tvshowid',
  'uniqueid',
  'cast',
  'streamdetails',
  'file',
] as const;
