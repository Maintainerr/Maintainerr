import {
  ChartBarIcon,
  CollectionIcon,
  DesktopComputerIcon,
  ExclamationCircleIcon,
  FilmIcon,
  FolderIcon,
  ServerIcon,
} from '@heroicons/react/solid'
import type {
  StorageDiskspaceEntry,
  StorageInstanceStatus,
  StorageLibrarySizesResponse,
  StorageMediaServerInfo,
  StorageMetricsResponse,
  StorageTopCollection,
} from '@maintainerr/contracts'
import { useEffect, useMemo, useState } from 'react'
import GetApiHandler from '../../utils/ApiHandler'
import { formatBytes, formatPercent } from '../../utils/formatBytes'
import Button from '../Common/Button'
import LoadingSpinner from '../Common/LoadingSpinner'
import Modal from '../Common/Modal'
import StorageUsageBar from './StorageUsageBar'

interface SummaryCardProps {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  subtitle,
  icon,
}) => (
  <div className="transparent-glass-bg flex flex-col rounded-lg border border-zinc-700 p-4 shadow">
    <div className="flex items-center text-sm font-medium uppercase tracking-wide text-zinc-400">
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
  const [metrics, setMetrics] = useState<StorageMetricsResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        setIsLoading(true)
        setErrorMessage(null)
        const response =
          await GetApiHandler<StorageMetricsResponse>('/storage-metrics')
        if (active) {
          setMetrics(response)
        }
      } catch {
        if (active) {
          setErrorMessage(
            'Unable to load storage metrics. Check that Maintainerr can reach your Radarr and Sonarr instances.',
          )
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
        <title>Storage Metrics - Maintainerr</title>
        <div className="min-h-[20rem]">
          <LoadingSpinner />
        </div>
      </>
    )
  }

  if (errorMessage || !metrics) {
    return (
      <>
        <title>Storage Metrics - Maintainerr</title>
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-md border border-error-500/60 bg-error-500/10 p-4 text-error-100"
        >
          <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0 text-error-300" />
          <p className="text-sm">
            {errorMessage ?? 'Storage metrics are unavailable.'}
          </p>
        </div>
      </>
    )
  }

  const hasInstances = metrics.instances.length > 0
  const hasAnyMounts = metrics.mounts.length > 0
  const hasCollectionData = metrics.collectionSummary.totalCollectionCount > 0
  const { totals } = metrics
  const hasAnyTotal = totals.totalSpace > 0
  const mountLabel = (count: number) =>
    `${count} mount${count === 1 ? '' : 's'}`

  return (
    <>
      <title>Storage Metrics - Maintainerr</title>
      <div className="w-full px-0 pb-8">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-white">Storage Metrics</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Disk usage across your Radarr and Sonarr instances, plus how much
            space Maintainerr can reclaim from active collections.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Total capacity"
            value={hasAnyTotal ? formatBytes(totals.totalSpace) : '—'}
            subtitle={
              !hasAnyTotal
                ? 'No instance reports total capacity'
                : totals.accurateTotalSpace
                  ? mountLabel(totals.mountCount)
                  : `${totals.accurateMountCount} of ${totals.mountCount} mounts report total capacity`
            }
            icon={<ServerIcon className="h-5 w-5" />}
          />
          <SummaryCard
            title="Used"
            value={hasAnyTotal ? formatBytes(totals.usedSpace) : '—'}
            subtitle={
              hasAnyTotal
                ? formatPercent(totals.usedSpace, totals.totalSpace)
                : 'Requires total-space reporting'
            }
            icon={<ChartBarIcon className="h-5 w-5" />}
          />
          <SummaryCard
            title="Free"
            value={formatBytes(totals.freeSpace)}
            subtitle={`Aggregated across ${mountLabel(totals.accurateMountCount)}`}
            icon={<ChartBarIcon className="h-5 w-5" />}
          />
          <SummaryCard
            title="Reclaimable from collections"
            value={formatBytes(metrics.collectionSummary.activeSizeBytes)}
            subtitle={`${metrics.collectionSummary.activeSizedCount} of ${metrics.collectionSummary.activeCount} active collections sized`}
            icon={<CollectionIcon className="h-5 w-5" />}
          />
        </div>

        <section className="mt-8">
          <h2 className="sm-heading">Potential reclaim by type</h2>
          <p className="description">
            Based on cached collection sizes. Run collection processing jobs to
            refresh size data.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="transparent-glass-bg rounded-lg border border-zinc-700 p-4">
              <div className="flex items-center justify-between text-sm text-zinc-300">
                <span className="flex items-center gap-2">
                  <FilmIcon className="h-5 w-5 text-maintainerr-500" />
                  Movies
                </span>
                <span className="text-zinc-400">
                  {metrics.collectionSummary.movieCollectionCount} collection
                  {metrics.collectionSummary.movieCollectionCount === 1
                    ? ''
                    : 's'}
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
                  Shows
                </span>
                <span className="text-zinc-400">
                  {metrics.collectionSummary.showCollectionCount} collection
                  {metrics.collectionSummary.showCollectionCount === 1
                    ? ''
                    : 's'}
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {formatBytes(metrics.collectionSummary.showSizeBytes)}
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
          <h2 className="sm-heading">Mounts by instance</h2>
          <p className="description">
            Disk space reported by each configured Radarr or Sonarr instance.
            Mounts are deduplicated by host + path for the totals above.
          </p>

          {!hasInstances ? (
            <p className="mt-3 text-sm text-zinc-400">
              No Radarr or Sonarr instances are configured yet. Add one in
              Settings to see disk usage here.
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-4">
            {metrics.instances.map((instance) => {
              const mounts =
                (mountsByInstance.get(`${instance.type}-${instance.id}`) as
                  | StorageDiskspaceEntry[]
                  | undefined) ?? []

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
              No mount data returned. Check that each instance has a root folder
              configured.
            </p>
          ) : null}
        </section>

        <section className="mt-8">
          <h2 className="sm-heading">Largest collections</h2>
          <p className="description">
            Top ten collections by cached total file size.
          </p>

          {!hasCollectionData ? (
            <p className="mt-3 text-sm text-zinc-400">
              No collections yet. Create a rule to build your first collection.
            </p>
          ) : metrics.topCollections.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">
              Collection sizes have not been computed yet. They are calculated
              as part of the regular collection processing job.
            </p>
          ) : (
            <TopCollectionsTable collections={metrics.topCollections} />
          )}
        </section>

        <p className="mt-8 text-xs text-zinc-500">
          Generated at {new Date(metrics.generatedAt).toLocaleString()}
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
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isComputing, setIsComputing] = useState(false)
  const [computeError, setComputeError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setIsComputing(true)
    setComputeError(null)
    try {
      const response = await GetApiHandler<StorageLibrarySizesResponse>(
        '/storage-metrics/library-sizes',
      )
      onLibrarySizesComputed(response.sizeBytesByLibrary)
      setIsConfirmOpen(false)
    } catch {
      setComputeError(
        'Failed to compute library sizes. Check that Maintainerr can reach your media server.',
      )
    } finally {
      setIsComputing(false)
    }
  }

  const closeConfirm = () => {
    if (isComputing) return
    setIsConfirmOpen(false)
    setComputeError(null)
  }

  if (!mediaServer.configured) {
    return (
      <section className="mt-8">
        <h2 className="sm-heading">Media server</h2>
        <p className="description">
          Connect a Plex or Jellyfin server in Settings to see library item
          counts here.
        </p>
      </section>
    )
  }

  const typeLabel = mediaServer.serverType
    ? (mediaServerLabel[mediaServer.serverType] ?? mediaServer.serverType)
    : 'Media server'

  const header = mediaServer.serverName ?? typeLabel

  return (
    <section className="mt-8">
      <h2 className="sm-heading">Media server</h2>
      <p className="description">
        Libraries reported by {typeLabel}. Counts reflect what Maintainerr sees
        through the server API. Use Compute library sizes for an accurate
        per-library total — it can take a while.
      </p>

      <div className="transparent-glass-bg mt-3 rounded-lg border border-zinc-700 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${pillBadgeClasses}`}
            >
              {typeLabel}
            </span>
            <span className="text-base font-medium text-white">{header}</span>
          </div>
          <div className="flex items-center gap-3">
            {mediaServer.reachable && mediaServer.libraries.length > 0 ? (
              <Button
                buttonType="default"
                buttonSize="sm"
                onClick={() => setIsConfirmOpen(true)}
              >
                Compute library sizes
              </Button>
            ) : null}
            <span className="text-xs text-zinc-400">
              {mediaServer.reachable
                ? `${mediaServer.totalItemCount.toLocaleString()} items`
                : 'Unavailable'}
            </span>
          </div>
        </div>

        {!mediaServer.reachable ? (
          <p className="mt-2 text-sm text-error-200">
            {mediaServer.error ??
              'Media server is not reachable. Check your Settings.'}
          </p>
        ) : mediaServer.libraries.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">
            No libraries reported. Add libraries in your media server, then
            refresh.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mediaServer.libraries.map((library) => (
              <div
                key={library.id}
                className="rounded border border-zinc-800 bg-zinc-900/40 p-3"
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
                  {library.itemCount.toLocaleString()}
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="capitalize">
                    {library.type === 'movie' ? 'Movies' : 'Shows'}
                  </span>
                  {library.sizeBytes != null ? (
                    <span title="Size on disk reported by the media server">
                      {formatBytes(library.sizeBytes)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isConfirmOpen ? (
        <Modal
          title="Compute library sizes"
          size="md"
          backgroundClickable={!isComputing}
          onCancel={closeConfirm}
          cancelText="Cancel"
          loading={isComputing}
          footerActions={
            <Button
              buttonType="primary"
              onClick={() => {
                void handleConfirm()
              }}
              disabled={isComputing}
            >
              Run scan
            </Button>
          }
        >
          <div className="space-y-3">
            <p>
              Maintainerr will iterate every movie and episode in your{' '}
              {typeLabel} libraries to compute an accurate size on disk. This
              can take a while on large libraries.
            </p>
            {computeError ? (
              <p className="text-sm text-error-200">{computeError}</p>
            ) : null}
          </div>
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
  return (
    <div className="transparent-glass-bg rounded-lg border border-zinc-700 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${pillBadgeClasses}`}
          >
            {instance.type === 'radarr' ? 'Radarr' : 'Sonarr'}
          </span>
          <span className="text-base font-medium text-white">
            {instance.name}
          </span>
        </div>
        <span className="text-xs text-zinc-400">
          {instance.ok
            ? `${instance.mountCount} mount${instance.mountCount === 1 ? '' : 's'}`
            : 'Unavailable'}
        </span>
      </div>

      {!instance.ok ? (
        <p className="mt-2 text-sm text-error-200">
          {instance.error ?? 'Unknown error fetching disk space.'}
        </p>
      ) : mounts.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">
          No mounts reported for this instance.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {mounts.map((mount, idx) => {
            const used = Math.max(mount.totalSpace - mount.freeSpace, 0)
            return (
              <div
                key={`${instance.type}-${instance.id}-${mount.path ?? idx}`}
                className="rounded border border-zinc-800 bg-zinc-900/40 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-mono text-zinc-100">
                    <FolderIcon className="h-4 w-4 text-info-400" />
                    {mount.path ?? 'Unknown path'}
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
        <thead className="bg-zinc-800/60 text-left text-xs uppercase tracking-wide text-zinc-400">
          <tr>
            <th scope="col" className="px-3 py-2">
              Collection
            </th>
            <th scope="col" className="px-3 py-2">
              Type
            </th>
            <th scope="col" className="px-3 py-2">
              Items
            </th>
            <th scope="col" className="px-3 py-2">
              Size
            </th>
            <th scope="col" className="px-3 py-2">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800 text-zinc-200">
          {collections.map((collection) => (
            <tr key={collection.id}>
              <td className="px-3 py-2">
                <a
                  className="text-maintainerr-500 hover:text-maintainerrdark-500 hover:underline"
                  href={`/collections/${collection.id}`}
                >
                  {collection.title}
                </a>
              </td>
              <td className="px-3 py-2 capitalize text-zinc-300">
                {collection.type}
              </td>
              <td className="px-3 py-2 text-zinc-300">
                {collection.mediaCount}
              </td>
              <td className="px-3 py-2 font-medium text-white">
                {formatBytes(collection.totalSizeBytes)}
              </td>
              <td className="px-3 py-2">
                {collection.isActive ? (
                  <span className="text-success-500">Active</span>
                ) : (
                  <span className="text-error-500">Inactive</span>
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
