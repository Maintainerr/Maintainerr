import z from 'zod'
import { MediaServerType } from '../media-server/enums'
import { leavingSoonMethods } from '../media-server/jellyfin/jellyfinSetting'
import { MetadataProviderPreference } from './metadata'
import { serviceUrlSchema } from './serviceUrl'

/**
 * Body schema for the bulk settings endpoints (`POST` / `PATCH /api/settings`).
 *
 * Both endpoints merge the body over the stored row, so every field is
 * optional and an absent key means "leave as-is". Service URLs reuse
 * `serviceUrlSchema`, the same refinement the per-service endpoints enforce, so
 * a URL cannot be smuggled past it through the bulk route.
 *
 * `id` is deliberately absent: letting it through made TypeORM write a second
 * settings row. Everything else `GET /api/settings` returns is accepted, so a
 * read-modify-write round trip does not silently drop fields.
 */
export const settingsUpdateSchema = z.object({
  clientId: z.string().trim().optional(),
  applicationTitle: z.string().trim().optional(),
  // Not a service URL: this defaults to the bare host 'localhost'.
  applicationUrl: z.string().trim().optional(),
  apikey: z.string().trim().optional(),
  locale: z.string().trim().optional(),

  media_server_type: z.enum(MediaServerType).nullable().optional(),

  plex_name: z.string().trim().optional(),
  // A host or host:port, optionally scheme-prefixed; the server normalises it.
  plex_hostname: z.string().trim().optional(),
  plex_port: z.number().int().min(1).max(65535).optional(),
  plex_ssl: z.number().int().min(0).max(1).optional(),
  plex_auth_token: z.string().trim().optional(),
  plex_machine_id: z.string().trim().optional(),
  plex_manual_mode: z.number().int().min(0).max(1).optional(),

  jellyfin_url: serviceUrlSchema.optional(),
  jellyfin_api_key: z.string().trim().optional(),
  jellyfin_user_id: z.string().trim().optional(),
  jellyfin_server_name: z.string().trim().optional(),
  // How scheduled-deletion collections are surfaced on Jellyfin: native BoxSet
  // collections, or the leaving-soon plugin's symlink-backed library.
  leaving_soon_method: z.enum(leavingSoonMethods).optional(),

  emby_url: serviceUrlSchema.optional(),
  emby_api_key: z.string().trim().optional(),
  emby_user_id: z.string().trim().optional(),
  emby_server_name: z.string().trim().optional(),

  seerr_url: serviceUrlSchema.optional(),
  seerr_api_key: z.string().trim().optional(),

  tmdb_api_key: z.string().trim().optional(),
  tvdb_api_key: z.string().trim().optional(),
  metadata_provider_preference: z.enum(MetadataProviderPreference).optional(),

  tautulli_url: serviceUrlSchema.optional(),
  tautulli_api_key: z.string().trim().optional(),

  streamystats_url: serviceUrlSchema.optional(),

  tracearr_url: serviceUrlSchema.optional(),
  tracearr_api_key: z.string().trim().optional(),
  tracearr_server_id: z.string().trim().optional(),

  download_client_url: serviceUrlSchema.optional(),
  // Not trimmed: the download client compares credentials verbatim.
  download_client_username: z.string().optional(),
  download_client_password: z.string().optional(),
  download_client_delete_data: z.boolean().optional(),
  download_client_fallback_ratio: z.number().min(0.5).optional(),

  collection_handler_job_cron: z.string().trim().optional(),
  rules_handler_job_cron: z.string().trim().optional(),

  radarr_tag_exclusions: z.boolean().optional(),
  radarr_exclusion_tag: z.string().trim().optional(),
  radarr_untag_on_unexclude: z.boolean().optional(),
  sonarr_tag_exclusions: z.boolean().optional(),
  sonarr_exclusion_tag: z.string().trim().optional(),
  sonarr_untag_on_unexclude: z.boolean().optional(),
})

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>

export const cronScheduleSchema = z.object({
  schedule: z.string(),
})

export type CronSchedule = z.infer<typeof cronScheduleSchema>

export const plexAuthTokenSchema = z.object({
  plex_auth_token: z.string().trim().min(1, 'Plex auth token is required'),
})

export type PlexAuthToken = z.infer<typeof plexAuthTokenSchema>
