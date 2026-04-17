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

export interface StorageMediaServerLibrary {
  id: string
  title: string
  type: 'movie' | 'show'
  itemCount: number
  sizeBytes: number | null
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
}

export interface StorageLibrarySizesResponse {
  generatedAt: string
  sizeBytesByLibrary: Record<string, number>
}
