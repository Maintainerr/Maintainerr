import { MediaItemType } from './enums'

/**
 * Provider IDs for external databases (IMDB, TMDB, TVDB)
 */
export interface MediaProviderIds {
  imdb?: string[]
  tmdb?: string[]
  tvdb?: string[]
}

/**
 * Media source/file information
 */
export interface MediaSource {
  id: string
  duration: number
  bitrate?: number
  width?: number
  height?: number
  aspectRatio?: number
  audioChannels?: number
  audioCodec?: string
  videoCodec?: string
  videoResolution?: string
  container?: string
  sizeBytes?: number
}

/**
 * Genre information
 */
export interface MediaGenre {
  id?: number | string
  name: string
}

/**
 * Actor/role information
 */
export interface MediaActor {
  id?: number | string
  name: string
  role?: string
  thumb?: string
}

/**
 * Rating information (critic/audience)
 */
export interface MediaRating {
  source: string
  value: number
  type?: 'audience' | 'critic'
}

/**
 * Server-agnostic media item representation.
 * Maps from PlexLibraryItem, JellyfinMediaItem, etc.
 */
export interface MediaItem {
  id: string
  parentId?: string
  grandparentId?: string
  title: string
  parentTitle?: string
  grandparentTitle?: string
  guid: string
  parentGuid?: string
  grandparentGuid?: string
  type: MediaItemType
  addedAt: Date
  updatedAt?: Date
  providerIds: MediaProviderIds
  mediaSources: MediaSource[]
  library: {
    id: string
    title: string
  }
  summary?: string
  viewCount?: number
  skipCount?: number
  lastViewedAt?: Date
  year?: number
  durationMs?: number
  originallyAvailableAt?: Date
  contentRating?: string
  ratings?: MediaRating[]
  userRating?: number
  genres?: MediaGenre[]
  actors?: MediaActor[]
  childCount?: number
  watchedChildCount?: number
  index?: number
  parentIndex?: number
  collections?: string[]
  labels?: string[]
  maintainerrExclusionType?: 'specific' | 'global'
  maintainerrExclusionId?: number
  maintainerrIsManual?: boolean
}

/**
 * MediaItem extended with parent metadata.
 * Used when child items need their parent's metadata (e.g., for provider IDs).
 */
export interface MediaItemWithParent extends MediaItem {
  parentItem?: MediaItem
}

/**
 * Server-agnostic library representation
 */
export interface MediaLibrary {
  id: string
  title: string
  type: 'movie' | 'show'
  agent?: string
}

/**
 * Server-agnostic user representation
 */
export interface MediaUser {
  id: string
  name: string
  thumb?: string
}

/**
 * Watch history record
 */
export interface WatchRecord {
  userId: string
  itemId: string
  watchedAt?: Date
  progress?: number
}

/**
 * Server-agnostic collection representation
 */
export interface MediaCollection {
  id: string
  title: string
  summary?: string
  thumb?: string
  childCount: number
  addedAt?: Date
  updatedAt?: Date
  smart?: boolean
  libraryId?: string
}

/**
 * Server-agnostic playlist representation
 */
export interface MediaPlaylist {
  id: string
  title: string
  summary?: string
  smart?: boolean
  itemCount: number
  durationMs?: number
  addedAt?: Date
  updatedAt?: Date
}

/**
 * Server status information
 */
export interface MediaServerStatus {
  machineId: string
  version: string
  name?: string
  platform?: string
  url?: string
}

/**
 * Options for querying library contents
 */
export interface LibraryQueryOptions {
  type?: MediaItemType
  offset?: number
  limit?: number
  sort?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * Options for getting recently added items
 */
export interface RecentlyAddedOptions {
  limit?: number
  type?: MediaItemType
}

/**
 * Paginated result wrapper
 */
export interface PagedResult<T> {
  items: T[]
  totalSize: number
  offset: number
  limit: number
}

/**
 * Parameters for creating a collection
 */
export interface CreateCollectionParams {
  libraryId: string
  title: string
  summary?: string
  type: MediaItemType
  sortTitle?: string
}

/** Plex-only visibility settings */
export interface CollectionVisibilitySettings {
  libraryId: string
  collectionId: string
  ownHome?: boolean
  sharedHome?: boolean
  recommended?: boolean
}

/**
 * Parameters for updating a collection's metadata
 */
export interface UpdateCollectionParams {
  libraryId: string
  collectionId: string
  title?: string
  summary?: string
  sortTitle?: string
}
