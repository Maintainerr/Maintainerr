import { MediaItem, type MediaProviderIds } from '@maintainerr/contracts'
import React, { memo, useEffect, useMemo, useState } from 'react'
import { useMediaServerType } from '../../../../hooks/useMediaServerType'
import GetApiHandler from '../../../../utils/ApiHandler'
import { logClientError } from '../../../../utils/ClientLogger'
import {
  buildMetadataImagePath,
  toApiMediaType,
} from '../../../../utils/mediaTypeUtils'
import Button from '../../Button'
import { SmallLoadingSpinner } from '../../LoadingSpinner'
import PosterModal from '../../Poster/PosterModal'

interface ModalContentProps {
  onClose: () => void
  id: number | string
  summary?: string
  year?: string
  mediaType: 'movie' | 'show' | 'season' | 'episode'
  title: string
  providerIds?: MediaProviderIds
}

const mergeProviderIds = (
  preferred?: MediaProviderIds,
  fallback?: MediaProviderIds,
): MediaProviderIds | undefined => {
  const mergedEntries = new Map<string, string[]>()

  for (const source of [preferred, fallback]) {
    if (!source) {
      continue
    }

    for (const [key, values] of Object.entries(source) as [
      string,
      string[] | undefined,
    ][]) {
      if (!values?.length) {
        continue
      }

      const existingValues = mergedEntries.get(key) ?? []
      const nextValues = [...existingValues]

      values.forEach((value) => {
        if (!nextValues.includes(value)) {
          nextValues.push(value)
        }
      })

      mergedEntries.set(key, nextValues)
    }
  }

  if (mergedEntries.size === 0) {
    return undefined
  }

  return Object.fromEntries(mergedEntries) as MediaProviderIds
}

const basePath = import.meta.env.VITE_BASE_PATH ?? ''
const ratingIcons: Record<string, string> = {
  audience: `${basePath}/icons_logos/tmdb_icon.svg`,
  critic: `${basePath}/icons_logos/rt_critic.svg`,
}

const metadataProviderLogos: Record<
  string,
  {
    logo: string
    alt: string
    buildUrl: (mediaType: string, id: string) => string
    providerIdKey: keyof MediaProviderIds
  }
> = {
  TMDB: {
    logo: `${basePath}/icons_logos/tmdb_logo.svg`,
    alt: 'TMDB Logo',
    buildUrl: (mediaType, id) => `https://themoviedb.org/${mediaType}/${id}`,
    providerIdKey: 'tmdb',
  },
  TVDB: {
    logo: `${basePath}/icons_logos/tvdb_logo.svg`,
    alt: 'TheTVDB Logo',
    buildUrl: (mediaType, id) =>
      `https://thetvdb.com/dereferrer/${mediaType === 'tv' ? 'series' : 'movie'}/${id}`,
    providerIdKey: 'tvdb',
  },
}

interface BackdropResult {
  requestKey: string | null
  url: string | null
  provider: string | null
  providerId: number | null
}

const emptyBackdropResult: BackdropResult = {
  requestKey: null,
  url: null,
  provider: null,
  providerId: null,
}

