import {
  MediaServerType,
  MetadataProviderPreference,
} from '@maintainerr/contracts';
import { CronExpression } from '@nestjs/schedule';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { SettingDto } from "../dto's/setting.dto";

@Entity()
export class Settings implements SettingDto {
  @PrimaryGeneratedColumn()
  id: number;

  // clientId is set explicitly via randomUUID() in SettingsOperationsService.init()
  @Column({ nullable: true })
  clientId: string;

  @Column({ nullable: false, default: 'Maintainerr' })
  applicationTitle: string;

  @Column({ nullable: false, default: 'localhost' })
  applicationUrl: string;

  @Column({ nullable: true })
  apikey: string;

  // Seerr integration
  @Column({ nullable: true })
  seerr_url: string;

  @Column({ nullable: false, default: 'en' })
  locale: string;

  // Media server type selection - null until user chooses
  @Column({ type: 'varchar', nullable: true, default: null })
  media_server_type?: MediaServerType | null;

  // Plex settings
  @Column({ nullable: true })
  plex_name: string;

  @Column({ nullable: true })
  plex_hostname: string;

  @Column({ nullable: true, default: 32400 })
  plex_port: number;

  @Column({ nullable: true })
  plex_ssl: number;

  @Column({ nullable: true })
  plex_auth_token: string;

  @Column({ nullable: true })
  plex_machine_id?: string;

  @Column({ nullable: true, default: 0 })
  plex_manual_mode?: number;

  // Jellyfin settings
  @Column({ nullable: true })
  jellyfin_url?: string;

  @Column({ nullable: true })
  jellyfin_api_key?: string;

  @Column({ nullable: true })
  jellyfin_user_id?: string;

  @Column({ nullable: true })
  jellyfin_server_name?: string;

  // Emby settings
  @Column({ nullable: true })
  emby_url?: string;

  @Column({ nullable: true })
  emby_api_key?: string;

  @Column({ nullable: true })
  emby_user_id?: string;

  @Column({ nullable: true })
  emby_server_name?: string;

  // Seerr integration
  @Column({ nullable: true })
  seerr_api_key: string;

  @Column({ nullable: true })
  tmdb_api_key?: string;

  @Column({ nullable: true })
  tvdb_api_key?: string;

  @Column({
    type: 'varchar',
    nullable: false,
    default: MetadataProviderPreference.TMDB_PRIMARY,
  })
  metadata_provider_preference?: MetadataProviderPreference;

  @Column({ type: 'boolean', nullable: true, default: false })
  metadata_writeback?: boolean;

  @Column({ nullable: true })
  tautulli_url: string;

  @Column({ nullable: true })
  tautulli_api_key: string;

  @Column({ nullable: true })
  streamystats_url: string;

  // Download client integration (currently qBittorrent)
  @Column({ nullable: true })
  download_client_url: string;

  @Column({ nullable: true })
  download_client_username: string;

  @Column({ nullable: true })
  download_client_password: string;

  @Column({ type: 'boolean', nullable: true, default: true })
  download_client_delete_data: boolean;

  // Fallback seeding ratio applied only when the download client enforces no
  // ratio/seed-time limit of its own. Defaults to 0.5; the UI/contract forbid
  // setting it lower.
  @Column({ type: 'float', nullable: false, default: 0.5 })
  download_client_fallback_ratio: number;

  @Column({ nullable: false, default: CronExpression.EVERY_12_HOURS })
  collection_handler_job_cron: string;

  @Column({ nullable: false, default: CronExpression.EVERY_8_HOURS })
  rules_handler_job_cron: string;
}
