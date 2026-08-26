import { t } from '@lingui/core/macro'
import {
  isSportarrTvdbAlias,
  type MediaItemType,
  type MediaProviderIds,
} from '@maintainerr/contracts'

const mediaTypeBadgeColors: Record<string, string> = {
  movie: 'bg-zinc-900',
  show: 'bg-maintainerrdark',
  season: 'bg-yellow-700',
  episode: 'bg-rose-900',
}

export function mediaTypeBgColor(mediaType: string): string {
  return mediaTypeBadgeColors[mediaType] ?? 'bg-rose-900'
}

export function toImageEndpointType(
  mediaType: MediaItemType,
): 'movie' | 'show' {
  return ['season', 'episode'].includes(mediaType)
    ? 'show'
    : (mediaType as 'movie' | 'show')
}

export function toApiMediaType(mediaType: MediaItemType): 'movie' | 'tv' {
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

/**
 * Badge/chip label for a media type. Seasons and episodes carry their number so
 * items of the same show stay distinguishable on the poster.
 */
export function mediaTypeLabel(
  mediaType: MediaItemType,
  numbers: { seasonNumber?: number; episodeNumber?: number } = {},
): string {
  if (mediaType === 'season' && numbers.seasonNumber != null) {
    const itemNumber = numbers.seasonNumber
    return t`season ${{ itemNumber }}`
  }

  if (mediaType === 'episode' && numbers.episodeNumber != null) {
    const itemNumber = numbers.episodeNumber
    return t`episode ${{ itemNumber }}`
  }

  switch (mediaType) {
    case 'movie':
      return t`movie`
    case 'show':
      return t`show`
    case 'season':
      return t`season`
    default:
      return t`episode`
  }
}

export function buildMetadataPath(
  kind: 'image' | 'backdrop' | 'overview',
  mediaType: MediaItemType,
  providerIds: MediaProviderIds | undefined,
  itemId?: string | number,
): string | undefined {
  const params = buildProviderIdParams(providerIds)

  if (!params.toString()) {
    return undefined
  }

  if (itemId && (mediaType === 'season' || mediaType === 'episode')) {
    params.set('itemId', String(itemId))
  }

  return `/metadata/${kind}/${toImageEndpointType(mediaType)}?${params.toString()}`
}

/**
 * TMDB and TheTVDB split movies from series; TheTVDB goes through its
 * dereferrer, which resolves a numeric id to the right slug. Sportarr stamps
 * numeric aliases into the tvdb namespace that have no page at all, so those
 * resolve to nothing rather than a dead link; its own sportarr namespace
 * links to the league on sportarr.net.
 */
export function buildProviderUrl(
  provider: keyof MediaProviderIds,
  providerId: string,
  mediaType: MediaItemType,
): string | undefined {
  const id = encodeURIComponent(providerId)
  const isMovie = toApiMediaType(mediaType) === 'movie'

  switch (provider) {
    case 'tmdb':
      return `https://themoviedb.org/${isMovie ? 'movie' : 'tv'}/${id}`
    case 'imdb':
      return `https://www.imdb.com/title/${id}/`
    case 'tvdb': {
      if (isSportarrTvdbAlias(Number(providerId))) {
        return undefined
      }
      return `https://thetvdb.com/dereferrer/${isMovie ? 'movie' : 'series'}/${id}`
    }
    case 'sportarr':
      return `https://sportarr.net/browse/leagues/${id}`
    default:
      return undefined
  }
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
