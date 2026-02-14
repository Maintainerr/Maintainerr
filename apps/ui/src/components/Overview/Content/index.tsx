import { debounce } from 'lodash-es'
import { useEffect } from 'react'
import { ICollectionMedia } from '../../Collection'
import LoadingSpinner, {
  SmallLoadingSpinner,
} from '../../Common/LoadingSpinner'
import MediaCard from '../../Common/MediaCard'

interface IOverviewContent {
  data: IPlexMetadata[]
  dataFinished: boolean
  loading: boolean
  extrasLoading?: boolean
  fetchData: () => void
  onRemove?: (id: string) => void
  libraryId: number
  collectionPage?: boolean
  collectionInfo?: ICollectionMedia[]
  collectionId?: number
}

export interface IPlexMetadata {
  ratingKey: string
  key: string
  parentRatingKey?: string
  grandparentRatingKey?: string
  art: string
  audienceRating?: number
  audienceRatingImage?: string
  contentRating?: string
  duration: number
  guid: string
  type: 'movie' | 'show' | 'season' | 'episode'
  title: string
  Guid: {
    id: string
  }[]
  Genre?: {
    id: string
  }[]
  Country?: {
    tag: string
  }[]
  Role?: {
    tag: string
  }[]
  Writer?: {
    tag: string
  }[]
  Director?: {
    tag: string
  }[]
  addedAt: number
  childCount?: number
  leafCount?: number
  viewedLeafCount?: number
  primaryExtraKey: string
  originallyAvailableAt: string
  updatedAt: number
  thumb: string
  tagline?: string
  summary: string
  studio: string
  year: number
  parentTitle?: string
  grandparentTitle?: string
  parentData?: IPlexMetadata
  parentYear?: number
  grandParentYear?: number
  index?: number
  maintainerrExclusionType?: 'specific' | 'global' // this is added by Maintainerr, not a Plex type
  maintainerrExclusionId?: number // this is added by Maintainerr, not a Plex type
  maintainerrIsManual?: boolean // this is added by Maintainerr, not a Plex type
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

  const getDaysLeft = (plexId: number) => {
    if (props.collectionInfo) {
      const collectionData = props.collectionInfo.find(
        (colEl) => colEl.plexId === +plexId,
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

  const getCollectionMediaSize = (plexId: number) => {
    return props.collectionInfo?.find((colEl) => colEl.plexId === +plexId)?.size
  }

  if (props.loading) {
    return <LoadingSpinner />
  }

  if (props.data && props.data.length > 0) {
    return (
      <ul className="cards-vertical">
        {props.data.map((el) => (
          <li key={+el.ratingKey}>
            <MediaCard
              id={+el.ratingKey}
              libraryId={props.libraryId}
              type={
                el.type === 'movie'
                  ? 1
                  : el.type === 'show'
                    ? 2
                    : el.type === 'season'
                      ? 3
                      : 4
              }
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
                  : el.parentYear
                    ? el.parentYear.toString()
                    : el.year?.toString()
              }
              mediaType={
                el.type === 'movie'
                  ? 'movie'
                  : el.type === 'show'
                    ? 'show'
                    : el.type === 'season'
                      ? 'season'
                      : 'episode'
              }
              mediaTypeSubLabel={
                el.type === 'season' && el.index !== undefined
                  ? `${el.index}`
                  : undefined
              }
              title={
                el.grandparentTitle
                  ? el.grandparentTitle
                  : el.parentTitle
                    ? el.parentTitle
                    : el.title
              }
              userScore={el.audienceRating ? el.audienceRating : 0}
              exclusionId={
                el.maintainerrExclusionId
                  ? el.maintainerrExclusionId
                  : undefined
              }
              tmdbid={
                el.parentData
                  ? el.parentData.Guid?.find((e) =>
                      e.id?.includes('tmdb'),
                    )?.id?.split('tmdb://')[1]
                  : el.Guid
                    ? el.Guid.find((e) => e.id?.includes('tmdb'))?.id?.split(
                        'tmdb://',
                      )[1]
                    : undefined
              }
              collectionPage={
                props.collectionPage ? props.collectionPage : false
              }
              exclusionType={el.maintainerrExclusionType}
              onRemove={props.onRemove}
              collectionId={props.collectionId}
              isManual={el.maintainerrIsManual ? el.maintainerrIsManual : false}
              collectionMediaSize={getCollectionMediaSize(+el.ratingKey)}
              {...(props.collectionInfo
                ? {
                    daysLeft: getDaysLeft(+el.ratingKey),
                    collectionId: props.collectionInfo.find(
                      (colEl) => colEl.plexId === +el.ratingKey,
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
