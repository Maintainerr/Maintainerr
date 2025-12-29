import { EMediaDataType } from './enums';

/**
 * Provider IDs for external databases (IMDB, TMDB, TVDB)
 */
export interface MediaProviderIds {
  imdb?: string;
  tmdb?: string;
  tvdb?: string;
}

/**
 * Media source/file information
 */
export interface MediaSource {
  id: string;
  duration: number;
  bitrate?: number;
  width?: number;
  height?: number;
  aspectRatio?: number;
  audioChannels?: number;
  audioCodec?: string;
  videoCodec?: string;
  videoResolution?: string;
  container?: string;
}

/**
 * Genre information
 */
export interface MediaGenre {
  id?: number | string;
  name: string;
}

/**
 * Actor/role information
 */
export interface MediaActor {
  id?: number | string;
  name: string;
  role?: string;
  thumb?: string;
}

/**
 * Rating information (critic/audience)
 */
export interface MediaRating {
  source: string;
  value: number;
  type?: 'audience' | 'critic';
}

/**
 * Server-agnostic media item representation
 * Maps from PlexLibraryItem, JellyfinMediaItem, etc.
 */
export interface MediaItem {
  /** Unique identifier within the media server */
  id: string;
  /** Parent item ID (for seasons -> show, episodes -> season) */
  parentId?: string;
  /** Grandparent item ID (for episodes -> show) */
  grandparentId?: string;
  /** Display title */
  title: string;
  /** Parent title (e.g., show name for episode) */
  parentTitle?: string;
  /** Grandparent title */
  grandparentTitle?: string;
  /** Internal GUID/identifier */
  guid: string;
  /** Parent GUID */
  parentGuid?: string;
  /** Grandparent GUID */
  grandparentGuid?: string;
  /** Media type */
  type: EMediaDataType;
  /** When the item was added to the library */
  addedAt: Date;
  /** When the item was last updated */
  updatedAt?: Date;
  /** External provider IDs */
  providerIds: MediaProviderIds;
  /** Media sources/files */
  mediaSources: MediaSource[];
  /** Library section information */
  library: {
    id: string;
    title: string;
  };
  /** Summary/description */
  summary?: string;
  /** View count */
  viewCount?: number;
  /** Skip count */
  skipCount?: number;
  /** Last viewed timestamp */
  lastViewedAt?: Date;
  /** Release year */
  year?: number;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Original air date */
  originallyAvailableAt?: Date;
  /** Ratings */
  ratings?: MediaRating[];
  /** User rating (0-10) */
  userRating?: number;
  /** Genres */
  genres?: MediaGenre[];
  /** Cast/actors */
  actors?: MediaActor[];
  /** Number of child items (for shows/seasons) */
  childCount?: number;
  /** Number of watched child items */
  watchedChildCount?: number;
  /** Index within parent (episode number, season number) */
  index?: number;
  /** Parent index (season number for episodes) */
  parentIndex?: number;
  /** Collection tags */
  collections?: string[];
  /** Labels/tags */
  labels?: string[];
}

/**
 * Server-agnostic library representation
 */
export interface MediaLibrary {
  /** Unique identifier */
  id: string;
  /** Display name */
  title: string;
  /** Library type (movie/show) */
  type: 'movie' | 'show';
  /** Agent used for metadata */
  agent?: string;
}

/**
 * Server-agnostic user representation
 */
export interface MediaUser {
  /** Unique identifier */
  id: string;
  /** Username/display name */
  name: string;
  /** User thumbnail */
  thumb?: string;
}

/**
 * Watch history record
 */
export interface WatchRecord {
  /** User who watched */
  userId: string;
  /** Item that was watched */
  itemId: string;
  /** When it was watched */
  watchedAt: Date;
  /** Playback progress (0-100) */
  progress?: number;
}

/**
 * Server-agnostic collection representation
 */
export interface MediaCollection {
  /** Unique identifier */
  id: string;
  /** Collection title */
  title: string;
  /** Collection summary */
  summary?: string;
  /** Thumbnail URL */
  thumb?: string;
  /** Number of items in collection */
  childCount: number;
  /** When the collection was added */
  addedAt?: Date;
  /** When the collection was last updated */
  updatedAt?: Date;
  /** Whether this is a smart collection */
  smart?: boolean;
  /** Library ID this collection belongs to */
  libraryId?: string;
}

/**
 * Server-agnostic playlist representation
 */
export interface MediaPlaylist {
  /** Unique identifier */
  id: string;
  /** Playlist title */
  title: string;
  /** Playlist summary */
  summary?: string;
  /** Whether this is a smart playlist */
  smart?: boolean;
  /** Number of items */
  itemCount: number;
  /** Total duration in milliseconds */
  durationMs?: number;
  /** When the playlist was added */
  addedAt?: Date;
  /** When the playlist was last updated */
  updatedAt?: Date;
}

/**
 * Server status information
 */
export interface MediaServerStatus {
  /** Server identifier */
  machineId: string;
  /** Server version */
  version: string;
  /** Server name */
  name?: string;
  /** Operating system */
  platform?: string;
}

/**
 * Options for querying library contents
 */
export interface LibraryQueryOptions {
  /** Filter by media type */
  type?: EMediaDataType;
  /** Pagination offset */
  offset?: number;
  /** Number of items to return */
  limit?: number;
  /** Sort field */
  sort?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Options for getting recently added items
 */
export interface RecentlyAddedOptions {
  /** Number of items to return */
  limit?: number;
  /** Filter by media type */
  type?: EMediaDataType;
}

/**
 * Paginated result wrapper
 */
export interface PagedResult<T> {
  /** Items in this page */
  items: T[];
  /** Total number of items */
  totalSize: number;
  /** Current offset */
  offset: number;
  /** Page size */
  limit: number;
}

/**
 * Parameters for creating a collection
 */
export interface CreateCollectionParams {
  /** Library to create collection in */
  libraryId: string;
  /** Collection title */
  title: string;
  /** Collection summary */
  summary?: string;
  /** Media type for the collection */
  type: EMediaDataType;
  /** Sort title override */
  sortTitle?: string;
}

/**
 * Collection visibility settings (Plex-only)
 */
export interface CollectionVisibilitySettings {
  /** Visible on home screen */
  homeVisibility?: boolean;
  /** Visible in recommendations */
  recommendationsVisibility?: boolean;
}
