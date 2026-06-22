import z from 'zod'
import { serviceUrlSchema } from '../../settings/serviceUrl'

/**
 * Schema for Kodi server settings.
 *
 * Kodi's JSON-RPC transport authenticates with HTTP Basic credentials (there is
 * no API key), so the form collects a username/password pair alongside the URL.
 * The password may be blank for installs that enable remote control without one.
 */
export const kodiSettingSchema = z.object({
  kodi_url: serviceUrlSchema,
  kodi_username: z.string().trim().min(1, 'Username is required'),
  kodi_password: z.string(),
})

export type KodiSetting = z.infer<typeof kodiSettingSchema>
