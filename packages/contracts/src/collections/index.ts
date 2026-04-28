export * from './logs'
export * from './servarr-action'

export interface CollectionPosterUploadResponse {
  attempted: boolean
  pushed: boolean
}

// Custom collection posters are stored locally and pushed to the media server
// in a single request. Cap the upload at 500 KB so we never push large bodies
// over flaky media-server connections — anything bigger is almost certainly
// not a poster anyway.
export const COLLECTION_POSTER_MAX_BYTES = 500 * 1024
export const COLLECTION_POSTER_MAX_LABEL = '500 KB'
