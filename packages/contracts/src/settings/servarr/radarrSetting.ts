import z from 'zod'
import { serviceUrlSchema } from '../serviceUrl'
import { arrExclusionTagFields } from './arrTag'

export const radarrSettingSchema = z.object({
  serverName: z.string().trim().min(1, 'Server name is required'),
  url: serviceUrlSchema,
  apiKey: z.string().trim().min(1, 'API key is required'),
  ...arrExclusionTagFields,
})

export type RadarrSetting = z.infer<typeof radarrSettingSchema>
