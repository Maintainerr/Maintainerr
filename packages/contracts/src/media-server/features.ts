import { MediaServerFeature, MediaServerType } from './enums'

/**
 * Feature support matrix for media servers.
 * Shared between server adapters and the UI so capability checks stay aligned.
 */
export const MEDIA_SERVER_FEATURES: Record<
  MediaServerType,
  ReadonlySet<MediaServerFeature>
> = {
  [MediaServerType.PLEX]: new Set([
    MediaServerFeature.COLLECTION_VISIBILITY,
    MediaServerFeature.WATCHLIST,
    MediaServerFeature.CENTRAL_WATCH_HISTORY,
    MediaServerFeature.LABELS,
    MediaServerFeature.PLAYLISTS,
    MediaServerFeature.COLLECTION_POSTER,
    MediaServerFeature.COLLECTION_SORT,
  ]),
  [MediaServerType.JELLYFIN]: new Set([
    MediaServerFeature.LABELS, // Tags in Jellyfin
    MediaServerFeature.PLAYLISTS,
    MediaServerFeature.COLLECTION_POSTER,
    // Note: COLLECTION_VISIBILITY not supported
    // Note: WATCHLIST not supported (no API)
    // Note: CENTRAL_WATCH_HISTORY not supported (requires user iteration)
    // Note: COLLECTION_SORT not supported — no boxset reorder API; ForcedSortName has global side-effects.
  ]),
}

/**
 * Check whether a media server type supports a specific feature.
 */
export function supportsFeature(
  serverType: MediaServerType | null | undefined,
  feature: MediaServerFeature,
): boolean {
  return serverType ? MEDIA_SERVER_FEATURES[serverType].has(feature) : false
}
