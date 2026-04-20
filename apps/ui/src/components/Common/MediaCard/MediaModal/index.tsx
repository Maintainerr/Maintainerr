import {
  MediaItem,
  ServarrAction,
  type MaintainerrMediaStatusDetails,
  type MaintainerrMediaStatusEntry,
  type MediaProviderIds,
} from '@maintainerr/contracts'
import React, { memo, useEffect, useMemo, useState } from 'react'
import { useLockBodyScroll } from '../../../../hooks/useLockBodyScroll'
import { useMediaServerType } from '../../../../hooks/useMediaServerType'
import GetApiHandler from '../../../../utils/ApiHandler'
import { logClientError } from '../../../../utils/ClientLogger'
import {
  buildMetadataImagePath,
  toApiMediaType,
} from '../../../../utils/mediaTypeUtils'
import Button from '../../Button'
import LoadingSpinner from '../../LoadingSpinner'
import {
  emptyMaintainerrMediaStatusDetails,
  getMaintainerrStatusDetailsKey,
  loadMaintainerrStatusDetails,
  rememberMaintainerrStatusDetails,
} from '../maintainerrStatus'
import type { ICollection } from '../../../Collection'
import TriggerRuleActionBtn from '../../../Collection/CollectionDetail/TriggerRuleActionBtn'

