import z from 'zod'

/**
 * Schema for Plex server settings
 */
export const plexSettingSchema = z.object({
  /** Plex server name */
  name: z.string().trim().optional(),
  /** Plex machine identifier */
  machineId: z.string().trim().optional(),
  /** Plex server IP or hostname */
  ip: z.string().trim().min(1, 'Server address is required'),
  /** Plex server port */
  port: z.number().int().positive().default(32400),
  /** Plex authentication token */
  auth_token: z.string().trim().min(1, 'Authentication token is required'),
  /** Whether to use SSL */
  useSsl: z.boolean().optional().default(false),
  /** Plex web app URL */
  webAppUrl: z
    .string()
    .trim()
    .refine((val) => val.startsWith('http://') || val.startsWith('https://'), {
      message: 'Must start with http:// or https://',
    })
    .optional(),
})

export type PlexSetting = z.infer<typeof plexSettingSchema>
