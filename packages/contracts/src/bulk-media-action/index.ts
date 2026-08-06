import z from 'zod'
import { MediaItemTypes, type MediaItemType } from '../media-server/enums'

/**
 * Both bulk actions report per media id rather than failing the whole request,
 * so a partial result stays actionable.
 */

export const BULK_MEDIA_ACTION_MAX_ITEMS = 250

/** 0 = add, 1 = remove, matching the singular endpoints' action field. */
export const bulkMediaActionSchema = z.union([z.literal(0), z.literal(1)])

const bulkMediaIdsSchema = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(BULK_MEDIA_ACTION_MAX_ITEMS)

/**
 * Narrows one selected item to a season or episode. The item stays the entry
 * point, so the exclusion rows it writes still record it as their `parent` and
 * stay removable through it. Only meaningful for a single-item selection.
 */
const mediaContextSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(MediaItemTypes as [MediaItemType, ...MediaItemType[]]),
})

const singleItemContext = (
  value: { mediaIds: string[]; context?: unknown },
  ctx: z.RefinementCtx,
) => {
  if (value.context && value.mediaIds.length !== 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['context'],
      message:
        'context narrows a single item, so exactly one media id is allowed',
    })
  }
}

export const bulkExclusionRequestSchema = z
  .object({
    mediaIds: bulkMediaIdsSchema,
    /**
     * Scopes to the collection's rule group; adding also drops the items from
     * that collection. Omitted means every collection: a global exclusion, or a
     * removal of every exclusion the items carry.
     */
    collectionId: z.number().int().positive().optional(),
    action: bulkMediaActionSchema.optional(),
    context: mediaContextSchema.optional(),
  })
  .superRefine(singleItemContext)

export type BulkExclusionRequest = z.infer<typeof bulkExclusionRequestSchema>

export const bulkCollectionMediaRequestSchema = z
  .object({
    mediaIds: bulkMediaIdsSchema,
    /** Omitted only for a removal, which then covers every collection. */
    collectionId: z.number().int().positive().optional(),
    action: bulkMediaActionSchema,
    /** Lets the server resolve the hierarchy without a metadata read per item. */
    mediaType: z.enum(MediaItemTypes as [MediaItemType, ...MediaItemType[]]),
    context: mediaContextSchema.optional(),
  })
  .superRefine(singleItemContext)

export type BulkCollectionMediaRequest = z.infer<
  typeof bulkCollectionMediaRequestSchema
>

export interface BulkMediaItemResult {
  mediaId: string
  code: 0 | 1
  message?: string
}

export interface BulkMediaResponse {
  results: BulkMediaItemResult[]
}
