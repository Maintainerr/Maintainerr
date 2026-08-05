import type {
  BulkCollectionMediaRequest,
  BulkExclusionRequest,
  BulkMediaItemResult,
  BulkMediaResponse,
} from '@maintainerr/contracts'
import { chunk } from 'lodash-es'
import { PostApiHandler } from '../utils/ApiHandler'

// Kept well below BULK_MEDIA_ACTION_MAX_ITEMS: each item fans out server-side
// (an excluded show cascades to all of its seasons and episodes, a collection
// action resolves the hierarchy), so smaller requests keep every call
// comfortably inside reverse-proxy timeouts and let a selection larger than one
// request cap still succeed as a whole.
const BULK_REQUEST_CHUNK = 25

/**
 * Runs a bulk request one chunk at a time. Earlier chunks are already persisted
 * server-side, so a transport failure must not reject the aggregate: this and
 * every unattempted batch are reported as per-item failures instead.
 */
const postInChunks = async (
  mediaIds: string[],
  postChunk: (chunkIds: string[]) => Promise<BulkMediaResponse>,
): Promise<BulkMediaResponse> => {
  const results: BulkMediaItemResult[] = []
  const batches = chunk(mediaIds, BULK_REQUEST_CHUNK)

  for (const [index, batch] of batches.entries()) {
    try {
      const response = await postChunk(batch)
      results.push(...response.results)
    } catch {
      for (const remaining of batches.slice(index)) {
        for (const mediaId of remaining) {
          results.push({ mediaId, code: 0, message: 'Failed - request error' })
        }
      }
      break
    }
  }

  return { results }
}

export const postBulkExclusions = async ({
  mediaIds,
  collectionId,
  action,
  context,
}: BulkExclusionRequest): Promise<BulkMediaResponse> =>
  await postInChunks(mediaIds, (batch) =>
    PostApiHandler<BulkMediaResponse>('/rules/exclusions/bulk', {
      mediaIds: batch,
      ...(collectionId !== undefined ? { collectionId } : {}),
      action,
      ...(context ? { context } : {}),
    }),
  )

export const postBulkCollectionMedia = async ({
  mediaIds,
  collectionId,
  action,
  mediaType,
  context,
}: BulkCollectionMediaRequest): Promise<BulkMediaResponse> =>
  await postInChunks(mediaIds, (batch) =>
    PostApiHandler<BulkMediaResponse>('/collections/media/bulk', {
      mediaIds: batch,
      ...(collectionId !== undefined ? { collectionId } : {}),
      action,
      mediaType,
      ...(context ? { context } : {}),
    }),
  )
