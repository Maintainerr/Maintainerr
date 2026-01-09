export enum MediaServerType {
  PLEX = 'plex',
  JELLYFIN = 'jellyfin',
}

export type MediaItemType = 'movie' | 'show' | 'season' | 'episode'

export const MediaItemTypes: MediaItemType[] = [
  'movie',
  'show',
  'season',
  'episode',
]

export const MediaDataTypeStrings: string[] = [
  'MOVIES',
  'SHOWS',
  'SEASONS',
  'EPISODES',
]

export function isMediaType(
  itemType: MediaItemType | null | undefined,
  expectedType: MediaItemType,
): boolean {
  return itemType === expectedType
}

export function isValidMediaItemType(type: string): type is MediaItemType {
  return MediaItemTypes.includes(type as MediaItemType)
}

/**
 * Feature flags for capability detection
 * Different media servers support different features
 */
export enum MediaServerFeature {
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
