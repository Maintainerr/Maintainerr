import { type MediaItem, type MediaItemType } from '@maintainerr/contracts'

export interface ICollection {
  id?: number
  mediaServerId?: string
  libraryId: string
  title: string
  description?: string
  isActive: boolean
  visibleOnRecommended?: boolean
  visibleOnHome?: boolean
  deleteAfterDays?: number
  listExclusions?: boolean
  forceOverseerr?: boolean
  type: MediaItemType
  arrAction: number
  media: ICollectionMedia[]
  manualCollection: boolean
  manualCollectionName: string
  addDate: Date
  handledMediaAmount: number
  lastDurationInSeconds: number
  keepLogsForMonths: number
  tautulliWatchedPercentOverride?: number
  radarrSettingsId?: number
  sonarrSettingsId?: number
  sortTitle?: string
  totalSizeBytes?: number | null
}

export interface ICollectionMedia {
  id: number
  collectionId: number
  mediaServerId: string
  tmdbId: number
  tvdbid: number
  addDate: Date
  image_path: string
  isManual: boolean
  collection: ICollection
  /** Server-agnostic media metadata */
  mediaData?: MediaItem
}
