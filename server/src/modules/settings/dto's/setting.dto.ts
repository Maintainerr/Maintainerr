export class SettingDto {
  id: number;

  clientId: string;

  applicationTitle: string;

  applicationUrl: string;

  apikey: string;

  locale: string;

  cacheImages: number;

  plex_name: string;

  plex_hostname: string;

  plex_port: number;

  plex_ssl: number;

  plex_auth_token: string;

  plex_default_library: number | null;

  overseerr_url: string;

  overseerr_api_key: string;

  tautulli_url: string;

  tautulli_api_key: string;

  jellyseerr_url: string;

  jellyseerr_api_key: string;

  collection_handler_job_cron: string;

  rules_handler_job_cron: string;
}
