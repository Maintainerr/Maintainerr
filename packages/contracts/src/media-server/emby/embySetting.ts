import z from 'zod'
import { serviceUrlSchema } from '../../settings/serviceUrl'

/**
 * Schema for Emby server settings
 */
export const embySettingSchema = z.object({
  emby_url: serviceUrlSchema,
  emby_api_key: z.string().trim().min(1, 'API key is required'),
  emby_user_id: z.string().trim().optional(),
})

export type EmbySetting = z.infer<typeof embySettingSchema>

export const embyLoginRequestSchema = z.object({
  emby_url: serviceUrlSchema,
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string(),
})

export type EmbyLoginRequest = z.infer<typeof embyLoginRequestSchema>
