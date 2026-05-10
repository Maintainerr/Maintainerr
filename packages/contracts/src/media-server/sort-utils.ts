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

export interface CompareMediaItemsOptions {
  /**
   * Override the timestamp used for the `deleteSoonest` sort. Collection
   * callers pass `collection_media.addDate` (when Maintainerr started the
   * deletion timer) so ordering reflects the user-visible "Leaving in X
   * days" overlay rather than `MediaItem.addedAt` (when the file was added
   * to the underlying media-server library).
   */
  deleteSoonestDate?: (item: MediaItem) => Date | string | undefined | null
}

const getDeleteSoonestDayBucket = (
  item: MediaItem,
  override: CompareMediaItemsOptions['deleteSoonestDate'],
): number => {
  const value = override?.(item) ?? item.addedAt
  const ms = value ? new Date(value).getTime() : 0
  // Bucket by UTC day so items added in the same rule run tie and reach the
  // title tiebreaker. Items split across the UTC midnight boundary land in
  // adjacent buckets — acceptable because the user-visible "Leaving in X
  // days" label can also flip across that boundary.
  return Math.floor(ms / 86_400_000)
}

// Title comparison that groups episodes and seasons under their show. Movies
// and shows have no parent/grandparent title, so this reduces to a plain
// title compare for those types.
const compareByDisplayHierarchy = (
  leftItem: MediaItem,
  rightItem: MediaItem,
): number => {
  const leftPrimary =
    leftItem.grandparentTitle ?? leftItem.parentTitle ?? leftItem.title
  const rightPrimary =
    rightItem.grandparentTitle ?? rightItem.parentTitle ?? rightItem.title
  return (
    leftPrimary.localeCompare(rightPrimary) ||
    leftItem.title.localeCompare(rightItem.title)
  )
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
  options?: CompareMediaItemsOptions,
): number => {
  const direction = sortOrder === 'desc' ? -1 : 1

  // Numeric/date sorts fall back to the existing 'title.asc' branch when the
  // primary returns 0, so within-group ordering is stable A→Z regardless of
  // direction. Status sorts (manual/excluded) intentionally skip the
  // tiebreaker — see compareMaintainerrState above.
  switch (sort) {
    case 'title':
      // Show-aware so episodes/seasons group under their show. The
      // direction multiplier still applies, so 'desc' reverses both tiers.
      return compareByDisplayHierarchy(leftItem, rightItem) * direction
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
    case 'deleteSoonest': {
      const leftBucket = getDeleteSoonestDayBucket(
        leftItem,
        options?.deleteSoonestDate,
      )
      const rightBucket = getDeleteSoonestDayBucket(
        rightItem,
        options?.deleteSoonestDate,
      )
      return (
        (leftBucket - rightBucket) * direction ||
        compareMediaItemsBySort(leftItem, rightItem, 'title', 'asc')
      )
    }
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
