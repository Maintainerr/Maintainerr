import z from 'zod'

const tvdbApiKeySchema = z.string().trim().min(1, 'API key is required')

export const tvdbSettingSchema = z.object({
  api_key: tvdbApiKeySchema,
})

export const tvdbSettingFormSchema = z.object({
  api_key: tvdbApiKeySchema.or(z.literal('')),
})

export type TvdbSetting = z.infer<typeof tvdbSettingSchema>
export type TvdbSettingForm = z.infer<typeof tvdbSettingFormSchema>
