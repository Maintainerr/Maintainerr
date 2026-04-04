import {
  type CollectionMediaSortField,
  type MediaLibrarySortField,
  type MediaLibrarySortKey,
  type MediaSortOrder,
} from './sorting'
import type { MediaItem } from './types'

const defaultMediaLibrarySort: MediaLibrarySortKey = 'title.asc'

export const getAudienceRating = (item: MediaItem): number => {
  return item.ratings?.find((rating) => rating.type === 'audience')?.value ?? 0
}

const getComparableAirDate = (item: MediaItem): number => {
  return item.originallyAvailableAt
    ? new Date(item.originallyAvailableAt).getTime()
    : 0
}

const getWatchCount = (item: MediaItem): number => {
  return item.viewCount ?? 0
}

const compareMaintainerrState = (
  leftItem: MediaItem,
  rightItem: MediaItem,
  sortOrder: MediaSortOrder,
  getValue: (item: MediaItem) => boolean,
): number => {
  const leftValue = getValue(leftItem) ? 1 : 0
  const rightValue = getValue(rightItem) ? 1 : 0
  const direction = sortOrder === 'desc' ? -1 : 1

  return (
    (leftValue - rightValue) * direction ||
    leftItem.title.localeCompare(rightItem.title)
  )
}

export const compareMediaItemsBySort = (
  leftItem: MediaItem,
  rightItem: MediaItem,
  sort?: CollectionMediaSortField,
  sortOrder: MediaSortOrder = 'asc',
): number => {
  const direction = sortOrder === 'desc' ? -1 : 1

  switch (sort) {
    case 'title':
      return leftItem.title.localeCompare(rightItem.title) * direction
    case 'airDate':
      return (
        (getComparableAirDate(leftItem) - getComparableAirDate(rightItem)) *
        direction
      )
    case 'rating':
      return (
        (getAudienceRating(leftItem) - getAudienceRating(rightItem)) * direction
      )
    case 'watchCount':
      return (getWatchCount(leftItem) - getWatchCount(rightItem)) * direction
    case 'manual':
      return compareMaintainerrState(
        leftItem,
        rightItem,
        sortOrder,
        (item) => item.maintainerrIsManual === true,
      )
    case 'excluded':
      return compareMaintainerrState(
        leftItem,
        rightItem,
        sortOrder,
        (item) => item.maintainerrExclusionId != null,
      )
    default:
      return 0
  }
}

export const compareMediaItemsBySortKey = (
  leftItem: MediaItem,
  rightItem: MediaItem,
  sortKey: MediaLibrarySortKey = defaultMediaLibrarySort,
): number => {
  const [sort, sortOrder] = sortKey.split('.') as [
    MediaLibrarySortField,
    MediaSortOrder,
  ]

  return compareMediaItemsBySort(leftItem, rightItem, sort, sortOrder)
}
