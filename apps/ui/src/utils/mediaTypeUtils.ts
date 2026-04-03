import { type MediaProviderIds } from '@maintainerr/contracts'

const mediaTypeBadgeColors: Record<string, string> = {
  movie: 'bg-zinc-900',
  show: 'bg-amber-900',
  season: 'bg-yellow-700',
  episode: 'bg-rose-900',
}

export function mediaTypeBgColor(mediaType: string): string {
  return mediaTypeBadgeColors[mediaType] ?? 'bg-rose-900'
}

export function toImageEndpointType(
  mediaType: 'movie' | 'show' | 'season' | 'episode',
): 'movie' | 'show' {
  return ['season', 'episode'].includes(mediaType)
    ? 'show'
    : (mediaType as 'movie' | 'show')
}

export function toApiMediaType(
  mediaType: 'movie' | 'show' | 'season' | 'episode',
): 'movie' | 'tv' {
  return ['show', 'season', 'episode'].includes(mediaType) ? 'tv' : 'movie'
}

export function buildProviderIdParams(
  providerIds: MediaProviderIds | undefined,
): URLSearchParams {
  const params = new URLSearchParams()

  if (!providerIds) {
    return params
  }

  for (const [key, values] of Object.entries(providerIds)) {
    if (values?.[0]) {
      params.set(`${key}Id`, values[0])
    }
  }

  return params
}

export function buildMetadataImagePath(
  kind: 'image' | 'backdrop',
  mediaType: 'movie' | 'show' | 'season' | 'episode',
  providerIds: MediaProviderIds | undefined,
): string | undefined {
  const query = buildProviderIdParams(providerIds).toString()

  if (!query) {
    return undefined
  }

  return `/metadata/${kind}/${toImageEndpointType(mediaType)}?${query}`
}

export function toProviderIds(ids: {
  tmdbId?: number | null
  tvdbId?: number | null
}): MediaProviderIds | undefined {
  const providerIds: MediaProviderIds = {}

  if (ids.tmdbId != null) {
    providerIds.tmdb = [String(ids.tmdbId)]
  }

  if (ids.tvdbId != null) {
    providerIds.tvdb = [String(ids.tvdbId)]
  }

  return Object.keys(providerIds).length > 0 ? providerIds : undefined
}

export function isAbsoluteUrl(
  value: string | null | undefined,
): value is string {
  if (value == null) {
    return false
  }

  return value.startsWith('http://') || value.startsWith('https://')
}
