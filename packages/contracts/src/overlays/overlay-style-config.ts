import z from 'zod'
import { safeFilenameField } from './overlay-element'

export const horizontalAlignValues = ['left', 'center', 'right'] as const
export const verticalAlignValues = ['top', 'center', 'bottom'] as const

export const overlayStyleConfigSchema = z.object({
  fontPath: safeFilenameField(),
  fontColor: z.string().min(4),
  backColor: z.string().min(4),
  fontSize: z.number().min(1).max(20),
  padding: z.number().min(0).max(20),
  backRadius: z.number().min(0).max(50),
  horizontalOffset: z.number().min(0).max(50),
  horizontalAlign: z.enum(horizontalAlignValues),
  verticalOffset: z.number().min(0).max(50),
  verticalAlign: z.enum(verticalAlignValues),
  overlayBottomCenter: z.boolean(),
})

export type OverlayStyleConfig = z.infer<typeof overlayStyleConfigSchema>

export const DEFAULT_OVERLAY_STYLE_CONFIG: OverlayStyleConfig = {
  fontPath: 'Inter-Bold.ttf',
  fontColor: '#FFFFFF',
  backColor: '#B20710',
  fontSize: 5.5,
  padding: 1.5,
  backRadius: 3.0,
  horizontalOffset: 3.0,
  horizontalAlign: 'left',
  verticalOffset: 4.0,
  verticalAlign: 'top',
  overlayBottomCenter: false,
}
