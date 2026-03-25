import z from 'zod'
import { serviceUrlSchema } from '../serviceUrl'

export const sonarrSettingSchema = z.object({
  serverName: z.string().trim().min(1, 'Server name is required'),
  url: serviceUrlSchema,
  apiKey: z.string().trim().min(1, 'API key is required'),
})

export type SonarrSetting = z.infer<typeof sonarrSettingSchema>
