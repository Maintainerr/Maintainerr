import {
  MediaCollection,
  MediaItem,
  MediaLibrary,
  MediaServerStatus,
  MediaUser,
  PagedResult,
  WatchRecord,
} from '@maintainerr/contracts'
import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import GetApiHandler from '../utils/ApiHandler'

export const mediaServerKeys = {
  all: ['media-server'] as const,
  status: () => [...mediaServerKeys.all, 'status'] as const,
  type: () => [...mediaServerKeys.all, 'type'] as const,
  libraries: () => [...mediaServerKeys.all, 'libraries'] as const,
  library: (id: string) => [...mediaServerKeys.all, 'library', id] as const,
  libraryContent: (id: string, page?: number, limit?: number) =>
    [...mediaServerKeys.library(id), 'content', { page, limit }] as const,
  libraryCollections: (id: string) =>
    [...mediaServerKeys.library(id), 'collections'] as const,
  users: () => [...mediaServerKeys.all, 'users'] as const,
  user: (id: string) => [...mediaServerKeys.all, 'user', id] as const,
  metadata: (id: string) => [...mediaServerKeys.all, 'meta', id] as const,
  metadataChildren: (id: string) =>
    [...mediaServerKeys.metadata(id), 'children'] as const,
  watchHistory: (id: string) =>
    [...mediaServerKeys.metadata(id), 'seen'] as const,
  collection: (id: string) =>
    [...mediaServerKeys.all, 'collection', id] as const,
  collectionChildren: (id: string) =>
    [...mediaServerKeys.collection(id), 'children'] as const,
  search: (query: string) => [...mediaServerKeys.all, 'search', query] as const,
}

type UseMediaServerLibrariesQueryKey = ReturnType<
  typeof mediaServerKeys.libraries
>
type UseMediaServerLibrariesOptions = Omit<
  UseQueryOptions<
    MediaLibrary[],
    Error,
    MediaLibrary[],
    UseMediaServerLibrariesQueryKey
  >,
  'queryKey' | 'queryFn'
>

/**
 * Hook to fetch libraries from the configured media server.
 * Works with both Plex and Jellyfin.
 */
export const useMediaServerLibraries = (
  options?: UseMediaServerLibrariesOptions,
) => {
  return useQuery<
    MediaLibrary[],
    Error,
    MediaLibrary[],
    UseMediaServerLibrariesQueryKey
  >({
    queryKey: mediaServerKeys.libraries(),
    queryFn: async () => {
      return await GetApiHandler<MediaLibrary[]>('/media-server/libraries')
    },
    staleTime: 0,
    ...options,
  })
}

type UseMediaServerStatusQueryKey = ReturnType<typeof mediaServerKeys.status>
type UseMediaServerStatusOptions = Omit<
  UseQueryOptions<
    MediaServerStatus | null,
    Error,
    MediaServerStatus | null,
    UseMediaServerStatusQueryKey
  >,
  'queryKey' | 'queryFn'
>

/**
 * Hook to fetch media server status.
 */
export const useMediaServerStatus = (options?: UseMediaServerStatusOptions) => {
  return useQuery<
    MediaServerStatus | null,
    Error,
    MediaServerStatus | null,
    UseMediaServerStatusQueryKey
  >({
    queryKey: mediaServerKeys.status(),
    queryFn: async () => {
      const result = await GetApiHandler<MediaServerStatus | undefined>(
        '/media-server',
      )
      return result ?? null
    },
    staleTime: 30000, // 30 seconds
    ...options,
  })
}

// NOTE: useMediaServerType hook is located in hooks/useMediaServerType.ts
// It provides isPlex/isJellyfin booleans from settings

type UseMediaServerUsersQueryKey = ReturnType<typeof mediaServerKeys.users>
type UseMediaServerUsersOptions = Omit<
  UseQueryOptions<MediaUser[], Error, MediaUser[], UseMediaServerUsersQueryKey>,
  'queryKey' | 'queryFn'
>

/**
 * Hook to fetch users from the configured media server.
 */
