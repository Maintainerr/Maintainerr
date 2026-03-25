import z from 'zod'
import { serviceUrlSchema } from '../serviceUrl'

export const seerrSettingSchema = z.object({
  url: serviceUrlSchema,
  api_key: z.string().trim(),
})

export type SeerrSetting = z.infer<typeof seerrSettingSchema>
