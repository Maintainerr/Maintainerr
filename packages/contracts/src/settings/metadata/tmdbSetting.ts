import z from 'zod'

export const tmdbSettingSchema = z.object({
  api_key: z.string().trim(),
})

export type TmdbSetting = z.infer<typeof tmdbSettingSchema>
export type TmdbSettingForm = TmdbSetting
