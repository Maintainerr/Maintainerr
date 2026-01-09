import {
  type MediaItem,
  type MediaItemWithParent,
} from '@maintainerr/contracts'
import { debounce } from 'lodash-es'
import { useEffect } from 'react'
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

/**
 * Extract TMDB ID from a MediaItem.
 * For episodes/seasons, checks parent item's providerIds.
 */
function extractTmdbId(
  item: MediaItem | MediaItemWithParent,
): string | undefined {
  if (item.providerIds?.tmdb?.[0]) {
    return item.providerIds.tmdb[0]
  }

  // For episodes/seasons, check parent item's providerIds
  const parentItem = (item as MediaItemWithParent).parentItem
  if (parentItem?.providerIds?.tmdb?.[0]) {
    return parentItem.providerIds.tmdb[0]
  }

  return undefined
}

const OverviewContent = (props: IOverviewContent) => {
  const handleScroll = () => {
    if (
      window.innerHeight + document.documentElement.scrollTop >=
      document.documentElement.scrollHeight * 0.8
    ) {
      if (!props.extrasLoading && !props.dataFinished) {
        props.fetchData()
      }
    }
  }

  useEffect(() => {
    const debouncedScroll = debounce(handleScroll, 200)
    window.addEventListener('scroll', debouncedScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', debouncedScroll)
      debouncedScroll.cancel() // Cancel pending debounced calls
    }
  }, [])

  useEffect(() => {
    if (
      window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.scrollHeight * 0.8 &&
      !props.loading &&
      !props.extrasLoading &&
      !props.dataFinished
    ) {
      props.fetchData()
    }
  }, [props.data])

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

  /**
   * Get the audience rating from a MediaItem's ratings array.
   */
  const getAudienceRating = (item: MediaItem): number => {
    return item.ratings?.find((r) => r.type === 'audience')?.value ?? 0
  }

  if (props.loading) {
    return <LoadingSpinner />
  }

  if (props.data && props.data.length > 0) {
    return (
      <ul className="cards-vertical">
        {props.data.map((el) => (
          <li key={el.id}>
            <MediaCard
              id={el.id}
              libraryId={props.libraryId}
              type={el.type}
              image={''}
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
              userScore={getAudienceRating(el)}
              exclusionId={
                el.maintainerrExclusionId
                  ? el.maintainerrExclusionId
                  : undefined
              }
              tmdbid={extractTmdbId(el)}
              collectionPage={
                props.collectionPage ? props.collectionPage : false
              }
              exclusionType={el.maintainerrExclusionType}
              onRemove={props.onRemove}
              collectionId={props.collectionId}
              isManual={el.maintainerrIsManual ? el.maintainerrIsManual : false}
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
        {props.extrasLoading ? <SmallLoadingSpinner /> : undefined}
      </ul>
    )
  }
  return <></>
}
export default OverviewContent
