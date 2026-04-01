export const mediaLibrarySortFields = [
  'title',
  'airDate',
  'rating',
  'watchCount',
] as const

export type MediaLibrarySortField = (typeof mediaLibrarySortFields)[number]

export const mediaSortOrders = ['asc', 'desc'] as const

export type MediaSortOrder = (typeof mediaSortOrders)[number]

export const collectionMediaSortFields = [
  ...mediaLibrarySortFields,
  'deleteSoonest',
] as const

export type CollectionMediaSortField =
  (typeof collectionMediaSortFields)[number]

export type MediaLibrarySortKey = `${MediaLibrarySortField}.${MediaSortOrder}`

export interface MediaLibrarySortParams {
  sort: MediaLibrarySortField
  sortOrder: MediaSortOrder
}

export interface CollectionMediaSortParams {
  sort: CollectionMediaSortField
  sortOrder: MediaSortOrder
}
