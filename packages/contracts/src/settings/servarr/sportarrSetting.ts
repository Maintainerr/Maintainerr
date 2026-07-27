import z from 'zod'
import { serviceUrlSchema } from '../serviceUrl'

export const sportarrSettingSchema = z.object({
  serverName: z.string().trim().min(1, 'Server name is required'),
  url: serviceUrlSchema,
  apiKey: z.string().trim().min(1, 'API key is required'),
})

export type SportarrSetting = z.infer<typeof sportarrSettingSchema>
