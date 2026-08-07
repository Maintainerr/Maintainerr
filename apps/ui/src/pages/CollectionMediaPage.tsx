import {
  MediaServerFeature,
  supportsFeature,
  type MediaItem,
} from '@maintainerr/contracts'
import { useCallback, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import type { ICollectionMedia } from '../components/Collection'
import MediaSelectionActions from '../components/Common/MediaSelectionActions'
import type { MediaActionOutcome } from '../components/Common/MediaActionModal'
import {
  getCollectionMediaSortConfig,
  MediaLibrarySortControl,
  useMediaLibrarySort,
} from '../components/Common/MediaLibrarySortControl'
import PageControlRow from '../components/Common/PageControlRow'
import OverviewContent from '../components/Overview/Content'
import useInfinitePaginatedList from '../hooks/useInfinitePaginatedList'
import useMediaSelection from '../hooks/useMediaSelection'
import { useMediaServerType } from '../hooks/useMediaServerType'
import { bulkOutcomeVerb, reportBulkOutcome } from '../utils/bulkOutcome'
import type { CollectionDetailOutletContext } from './CollectionDetailPage'
import GetApiHandler from '../utils/ApiHandler'

export const mapCollectionMediaItemsToMediaData = (
  items: ICollectionMedia[],
) => {
  return items.map((item) => {
    if (!item.mediaData) {
      return {} as MediaItem
    }

    return {
      ...item.mediaData,
      maintainerrIsManual: item.isManual ?? false,
    }
  })
}

const CollectionMediaPage = () => {
  const { collection } = useOutletContext<CollectionDetailOutletContext>()
  const { id } = useParams<{ id: string }>()
  const [media, setMedia] = useState<ICollectionMedia[]>([])
  const { mediaServerType } = useMediaServerType()
  const {
    selectionMode,
    selectedIds,
    toggleSelection,
    toggleSelectionMode,
    applyBulkOutcome,
    resetSelection,
  } = useMediaSelection()
  const fetchAmount = 30
  const mediaRef = useRef<ICollectionMedia[]>([])
  const libraryType = collection.type === 'movie' ? 'movie' : 'show'
  const sortConfig = getCollectionMediaSortConfig(
    libraryType,
    collection.deleteAfterDays != null,
    supportsFeature(mediaServerType, MediaServerFeature.LIBRARY_STUDIO_SORT),
    true,
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

  const mapCollectionMediaItems = useCallback(
    (items: ICollectionMedia[]) => mapCollectionMediaItemsToMediaData(items),
    [],
  )

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

    // A selection made against the previous item set must never survive into
    // the next one - same contract as the Overview sync.
    resetSelection()
    resetAndLoad({
      fetchPage: (page) =>
        fetchCollectionMediaPage(page, nextSortState.sortParams),
    })
  }

  const removeMediaItem = (mediaServerId: string) => {
    updateData((currentData) =>
      currentData.filter((item) => item.id !== mediaServerId),
    )
    updateMedia((currentMedia) =>
      currentMedia.filter((item) => item.mediaServerId !== mediaServerId),
    )
  }

  const handleBulkOutcome = ({
    action,
    succeededIds,
    failedIds,
  }: MediaActionOutcome) => {
    applyBulkOutcome(new Set(failedIds))

    // Only these drop the item from this collection.
    if (
      action === 'exclusion-add' ||
      action === 'collection-remove' ||
      action === 'collection-remove-all'
    ) {
      for (const mediaServerId of succeededIds) {
        removeMediaItem(mediaServerId)
      }
    }

    reportBulkOutcome(
      succeededIds.length,
      failedIds.length,
      bulkOutcomeVerb(action),
    )
  }

  const showRefreshing = isLoading && data.length > 0

  return (
    <div className="w-full">
      <PageControlRow
        sticky
        actions={
          <MediaSelectionActions
            selectionMode={selectionMode}
            onToggleSelectionMode={toggleSelectionMode}
            selectedIds={selectedIds}
            items={data}
            libraryId={collection.libraryId}
            lockedCollection={{
              id: collection.id,
              title: collection.title,
              type: collection.type,
            }}
            // Everything here is already in this collection.
            hiddenActions={['collection-add']}
            onSubmitted={handleBulkOutcome}
          />
        }
        controls={
          <MediaLibrarySortControl
            ariaLabel="Sort collection items"
            options={sortConfig.options}
            value={sortValue}
            onSortChange={handleSortChange}
            isLoading={showRefreshing}
          />
        }
      />

      <OverviewContent
        dataFinished={true}
        fetchData={() => {}}
        loading={isLoading}
        data={data}
        collection={collection}
        collectionPage={true}
        extrasLoading={isLoadingExtra && !isLoading && hasMoreData}
        selectionMode={selectionMode}
        selectedMediaIds={selectedIds}
        onToggleSelection={toggleSelection}
        onRemove={removeMediaItem}
        onItemPostponed={(id: string, addDate: string) => {
          // Patch the local addDate so the "days left" badge reflects the new
          // deletion date immediately, without refetching the page.
          updateMedia((currentMedia) =>
            currentMedia.map((item) =>
              item.mediaServerId === id
                ? { ...item, addDate: new Date(addDate) }
                : item,
            ),
          )
        }}
        collectionInfo={media}
      />
    </div>
  )
}

export default CollectionMediaPage
