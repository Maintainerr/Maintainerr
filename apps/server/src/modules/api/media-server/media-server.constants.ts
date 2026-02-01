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
  ]),
  [MediaServerType.JELLYFIN]: new Set([
    MediaServerFeature.LABELS, // Tags in Jellyfin
    MediaServerFeature.PLAYLISTS,
    // Note: COLLECTION_VISIBILITY not supported
    // Note: WATCHLIST not supported (no API)
    // Note: CENTRAL_WATCH_HISTORY not supported (requires user iteration)
  ]),
};

/**
 * Check if a media server type supports a specific feature.
 */
export function supportsFeature(
  serverType: MediaServerType,
  feature: MediaServerFeature,
): boolean {
  return MEDIA_SERVER_FEATURES[serverType]?.has(feature) ?? false;
}

/**
 * Injection token for the media server service interface.
 */
export const MEDIA_SERVER_SERVICE = 'MEDIA_SERVER_SERVICE';
