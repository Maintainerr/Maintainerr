import z from 'zod'
import { DEFAULT_FRAME_CONFIG, frameConfigSchema } from './frame-config'
import { DEFAULT_OVERLAY_STYLE_CONFIG, overlayStyleConfigSchema } from './overlay-style-config'
import { DEFAULT_OVERLAY_TEXT_CONFIG, overlayTextConfigSchema } from './overlay-text-config'

export const overlaySettingsSchema = z.object({
  enabled: z.boolean(),
  posterOverlayText: overlayTextConfigSchema,
  posterOverlayStyle: overlayStyleConfigSchema,
  posterFrame: frameConfigSchema,
  titleCardOverlayText: overlayTextConfigSchema,
  titleCardOverlayStyle: overlayStyleConfigSchema,
  titleCardFrame: frameConfigSchema,
  cronSchedule: z.string().nullable(),
  applyOnAdd: z.boolean(),
})

export const overlaySettingsUpdateSchema = overlaySettingsSchema.partial()

export type OverlaySettings = z.infer<typeof overlaySettingsSchema>
export type OverlaySettingsUpdate = z.infer<typeof overlaySettingsUpdateSchema>

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  enabled: false,
  posterOverlayText: DEFAULT_OVERLAY_TEXT_CONFIG,
  posterOverlayStyle: DEFAULT_OVERLAY_STYLE_CONFIG,
  posterFrame: DEFAULT_FRAME_CONFIG,
  titleCardOverlayText: DEFAULT_OVERLAY_TEXT_CONFIG,
  titleCardOverlayStyle: DEFAULT_OVERLAY_STYLE_CONFIG,
  titleCardFrame: DEFAULT_FRAME_CONFIG,
  cronSchedule: null,
  applyOnAdd: true,
}

export const overlayExportSchema = z.object({
  version: z.literal(1),
  overlayText: overlayTextConfigSchema,
  overlayStyle: overlayStyleConfigSchema,
  frame: frameConfigSchema,
})

export type OverlayExport = z.infer<typeof overlayExportSchema>
