import z from 'zod'

/**
 * Schema for Plex server settings
 */
export const plexSettingSchema = z.object({
  name: z.string().trim().optional(),
  machineId: z.string().trim().optional(),
  ip: z.string().trim().min(1, 'Server address is required'),
  port: z.number().int().positive().default(32400),
  auth_token: z.string().trim().min(1, 'Authentication token is required'),
  useSsl: z.boolean().optional().default(false),
  // Plex stores hostname/port/SSL separately; this value may be a bare hostname.
  webAppUrl: z.string().trim().optional(),
})

export type PlexSetting = z.infer<typeof plexSettingSchema>
