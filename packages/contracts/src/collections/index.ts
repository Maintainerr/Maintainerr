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
