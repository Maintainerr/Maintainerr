import {
  MediaItem,
  ServarrAction,
  type MaintainerrMediaStatusDetails,
  type MaintainerrMediaStatusEntry,
  type MediaItemType,
  type MediaProviderIds,
} from '@maintainerr/contracts'
import { XIcon } from '@heroicons/react/solid'
import React, { memo, useEffect, useMemo, useState } from 'react'
import { useMetadataOverview } from '../../../../api/metadata'
import { useLockBodyScroll } from '../../../../hooks/useLockBodyScroll'
import { useMediaServerType } from '../../../../hooks/useMediaServerType'
import GetApiHandler from '../../../../utils/ApiHandler'
import { logClientError } from '../../../../utils/ClientLogger'
import {
  buildMetadataPath,
  buildProviderUrl,
  mediaTypeLabel,
} from '../../../../utils/mediaTypeUtils'
import { modalCloseButtonClassName } from '../../Modal'
import LoadingSpinner from '../../LoadingSpinner'
import StreamystatsStatsPanel from './StreamystatsStatsPanel'
import {
  emptyMaintainerrMediaStatusDetails,
  getMaintainerrStatusDetailsKey,
  loadMaintainerrStatusDetails,
  rememberMaintainerrStatusDetails,
} from '../maintainerrStatus'
import type { ICollection } from '../../../Collection'
import PostponeButton from '../../../Collection/CollectionDetail/PostponeButton'
import TriggerRuleButton from '../../../Collection/CollectionDetail/TriggerRuleActionButton'

interface ModalContentProps {
  onClose: () => void
  id: number | string
  summary?: string
  year?: string
  mediaType: MediaItemType
  title: string
  seasonNumber?: number
  episodeNumber?: number
  providerIds?: MediaProviderIds
  exclusionType?: 'global' | 'specific'
  collection?: ICollection
  isManual?: boolean
  forceStatusLoad?: boolean
  onStatusLink?: (targetPath: string) => void
  onCollectionItemRemoved?: () => void
  onCollectionItemPostponed?: (addDate: string) => void
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
    providerIdKey: keyof MediaProviderIds
  }
> = {
  TMDB: {
    logo: `${basePath}/icons_logos/tmdb_logo.svg`,
    alt: 'TMDB Logo',
    providerIdKey: 'tmdb',
  },
  TVDB: {
    logo: `${basePath}/icons_logos/tvdb_logo.svg`,
    alt: 'TheTVDB Logo',
    providerIdKey: 'tvdb',
  },
}

const providerBadgeClassName =
  'flex items-center justify-center rounded-lg bg-zinc-700 p-2 text-xs text-white shadow-lg'

