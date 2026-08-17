import z from 'zod'
import { serviceUrlSchema } from '../../settings/serviceUrl'

/**
 * How scheduled-deletion collections are surfaced on the Jellyfin server.
 */
export const LeavingSoonMethod = {
  /** Native Jellyfin BoxSet collections (default). */
  COLLECTION: 'collection',
  /** The leaving-soon plugin's symlink-backed library, no BoxSet. */
  PLUGIN: 'plugin',
} as const

export type LeavingSoonMethod =
  (typeof LeavingSoonMethod)[keyof typeof LeavingSoonMethod]

export const leavingSoonMethods = Object.values(LeavingSoonMethod)

/**
 * Schema for Jellyfin server settings
 */
export const jellyfinSettingSchema = z.object({
  jellyfin_url: serviceUrlSchema,
  jellyfin_api_key: z.string().trim().min(1, 'API key is required'),
  jellyfin_user_id: z.string().trim().optional(),
  leaving_soon_method: z.enum(leavingSoonMethods).optional(),
})

export type JellyfinSetting = z.infer<typeof jellyfinSettingSchema>
