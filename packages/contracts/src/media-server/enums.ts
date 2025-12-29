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
 * Note: This is designed to eventually replace EPlexDataType
 */
export enum EMediaDataType {
  MOVIE = 'movie',
  SHOW = 'show',
  SEASON = 'season',
  EPISODE = 'episode',
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
