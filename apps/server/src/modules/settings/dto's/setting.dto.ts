import {
  MediaServerType,
  MetadataProviderPreference,
} from '@maintainerr/contracts';

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

  plex_machine_id?: string;

  plex_manual_mode?: number;

  // Jellyfin settings
  jellyfin_url?: string;

  jellyfin_api_key?: string;

  jellyfin_user_id?: string;

  jellyfin_server_name?: string;

  // Seerr integration
  seerr_url: string;

  seerr_api_key: string;

  tmdb_api_key?: string;

  tvdb_api_key?: string;

  metadata_provider_preference?: MetadataProviderPreference;

  tautulli_url: string;

  tautulli_api_key: string;

  streamystats_url: string;

  download_client_url: string;

  download_client_username: string;

  download_client_password: string;

  download_client_delete_data: boolean;

  download_client_fallback_ratio: number;

  collection_handler_job_cron: string;

  rules_handler_job_cron: string;

  // *arr exclusion tagging (https://features.maintainerr.info/posts/81) — Radarr and Sonarr configured independently
  radarr_tag_exclusions: boolean;

  radarr_exclusion_tag: string;

  radarr_untag_on_unexclude: boolean;

  sonarr_tag_exclusions: boolean;

  sonarr_exclusion_tag: string;

  sonarr_untag_on_unexclude: boolean;
}
