import { EMediaServerFeature, EMediaServerType } from '@maintainerr/contracts';

/**
 * Feature support matrix for media servers.
 * Used by MediaServerFactory and feature detection.
 */
export const MEDIA_SERVER_FEATURES: Record<
  EMediaServerType,
  Set<EMediaServerFeature>
> = {
  [EMediaServerType.PLEX]: new Set([
    EMediaServerFeature.COLLECTION_VISIBILITY,
    EMediaServerFeature.WATCHLIST,
    EMediaServerFeature.CENTRAL_WATCH_HISTORY,
    EMediaServerFeature.LABELS,
    EMediaServerFeature.PLAYLISTS,
  ]),
  [EMediaServerType.JELLYFIN]: new Set([
    EMediaServerFeature.LABELS, // Tags in Jellyfin
    EMediaServerFeature.PLAYLISTS,
    // Note: COLLECTION_VISIBILITY not supported
    // Note: WATCHLIST not supported (no API)
    // Note: CENTRAL_WATCH_HISTORY not supported (requires user iteration)
  ]),
};

/**
 * Check if a media server type supports a specific feature.
 */
export function supportsFeature(
  serverType: EMediaServerType,
  feature: EMediaServerFeature,
): boolean {
  return MEDIA_SERVER_FEATURES[serverType]?.has(feature) ?? false;
}

/**
 * Injection token for the media server service interface.
 */
export const MEDIA_SERVER_SERVICE = 'MEDIA_SERVER_SERVICE';
