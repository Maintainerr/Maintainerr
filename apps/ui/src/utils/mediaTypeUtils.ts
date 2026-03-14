/**
 * Shared media-type utilities used across MediaCard, MediaModal,
 * and other components that deal with media types.
 */

// ── Badge color mapping ──

const mediaTypeBadgeColors: Record<string, string> = {
  movie: 'bg-zinc-900',
  show: 'bg-amber-900',
  season: 'bg-yellow-700',
  episode: 'bg-rose-900',
}

/**
 * Returns a Tailwind background-color class for a media-type badge.
 */
export function mediaTypeBgColor(mediaType: string): string {
  return mediaTypeBadgeColors[mediaType] ?? 'bg-rose-900'
}

// ── Media type normalization ──

/**
 * Map a UI media type to the image endpoint path segment.
 * Seasons and episodes use the show-level image.
 */
export function toImageEndpointType(
  mediaType: 'movie' | 'show' | 'season' | 'episode',
): 'movie' | 'show' {
  return ['season', 'episode'].includes(mediaType)
    ? 'show'
    : (mediaType as 'movie' | 'show')
}

/**
 * Map a UI media type to the canonical provider media type.
 * Used for external provider URLs (TMDB, TVDB).
 */
export function toApiMediaType(
  mediaType: 'movie' | 'show' | 'season' | 'episode',
): 'tv' | 'movie' {
  return ['show', 'season', 'episode'].includes(mediaType) ? 'tv' : 'movie'
}

// ── Provider ID params ──

/**
 * Build URLSearchParams from a provider IDs object.
 * Each provider key gets a `${key}Id` param with the first value.
 */
export function buildProviderIdParams(
  providerIds: Record<string, string[]> | undefined,
): URLSearchParams {
  const params = new URLSearchParams()
  if (providerIds) {
    for (const [key, values] of Object.entries(providerIds)) {
      if (values?.[0]) params.set(`${key}Id`, values[0])
    }
  }
  return params
}
