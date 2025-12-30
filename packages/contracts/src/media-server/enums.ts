/**
 * Media server type enumeration
 * Identifies which media server implementation is being used
 */
export enum EMediaServerType {
  PLEX = 'plex',
  JELLYFIN = 'jellyfin',
}

/**
 * Media data type enumeration
 * Server-agnostic media type classification
 * Uses numeric values and plural names for database compatibility with existing EPlexDataType data
 */
export enum EMediaDataType {
  MOVIES = 1,
  SHOWS = 2,
  SEASONS = 3,
  EPISODES = 4,
}

/**
 * Feature flags for capability detection
 * Different media servers support different features
 */
export enum EMediaServerFeature {
  /** Ability to set collection visibility (home/recommended) */
  COLLECTION_VISIBILITY = 'collection_visibility',
  /** Watchlist functionality via external API (Plex.tv) */
  WATCHLIST = 'watchlist',
  /** Central watch history endpoint (vs per-user iteration) */
  CENTRAL_WATCH_HISTORY = 'central_watch_history',
  /** Support for labels/tags on media items */
  LABELS = 'labels',
  /** Playlist management */
  PLAYLISTS = 'playlists',
}
