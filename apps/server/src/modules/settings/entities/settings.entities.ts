import { MediaServerType } from '@maintainerr/contracts';
import { CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { SettingDto } from "../dto's/setting.dto";

@Entity()
export class Settings implements SettingDto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true, default: randomUUID() })
  clientId: string;

  @Column({ nullable: false, default: 'Maintainerr' })
  applicationTitle: string;

  @Column({ nullable: false, default: 'localhost' })
  applicationUrl: string;

  @Column({ nullable: true })
  apikey: string;

  @Column({ nullable: true })
  overseerr_url: string;

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

  // Jellyfin settings
  @Column({ nullable: true })
  jellyfin_url?: string;

  @Column({ nullable: true })
  jellyfin_api_key?: string;

  @Column({ nullable: true })
  jellyfin_user_id?: string;

  @Column({ nullable: true })
  jellyfin_server_name?: string;

  // Third-party integrations
  @Column({ nullable: true })
  overseerr_api_key: string;

  @Column({ nullable: true })
  tautulli_url: string;

  @Column({ nullable: true })
  tautulli_api_key: string;

  @Column({ nullable: true })
  jellyseerr_url: string;

  @Column({ nullable: true })
  jellyseerr_api_key: string;

  @Column({ nullable: false, default: CronExpression.EVERY_12_HOURS })
  collection_handler_job_cron: string;

  @Column({ nullable: false, default: CronExpression.EVERY_8_HOURS })
  rules_handler_job_cron: string;
}
