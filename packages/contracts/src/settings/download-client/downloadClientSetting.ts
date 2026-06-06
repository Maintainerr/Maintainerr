import z from 'zod'
import { serviceUrlSchema } from '../serviceUrl'

/**
 * Connection + cleanup options for the download client Maintainerr talks to
 * (currently qBittorrent). Used to remove the completed download for media
 * that Radarr/Sonarr deletes.
 */
export const downloadClientSettingSchema = z.object({
  download_client_url: serviceUrlSchema,
  // Credentials are optional — a client may allow unauthenticated access
  // (e.g. a localhost WebUI bypass). Not trimmed: the download client compares
  // them verbatim, so trimming would silently corrupt a credential that has
  // leading/trailing whitespace.
  download_client_username: z.string().optional().default(''),
  download_client_password: z.string().optional().default(''),
  // When true, removing a download also deletes its data on disk.
  download_client_delete_data: z.boolean(),
  // Whether a download has finished seeding is decided by the download client's
  // own ratio/seed-time limits. This fallback ratio only applies when the client
  // enforces no limit of its own, and may not be set below 0.5.
  download_client_fallback_ratio: z.number().min(0.5),
})

export type DownloadClientSetting = z.infer<typeof downloadClientSettingSchema>
