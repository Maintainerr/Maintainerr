import {
  ChartBarIcon,
  CheckCircleIcon,
  CollectionIcon,
  DesktopComputerIcon,
  ExclamationCircleIcon,
  FilmIcon,
  FolderIcon,
  PlayIcon,
  ServerIcon,
} from '@heroicons/react/solid'
import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import type {
  StorageDiskspaceEntry,
  StorageInstanceStatus,
  StorageLibrarySizesResponse,
  StorageMediaServerInfo,
  StorageMetricsResponse,
  StorageTopCollection,
} from '@maintainerr/contracts'
import { useEffect, useMemo, useState } from 'react'
import { getApiErrorMessage } from '../../utils/ApiError'
import GetApiHandler from '../../utils/ApiHandler'
import { formatBytes, formatPercent } from '../../utils/formatBytes'
import { mediaTypeLabel } from '../../utils/mediaTypeUtils'
import BrandLink from '../Common/BrandLink'
import Button from '../Common/Button'
import LoadingSpinner, { SmallLoadingSpinner } from '../Common/LoadingSpinner'
import Modal from '../Common/Modal'
import StorageUsageBar from './StorageUsageBar'

interface SummaryCardProps {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
}

// Shared builders so each counted phrase extracts to a single message with a
// named argument. A `<Plural value={obj.field}>` would emit a bare {0} and a
// separate message per call site.
const collectionCountLabel = (collectionCount: number) =>
  plural(collectionCount, { one: '# collection', other: '# collections' })

const itemCountLabel = (itemCount: number) =>
  plural(itemCount, { one: '# item', other: '# items' })

const mountCountLabel = (mountCount: number) =>
  plural(mountCount, { one: '# mount', other: '# mounts' })

const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  subtitle,
  icon,
}) => (
  <div
    role="region"
    aria-label={title}
    className="transparent-glass-bg flex flex-col rounded-lg border border-zinc-700 p-4 shadow-sm"
  >
    <div className="flex items-center text-sm font-medium tracking-wide text-zinc-400 uppercase">
      <span className="mr-2 text-maintainerr-500">{icon}</span>
      {title}
    </div>
    <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    {subtitle ? (
      <div className="mt-1 text-xs text-zinc-400">{subtitle}</div>
    ) : null}
  </div>
)

const pillBadgeClasses = 'border border-zinc-600 bg-zinc-600 text-zinc-200'

const groupMountsByInstance = (mounts: StorageDiskspaceEntry[]) => {
  const map = new Map<string, StorageDiskspaceEntry[]>()
  for (const mount of mounts) {
    const key = `${mount.instanceType}-${mount.instanceId}`
    const existing = map.get(key) ?? []
    existing.push(mount)
    map.set(key, existing)
  }
  return map
}