interface ModalContentProps {
  onClose: () => void
  id: number | string
  summary?: string
  year?: string
  mediaType: 'movie' | 'show' | 'season' | 'episode'
  title: string
  providerIds?: MediaProviderIds
  exclusionType?: 'global' | 'specific'
  collection?: ICollection
  isManual?: boolean
  forceStatusLoad?: boolean
  onStatusLink?: (targetPath: string) => void
  onCollectionItemRemoved?: () => void
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

const maintainerrStatusCardStyles = {
  cardClassName: 'bg-zinc-900/70',
  titleClassName: 'text-white',
  contentClassName: 'text-zinc-100',
  emptyClassName: 'text-zinc-100/80',
  linkClassName: 'text-maintainerr underline hover:text-maintainerr-400',
} as const

const MediaModalContent: React.FC<ModalContentProps> = memo(
  ({
    onClose,
    mediaType,
    id,
    summary,
    year,
    title,
    providerIds: fallbackProviderIds,
    exclusionType,
    collection,
    isManual = false,
    forceStatusLoad = false,
    onStatusLink,
    onCollectionItemRemoved,
  }) => {
    useLockBodyScroll(true)

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
    const [maintainerrDetailsState, setMaintainerrDetailsState] = useState<{
      key: string
      details: MaintainerrMediaStatusDetails
    } | null>(null)
    const [maintainerrDetailsLoading, setMaintainerrDetailsLoading] =
      useState(false)

    const mediaTypeOf = useMemo(() => toApiMediaType(mediaType), [mediaType])
    const maintainerrDetailsKey = useMemo(
      () =>
        forceStatusLoad
          ? String(id)
          : getMaintainerrStatusDetailsKey({
              id,
              exclusionType,
              isManual,
            }),
      [exclusionType, forceStatusLoad, id, isManual],
    )
    const maintainerrDetails = useMemo(() => {
      if (
        !maintainerrDetailsKey ||
        maintainerrDetailsState?.key !== maintainerrDetailsKey
      ) {
        return undefined
      }

      return maintainerrDetailsState.details
    }, [maintainerrDetailsKey, maintainerrDetailsState])
    const excludedFromEntries =
      maintainerrDetails?.excludedFrom ??
      emptyMaintainerrMediaStatusDetails.excludedFrom
    const manuallyAddedToEntries =
      maintainerrDetails?.manuallyAddedTo ??
      emptyMaintainerrMediaStatusDetails.manuallyAddedTo
    const shouldShowExcludedDetails = maintainerrDetailsLoading
      ? exclusionType != null
      : excludedFromEntries.length > 0
    const shouldShowManualDetails = maintainerrDetailsLoading
      ? isManual
      : manuallyAddedToEntries.length > 0
    const showMaintainerrDetails =
      shouldShowExcludedDetails || shouldShowManualDetails
    const canTriggerRuleAction =
      collection != null &&
      collection.arrAction !== ServarrAction.DO_NOTHING &&
      !isManual &&
      exclusionType == null
    const providerIds = useMemo(
      () => mergeProviderIds(metadata?.providerIds, fallbackProviderIds),
      [metadata?.providerIds, fallbackProviderIds],
    )
    const backdropRequestPath = buildMetadataImagePath(
      'backdrop',
      mediaType,
      providerIds,
      id,
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
      if (!maintainerrDetailsKey) {
        return
      }

      if (maintainerrDetailsState?.key === maintainerrDetailsKey) {
        return
      }

      let active = true
      setMaintainerrDetailsLoading(true)

      const loadDetails = async () => {
        try {
          const details = await loadMaintainerrStatusDetails({
            cacheKey: maintainerrDetailsKey,
            id,
            getApiHandler: GetApiHandler,
          })

          if (!active) {
            return
          }

          setMaintainerrDetailsState({
            key: maintainerrDetailsKey,
            details,
          })
        } catch (error) {
          if (!active) {
            return
          }

          void logClientError(
            'Failed to load maintainerr status details.',
            error,
            'MediaCard.MediaModal.loadMaintainerrDetails',
          )

          setMaintainerrDetailsState({
            key: maintainerrDetailsKey,
            details: rememberMaintainerrStatusDetails(
              maintainerrDetailsKey,
              emptyMaintainerrMediaStatusDetails,
            ),
          })
        } finally {
          if (active) {
            setMaintainerrDetailsLoading(false)
          }
        }
      }

      void loadDetails()

      return () => {
        active = false
      }
    }, [id, maintainerrDetailsKey, maintainerrDetailsState?.key])

    useEffect(() => {
      let active = true

      GetApiHandler('/media-server')
        .then((resp) => {
          if (!active) return
          setMachineId(resp?.machineId)
          // For Jellyfin, we need the server URL to construct links
          if (resp?.url) {
            setServerUrl(resp.url)
          }
        })
        .catch(() => {})
      GetApiHandler('/settings')
        .then((resp) => {
          if (!active) return
          setTautulliModalUrl(resp?.tautulli_url || null)
        })
        .catch(() => {})
      GetApiHandler<MediaItem>(`/media-server/meta/${id}`)
        .then((data) => {
          if (!active) return
          setMetadata(data)
          setLoading(false)
        })
        .catch(() => {
          if (active) setLoading(false)
        })

      return () => {
        active = false
      }
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

    const renderMaintainerrStatusItems = (
      entries: ReadonlyArray<MaintainerrMediaStatusEntry>,
      emptyLabel: string,
      contentClassName: string,
      emptyClassName: string,
      linkClassName: string,
    ) => {
      if (entries.length === 0) {
        return <p className={`text-sm ${emptyClassName}`}>{emptyLabel}</p>
      }

      return (
        <ul className={`space-y-2 text-sm ${contentClassName}`}>
          {entries.map((entry) => {
            const targetPath = entry.targetPath

            return (
              <li
                key={`${entry.label}-${targetPath ?? 'none'}`}
                className="flex items-start gap-2"
              >
                <span className="mt-1 text-xs text-zinc-400">•</span>
                {targetPath && onStatusLink ? (
                  <button
                    type="button"
                    className={`text-left transition ${linkClassName}`}
                    onClick={() => onStatusLink(targetPath)}
                  >
                    {entry.label}
                  </button>
                ) : targetPath ? (
                  <a
                    href={targetPath}
                    className={`transition ${linkClassName}`}
                  >
                    {entry.label}
                  </a>
                ) : (
                  <span>{entry.label}</span>
                )}
              </li>
            )
          })}
        </ul>
      )
    }

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 px-3"
        onClick={onClose}
      >
        <div
          className="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-zinc-800 shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
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
              <div className="absolute bottom-0 left-0 right-0 top-0 bg-black bg-opacity-50">
                <LoadingSpinner
                  className="h-16 w-16"
                  containerClassName="h-full w-full"
                />
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
                          ? 'bg-maintainerrdark'
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
              <p>{metadata?.summary || summary || 'No summary available.'}</p>
            </div>

            {showMaintainerrDetails ? (
              <div
                className={`mt-4 grid gap-4 ${shouldShowExcludedDetails && shouldShowManualDetails ? 'grid-cols-2' : ''}`}
              >
                {shouldShowExcludedDetails ? (
                  <div
                    className={`min-h-[5.75rem] rounded-xl p-3 ${maintainerrStatusCardStyles.cardClassName}`}
                  >
                    <p
                      className={`text-sm font-semibold ${maintainerrStatusCardStyles.titleClassName}`}
                    >
                      Excluded From
                    </p>
                    <div className="mt-2">
                      {maintainerrDetailsLoading
                        ? renderMaintainerrStatusItems(
                            [],
                            'Loading exclusion details...',
                            maintainerrStatusCardStyles.contentClassName,
                            maintainerrStatusCardStyles.emptyClassName,
                            maintainerrStatusCardStyles.linkClassName,
                          )
                        : renderMaintainerrStatusItems(
                            excludedFromEntries,
                            'Not excluded from any collection.',
                            maintainerrStatusCardStyles.contentClassName,
                            maintainerrStatusCardStyles.emptyClassName,
                            maintainerrStatusCardStyles.linkClassName,
                          )}
                    </div>
                  </div>
                ) : null}
                {shouldShowManualDetails ? (
                  <div
                    className={`min-h-[5.75rem] rounded-xl p-3 ${maintainerrStatusCardStyles.cardClassName}`}
                  >
                    <p
                      className={`text-sm font-semibold ${maintainerrStatusCardStyles.titleClassName}`}
                    >
                      Manually Added To
                    </p>
                    <div className="mt-2">
                      {maintainerrDetailsLoading
                        ? renderMaintainerrStatusItems(
                            [],
                            'Loading manual collection details...',
                            maintainerrStatusCardStyles.contentClassName,
                            maintainerrStatusCardStyles.emptyClassName,
                            maintainerrStatusCardStyles.linkClassName,
                          )
                        : renderMaintainerrStatusItems(
                            manuallyAddedToEntries,
                            'Not manually added to any collection.',
                            maintainerrStatusCardStyles.contentClassName,
                            maintainerrStatusCardStyles.emptyClassName,
                            maintainerrStatusCardStyles.linkClassName,
                          )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : undefined}

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
                {canTriggerRuleAction ? (
                  <TriggerRuleActionBtn
                    collection={collection}
                    mediaServerId={id}
                    onHandled={onCollectionItemRemoved}
                  />
                ) : null}
                <Button buttonType="default" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  },
)

MediaModalContent.displayName = 'MediaModalContent'

export default MediaModalContent
