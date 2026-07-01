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
    MediaServerFeature.CROSS_LIBRARY_COLLECTIONS, // BoxSets are server-global
    // Note: COLLECTION_VISIBILITY not supported
    // Note: WATCHLIST not supported (no API)
    // Note: CENTRAL_WATCH_HISTORY not supported (requires user iteration)
    // Note: COLLECTION_SORT not supported — no boxset reorder API; ForcedSortName has global side-effects.
  ]),
  [MediaServerType.EMBY]: new Set([
    MediaServerFeature.LABELS,
    MediaServerFeature.PLAYLISTS,
    MediaServerFeature.COLLECTION_POSTER,
    MediaServerFeature.CROSS_LIBRARY_COLLECTIONS, // BoxSets are server-global
    // Conservative defaults mirroring Jellyfin:
    // - COLLECTION_VISIBILITY: Emby has no Plex-style home/recommended pinning.
    // - WATCHLIST: no public watchlist API.
    // - CENTRAL_WATCH_HISTORY: same per-user iteration model as Jellyfin.
    // - COLLECTION_SORT: Emby exposes DisplayOrder = PremiereDate | SortName
    //   on a BoxSet but no item-move/reorder endpoint, so Maintainerr's
    //   "push an explicit ordered list of item IDs" contract isn't satisfiable.
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