const StorageMetrics: React.FC = () => {
  const { t, i18n } = useLingui()
  const [metrics, setMetrics] = useState<StorageMetricsResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  // A flag, not a message: translating inside the effect would put `t` in its
  // dependency array and re-fetch the metrics every time the language changed.
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        setIsLoading(true)
        setLoadFailed(false)
        const response =
          await GetApiHandler<StorageMetricsResponse>('/storage-metrics')
        if (active) {
          setMetrics(response)
        }
      } catch {
        if (active) {
          setLoadFailed(true)
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const mountsByInstance = useMemo(
    () => (metrics ? groupMountsByInstance(metrics.mounts) : new Map()),
    [metrics],
  )

  if (isLoading && !metrics) {
    return (
      <>
        <title>{t`Storage Metrics - Maintainerr`}</title>
        <div className="min-h-80">
          <LoadingSpinner />
        </div>
      </>
    )
  }

  if (loadFailed || !metrics) {
    return (
      <>
        <title>{t`Storage Metrics - Maintainerr`}</title>
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-md border border-error-500/60 bg-error-500/10 p-4 text-error-100"
        >
          <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0 text-error-300" />
          <p className="text-sm">
            {loadFailed
              ? t`Unable to load storage metrics. Check that Maintainerr can reach your Radarr and Sonarr instances.`
              : t`Storage metrics are unavailable.`}
          </p>
        </div>
      </>
    )
  }

  const hasInstances = metrics.instances.length > 0
  const hasAnyMounts = metrics.mounts.length > 0
  const hasCollectionData = metrics.collectionSummary.totalCollectionCount > 0
  const { totals, cleanupTotals } = metrics
  const hasCleanupActivity = cleanupTotals.itemsHandled > 0
  const hasAnyTotal = totals.totalSpace > 0
  const hasAnyFree = totals.freeSpace > 0 || totals.mountCount > 0
  const mountCount = totals.mountCount
  // The app locale, not the browser's: the sentence around this date
  // switches language with the picker, so the date format follows it too.
  const generatedAt = new Date(metrics.generatedAt).toLocaleString(i18n.locale)
  const noTotalSubtitle = hasAnyFree
    ? t`Free space only - Sonarr/Radarr do not report total size for NFS/CIFS mounts`
    : t`No instance reports total capacity`

  return (
    <>
      <title>{t`Storage Metrics - Maintainerr`}</title>
      <div className="w-full px-0 pb-8">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-white">
            <Trans>Storage Metrics</Trans>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            <Trans>
              Disk usage across your Radarr and Sonarr instances, plus how much
              space Maintainerr can reclaim from collections with a delete rule.
              Items appearing in multiple collections are counted once.
            </Trans>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title={t`Total capacity`}
            value={hasAnyTotal ? formatBytes(totals.totalSpace) : '-'}
            subtitle={
              !hasAnyTotal
                ? noTotalSubtitle
                : totals.accurateTotalSpace
                  ? mountCountLabel(totals.mountCount)
                  : t`${{ accurateMountCount: totals.accurateMountCount }} of ${{ mountCount: totals.mountCount }} mounts report total capacity`
            }
            icon={<ServerIcon className="h-5 w-5" />}
          />
          <SummaryCard
            title={t`Used`}
            value={hasAnyTotal ? formatBytes(totals.usedSpace) : '-'}
            subtitle={
              hasAnyTotal
                ? formatPercent(totals.usedSpace, totals.totalSpace)
                : t`Requires total-space reporting`
            }
            icon={<ChartBarIcon className="h-5 w-5" />}
          />
          <SummaryCard
            title={t`Free`}
            value={formatBytes(totals.freeSpace)}
            subtitle={plural(mountCount, {
              one: 'Aggregated across # mount',
              other: 'Aggregated across # mounts',
            })}
            icon={<ChartBarIcon className="h-5 w-5" />}
          />
          <SummaryCard
            title={t`Reclaimable from collections`}
            value={formatBytes(metrics.collectionSummary.activeSizeBytes)}
            subtitle={
              metrics.collectionSummary.reclaimableUsingFallback
                ? t`${{ sizedCount: metrics.collectionSummary.reclaimableSizedCount }} of ${{ reclaimableCount: metrics.collectionSummary.reclaimableCount }} reclaimable collections sized - duplicates not yet deduplicated, refreshes after next collection run`
                : t`${{ sizedCount: metrics.collectionSummary.reclaimableSizedCount }} of ${{ reclaimableCount: metrics.collectionSummary.reclaimableCount }} reclaimable collections sized - duplicates counted once`
            }
            icon={<CollectionIcon className="h-5 w-5" />}
          />
        </div>

        <section className="mt-8">
          <h2 className="sm-heading">
            <Trans>Cleanup totals</Trans>
          </h2>
          <p className="description">
            <Trans>
              Cumulative count of media items Maintainerr has handled across all
              collections, with the on-disk space reclaimed by delete-style
              actions. Unmonitor and quality-change actions do not contribute to
              bytes reclaimed.
            </Trans>
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard
              title={t`Items handled`}
              value={cleanupTotals.itemsHandled.toLocaleString(i18n.locale)}
              subtitle={
                hasCleanupActivity
                  ? t`${{ size: formatBytes(cleanupTotals.bytesHandled) }} reclaimed total`
                  : t`No items processed yet`
              }
              icon={<CheckCircleIcon className="h-5 w-5" />}
            />
            <SummaryCard
              title={t`Movies handled`}
              value={cleanupTotals.moviesHandled.toLocaleString(i18n.locale)}
              subtitle={t`${{ size: formatBytes(cleanupTotals.movieBytesHandled) }} reclaimed`}
              icon={<FilmIcon className="h-5 w-5" />}
            />
            <SummaryCard
              title={t`Shows handled`}
              value={cleanupTotals.showsHandled.toLocaleString(i18n.locale)}
              subtitle={t`${{ size: formatBytes(cleanupTotals.showBytesHandled) }} reclaimed`}
              icon={<DesktopComputerIcon className="h-5 w-5" />}
            />
            <SummaryCard
              title={t`Seasons handled`}
              value={cleanupTotals.seasonsHandled.toLocaleString(i18n.locale)}
              subtitle={t`${{ size: formatBytes(cleanupTotals.seasonBytesHandled) }} reclaimed`}
              icon={<CollectionIcon className="h-5 w-5" />}
            />
            <SummaryCard
              title={t`Episodes handled`}
              value={cleanupTotals.episodesHandled.toLocaleString(i18n.locale)}
              subtitle={t`${{ size: formatBytes(cleanupTotals.episodeBytesHandled) }} reclaimed`}
              icon={<PlayIcon className="h-5 w-5" />}
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="sm-heading">
            <Trans>Potential reclaim by type</Trans>
          </h2>
          <p className="description">
            {metrics.collectionSummary.reclaimableUsingFallback ? (
              <Trans>
                Based on cached collection totals while per-item sizes are still
                backfilling. Duplicates across collections are resolved after
                the next collection size refresh.
              </Trans>
            ) : (
              <Trans>
                Based on cached collection sizes, deduplicated across
                collections. Run collection processing jobs to refresh size
                data.
              </Trans>
            )}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="transparent-glass-bg rounded-lg border border-zinc-700 p-4">
              <div className="flex items-center justify-between text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <FilmIcon className="h-5 w-5 text-maintainerr-500" />
                  <Trans>Movies</Trans>
                </span>
                <span className="text-zinc-400">
                  {collectionCountLabel(
                    metrics.collectionSummary.reclaimableMovieCount,
                  )}
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatBytes(metrics.collectionSummary.movieSizeBytes)}
              </div>
            </div>
            <div className="transparent-glass-bg rounded-lg border border-zinc-700 p-4">
              <div className="flex items-center justify-between text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <DesktopComputerIcon className="h-5 w-5 text-maintainerrdark-500" />
                  <Trans>Shows</Trans>
                </span>
                <span className="text-zinc-400">
                  {collectionCountLabel(
                    metrics.collectionSummary.reclaimableShowCount,
                  )}
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatBytes(metrics.collectionSummary.showSizeBytes)}
              </div>
            </div>
            <div className="transparent-glass-bg rounded-lg border border-zinc-700 p-4">
              <div className="flex items-center justify-between text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <CollectionIcon className="h-5 w-5 text-maintainerr-500" />
                  <Trans>Seasons</Trans>
                </span>
                <span className="text-zinc-400">
                  {collectionCountLabel(
                    metrics.collectionSummary.reclaimableSeasonCount,
                  )}
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatBytes(metrics.collectionSummary.seasonSizeBytes)}
              </div>
            </div>
            <div className="transparent-glass-bg rounded-lg border border-zinc-700 p-4">
              <div className="flex items-center justify-between text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <PlayIcon className="h-5 w-5 text-maintainerrdark-500" />
                  <Trans>Episodes</Trans>
                </span>
                <span className="text-zinc-400">
                  {collectionCountLabel(
                    metrics.collectionSummary.reclaimableEpisodeCount,
                  )}
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatBytes(metrics.collectionSummary.episodeSizeBytes)}
              </div>
            </div>
          </div>
        </section>

        <MediaServerSection
          mediaServer={metrics.mediaServer}
          onLibrarySizesComputed={(sizeBytesByLibrary) =>
            setMetrics((current) =>
              current
                ? {
                    ...current,
                    mediaServer: {
                      ...current.mediaServer,
                      libraries: current.mediaServer.libraries.map((lib) => ({
                        ...lib,
                        sizeBytes: sizeBytesByLibrary[lib.id] ?? lib.sizeBytes,
                      })),
                    },
                  }
                : current,
            )
          }
        />

        <section className="mt-8">
          <h2 className="sm-heading">
            <Trans>Mounts by instance</Trans>
          </h2>
          <p className="description">
            <Trans>
              Disk space reported by each configured Radarr or Sonarr instance.
              Headline totals count only root-folder-backed mounts and merge
              shared filesystems per host.
            </Trans>
          </p>

          {!hasInstances ? (
            <p className="mt-3 text-sm text-zinc-400">
              <Trans>
                No Radarr or Sonarr instances are configured yet. Add one in
                Settings to see disk usage here.
              </Trans>
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-4">
            {metrics.instances.map((instance) => {
              const mounts =
                (mountsByInstance.get(`${instance.type}-${instance.id}`) as
                  StorageDiskspaceEntry[] | undefined) ?? []

              return (
                <InstanceCard
                  key={`${instance.type}-${instance.id}`}
                  instance={instance}
                  mounts={mounts}
                />
              )
            })}
          </div>

          {hasInstances && !hasAnyMounts ? (
            <p className="mt-3 text-sm text-zinc-400">
              <Trans>
                No mount data returned. Check that each instance has a root
                folder configured.
              </Trans>
            </p>
          ) : null}
        </section>

        <section className="mt-8">
          <h2 className="sm-heading">
            <Trans>Largest collections</Trans>
          </h2>
          <p className="description">
            <Trans>Top ten collections by cached total file size.</Trans>
          </p>

          {!hasCollectionData ? (
            <p className="mt-3 text-sm text-zinc-400">
              <Trans>
                No collections yet. Create a rule to build your first
                collection.
              </Trans>
            </p>
          ) : metrics.topCollections.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">
              <Trans>
                Collection sizes have not been computed yet. They are calculated
                as part of the regular collection processing job.
              </Trans>
            </p>
          ) : (
            <TopCollectionsTable collections={metrics.topCollections} />
          )}
        </section>

        <p className="mt-8 text-xs text-zinc-500">
          <Trans>Generated at {generatedAt}</Trans>
        </p>
      </div>
    </>
  )
}

