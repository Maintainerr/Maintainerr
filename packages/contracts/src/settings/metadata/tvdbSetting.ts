import z from 'zod'

export const tvdbSettingSchema = z.object({
  api_key: z.string().trim().min(1, 'API key is required'),
})

export type TvdbSetting = z.infer<typeof tvdbSettingSchema>
