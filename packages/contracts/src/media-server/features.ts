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
    MediaServerFeature.OVERLAYS,
  ]),
  [MediaServerType.JELLYFIN]: new Set([
    MediaServerFeature.LABELS, // Tags in Jellyfin
    MediaServerFeature.PLAYLISTS,
    MediaServerFeature.COLLECTION_POSTER,
    MediaServerFeature.OVERLAYS,
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
    MediaServerFeature.OVERLAYS,
    MediaServerFeature.CROSS_LIBRARY_COLLECTIONS, // BoxSets are server-global
    // Conservative defaults mirroring Jellyfin:
    // - COLLECTION_VISIBILITY: Emby has no Plex-style home/recommended pinning.
    // - WATCHLIST: no public watchlist API.
    // - CENTRAL_WATCH_HISTORY: same per-user iteration model as Jellyfin.
    // - COLLECTION_SORT: Emby exposes DisplayOrder = PremiereDate | SortName
    //   on a BoxSet but no item-move/reorder endpoint, so Maintainerr's
    //   "push an explicit ordered list of item IDs" contract isn't satisfiable.
  ]),
  [MediaServerType.KODI]: new Set([
    // Kodi is a single-user player exposing only a JSON-RPC client surface;
    // none of the optional capabilities below are available over JSON-RPC:
    // - COLLECTION_VISIBILITY: no home/recommended pinning.
    // - WATCHLIST: no watchlist API.
    // - CENTRAL_WATCH_HISTORY: single-user, only per-item playcount/lastplayed.
    // - COLLECTION_POSTER: collections are tag-backed; tags carry no artwork.
    // - COLLECTION_SORT: no item-move/reorder endpoint.
    // - CROSS_LIBRARY_COLLECTIONS: libraries are synthesized (movies/tvshows).
    // - PLAYLISTS: no library-scoped collection-style playlist analogue.
    // - LABELS: the tag field is reserved for collection membership, so
    //   exposing it as a separate label writer would collide.
    // - OVERLAYS: no writable per-item poster surface over JSON-RPC.
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
