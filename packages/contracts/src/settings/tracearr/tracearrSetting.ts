import z from 'zod'
import { serviceUrlSchema } from '../serviceUrl'

export const tracearrConnectionSchema = z.object({
  url: serviceUrlSchema,
  api_key: z.string().trim().min(1, 'API key is required'),
})

export type TracearrConnection = z.infer<typeof tracearrConnectionSchema>

// server_id is optional: Maintainerr manages one media server, so the matching
// Tracearr server is resolved on save. It is only supplied when Tracearr has
// several servers of that type and nothing can tell them apart automatically.
export const tracearrSettingSchema = tracearrConnectionSchema.extend({
  server_id: z.uuid('Tracearr server ID must be a UUID').optional(),
})

export type TracearrSetting = z.infer<typeof tracearrSettingSchema>

export const tracearrSettingFormSchema = z.object({
  url: serviceUrlSchema,
  api_key: z.string(),
  server_id: z.string().optional(),
})

export type TracearrSettingForm = z.infer<typeof tracearrSettingFormSchema>