export const useMediaServerUsers = (options?: UseMediaServerUsersOptions) => {
  return useQuery<MediaUser[], Error, MediaUser[], UseMediaServerUsersQueryKey>(
    {
      queryKey: mediaServerKeys.users(),
      queryFn: async () => {
        return await GetApiHandler<MediaUser[]>('/media-server/users')
      },
      staleTime: 60000, // 1 minute
      ...options,
    },
  )
}

type UseMediaServerCollectionsQueryKey = ReturnType<
  typeof mediaServerKeys.libraryCollections
>
type UseMediaServerCollectionsOptions = Omit<
  UseQueryOptions<
    MediaCollection[],
    Error,
    MediaCollection[],
    UseMediaServerCollectionsQueryKey
  >,
  'queryKey' | 'queryFn'
>

/**
 * Hook to fetch collections from a library.
 */
export const useMediaServerCollections = (
  libraryId: string,
  options?: UseMediaServerCollectionsOptions,
) => {
  return useQuery<
    MediaCollection[],
    Error,
    MediaCollection[],
    UseMediaServerCollectionsQueryKey
  >({
    queryKey: mediaServerKeys.libraryCollections(libraryId),
    queryFn: async () => {
      return await GetApiHandler<MediaCollection[]>(
        `/media-server/library/${libraryId}/collections`,
      )
    },
    staleTime: 30000, // 30 seconds
    enabled: !!libraryId,
    ...options,
  })
}

type UseMediaServerMetadataQueryKey = ReturnType<
  typeof mediaServerKeys.metadata
>
type UseMediaServerMetadataOptions = Omit<
  UseQueryOptions<
    MediaItem | null,
    Error,
    MediaItem | null,
    UseMediaServerMetadataQueryKey
  >,
  'queryKey' | 'queryFn'
>

/**
 * Hook to fetch metadata for a specific item.
 */
export const useMediaServerMetadata = (
  itemId: string,
  options?: UseMediaServerMetadataOptions,
) => {
  return useQuery<
    MediaItem | null,
    Error,
    MediaItem | null,
    UseMediaServerMetadataQueryKey
  >({
    queryKey: mediaServerKeys.metadata(itemId),
    queryFn: async () => {
      const result = await GetApiHandler<MediaItem | undefined>(
        `/media-server/meta/${itemId}`,
      )
      return result ?? null
    },
    staleTime: 60000, // 1 minute
    enabled: !!itemId,
    ...options,
  })
}

type UseMediaServerSearchQueryKey = ReturnType<typeof mediaServerKeys.search>
type UseMediaServerSearchOptions = Omit<
  UseQueryOptions<
    MediaItem[],
    Error,
    MediaItem[],
    UseMediaServerSearchQueryKey
  >,
  'queryKey' | 'queryFn'
>

/**
 * Hook to search media server content.
 */
export const useMediaServerSearch = (
  query: string,
  options?: UseMediaServerSearchOptions,
) => {
  return useQuery<
    MediaItem[],
    Error,
    MediaItem[],
    UseMediaServerSearchQueryKey
  >({
    queryKey: mediaServerKeys.search(query),
    queryFn: async () => {
      return await GetApiHandler<MediaItem[]>(
        `/media-server/search/${encodeURIComponent(query)}`,
      )
    },
    staleTime: 30000, // 30 seconds
    enabled: !!query && query.length > 0,
    ...options,
  })
}

// Re-export types for convenience
export type UseMediaServerLibrariesResult = ReturnType<
  typeof useMediaServerLibraries
>
export type UseMediaServerStatusResult = ReturnType<typeof useMediaServerStatus>
export type UseMediaServerUsersResult = ReturnType<typeof useMediaServerUsers>
export type UseMediaServerCollectionsResult = ReturnType<
  typeof useMediaServerCollections
>
export type UseMediaServerMetadataResult = ReturnType<
  typeof useMediaServerMetadata
>
export type UseMediaServerSearchResult = ReturnType<typeof useMediaServerSearch>
