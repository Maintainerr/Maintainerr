import z from 'zod'

const tmdbApiKeySchema = z.string().trim().min(1, 'API key is required')

export const tmdbSettingSchema = z.object({
  api_key: tmdbApiKeySchema,
})

export const tmdbSettingFormSchema = z.object({
  api_key: tmdbApiKeySchema.or(z.literal('')),
})

export type TmdbSetting = z.infer<typeof tmdbSettingSchema>
export type TmdbSettingForm = z.infer<typeof tmdbSettingFormSchema>