const ProviderIdBadge = ({
  provider,
  providerId,
  mediaType,
}: {
  provider: keyof MediaProviderIds
  providerId: string
  mediaType: MediaItemType
}) => {
  const href = buildProviderUrl(provider, providerId, mediaType)
  const label = `${provider}://${providerId}`

  if (!href) {
    return <span className={providerBadgeClassName}>{label}</span>
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Open on ${provider}`}
      className={`${providerBadgeClassName} underline transition hover:bg-zinc-600`}
      onClick={(event) => event.stopPropagation()}
    >
      {label}
    </a>
  )
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
    seasonNumber,
    episodeNumber,
    providerIds: fallbackProviderIds,
    exclusionType,
    collection,
    isManual = false,
    forceStatusLoad = false,
    onStatusLink,
    onCollectionItemRemoved,
    onCollectionItemPostponed,
  }) => {
    useLockBodyScroll(true)

    const { isPlex, isJellyfin, isEmby } = useMediaServerType()
    const [loading, setLoading] = useState<boolean>(true)
    const [backdropResult, setBackdropResult] =
      useState<BackdropResult>(emptyBackdropResult)
    const [machineId, setMachineId] = useState<string | null>(null)
    const [serverUrl, setServerUrl] = useState<string | null>(null)
    const [tautulliModalUrl, setTautulliModalUrl] = useState<string | null>(
      null,
    )
    const [streamystatsItemUrl, setStreamystatsItemUrl] = useState<
      string | null
    >(null)
    const [metadata, setMetadata] = useState<MediaItem | null>(null)
    const [seerrConfigured, setSeerrConfigured] = useState<boolean>(false)
    // Keyed by the path it was fetched for, like the backdrop below, so a
    // change of item derives an empty list instead of resetting state.
    const [requesterResult, setRequesterResult] = useState<{
      requestKey: string
      users: string[]
    }>()
    const [maintainerrDetailsState, setMaintainerrDetailsState] = useState<{
      key: string
      details: MaintainerrMediaStatusDetails
    } | null>(null)

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
    const maintainerrDetailsLoading =
      !!maintainerrDetailsKey &&
      maintainerrDetailsState?.key !== maintainerrDetailsKey
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
    // Postpone only makes sense when the item is actually on a deletion
    // countdown: the collection has a grace period and an action to run, and the
    // item isn't excluded from it.
    const canPostpone =
      collection != null &&
      collection.deleteAfterDays != null &&
      collection.arrAction !== ServarrAction.DO_NOTHING &&
      exclusionType == null
    const providerIds = useMemo(
      () => mergeProviderIds(metadata?.providerIds, fallbackProviderIds),
      [metadata?.providerIds, fallbackProviderIds],
    )
    // Seerr tracks TV requests per season, so ask for this item's own season or
    // the show's other requesters get credited here too.
    const seerrRequestersPath = useMemo(() => {
      const tmdbId = providerIds?.tmdb?.[0]
      if (!seerrConfigured || !tmdbId) {
        return null
      }

      const season =
        metadata?.type === 'season'
          ? metadata.index
          : metadata?.type === 'episode'
            ? metadata.parentIndex
            : undefined

      const base = `/seerr/requests/${tmdbId}/users`
      return season != null ? `${base}?season=${season}` : base
    }, [seerrConfigured, providerIds, metadata])

    const requestedBy =
      requesterResult?.requestKey === seerrRequestersPath
        ? requesterResult.users
        : []

    const backdropRequestPath = buildMetadataPath(
      'backdrop',
      mediaType,
      providerIds,
      id,
    )
    const isCurrentBackdrop = backdropResult.requestKey === backdropRequestPath
    const resolvedBackdrop = isCurrentBackdrop ? backdropResult.url : null
    const mediaServerSummary = metadata?.summary || summary
    // Media servers rarely fill in a season description, so ask the metadata
    // provider for one instead of leaving the season with no text at all.
    const overviewRequestPath =
      loading || mediaServerSummary
        ? undefined
        : buildMetadataPath('overview', mediaType, providerIds, id)
    const { data: providerOverview, isPending: overviewRequestPending } =
      useMetadataOverview(overviewRequestPath)
    const isOverviewPending = !!overviewRequestPath && overviewRequestPending
    // Nothing rather than a placeholder while a description is still in flight,
    // so the text does not swap out from under the reader.
    const summaryText =
      mediaServerSummary ||
      providerOverview ||
      (loading || isOverviewPending ? '' : 'No summary available.')
    const providerLogo = useMemo(() => {
      if (!isCurrentBackdrop || !backdropResult.provider) return null
      const cfg = metadataProviderLogos[backdropResult.provider]
      if (!cfg) return null
      const linkId =
        backdropResult.providerId?.toString() ??
        providerIds?.[cfg.providerIdKey]?.[0]
      if (!linkId) return null
      const href = buildProviderUrl(cfg.providerIdKey, linkId, mediaType)
      if (!href) return null
      return { ...cfg, href }
    }, [isCurrentBackdrop, backdropResult, providerIds, mediaType])

    useEffect(() => {
      if (!maintainerrDetailsKey) {
        return
      }

      if (maintainerrDetailsState?.key === maintainerrDetailsKey) {
        return
      }

      let active = true

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
          setSeerrConfigured(!!resp?.seerr_url)
        })
        .catch(() => {})
      // Streamystats is Jellyfin-only (Emby is unsupported upstream), so only
      // resolve the item link when Jellyfin is the active media server.
      if (isJellyfin) {
        GetApiHandler<{ url: string; serverId: number | null }>(
          '/streamystats/info',
        )
          .then((info) => {
            if (!active) return
            if (info?.url && info.serverId != null) {
              setStreamystatsItemUrl(
                `${info.url}/servers/${info.serverId}/library/${id}`,
              )
            }
          })
          .catch(() => {})
      }
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
    }, [id, isJellyfin])

    useEffect(() => {
      if (!seerrRequestersPath) {
        return
      }

      let active = true

      GetApiHandler<string[]>(seerrRequestersPath)
        .then((users) => {
          if (!active) return
          setRequesterResult({
            requestKey: seerrRequestersPath,
            users: users ?? [],
          })
        })
        .catch(() => {})

      return () => {
        active = false
      }
    }, [seerrRequestersPath])

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

    const backdropProviderKey =
      isCurrentBackdrop && backdropResult.provider
        ? metadataProviderLogos[backdropResult.provider]?.providerIdKey
        : undefined
    const showBackdropProviderBadge =
      !!backdropProviderKey &&
      backdropResult.providerId != null &&
      !providerIds?.[backdropProviderKey]?.includes(
        String(backdropResult.providerId),
      )

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3"
        onClick={onClose}
        // The close button is a phone affordance and a pointer closes this from
        // the backdrop, so Escape is what a keyboard is left with - same handler
        // the shared Modal carries.
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose()
          }
        }}
      >
        <div
          className="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-zinc-800 shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${modalCloseButtonClassName} sm:hidden`}
          >
            <XIcon className="h-5 w-5" />
          </button>
          {/* Short on a small phone: at h-72 the backdrop took two thirds of
              the sheet and pushed the title and summary below the fold. */}
          <div className="relative h-40 w-full overflow-hidden p-2 sm:h-72 xl:h-96">
            <div
              className="h-full w-full rounded-xl bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: resolvedBackdrop
                  ? `url(${resolvedBackdrop})`
                  : 'linear-gradient(to bottom, #1e293b, #1e293b)',
              }}
            ></div>
            {loading && (
              <div className="absolute top-0 right-0 bottom-0 left-0 bg-black/50">
                <LoadingSpinner
                  className="h-16 w-16"
                  containerClassName="h-full w-full"
                />
              </div>
            )}

            <div className="absolute top-0 left-0 z-10 flex h-full w-full gap-x-4 p-4">
              <div className="flex grow flex-col">
                <div className="max-w-fit grow">
                  <div
                    className={`pointer-events-none flex justify-center rounded-lg p-2 text-xs font-medium text-zinc-200 uppercase ${
                      mediaType === 'movie'
                        ? 'bg-black/70'
                        : mediaType === 'show'
                          ? 'bg-maintainerrdark/70'
                          : mediaType === 'season'
                            ? 'bg-yellow-700/70'
                            : 'bg-rose-900/70'
                    }`}
                  >
                    {mediaTypeLabel(mediaType, { seasonNumber, episodeNumber })}
                  </div>
                  {metadata?.contentRating && (
                    <div className="pointer-events-none mt-1 rounded-lg bg-black/70 p-2 text-xs font-medium text-zinc-200 uppercase">
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
                          className="flex items-center justify-center space-x-1.5 rounded-lg bg-black/70 px-3 py-1 text-white shadow-lg"
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
              {/* The close button only exists on a phone, and takes this
                  corner: the first row keeps its height as a spacer so the
                  logos below stay clear of it, and drops its own logo - that id
                  is a link in the body. Padding the column instead left a blank
                  channel beside every logo. */}
              <div className="flex flex-col items-end">
                <div className="max-w-fit grow">
                  <div className="flex h-8 w-32 justify-end">
                    {providerLogo && (
                      <a
                        href={providerLogo.href}
                        target="_blank"
                        rel="noreferrer"
                        className="hidden h-full w-full sm:block"
                      >
                        <img
                          src={providerLogo.logo}
                          alt={providerLogo.alt}
                          width={128}
                          height={32}
                          className="h-8 w-32 rounded-lg bg-black/70 p-2 shadow-lg"
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
                          className="mt-1 h-8 w-32 rounded-lg bg-black/70 p-1 shadow-lg"
                        />
                      </a>
                    </div>
                  )}
                  {isEmby && serverUrl && (
                    <div>
                      <a
                        href={
                          machineId
                            ? `${serverUrl}/web/index.html#!/item?id=${id}&serverId=${machineId}`
                            : `${serverUrl}/web/index.html#!/item?id=${id}`
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={`${basePath}/icons_logos/emby.png`}
                          alt="Emby Logo"
                          width={128}
                          height={32}
                          className="mt-1 h-8 w-32 rounded-lg bg-black/70 object-contain p-1 shadow-lg"
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
                          className="mt-1 h-8 w-32 rounded-lg bg-black/70 p-1 shadow-lg"
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
                          className="mt-1 h-8 w-32 rounded-lg bg-black/70 p-1.5 shadow-lg"
                        />
                      </a>
                    </div>
                  )}
                  {isJellyfin && streamystatsItemUrl && (
                    <div>
                      <a
                        href={streamystatsItemUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={`${basePath}/icons_logos/streamystats.svg`}
                          alt="Streamystats"
                          width={128}
                          height={32}
                          className="mt-1 h-8 w-32 rounded-lg bg-black/70 object-contain p-1 shadow-lg"
                        />
                      </a>
                    </div>
                  )}
                </div>
                {/* One row of genres on a phone. Wrapped, they ran past the
                    short backdrop and the overflow sliced them in half. The cap
                    is exactly one chip tall, so nothing is left cut. */}
                {metadata?.genres && metadata.genres.length > 0 ? (
                  <div className="pointer-events-none flex max-h-8 flex-wrap-reverse items-end justify-end gap-1 overflow-hidden sm:max-h-none sm:overflow-visible">
                    {metadata.genres.map((genre, index) => (
                      <span
                        key={index}
                        className="flex items-center rounded-lg bg-black/70 p-2 text-xs font-medium text-white shadow-lg"
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
            <div className="flex items-center justify-between border-b border-zinc-700 pb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-100">
                  {title}
                  {year ? ` (${year})` : ''}
                </h2>
              </div>
            </div>

            <div className="mt-2 text-gray-300">
              <p>{summaryText}</p>
            </div>

            {requestedBy.length > 0 ? (
              <div className="mt-2 text-sm text-zinc-400">
                Requested by{' '}
                <span className="text-zinc-200">{requestedBy.join(', ')}</span>
              </div>
            ) : null}

            {isJellyfin && streamystatsItemUrl ? (
              <StreamystatsStatsPanel
                itemId={String(id)}
                itemUrl={streamystatsItemUrl}
              />
            ) : null}

            {showMaintainerrDetails ? (
              <div
                className={`mt-4 grid gap-4 ${shouldShowExcludedDetails && shouldShowManualDetails ? 'grid-cols-2' : ''}`}
              >
                {shouldShowExcludedDetails ? (
                  <div
                    className={`min-h-23 rounded-xl p-3 ${maintainerrStatusCardStyles.cardClassName}`}
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
                    className={`min-h-23 rounded-xl p-3 ${maintainerrStatusCardStyles.cardClassName}`}
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

            {/* Wraps: side by side these actions are wider than a phone, and
                the sheet scrolled sideways to reach the last one. */}
            <div className="mt-6 mr-0.5 flex flex-row flex-wrap items-center justify-between gap-4">
              {providerIds &&
                ['movie', 'show'].includes(mediaType) &&
                (providerIds.tmdb?.length ||
                  providerIds.imdb?.length ||
                  providerIds.tvdb?.length) && (
                  <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-400">
                    {(['tmdb', 'imdb', 'tvdb'] as const).flatMap((provider) =>
                      (providerIds[provider] ?? []).map((id) => (
                        <ProviderIdBadge
                          key={`${provider}-${id}`}
                          provider={provider}
                          providerId={id}
                          mediaType={mediaType}
                        />
                      )),
                    )}
                    {showBackdropProviderBadge && backdropProviderKey && (
                      <ProviderIdBadge
                        key={`${backdropProviderKey}-${backdropResult.providerId}`}
                        provider={backdropProviderKey}
                        providerId={String(backdropResult.providerId)}
                        mediaType={mediaType}
                      />
                    )}
                  </div>
                )}
              <div className="ml-auto flex flex-wrap justify-end gap-3">
                {canPostpone ? (
                  <PostponeButton
                    collection={collection}
                    mediaServerId={id}
                    onPostponed={onCollectionItemPostponed}
                  />
                ) : null}
                {canTriggerRuleAction ? (
                  <TriggerRuleButton
                    collection={collection}
                    mediaServerId={id}
                    onHandled={onCollectionItemRemoved}
                  />
                ) : null}
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