interface MediaServerSectionProps {
  mediaServer: StorageMediaServerInfo
  onLibrarySizesComputed: (sizeBytesByLibrary: Record<string, number>) => void
}

const mediaServerLabel: Record<string, string> = {
  plex: 'Plex',
  jellyfin: 'Jellyfin',
}

const MediaServerSection: React.FC<MediaServerSectionProps> = ({
  mediaServer,
  onLibrarySizesComputed,
}) => {
  const { t, i18n } = useLingui()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isComputing, setIsComputing] = useState(false)
  const [computeError, setComputeError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setIsConfirmOpen(false)
    setIsComputing(true)
    setComputeError(null)
    try {
      const response = await GetApiHandler<StorageLibrarySizesResponse>(
        '/storage-metrics/library-sizes',
      )
      onLibrarySizesComputed(response.sizeBytesByLibrary)
    } catch (error) {
      setComputeError(
        getApiErrorMessage(
          error,
          t`Failed to compute library sizes. Check that Maintainerr can reach your media server.`,
        ),
      )
    } finally {
      setIsComputing(false)
    }
  }

  const closeConfirm = () => {
    setIsConfirmOpen(false)
  }

  if (!mediaServer.configured) {
    return (
      <section className="mt-8">
        <h2 className="sm-heading">
          <Trans>Media server</Trans>
        </h2>
        <p className="description">
          <Trans>
            Connect a Plex or Jellyfin server in Settings to see library item
            counts here.
          </Trans>
        </p>
      </section>
    )
  }

  const typeLabel = mediaServer.serverType
    ? (mediaServerLabel[mediaServer.serverType] ?? mediaServer.serverType)
    : t`Media server`

  const header = mediaServer.serverName ?? typeLabel

  return (
    <section className="mt-8">
      <h2 className="sm-heading">
        <Trans>Media server</Trans>
      </h2>
      <p className="description">
        <Trans>
          Libraries reported by {typeLabel}. Counts reflect what Maintainerr
          sees through the server API.
        </Trans>
      </p>

      <div className="transparent-glass-bg mt-3 rounded-lg border border-zinc-700 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold ${pillBadgeClasses}`}
            >
              {typeLabel}
            </span>
            <span className="text-base font-medium text-white">{header}</span>
          </div>
          <div className="flex items-center gap-3">
            {mediaServer.reachable && mediaServer.libraries.length > 0 ? (
              <Button
                buttonType="success"
                buttonSize="sm"
                onClick={() => setIsConfirmOpen(true)}
                disabled={isComputing}
              >
                {isComputing ? (
                  <SmallLoadingSpinner className="mr-2 h-4 w-4" />
                ) : null}
                <Trans>Compute library sizes</Trans>
              </Button>
            ) : null}
            <span className="text-xs text-zinc-400">
              {mediaServer.reachable ? (
                itemCountLabel(mediaServer.totalItemCount)
              ) : (
                <Trans>Unavailable</Trans>
              )}
            </span>
          </div>
        </div>

        {mediaServer.reachable && mediaServer.libraries.length > 0 ? (
          <p className="mt-2 text-xs text-zinc-500">
            <Trans>
              Sizes approximate on-disk bytes and may not fully reflect
              hardlinks, sparse files, or filesystem snapshots.
            </Trans>
          </p>
        ) : null}

        {!mediaServer.reachable ? (
          <p className="mt-2 text-sm text-error-200">
            {mediaServer.error ??
              t`Media server is not reachable. Check your Settings.`}
          </p>
        ) : mediaServer.libraries.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">
            <Trans>
              No libraries reported. Add libraries in your media server, then
              refresh.
            </Trans>
          </p>
        ) : (
          <>
            {computeError ? (
              <p className="mt-2 text-sm text-error-200">{computeError}</p>
            ) : null}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mediaServer.libraries.map((library) => (
                <div
                  key={library.id}
                  className="rounded-sm border border-zinc-800 bg-zinc-900/40 p-3"
                >
                  <div className="flex items-center gap-2 text-sm text-zinc-200">
                    {library.type === 'movie' ? (
                      <FilmIcon className="h-4 w-4 text-maintainerr-500" />
                    ) : (
                      <DesktopComputerIcon className="h-4 w-4 text-maintainerrdark-500" />
                    )}
                    <span className="truncate" title={library.title}>
                      {library.title}
                    </span>
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {library.itemCount.toLocaleString(i18n.locale)}
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="capitalize">
                      {library.type === 'movie' ? (
                        <Trans>Movies</Trans>
                      ) : (
                        <Trans>Shows</Trans>
                      )}
                    </span>
                    {library.sizeBytes != null ? (
                      <span
                        title={t`Size on disk reported by the media server`}
                      >
                        {formatBytes(library.sizeBytes)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {isConfirmOpen ? (
        <Modal
          title={t`Compute library sizes`}
          size="md"
          onCancel={closeConfirm}
          cancelText={t`Cancel`}
          footerActions={
            <Button
              buttonType="primary"
              onClick={() => {
                void handleConfirm()
              }}
            >
              <Trans>Run scan</Trans>
            </Button>
          }
        >
          <p>
            <Trans>
              Maintainerr will iterate every movie and episode in your{' '}
              {typeLabel} libraries to estimate size on disk. This can take a
              while on large libraries.
            </Trans>
          </p>
          <p className="mt-3 text-sm text-zinc-300">
            <Trans>
              Sizes approximate on-disk bytes and may not fully reflect
              hardlinks, sparse files, or filesystem snapshots.
            </Trans>
          </p>
        </Modal>
      ) : null}
    </section>
  )
}

interface InstanceCardProps {
  instance: StorageInstanceStatus
  mounts: StorageDiskspaceEntry[]
}

const InstanceCard: React.FC<InstanceCardProps> = ({ instance, mounts }) => {
  const { t } = useLingui()

  return (
    <div className="transparent-glass-bg rounded-lg border border-zinc-700 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold ${pillBadgeClasses}`}
          >
            {instance.type === 'radarr' ? 'Radarr' : 'Sonarr'}
          </span>
          <span className="text-base font-medium text-white">
            {instance.name}
          </span>
        </div>
        <span className="text-xs text-zinc-400">
          {instance.ok ? (
            mountCountLabel(instance.mountCount)
          ) : (
            <Trans>Unavailable</Trans>
          )}
        </span>
      </div>

      {!instance.ok ? (
        <p className="mt-2 text-sm text-error-200">
          {instance.error ?? t`Unknown error fetching disk space.`}
        </p>
      ) : mounts.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">
          <Trans>No mounts reported for this instance.</Trans>
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {mounts.map((mount, idx) => {
            const used = Math.max(mount.totalSpace - mount.freeSpace, 0)
            return (
              <div
                key={`${instance.type}-${instance.id}-${mount.path ?? idx}`}
                className="rounded-sm border border-zinc-800 bg-zinc-900/40 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-mono text-zinc-100">
                    <FolderIcon className="h-4 w-4 text-info-400" />
                    {mount.path ?? t`Unknown path`}
                  </span>
                  {mount.label ? (
                    <span className="text-xs text-zinc-400">{mount.label}</span>
                  ) : null}
                </div>
                <div className="mt-2">
                  <StorageUsageBar
                    used={used}
                    total={mount.totalSpace}
                    free={mount.freeSpace}
                    accurateTotalSpace={mount.hasAccurateTotalSpace}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface TopCollectionsTableProps {
  collections: StorageTopCollection[]
}

const TopCollectionsTable: React.FC<TopCollectionsTableProps> = ({
  collections,
}) => {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-700">
      <table className="min-w-full divide-y divide-zinc-700 text-sm">
        <thead className="bg-zinc-800/60 text-left text-xs tracking-wide text-zinc-400 uppercase">
          <tr>
            <th scope="col" className="px-3 py-2">
              <Trans>Collection</Trans>
            </th>
            <th scope="col" className="px-3 py-2">
              <Trans>Type</Trans>
            </th>
            <th scope="col" className="px-3 py-2">
              <Trans>Items</Trans>
            </th>
            <th scope="col" className="px-3 py-2">
              <Trans>Size</Trans>
            </th>
            <th scope="col" className="px-3 py-2">
              <Trans>Status</Trans>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800 text-zinc-200">
          {collections.map((collection) => (
            <tr key={collection.id}>
              <td className="px-3 py-2">
                <BrandLink to={`/collections/${collection.id}`}>
                  {collection.title}
                </BrandLink>
              </td>
              <td className="px-3 py-2 text-zinc-300 capitalize">
                {mediaTypeLabel(collection.type)}
              </td>
              <td className="px-3 py-2 text-zinc-300">
                {collection.mediaCount}
              </td>
              <td className="px-3 py-2 font-medium text-white">
                {formatBytes(collection.totalSizeBytes)}
              </td>
              <td className="px-3 py-2">
                {collection.isActive ? (
                  <span className="text-success-500">
                    <Trans>Active</Trans>
                  </span>
                ) : (
                  <span className="text-error-500">
                    <Trans>Inactive</Trans>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default StorageMetrics
