import z from 'zod'

export const tmdbSettingSchema = z.object({
  api_key: z.string().trim().min(1, 'API key is required'),
})

export type TmdbSetting = z.infer<typeof tmdbSettingSchema>
