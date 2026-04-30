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
