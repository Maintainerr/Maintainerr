/**
 * DTOs used by the overlay provider abstraction and the /api/overlays
 * editor-helper endpoints. Intentionally narrower than MediaLibrary /
 * MediaItem — the overlay UI only needs a handful of fields.
 */

export interface OverlayLibrarySection {
  /** Server-native library/section id (Plex ratingKey, Jellyfin ItemId). */
  key: string
  title: string
  type: 'movie' | 'show'
}

export interface OverlayPreviewItem {
  /** Server-native item id (Plex ratingKey, Jellyfin ItemId). */
  itemId: string
  title: string
}
