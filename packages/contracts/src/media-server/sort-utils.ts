import {
  collectionMediaSortFields,
  type CollectionMediaSortField,
  type MediaLibrarySortField,
  type MediaLibrarySortKey,
  type MediaServerCollectionSort,
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

  // Preserve the incoming order for ties so status sorts only partition items.
  return (leftValue - rightValue) * direction
}

export const compareMediaItemsBySort = (
  leftItem: MediaItem,
  rightItem: MediaItem,
  sort?: CollectionMediaSortField,
  sortOrder: MediaSortOrder = 'asc',
): number => {
  const direction = sortOrder === 'desc' ? -1 : 1

  // Numeric/date sorts fall back to the existing 'title.asc' branch when the
  // primary returns 0, so within-group ordering is stable A→Z regardless of
  // direction. Status sorts (manual/excluded) intentionally skip the
  // tiebreaker — see compareMaintainerrState above.
  switch (sort) {
    case 'title':
      return leftItem.title.localeCompare(rightItem.title) * direction
    case 'airDate':
      return (
        (getComparableAirDate(leftItem) - getComparableAirDate(rightItem)) *
          direction ||
        compareMediaItemsBySort(leftItem, rightItem, 'title', 'asc')
      )
    case 'rating':
      return (
        (getAudienceRating(leftItem) - getAudienceRating(rightItem)) *
          direction ||
        compareMediaItemsBySort(leftItem, rightItem, 'title', 'asc')
      )
    case 'watchCount':
      return (
        (getWatchCount(leftItem) - getWatchCount(rightItem)) * direction ||
        compareMediaItemsBySort(leftItem, rightItem, 'title', 'asc')
      )
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
    case 'deleteSoonest':
      // deleteSoonest is equivalent to addDate sorting because
      // deleteAfterDays is constant per collection.
      return (
        (new Date(leftItem.addedAt).getTime() -
          new Date(rightItem.addedAt).getTime()) *
          direction ||
        compareMediaItemsBySort(leftItem, rightItem, 'title', 'asc')
      )
    default:
      return 0
  }
}

export const parseCollectionSortKey = (
  key: string,
):
  | {
      key: MediaServerCollectionSort
      sort: CollectionMediaSortField
      order: MediaSortOrder
    }
  | undefined => {
  const [sort, order] = key.split('.') as [string, string | undefined]
  if (
    !(collectionMediaSortFields as readonly string[]).includes(sort) ||
    (order !== 'asc' && order !== 'desc')
  ) {
    return undefined
  }
  return {
    key: key as MediaServerCollectionSort,
    sort: sort as CollectionMediaSortField,
    order,
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
