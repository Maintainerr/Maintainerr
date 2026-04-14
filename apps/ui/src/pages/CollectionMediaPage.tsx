import { type MediaItem } from '@maintainerr/contracts'
import { useCallback, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import type { ICollectionMedia } from '../components/Collection'
import CollectionDetailControlRow from '../components/Collection/CollectionDetail/CollectionDetailControlRow'
import {
  getCollectionMediaSortConfig,
  MediaLibrarySortControl,
  useMediaLibrarySort,
} from '../components/Common/MediaLibrarySortControl'
import OverviewContent from '../components/Overview/Content'
import useInfinitePaginatedList from '../hooks/useInfinitePaginatedList'
import type { CollectionDetailOutletContext } from './CollectionDetailPage'
import GetApiHandler from '../utils/ApiHandler'

const CollectionMediaPage = () => {
  const { collection, canTestMedia, openMediaTestModal } =
    useOutletContext<CollectionDetailOutletContext>()
  const { id } = useParams<{ id: string }>()
  const [media, setMedia] = useState<ICollectionMedia[]>([])
  const fetchAmount = 30
  const mediaRef = useRef<ICollectionMedia[]>([])
  const libraryType = collection.type === 'movie' ? 'movie' : 'show'
  const sortConfig = getCollectionMediaSortConfig(
    libraryType,
    collection.deleteAfterDays != null,
  )
  const { sortValue, sortParams, onSortChange } =
    useMediaLibrarySort(sortConfig)

  const appendMediaPage = useCallback((items: ICollectionMedia[]) => {
    const nextMedia = [...mediaRef.current, ...items]
    mediaRef.current = nextMedia
    setMedia(nextMedia)
  }, [])

  const updateMedia = useCallback(
    (updater: (currentMedia: ICollectionMedia[]) => ICollectionMedia[]) => {
      const nextMedia = updater(mediaRef.current)
      mediaRef.current = nextMedia
      setMedia(nextMedia)
    },
    [],
  )

  const resetMedia = useCallback(() => {
    mediaRef.current = []
    setMedia([])
  }, [])

  const mapCollectionMediaItems = useCallback((items: ICollectionMedia[]) => {
    return items.map((item) => {
      if (item.mediaData) {
        item.mediaData.maintainerrIsManual = item.isManual ?? false
      }

      return item.mediaData ? item.mediaData : ({} as MediaItem)
    })
  }, [])

  const fetchCollectionMediaPage = useCallback(
    async (page: number, requestSortParams = sortParams) => {
      const query = new URLSearchParams({
        size: `${fetchAmount}`,
        ...(requestSortParams ?? {}),
      })

      return await GetApiHandler<{
        totalSize: number
        items: ICollectionMedia[]
      }>(`/collections/media/${id}/content/${page}?${query.toString()}`)
    },
    [fetchAmount, id, sortParams],
  )

  const fetchPage = useCallback(
    async (page: number) => {
      return await fetchCollectionMediaPage(page)
    },
    [fetchCollectionMediaPage],
  )

  const {
    data,
    hasMoreData,
    isLoading,
    isLoadingExtra,
    resetAndLoad,
    updateData,
  } = useInfinitePaginatedList<ICollectionMedia, MediaItem>({
    fetchAmount,
    fetchPage,
    mapPageItems: mapCollectionMediaItems,
    onAppendPageItems: appendMediaPage,
    onReset: resetMedia,
  })

  const handleSortChange = (nextSortValue: string) => {
    const nextSortState = onSortChange(nextSortValue)
    if (!nextSortState) {
      return
    }

    resetAndLoad({
      fetchPage: (page) =>
        fetchCollectionMediaPage(page, nextSortState.sortParams),
    })
  }

  const showRefreshing = isLoading && data.length > 0

  return (
    <div className="w-full">
      <CollectionDetailControlRow
        canTestMedia={canTestMedia}
        onOpenTestMedia={openMediaTestModal}
      >
        <MediaLibrarySortControl
          ariaLabel="Sort collection items"
          options={sortConfig.options}
          value={sortValue}
          onSortChange={handleSortChange}
          isLoading={showRefreshing}
        />
      </CollectionDetailControlRow>

      <OverviewContent
        dataFinished={true}
        fetchData={() => {}}
        loading={isLoading}
        data={data}
        libraryId={collection.libraryId}
        collectionPage={true}
        extrasLoading={isLoadingExtra && !isLoading && hasMoreData}
        onRemove={(id: string) => {
          updateData((currentData) =>
            currentData.filter((item) => item.id !== id),
          )
          updateMedia((currentMedia) =>
            currentMedia.filter((item) => item.mediaServerId !== id),
          )
        }}
        collectionInfo={media.map((item) => ({
          ...item,
          collection: {
            ...collection,
            media: [],
          },
        }))}
      />
    </div>
  )
}

export default CollectionMediaPage
