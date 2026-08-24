import z from 'zod'

export const telemetrySettingSchema = z.object({
  enabled: z.boolean(),
})

export type TelemetrySetting = z.infer<typeof telemetrySettingSchema>
