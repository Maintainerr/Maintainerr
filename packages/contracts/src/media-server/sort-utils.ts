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

const toDayBucket = (
  value: Date | string | number | null | undefined,
): number | undefined => {
  if (value == null) return undefined
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 86400000)
}

export const getAudienceRating = (item: MediaItem): number | undefined => {
  return item.ratings?.find((rating) => rating.type === 'audience')?.value
}

const getAirDateBucket = (item: MediaItem): number | undefined =>
  toDayBucket(item.originallyAvailableAt)

const getWatchCount = (item: MediaItem): number | undefined => item.viewCount

export interface CompareMediaItemsOptions {
  /**
   * Override the timestamp used for the `deleteSoonest` sort. Collection
   * callers pass `collection_media.addDate` (when Maintainerr started the
   * deletion timer) so ordering reflects the user-visible "Leaving in X
   * days" overlay rather than `MediaItem.addedAt` (when the file was added
   * to the underlying media-server library).
   */
  deleteSoonestDate?: (item: MediaItem) => Date | string | undefined | null
  /**
   * Anchor for `daysLeft` bucketing — pass `now - deleteAfterDays * dayMs`.
   * When set, items with the same overlay countdown tie even if they
   * straddle UTC midnight (e.g. addedAt 23:00 vs. 01:00 the next day with
   * the same "Leaves in 3 days" label). When omitted, items bucket by UTC
   * calendar day, which is acceptable for callers without a per-collection
   * `deleteAfterDays` (e.g. defensive paths in the comparator spec).
   */
  deleteSoonestReferenceTime?: Date | number
}

const toReferenceMs = (
  value: CompareMediaItemsOptions['deleteSoonestReferenceTime'],
): number | undefined => {
  if (value == null) return undefined
  return value instanceof Date ? value.getTime() : value
}

const getDeleteSoonestDayBucket = (
  item: MediaItem,
  options: CompareMediaItemsOptions | undefined,
): number | undefined => {
  const value = options?.deleteSoonestDate?.(item) ?? item.addedAt
  const referenceMs = toReferenceMs(options?.deleteSoonestReferenceTime)
  if (referenceMs === undefined) {
    // No collection context — bucket by UTC midnight.
    return toDayBucket(value)
  }
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (Number.isNaN(ms)) return undefined
  // daysLeft = ceil((addDate + N*day - now) / dayMs) = ceil((addDate - R) / dayMs).
  // Two items tie iff they share the same daysLeft window, which keeps the
  // sort aligned with the visible countdown across UTC midnight.
  return Math.ceil((ms - referenceMs) / 86400000)
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

// Numeric sort with two invariants: (1) items missing the value sort to the
// end regardless of direction — sorting "oldest air date first" must not put
// an item with no air date ahead of one from 1995; and (2) within-group ties
// fall back to the show-aware title order so the listing stays stable A→Z.
const compareNumericWithTitleFallback = (
  leftItem: MediaItem,
  rightItem: MediaItem,
  getValue: (item: MediaItem) => number | undefined,
  direction: 1 | -1,
): number => {
  const leftValue = getValue(leftItem)
  const rightValue = getValue(rightItem)
  if (leftValue === undefined && rightValue === undefined) {
    return compareByDisplayHierarchy(leftItem, rightItem)
  }
  if (leftValue === undefined) return 1
  if (rightValue === undefined) return -1
  return (
    (leftValue - rightValue) * direction ||
    compareByDisplayHierarchy(leftItem, rightItem)
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
  const direction: 1 | -1 = sortOrder === 'desc' ? -1 : 1

  switch (sort) {
    case 'title':
      // Show-aware so episodes/seasons group under their show. The
      // direction multiplier still applies, so 'desc' reverses both tiers.
      return compareByDisplayHierarchy(leftItem, rightItem) * direction
    case 'airDate':
      return compareNumericWithTitleFallback(
        leftItem,
        rightItem,
        getAirDateBucket,
        direction,
      )
    case 'rating':
      return compareNumericWithTitleFallback(
        leftItem,
        rightItem,
        getAudienceRating,
        direction,
      )
    case 'watchCount':
      return compareNumericWithTitleFallback(
        leftItem,
        rightItem,
        getWatchCount,
        direction,
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
      return compareNumericWithTitleFallback(
        leftItem,
        rightItem,
        (item) => getDeleteSoonestDayBucket(item, options),
        direction,
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
