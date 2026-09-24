import z from 'zod'
import { serviceUrlSchema } from '../serviceUrl'

export const ombiSettingSchema = z.object({
  url: serviceUrlSchema,
  api_key: z.string().trim().min(1, 'API key is required'),
})

export type OmbiSetting = z.infer<typeof ombiSettingSchema>
