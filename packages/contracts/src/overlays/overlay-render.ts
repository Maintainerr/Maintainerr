import z from 'zod'
import { frameConfigSchema } from './frame-config'
import { overlayStyleConfigSchema } from './overlay-style-config'
import { overlayTextConfigSchema } from './overlay-text-config'

export const overlayPreviewRequestSchema = z.object({
  plexId: z.string().min(1),
  mode: z.enum(['poster', 'titlecard']).optional().default('poster'),
})

export const overlayPreviewWithSettingsSchema = z.object({
  plexId: z.string().min(1),
  overlayText: overlayTextConfigSchema,
  overlayStyle: overlayStyleConfigSchema,
  frame: frameConfigSchema,
})

export type OverlayPreviewRequest = z.infer<typeof overlayPreviewRequestSchema>
export type OverlayPreviewWithSettings = z.infer<
  typeof overlayPreviewWithSettingsSchema
>

export interface OverlayRenderOptions {
  text: string
  fontPath: string
  fontColor: string
  backColor: string
  fontSize: number
  padding: number
  backRadius: number
  horizontalOffset: number
  horizontalAlign: 'left' | 'center' | 'right'
  verticalOffset: number
  verticalAlign: 'top' | 'center' | 'bottom'
  overlayBottomCenter: boolean
  useFrame: boolean
  frameColor: string
  frameWidth: number
  frameRadius: number
  frameInnerRadius: number
  frameInnerRadiusMode: 'auto' | 'absolute'
  frameInset: 'outside' | 'inside' | 'flush'
  dockStyle: 'bar' | 'pill'
  dockPosition: 'top' | 'bottom'
}

export interface OverlayResult {
  buffer: Uint8Array
  contentType: 'image/jpeg'
}
