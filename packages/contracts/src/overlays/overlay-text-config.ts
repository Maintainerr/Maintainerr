import z from 'zod'

export const overlayTextConfigSchema = z.object({
  overlayText: z.string().min(1),
  useDays: z.boolean(),
  textToday: z.string().min(1),
  textDay: z.string().min(1),
  textDays: z.string().min(1),
  enableDaySuffix: z.boolean(),
  enableUppercase: z.boolean(),
  language: z.string().min(2),
  dateFormat: z.string().min(1),
})

export type OverlayTextConfig = z.infer<typeof overlayTextConfigSchema>

export const DEFAULT_OVERLAY_TEXT_CONFIG: OverlayTextConfig = {
  overlayText: 'Leaving',
  useDays: false,
  textToday: 'today',
  textDay: 'in 1 day',
  textDays: 'in {0} days',
  enableDaySuffix: false,
  enableUppercase: false,
  language: 'en-US',
  dateFormat: 'MMM d',
}
