import z from 'zod'

export const frameInnerRadiusModeValues = ['auto', 'absolute'] as const
export const frameInsetValues = ['outside', 'inside', 'flush'] as const
export const dockStyleValues = ['bar', 'pill'] as const
export const dockPositionValues = ['top', 'bottom'] as const

export const frameConfigSchema = z.object({
  useFrame: z.boolean(),
  frameColor: z.string().min(4),
  frameWidth: z.number().min(0).max(20),
  frameRadius: z.number().min(0).max(50),
  frameInnerRadius: z.number().min(0).max(50),
  frameInnerRadiusMode: z.enum(frameInnerRadiusModeValues),
  frameInset: z.enum(frameInsetValues),
  dockStyle: z.enum(dockStyleValues),
  dockPosition: z.enum(dockPositionValues),
})

export type FrameConfig = z.infer<typeof frameConfigSchema>

export const DEFAULT_FRAME_CONFIG: FrameConfig = {
  useFrame: false,
  frameColor: '#B20710',
  frameWidth: 1.5,
  frameRadius: 2.0,
  frameInnerRadius: 2.0,
  frameInnerRadiusMode: 'auto',
  frameInset: 'outside',
  dockStyle: 'pill',
  dockPosition: 'bottom',
}
