import type {
  CollectionPosterDeleteResponse,
  CollectionPosterUploadResponse,
} from '@maintainerr/contracts'
import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import type { ICollection } from '../components/Collection'
import GetApiHandler, {
  API_BASE_PATH,
  DeleteApiHandler,
  PostApiHandler,
} from '../utils/ApiHandler'

type UseCollectionsQueryKey = ['collections', string]
type UseCollectionQueryKey = ['collections', 'detail', string]

type UseCollectionsOptions = Omit<
  UseQueryOptions<ICollection[], Error, ICollection[], UseCollectionsQueryKey>,
  'queryKey' | 'queryFn'
>

type UseCollectionOptions = Omit<
  UseQueryOptions<ICollection, Error, ICollection, UseCollectionQueryKey>,
  'queryKey' | 'queryFn'
>

export const fetchCollections = async (libraryId?: string) => {
  return await GetApiHandler<ICollection[]>(
    libraryId ? `/collections?libraryId=${libraryId}` : '/collections',
  )
}

export const useCollections = (
  libraryId?: string,
  options?: UseCollectionsOptions,
) => {
  const normalizedLibraryId = libraryId ?? 'all'

  return useQuery<ICollection[], Error, ICollection[], UseCollectionsQueryKey>({
    queryKey: ['collections', normalizedLibraryId],
    queryFn: async () => {
      return await fetchCollections(
        normalizedLibraryId === 'all' ? undefined : normalizedLibraryId,
      )
    },
    staleTime: 0,
    retry: 1,
    ...options,
  })
}

export const fetchCollection = async (collectionId: string | number) => {
  return await GetApiHandler<ICollection>(
    `/collections/collection/${collectionId}`,
  )
}

export const triggerCollectionItemAction = async (
  collectionId: number,
  mediaId: string | number,
) => {
  return await PostApiHandler('/collections/media/handle', {
    collectionId,
    mediaId: String(mediaId),
  })
}

// ── Custom collection poster ───────────────────────────────────────────────

export const buildCollectionPosterUrl = (
  collectionId: number,
  cacheBust?: number,
) => {
  const base = `${API_BASE_PATH}/api/collections/${collectionId}/poster`
  return cacheBust !== undefined ? `${base}?v=${cacheBust}` : base
}

export const uploadCollectionPoster = async (
  collectionId: number,
  file: File,
) => {
  const formData = new FormData()
  formData.append('poster', file)
  return await PostApiHandler<CollectionPosterUploadResponse>(
    `/collections/${collectionId}/poster`,
    formData,
  )
}

export const deleteCollectionPoster = async (collectionId: number) => {
  return await DeleteApiHandler<CollectionPosterDeleteResponse>(
    `/collections/${collectionId}/poster`,
  )
}

export const useCollection = (
  collectionId?: string | number,
  options?: UseCollectionOptions,
) => {
  const normalizedCollectionId =
    collectionId != null ? String(collectionId) : ''
  const queryEnabled =
    normalizedCollectionId.length > 0 && (options?.enabled ?? true)

  return useQuery<ICollection, Error, ICollection, UseCollectionQueryKey>({
    queryKey: ['collections', 'detail', normalizedCollectionId],
    queryFn: async () => {
      if (!normalizedCollectionId) {
        throw new Error('Collection ID is required to fetch collection data.')
      }

      return await fetchCollection(normalizedCollectionId)
    },
    staleTime: 0,
    retry: 1,
    ...options,
    enabled: queryEnabled,
  })
}
