import { MediaServerFeature, MediaServerType } from '@maintainerr/contracts';

/**
 * Feature support matrix for media servers.
 * Used by MediaServerFactory and feature detection.
 */
export const MEDIA_SERVER_FEATURES: Record<
  MediaServerType,
  Set<MediaServerFeature>
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
    // Note: COLLECTION_SORT not supported — no boxset reorder API;
    // ForcedSortName has global side-effects.
  ]),
};

export const MEDIA_SERVER_BATCH_SIZE = {
  METADATA_REFRESH: 10,
} as const;

/**
 * Check if a media server type supports a specific feature.
 */
export function supportsFeature(
  serverType: MediaServerType,
  feature: MediaServerFeature,
): boolean {
  return MEDIA_SERVER_FEATURES[serverType]?.has(feature) ?? false;
}
