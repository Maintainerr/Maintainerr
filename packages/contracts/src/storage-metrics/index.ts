import type { MediaItemType } from '../media-server/enums'

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
  accurateTotalSpace: boolean
}

export interface StorageCollectionSummary {
  activeCount: number
  activeSizeBytes: number
  activeSizedCount: number
  inactiveCount: number
  totalCollectionCount: number
  movieSizeBytes: number
  showSizeBytes: number
  movieCollectionCount: number
  showCollectionCount: number
}

export interface StorageTopCollection {
  id: number
  title: string
  type: MediaItemType
  mediaCount: number
  totalSizeBytes: number
  isActive: boolean
}

export interface StorageMetricsResponse {
  generatedAt: string
  totals: StorageTotals
  mounts: StorageDiskspaceEntry[]
  instances: StorageInstanceStatus[]
  collectionSummary: StorageCollectionSummary
  topCollections: StorageTopCollection[]
}
