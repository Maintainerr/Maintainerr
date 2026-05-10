import z from 'zod'

export const overlayProcessRequestSchema = z.object({
  force: z.boolean().optional(),
})

export type OverlayProcessRequest = z.infer<typeof overlayProcessRequestSchema>

export interface OverlayProcessorRunResult {
  processed: number
  reverted: number
  skipped: number
  errors: number
}
