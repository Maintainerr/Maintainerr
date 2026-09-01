import { useLingui } from '@lingui/react/macro'
import {
  MediaServerFeature,
  supportsFeature,
  type MediaItem,
} from '@maintainerr/contracts'
import { useCallback } from 'react'
import { ICollection } from '../..'
import useInfinitePaginatedList from '../../../../hooks/useInfinitePaginatedList'
import useMediaSelection from '../../../../hooks/useMediaSelection'
import { useMediaServerType } from '../../../../hooks/useMediaServerType'
import GetApiHandler from '../../../../utils/ApiHandler'
import { reportBulkOutcome } from '../../../../utils/bulkOutcome'
import { invalidateMaintainerrStatusDetails } from '../../../Common/MediaCard/maintainerrStatus'
import MediaSelectionActions from '../../../Common/MediaSelectionActions'
import type { MediaActionOutcome } from '../../../Common/MediaActionModal'
import {
  getCollectionSortConfig,
  MediaLibrarySortControl,
  useMediaLibrarySort,
} from '../../../Common/MediaLibrarySortControl'
import PageControlRow from '../../../Common/PageControlRow'
import OverviewContent from '../../../Overview/Content'

interface ICollectionExclusions {
  collection: ICollection
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
  const { t } = useLingui()
  const fetchAmount = 30
  const { mediaServerType } = useMediaServerType()
  const {
    selectionMode,
    selectedIds,
    toggleSelection,
    toggleSelectionMode,
    applyBulkOutcome,
    resetSelection,
  } = useMediaSelection()
  const libraryType = props.collection.type === 'movie' ? 'movie' : 'show'
  const sortConfig = getCollectionSortConfig(
    libraryType,
    undefined,
    supportsFeature(mediaServerType, MediaServerFeature.LIBRARY_STUDIO_SORT),
  )
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

    // A selection made against the previous item set must never survive into
    // the next one - same contract as the Overview sync.
    resetSelection()
    resetAndLoad({
      fetchPage: (page) => fetchExclusionsPage(page, nextSortState.sortParams),
    })
  }

  const handleBulkOutcome = (outcome: MediaActionOutcome) => {
    const { action, collectionId, succeededIds, failedIds } = outcome
    applyBulkOutcome(new Set(failedIds))

    for (const mediaServerId of succeededIds) {
      invalidateMaintainerrStatusDetails(mediaServerId)
    }

    // This list is the collection's exclusions, so only an un-exclude empties
    // it, and only when it reached this collection: an undefined id means every
    // exclusion the items carry, which includes these.
    if (
      action === 'exclusion-remove' &&
      (collectionId === undefined || collectionId === props.collection.id)
    ) {
      const removedIds = new Set(succeededIds)
      updateData((currentData) =>
        currentData.filter((item) => !removedIds.has(item.id)),
      )
    }

    reportBulkOutcome(outcome)
  }

  const showRefreshing = isLoading && data.length > 0

  return (
    <div className="w-full">
      <PageControlRow
        sticky
        actionsClassName="justify-center sm:justify-start"
        actions={
          <MediaSelectionActions
            selectionMode={selectionMode}
            onToggleSelectionMode={toggleSelectionMode}
            selectedIds={selectedIds}
            items={data}
            libraryId={props.collection.libraryId}
            defaultCollectionId={props.collection.id}
            onSubmitted={handleBulkOutcome}
          />
        }
        controls={
          <MediaLibrarySortControl
            ariaLabel={t`Sort collection exclusions`}
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
        collectionPage={true}
        collectionId={props.collection.id}
        extrasLoading={isLoadingExtra && !isLoading && hasMoreData}
        selectionMode={selectionMode}
        selectedMediaIds={selectedIds}
        onToggleSelection={toggleSelection}
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
