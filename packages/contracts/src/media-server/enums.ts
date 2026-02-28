export enum MediaServerType {
  PLEX = 'plex',
  JELLYFIN = 'jellyfin',
}

export type MediaItemType = 'movie' | 'show' | 'season' | 'episode'

/** All MediaItemType values. Must match the MediaItemType union. */
export const MediaItemTypes: MediaItemType[] = [
  'movie',
  'show',
  'season',
  'episode',
]

/** Display labels keyed by MediaItemType (derived). */
export const MediaItemTypeLabels: Record<MediaItemType, string> =
  Object.fromEntries(
    MediaItemTypes.map((t) => [
      t,
      t.charAt(0).toUpperCase() + t.slice(1) + 's',
    ]),
  ) as Record<MediaItemType, string>

/** Uppercase type strings for serialization, e.g. YAML export (derived). */
export const MediaDataTypeStrings: string[] = MediaItemTypes.map((t) =>
  MediaItemTypeLabels[t].toUpperCase(),
)

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
