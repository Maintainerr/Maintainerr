import z from 'zod'
import { serviceUrlSchema } from '../serviceUrl'

export const streamystatsSettingSchema = z.object({
  url: serviceUrlSchema,
})

export type StreamystatsSetting = z.infer<typeof streamystatsSettingSchema>
