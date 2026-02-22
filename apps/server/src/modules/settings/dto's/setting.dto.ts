import { MediaServerType } from '@maintainerr/contracts';

export class SettingDto {
  id: number;

  clientId: string;

  applicationTitle: string;

  applicationUrl: string;

  apikey: string;

  locale: string;

  // Media server type selection
  media_server_type?: MediaServerType;

  // Plex settings
  plex_name: string;

  plex_hostname: string;

  plex_port: number;

  plex_ssl: number;

  plex_auth_token: string;

  // Jellyfin settings
  jellyfin_url?: string;

  jellyfin_api_key?: string;

  jellyfin_user_id?: string;

  jellyfin_server_name?: string;

  // Seerr integration
  seerr_url: string;

  seerr_api_key: string;

  tautulli_url: string;

  tautulli_api_key: string;

  collection_handler_job_cron: string;

  rules_handler_job_cron: string;
}
