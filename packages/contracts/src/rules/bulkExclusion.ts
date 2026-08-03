import z from 'zod'

export const BULK_EXCLUSION_MAX_ITEMS = 250

export const bulkExclusionRequestSchema = z.object({
  mediaIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(BULK_EXCLUSION_MAX_ITEMS),
})

export type BulkExclusionRequest = z.infer<typeof bulkExclusionRequestSchema>

export interface BulkExclusionItemResult {
  mediaId: string
  code: 0 | 1
  message?: string
}

export interface BulkExclusionResponse {
  results: BulkExclusionItemResult[]
}
