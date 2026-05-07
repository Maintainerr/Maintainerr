import {
  type MediaItem,
  type MediaItemType,
  type MediaServerCollectionSort,
} from '@maintainerr/contracts'

export interface ICollection {
  id?: number
  mediaServerId?: string
  libraryId: string
  title: string
  description?: string
  isActive: boolean
  visibleOnRecommended?: boolean
  visibleOnHome?: boolean
  overlayEnabled?: boolean
  overlayTemplateId?: number | null
  deleteAfterDays?: number
  listExclusions?: boolean
  forceSeerr?: boolean
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
  radarrQualityProfileId?: number
  sonarrQualityProfileId?: number
  sortTitle?: string
  mediaServerSort?: MediaServerCollectionSort | null
  totalSizeBytes?: number | null
  mediaCount?: number
}

export interface ICollectionMedia {
  id: number
  collectionId: number
  mediaServerId: string
  tmdbId?: number
  tvdbId?: number
  addDate: Date
  image_path?: string
  isManual?: boolean
  collection: ICollection
  /** Server-agnostic media metadata */
  mediaData?: MediaItem
}
