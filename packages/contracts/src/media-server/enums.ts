export enum MediaServerType {
  PLEX = 'plex',
  JELLYFIN = 'jellyfin',
  EMBY = 'emby',
  KODI = 'kodi',
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
  /** Custom poster artwork can be set on collections */
  COLLECTION_POSTER = 'collection_poster',
  /** Ability to sort collections */
  COLLECTION_SORT = 'collection_sort',
  /**
   * A single collection can span multiple libraries. Jellyfin/Emby BoxSets are
   * server-global and may hold items from any library; Plex collections are
   * bound to one library. Gates the cross-library lookup for manual collections.
   */
  CROSS_LIBRARY_COLLECTIONS = 'cross_library_collections',
  /**
   * Poster/title-card overlays can be rendered and written back to the server.
   * Requires a writable per-item image the overlay processor can replace; not
   * available on players that expose no such surface (e.g. Kodi over JSON-RPC).
   */
  OVERLAYS = 'overlays',
}
