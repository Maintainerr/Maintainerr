import {
  type MediaItem,
  type MediaItemWithParent,
  type MediaProviderIds,
} from '@maintainerr/contracts'
import { debounce } from 'lodash-es'
import { useEffect, useEffectEvent } from 'react'
import { DEFAULT_INFINITE_SCROLL_THRESHOLD } from '../../../utils/uiBehavior'
import { ICollectionMedia } from '../../Collection'
import LoadingSpinner, {
  SmallLoadingSpinner,
} from '../../Common/LoadingSpinner'
import MediaCard from '../../Common/MediaCard'

interface IOverviewContent {
  data: MediaItem[]
  dataFinished: boolean
  loading: boolean
  extrasLoading?: boolean
  fetchData: () => void
  onRemove?: (id: string) => void
  libraryId: string
  collectionPage?: boolean
  collectionInfo?: ICollectionMedia[]
  collectionId?: number
}

function extractProviderIds(
  item: MediaItem | MediaItemWithParent,
): MediaProviderIds | undefined {
  const parentItem = (item as MediaItemWithParent).parentItem

  if (
    (item.type === 'season' || item.type === 'episode') &&
    parentItem?.providerIds
  ) {
    return parentItem.providerIds
  }

  if (item.providerIds && Object.keys(item.providerIds).length > 0) {
    return item.providerIds
  }

  if (
    parentItem?.providerIds &&
    Object.keys(parentItem.providerIds).length > 0
  ) {
    return parentItem.providerIds
  }

  return undefined
}

const OverviewContent = (props: IOverviewContent) => {
  const { data, dataFinished, extrasLoading, fetchData, loading } = props

  const isNearBottom = () =>
    window.innerHeight + document.documentElement.scrollTop >=
    document.documentElement.scrollHeight * DEFAULT_INFINITE_SCROLL_THRESHOLD

  const handleScroll = useEffectEvent(() => {
    if (isNearBottom() && !extrasLoading && !dataFinished) {
      fetchData()
    }
  })

  useEffect(() => {
    const debouncedScroll = debounce(handleScroll, 200)
    window.addEventListener('scroll', debouncedScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', debouncedScroll)
      debouncedScroll.cancel() // Cancel pending debounced calls
    }
  }, [])

  useEffect(() => {
    if (isNearBottom() && !loading && !extrasLoading && !dataFinished) {
      fetchData()
    }
  }, [data, dataFinished, extrasLoading, fetchData, loading])

  const getDaysLeft = (mediaId: string) => {
    if (props.collectionInfo) {
      const collectionData = props.collectionInfo.find(
        (colEl) => colEl.mediaServerId === mediaId,
      )
      if (collectionData && collectionData.collection) {
        if (collectionData.collection.deleteAfterDays == null) {
          return undefined
        }

        const date = new Date(collectionData.addDate)
        const today = new Date()

        date.setDate(date.getDate() + collectionData.collection.deleteAfterDays)

        const diffTime = date.getTime() - today.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        return diffDays
      }
    }
    return undefined
  }

  /**
   * Get the parent year from a MediaItem.
   * For episodes/seasons, this is the show's year.
   */
  const getParentYear = (item: MediaItem): number | undefined => {
    const parentItem = (item as MediaItemWithParent).parentItem
    return parentItem?.year
  }

  const hasData = data && data.length > 0
  const showInitialLoading = loading && !hasData
  const showAppendLoading = hasData && Boolean(extrasLoading)

  return (
    <>
      {showInitialLoading ? (
        <div className="min-h-[20rem]">
          <LoadingSpinner />
        </div>
      ) : hasData ? (
        <ul
          className="cards-vertical"
          aria-busy={loading || Boolean(extrasLoading)}
        >
          {data.map((el) => (
            <li key={el.id}>
              <MediaCard
                id={el.id}
                libraryId={props.libraryId}
                type={el.type}
                summary={
                  el.type === 'movie' || el.type === 'show'
                    ? el.summary
                    : el.type === 'season'
                      ? el.title
                      : el.type === 'episode'
                        ? 'Episode ' + el.index + ' - ' + el.title
                        : ''
                }
                year={
                  el.type === 'episode'
                    ? el.parentTitle
                    : getParentYear(el)
                      ? getParentYear(el)?.toString()
                      : el.year?.toString()
                }
                mediaType={el.type}
                title={
                  el.grandparentTitle
                    ? el.grandparentTitle
                    : el.parentTitle
                      ? el.parentTitle
                      : el.title
                }
                exclusionId={
                  el.maintainerrExclusionId
                    ? el.maintainerrExclusionId
                    : undefined
                }
                providerIds={extractProviderIds(el)}
                collectionPage={
                  props.collectionPage ? props.collectionPage : false
                }
                exclusionType={el.maintainerrExclusionType}
                onRemove={props.onRemove}
                collectionId={props.collectionId}
                isManual={
                  el.maintainerrIsManual ? el.maintainerrIsManual : false
                }
                {...(props.collectionInfo
                  ? {
                      daysLeft: getDaysLeft(el.id),
                      collectionId: props.collectionInfo.find(
                        (colEl) => colEl.mediaServerId === el.id,
                      )?.collectionId,
                    }
                  : undefined)}
              />
            </li>
          ))}
          {showAppendLoading ? (
            <li
              className="flex min-h-10 items-center justify-center"
              style={{ overflowAnchor: 'none' }}
            >
              <div role="status" aria-label="Loading more items">
                <SmallLoadingSpinner className="h-10 w-10" />
              </div>
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="flex min-h-[20rem] items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-6 text-sm text-zinc-400">
          No items found.
        </div>
      )}
    </>
  )
}
export default OverviewContent