const MediaModalContent: React.FC<ModalContentProps> = memo(
  ({
    onClose,
    mediaType,
    id,
    summary,
    year,
    title,
    providerIds: fallbackProviderIds,
  }) => {
    const { isPlex, isJellyfin } = useMediaServerType()
    const [loading, setLoading] = useState<boolean>(true)
    const [backdropResult, setBackdropResult] =
      useState<BackdropResult>(emptyBackdropResult)
    const [machineId, setMachineId] = useState<string | null>(null)
    const [serverUrl, setServerUrl] = useState<string | null>(null)
    const [tautulliModalUrl, setTautulliModalUrl] = useState<string | null>(
      null,
    )
    const [metadata, setMetadata] = useState<MediaItem | null>(null)

    const mediaTypeOf = useMemo(() => toApiMediaType(mediaType), [mediaType])
    const providerIds = useMemo(
      () => mergeProviderIds(metadata?.providerIds, fallbackProviderIds),
      [metadata?.providerIds, fallbackProviderIds],
    )
    const backdropRequestPath = buildMetadataImagePath(
      'backdrop',
      mediaType,
      providerIds,
    )
    const isCurrentBackdrop = backdropResult.requestKey === backdropRequestPath
    const resolvedBackdrop = isCurrentBackdrop ? backdropResult.url : null

    const providerLogo = useMemo(() => {
      if (!isCurrentBackdrop || !backdropResult.provider) return null
      const cfg = metadataProviderLogos[backdropResult.provider]
      if (!cfg) return null
      const linkId =
        backdropResult.providerId?.toString() ??
        providerIds?.[cfg.providerIdKey]?.[0]
      if (!linkId) return null
      return { ...cfg, linkId }
    }, [isCurrentBackdrop, backdropResult, providerIds])

    useEffect(() => {
      GetApiHandler('/media-server').then((resp) => {
        setMachineId(resp?.machineId)
        // For Jellyfin, we need the server URL to construct links
        if (resp?.url) {
          setServerUrl(resp.url)
        }
      })
      GetApiHandler('/settings').then((resp) =>
        setTautulliModalUrl(resp?.tautulli_url || null),
      )
      GetApiHandler<MediaItem>(`/media-server/meta/${id}`).then((data) => {
        setMetadata(data)
        setLoading(false)
      })
    }, [id])

    useEffect(() => {
      if (!backdropRequestPath) {
        return
      }

      let active = true

      GetApiHandler<{ url: string; provider: string; id: number } | undefined>(
        backdropRequestPath,
      )
        .then((resp) => {
          if (!active) {
            return
          }

          setBackdropResult({
            requestKey: backdropRequestPath,
            url: resp?.url ?? null,
            provider: resp?.provider ?? null,
            providerId: resp?.id ?? null,
          })
        })
        .catch((error) => {
          if (!active) {
            return
          }

          void logClientError(
            'Error fetching backdrop image. Check your media server metadata',
            error,
            'MediaCard.MediaModal.backdropFetch',
          )
          setBackdropResult({
            ...emptyBackdropResult,
            requestKey: backdropRequestPath,
          })
        })

      return () => {
        active = false
      }
    }, [backdropRequestPath])

    return (
      <PosterModal onClose={onClose}>
        <div className="relative h-72 w-full overflow-hidden p-2 xl:h-96">
          <div
            className="h-full w-full rounded-xl bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: resolvedBackdrop
                ? `url(${resolvedBackdrop})`
                : 'linear-gradient(to bottom, #1e293b, #1e293b)',
            }}
          ></div>
          {loading && (
            <div className="absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center bg-black bg-opacity-50">
              <SmallLoadingSpinner className="h-16 w-16" />
            </div>
          )}

          <div className="absolute left-0 top-0 z-10 flex h-full w-full gap-x-4 p-4">
            <div className="flex grow flex-col">
              <div className="max-w-fit grow">
                <div
                  className={`pointer-events-none flex justify-center rounded-lg bg-opacity-70 p-2 text-xs font-medium uppercase text-zinc-200 ${
                    mediaType === 'movie'
                      ? 'bg-black'
                      : mediaType === 'show'
                        ? 'bg-amber-900'
                        : mediaType === 'season'
                          ? 'bg-yellow-700'
                          : 'bg-rose-900'
                  }`}
                >
                  {mediaType}
                </div>
                {metadata?.contentRating && (
                  <div className="pointer-events-none mt-1 rounded-lg bg-black bg-opacity-70 p-2 text-xs font-medium uppercase text-zinc-200">
                    {`Rated: ${metadata.contentRating}`}
                  </div>
                )}
              </div>
              {metadata?.ratings && metadata.ratings.length > 0 ? (
                <div className="flex flex-wrap-reverse gap-1">
                  {metadata.ratings.map((rating, index) => {
                    const icon = rating.type
                      ? ratingIcons[rating.type]
                      : undefined
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-center space-x-1.5 rounded-lg bg-black bg-opacity-70 px-3 py-1 text-white shadow-lg"
                      >
                        {icon && (
                          <img
                            src={icon}
                            alt={`${rating.type} rating`}
                            width={24}
                            height={24}
                            className="h-6 w-6"
                          />
                        )}
                        <span className="cursor-default text-sm font-medium">
                          {rating.value.toFixed(1)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : undefined}
            </div>
            <div className="flex flex-col items-end">
              <div className="max-w-fit grow">
                <div className="flex h-8 w-32 justify-end">
                  {providerLogo && (
                    <a
                      href={providerLogo.buildUrl(
                        mediaTypeOf,
                        providerLogo.linkId,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="block h-full w-full"
                    >
                      <img
                        src={providerLogo.logo}
                        alt={providerLogo.alt}
                        width={128}
                        height={32}
                        className="h-8 w-32 rounded-lg bg-black bg-opacity-70 p-2 shadow-lg"
                      />
                    </a>
                  )}
                </div>
                {isPlex && (
                  <div>
                    <a
                      href={`https://app.plex.tv/desktop#!/server/${machineId}/details?key=%2Flibrary%2Fmetadata%2F${id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={`${basePath}/icons_logos/plex_logo.svg`}
                        alt="Plex Logo"
                        width={128}
                        height={32}
                        className="mt-1 h-8 w-32 rounded-lg bg-black bg-opacity-70 p-1 shadow-lg"
                      />
                    </a>
                  </div>
                )}
                {isJellyfin && serverUrl && (
                  <div>
                    <a
                      href={`${serverUrl}/web/#/details?id=${id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={`${basePath}/icons_logos/jellyfin.svg`}
                        alt="Jellyfin Logo"
                        width={128}
                        height={32}
                        className="mt-1 h-8 w-32 rounded-lg bg-black bg-opacity-70 p-1 shadow-lg"
                      />
                    </a>
                  </div>
                )}
                {isPlex && tautulliModalUrl && (
                  <div>
                    <a
                      href={`${tautulliModalUrl}/info?rating_key=${id}&source=history`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={`${basePath}/icons_logos/tautulli_logo.svg`}
                        alt="Tautulli Logo"
                        width={128}
                        height={32}
                        className="mt-1 h-8 w-32 rounded-lg bg-black bg-opacity-70 p-1.5 shadow-lg"
                      />
                    </a>
                  </div>
                )}
              </div>
              {metadata?.genres && metadata.genres.length > 0 ? (
                <div className="pointer-events-none flex flex-wrap-reverse items-end justify-end gap-1">
                  {metadata.genres.map((genre, index) => (
                    <span
                      key={index}
                      className="flex items-center rounded-lg bg-black bg-opacity-70 p-2 text-xs font-medium text-white shadow-lg"
                    >
                      {genre.name}
                    </span>
                  ))}
                </div>
              ) : undefined}
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-100">
                {title}
                {year ? ` (${year})` : ''}
              </h2>
            </div>
          </div>

          <div className="mt-2 text-gray-300">
            <p>{summary || 'No summary available.'}</p>
          </div>

          <div className="mr-0.5 mt-6 flex flex-row items-center justify-between gap-4">
            {providerIds &&
              ['movie', 'show'].includes(mediaType) &&
              (providerIds.tmdb?.length ||
                providerIds.imdb?.length ||
                providerIds.tvdb?.length) && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-400">
                  {providerIds.tmdb?.map((id) => (
                    <span
                      key={`tmdb-${id}`}
                      className="flex items-center justify-center rounded-lg bg-zinc-700 p-2 text-xs text-white shadow-lg"
                    >
                      tmdb://{id}
                    </span>
                  ))}
                  {providerIds.imdb?.map((id) => (
                    <span
                      key={`imdb-${id}`}
                      className="flex items-center justify-center rounded-lg bg-zinc-700 p-2 text-xs text-white shadow-lg"
                    >
                      imdb://{id}
                    </span>
                  ))}
                  {providerIds.tvdb?.map((id) => (
                    <span
                      key={`tvdb-${id}`}
                      className="flex items-center justify-center rounded-lg bg-zinc-700 p-2 text-xs text-white shadow-lg"
                    >
                      tvdb://{id}
                    </span>
                  ))}
                  {isCurrentBackdrop &&
                    backdropResult.provider &&
                    backdropResult.providerId != null &&
                    (() => {
                      const key =
                        metadataProviderLogos[backdropResult.provider!]
                          ?.providerIdKey
                      if (
                        !key ||
                        providerIds[key]?.includes(
                          String(backdropResult.providerId),
                        )
                      ) {
                        return null
                      }
                      return (
                        <span
                          key={`${key}-${backdropResult.providerId}`}
                          className="flex items-center justify-center rounded-lg bg-zinc-700 p-2 text-xs text-white shadow-lg"
                        >
                          {key}://{backdropResult.providerId}
                        </span>
                      )
                    })()}
                </div>
              )}
            <div className="ml-auto flex space-x-3">
              <Button buttonType="default" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </PosterModal>
    )
  },
)

MediaModalContent.displayName = 'MediaModalContent'

export default MediaModalContent
