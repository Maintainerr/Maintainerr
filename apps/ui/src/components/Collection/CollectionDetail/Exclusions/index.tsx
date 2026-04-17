import { type MediaItem } from '@maintainerr/contracts'
import { useCallback } from 'react'
import { ICollection } from '../..'
import CollectionDetailControlRow from '../CollectionDetailControlRow'
import useInfinitePaginatedList from '../../../../hooks/useInfinitePaginatedList'
import GetApiHandler from '../../../../utils/ApiHandler'
import {
  getCollectionSortConfig,
  MediaLibrarySortControl,
  useMediaLibrarySort,
} from '../../../Common/MediaLibrarySortControl'
import OverviewContent from '../../../Overview/Content'

interface ICollectionExclusions {
  collection: ICollection
  libraryId: string
  canTestMedia: boolean
  onOpenTestMedia: () => void
}

export interface IExclusionMedia {
  id: number
  mediaServerId: string
  ruleGroupId: number
  parent: number
  type: number
  /** Server-agnostic media metadata */
  mediaData?: MediaItem
}

const CollectionExcludions = (props: ICollectionExclusions) => {
  const fetchAmount = 30
  const libraryType = props.collection.type === 'movie' ? 'movie' : 'show'
  const sortConfig = getCollectionSortConfig(libraryType)
  const { sortValue, sortParams, onSortChange } =
    useMediaLibrarySort(sortConfig)

  const mapExclusionItems = useCallback((items: IExclusionMedia[]) => {
    return items.map((item) => {
      if (item.mediaData) {
        item.mediaData.maintainerrExclusionId = item.id
        item.mediaData.maintainerrExclusionType = item.ruleGroupId
          ? 'specific'
          : 'global'
      }

      return item.mediaData ? item.mediaData : ({} as MediaItem)
    })
  }, [])

  const fetchExclusionsPage = useCallback(
    async (page: number, requestSortParams = sortParams) => {
      const query = new URLSearchParams({
        size: `${fetchAmount}`,
        ...(requestSortParams ?? {}),
      })

      return await GetApiHandler<{
        totalSize: number
        items: IExclusionMedia[]
      }>(
        `/collections/exclusions/${props.collection.id}/content/${page}?${query.toString()}`,
      )
    },
    [fetchAmount, props.collection.id, sortParams],
  )

  const fetchPage = useCallback(
    async (page: number) => {
      return await fetchExclusionsPage(page)
    },
    [fetchExclusionsPage],
  )

  const {
    data,
    hasMoreData,
    isLoading,
    isLoadingExtra,
    resetAndLoad,
    updateData,
  } = useInfinitePaginatedList<IExclusionMedia, MediaItem>({
    fetchAmount,
    fetchPage,
    mapPageItems: mapExclusionItems,
  })

  const handleSortChange = (nextSortValue: string) => {
    const nextSortState = onSortChange(nextSortValue)
    if (!nextSortState) {
      return
    }

    resetAndLoad({
      fetchPage: (page) => fetchExclusionsPage(page, nextSortState.sortParams),
    })
  }

  const showRefreshing = isLoading && data.length > 0

  return (
    <div className="w-full">
      <CollectionDetailControlRow
        canTestMedia={props.canTestMedia}
        onOpenTestMedia={props.onOpenTestMedia}
      >
        <MediaLibrarySortControl
          ariaLabel="Sort collection exclusions"
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
        libraryId={props.libraryId}
        collectionPage={true}
        collectionId={props.collection.id}
        extrasLoading={isLoadingExtra && !isLoading && hasMoreData}
        onRemove={(id: string) =>
          updateData((currentData) =>
            currentData.filter((item) => item.id !== id),
          )
        }
      />
    </div>
  )
}

export default CollectionExcludions
