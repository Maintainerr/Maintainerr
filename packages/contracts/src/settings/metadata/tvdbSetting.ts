import z from 'zod'

export const tvdbSettingSchema = z.object({
  api_key: z.string().trim(),
})

export type TvdbSetting = z.infer<typeof tvdbSettingSchema>
export type TvdbSettingForm = TvdbSetting
