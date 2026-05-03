import type { MediaItemType } from '../media-server/enums'
import type { MediaServerType } from '../media-server/enums'

export type StorageInstanceType = 'radarr' | 'sonarr'

export interface StorageDiskspaceEntry {
  instanceId: number
  instanceType: StorageInstanceType
  instanceName: string
  path: string | null
  label: string | null
  freeSpace: number
  totalSpace: number
  hasAccurateTotalSpace: boolean
}

export interface StorageInstanceStatus {
  id: number
  name: string
  type: StorageInstanceType
  ok: boolean
  error: string | null
  mountCount: number
}

export interface StorageTotals {
  freeSpace: number
  totalSpace: number
  usedSpace: number
  mountCount: number
  accurateMountCount: number
  accurateTotalSpace: boolean
}

export interface StorageCollectionSummary {
  activeCount: number
  /**
   * Total reclaimable bytes across active collections that have a delete
   * rule (`deleteAfterDays > 0`). Items appearing in multiple collections
   * are counted once, since deleting an item frees its disk space exactly
   * once regardless of how many collections referenced it.
   */
  activeSizeBytes: number
  activeSizedCount: number
  inactiveCount: number
  totalCollectionCount: number
  /** Movie portion of `activeSizeBytes` (deduplicated). */
  movieSizeBytes: number
  /** Show portion of `activeSizeBytes` (deduplicated). */
  showSizeBytes: number
  movieCollectionCount: number
  showCollectionCount: number
  /**
   * True when `activeSizeBytes` was computed from cached per-collection
   * totals because per-item sizes have not been backfilled yet. In this
   * mode duplicates across collections are NOT deduplicated, so the value
   * may overestimate. Flips to false after the first backfill pass
   * populates `CollectionMedia.sizeBytes`.
   */
  reclaimableUsingFallback: boolean
}

export interface StorageTopCollection {
  id: number
  title: string
  type: MediaItemType
  mediaCount: number
  totalSizeBytes: number
  isActive: boolean
}

export interface StorageMediaServerLibrary {
  id: string
  title: string
  type: 'movie' | 'show'
  itemCount: number
  sizeBytes: number | null
}

export interface StorageCleanupTotals {
  itemsHandled: number
  moviesHandled: number
  showsHandled: number
  seasonsHandled: number
  episodesHandled: number
  /**
   * Cumulative bytes reclaimed from disk across all collections. Counts
   * every successful delete-style action where the per-item size was
   * known; unmonitor and quality-change actions do not contribute.
   */
  bytesHandled: number
  movieBytesHandled: number
  showBytesHandled: number
  seasonBytesHandled: number
  episodeBytesHandled: number
}

export interface StorageMediaServerInfo {
  configured: boolean
  serverType: MediaServerType | null
  serverName: string | null
  reachable: boolean
  error: string | null
  libraries: StorageMediaServerLibrary[]
  totalItemCount: number
}

export interface StorageMetricsResponse {
  generatedAt: string
  totals: StorageTotals
  mounts: StorageDiskspaceEntry[]
  instances: StorageInstanceStatus[]
  mediaServer: StorageMediaServerInfo
  collectionSummary: StorageCollectionSummary
  topCollections: StorageTopCollection[]
  cleanupTotals: StorageCleanupTotals
}

export interface StorageLibrarySizesResponse {
  generatedAt: string
  sizeBytesByLibrary: Record<string, number>
}
