import { t } from '@lingui/core/macro'
import type {
  BulkCollectionMediaRequest,
  BulkExclusionRequest,
  BulkMediaItemResult,
  BulkMediaResponse,
} from '@maintainerr/contracts'
import axios from 'axios'
import { chunk } from 'lodash-es'
import { PostApiHandler } from '../utils/ApiHandler'

// Kept well below BULK_MEDIA_ACTION_MAX_ITEMS: each item fans out server-side
// (an excluded show cascades to all of its seasons and episodes, a collection
// action resolves the hierarchy), so smaller requests keep every call
// comfortably inside reverse-proxy timeouts and let a selection larger than one
// request cap still succeed as a whole.
const BULK_REQUEST_CHUNK = 25

/**
 * What to tell the user about a failed chunk request.
 *
 * Deliberately not getApiErrorMessage: that ends in
 * normalizeConnectionErrorMessage, whose vocabulary is written for the
 * media-server and *arr connection tests. It rewrites anything timeout-shaped
 * into "Connection timed out after 5 seconds", and this path has no such budget
 * - the UI sets no axios timeout at all - so a reverse-proxy 504 would be
 * reported with a number that is simply untrue. The failing hop here is the
 * browser to Maintainerr, and the server's own message is the honest answer.
 */
const failureReason = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as
      { message?: string | string[] } | undefined
    const message = Array.isArray(body?.message)
      ? body.message.join('; ')
      : body?.message

    if (message && message.trim().length > 0) {
      return message
    }

    const status = error.response?.status
    if (status) {
      return t`server responded ${status}`
    }
  }

  return t`request error`
}

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
    } catch (error) {
      // The transport error is the only evidence of what went wrong. Discarding
      // it reported a read timeout, a 409 lock conflict and a dropped
      // connection identically; failureReason gives each its own sentence.
      //
      // No "Failed - " prefix on either message: that prefix is the server's,
      // and the toast strips it by matching the English text. A translated
      // prefix would survive the strip and read twice.
      const reason = failureReason(error)
      for (const mediaId of batch) {
        results.push({ mediaId, code: 0, message: reason })
      }

      // Everything after this batch was never sent, so it did not fail for that
      // reason - or for any reason yet. Reported separately so a retry is not
      // chasing a fault those items never hit.
      for (const remaining of batches.slice(index + 1)) {
        for (const mediaId of remaining) {
          results.push({ mediaId, code: 0, message: t`not attempted` })
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
