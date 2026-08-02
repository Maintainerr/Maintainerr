import z from 'zod'
import { serviceUrlSchema } from '../serviceUrl'

export const tracearrConnectionSchema = z.object({
  url: serviceUrlSchema,
  api_key: z.string().trim().min(1, 'API key is required'),
})

export type TracearrConnection = z.infer<typeof tracearrConnectionSchema>

export const tracearrSettingSchema = tracearrConnectionSchema.extend({
  server_id: z.uuid('Tracearr server ID must be a UUID'),
})

export type TracearrSetting = z.infer<typeof tracearrSettingSchema>

export const tracearrSettingFormSchema = z.object({
  url: serviceUrlSchema,
  api_key: z.string(),
  server_id: z.string(),
})

export type TracearrSettingForm = z.infer<typeof tracearrSettingFormSchema>
