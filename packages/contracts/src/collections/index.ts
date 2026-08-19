export * from './leftover-cleanup'
export * from './logs'
export * from './servarr-action'

import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MAX_LABEL } from '../uploads'

export interface CollectionPosterUploadResponse {
  attempted: boolean
  pushed: boolean
}

export interface CollectionPosterDeleteResponse {
  cleared: boolean
  refreshRequested: boolean
}

export const COLLECTION_POSTER_MAX_BYTES = IMAGE_UPLOAD_MAX_BYTES
export const COLLECTION_POSTER_MAX_LABEL = IMAGE_UPLOAD_MAX_LABEL

// Bounds for postponing one collection item's deletion. The upper bound keeps
// the resulting date well within Date range.
export const POSTPONE_MIN_DAYS = 1
export const POSTPONE_MAX_DAYS = 3650

// Upper bound for a collection's deletion window. Several places turn it into
// a real date (addDate + days), and past about 1e8 days that lands outside
// Date range: an Invalid Date, which is truthy, so it reached the overlay
// artwork as "Leaving Invalid Date" (#3549). A century is far beyond any
// retention policy, and everything under it is a valid date.
export const DELETE_AFTER_MAX_DAYS = 36500
