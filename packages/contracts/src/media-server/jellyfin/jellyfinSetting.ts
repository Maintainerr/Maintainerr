import z from 'zod'

/**
 * Schema for Jellyfin server settings
 */
export const jellyfinSettingSchema = z.object({
  /** Jellyfin server URL (e.g., http://jellyfin.local:8096) */
  jellyfin_url: z
    .string()
    .trim()
    .refine((val) => val.startsWith('http://') || val.startsWith('https://'), {
      message: 'Must start with http:// or https://',
    })
    .refine((val) => !val.endsWith('/'), {
      message: "Must not end with a '/'",
    }),
  /** API key generated from Jellyfin Dashboard → API Keys */
  jellyfin_api_key: z.string().trim().min(1, 'API key is required'),
  /** Optional admin user ID for administrative operations */
  jellyfin_user_id: z.string().trim().optional(),
})

export type JellyfinSetting = z.infer<typeof jellyfinSettingSchema>
