import {
  BasicResponseDto,
  MaintainerrEvent,
  MediaServerType,
  MetadataProviderPreference,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { isValidCron } from 'cron-validator';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { getErrorMessage } from '../../utils/connection-error';
import { maskSecret } from '../../utils/secretMasking';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingDto } from "./dto's/setting.dto";
import { RadarrSettings } from './entities/radarr_settings.entities';
import { Settings } from './entities/settings.entities';
import { SonarrSettings } from './entities/sonarr_settings.entities';

type PlexConnectionSettingsUpdate = Partial<
  Pick<
    Settings,
    | 'plex_hostname'
    | 'plex_port'
    | 'plex_ssl'
    | 'plex_machine_id'
    | 'plex_manual_mode'
  >
>;

/**
 * Passive data owner for application settings.
 *
 * This service hydrates the persisted settings into a synchronously-readable
 * in-memory snapshot and exposes the pure read helpers used across the app. It
 * deliberately injects ZERO other services (only repositories + the logger),
 * which keeps it free of circular dependencies. SettingsOperationsService coordinates
 * test/save/reinit flows on top of this store and delegates its read API here.
 */
@Injectable()
export class SettingsDataService implements SettingDto {
  id: number;

  clientId: string;

  applicationTitle: string;

  applicationUrl: string;

  apikey: string;

  locale: string;

  media_server_type?: MediaServerType;

  plex_name: string;

  plex_hostname: string;

  plex_port: number;

  plex_ssl: number;

  plex_auth_token: string;

  plex_machine_id?: string;

  plex_manual_mode?: number;

  jellyfin_url?: string;

  jellyfin_api_key?: string;

  jellyfin_user_id?: string;

  jellyfin_server_name?: string;

  emby_url?: string;

  emby_api_key?: string;

  emby_user_id?: string;

  emby_server_name?: string;

  // Seerr settings
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

  radarr_tag_exclusions: boolean;

  radarr_exclusion_tag: string;

  radarr_untag_on_unexclude: boolean;

  sonarr_tag_exclusions: boolean;

  sonarr_exclusion_tag: string;

  sonarr_untag_on_unexclude: boolean;

  leftover_cleanup_enabled: boolean;

  constructor(
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
    @InjectRepository(RadarrSettings)
    private readonly radarrSettingsRepo: Repository<RadarrSettings>,
    @InjectRepository(SonarrSettings)
    private readonly sonarrSettingsRepo: Repository<SonarrSettings>,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SettingsDataService.name);
  }

  public async init() {
    const settingsDb = await this.settingsRepo.findOne({
      where: {},
    });
    if (settingsDb) {
      this.id = settingsDb?.id;
      this.clientId = settingsDb?.clientId;
      this.applicationTitle = settingsDb?.applicationTitle;
      this.applicationUrl = settingsDb?.applicationUrl;
      this.apikey = settingsDb?.apikey;
      this.locale = settingsDb?.locale;
      this.media_server_type = settingsDb?.media_server_type;
      this.plex_name = settingsDb?.plex_name;
      this.plex_hostname = settingsDb?.plex_hostname;
      this.plex_port = settingsDb?.plex_port;
      this.plex_ssl = settingsDb?.plex_ssl;
      this.plex_auth_token = settingsDb?.plex_auth_token;
      this.plex_machine_id = settingsDb?.plex_machine_id;
      this.plex_manual_mode = settingsDb?.plex_manual_mode ?? 0;
      this.jellyfin_url = settingsDb?.jellyfin_url;
      this.jellyfin_api_key = settingsDb?.jellyfin_api_key;
      this.jellyfin_user_id = settingsDb?.jellyfin_user_id;
      this.jellyfin_server_name = settingsDb?.jellyfin_server_name;
      this.emby_url = settingsDb?.emby_url;
      this.emby_api_key = settingsDb?.emby_api_key;
      this.emby_user_id = settingsDb?.emby_user_id;
      this.emby_server_name = settingsDb?.emby_server_name;
      this.seerr_url = settingsDb?.seerr_url;
      this.seerr_api_key = settingsDb?.seerr_api_key;
      this.tmdb_api_key = settingsDb?.tmdb_api_key;
      this.tvdb_api_key = settingsDb?.tvdb_api_key;
      this.metadata_provider_preference =
        settingsDb?.metadata_provider_preference ??
        MetadataProviderPreference.TMDB_PRIMARY;
      this.tautulli_url = settingsDb?.tautulli_url;
      this.tautulli_api_key = settingsDb?.tautulli_api_key;
      this.streamystats_url = settingsDb?.streamystats_url;
      this.download_client_url = settingsDb?.download_client_url;
      this.download_client_username = settingsDb?.download_client_username;
      this.download_client_password = settingsDb?.download_client_password;
      this.download_client_delete_data =
        settingsDb?.download_client_delete_data ?? true;
      this.download_client_fallback_ratio =
        settingsDb?.download_client_fallback_ratio ?? 0.5;
      this.collection_handler_job_cron =
        settingsDb?.collection_handler_job_cron;
      this.rules_handler_job_cron = settingsDb?.rules_handler_job_cron;
      this.radarr_tag_exclusions = settingsDb?.radarr_tag_exclusions ?? false;
      this.radarr_exclusion_tag = settingsDb?.radarr_exclusion_tag ?? 'dnd';
      this.radarr_untag_on_unexclude =
        settingsDb?.radarr_untag_on_unexclude ?? false;
      this.sonarr_tag_exclusions = settingsDb?.sonarr_tag_exclusions ?? false;
      this.sonarr_exclusion_tag = settingsDb?.sonarr_exclusion_tag ?? 'dnd';
      this.sonarr_untag_on_unexclude =
        settingsDb?.sonarr_untag_on_unexclude ?? false;
      this.leftover_cleanup_enabled =
        settingsDb?.leftover_cleanup_enabled ?? false;

      // Auto-detect media server type when not set but credentials exist.
      // This handles upgrades from pre-Jellyfin versions (Plex) and any future
      // scenario where media_server_type is missing but a server is configured.
      if (!this.media_server_type) {
        if (this.jellyfin_api_key) {
          this.logger.log(
            'Detected existing Jellyfin configuration without media_server_type set. Setting to jellyfin.',
          );
          this.media_server_type = MediaServerType.JELLYFIN;
          await this.settingsRepo.update(
            { id: this.id },
            { media_server_type: MediaServerType.JELLYFIN },
          );
        } else if (this.emby_api_key) {
          this.logger.log(
            'Detected existing Emby configuration without media_server_type set. Setting to emby.',
          );
          this.media_server_type = MediaServerType.EMBY;
          await this.settingsRepo.update(
            { id: this.id },
            { media_server_type: MediaServerType.EMBY },
          );
        } else if (this.plex_auth_token) {
          this.logger.log(
            'Detected existing Plex configuration without media_server_type set. Setting to plex.',
          );
          this.media_server_type = MediaServerType.PLEX;
          await this.settingsRepo.update(
            { id: this.id },
            { media_server_type: MediaServerType.PLEX },
          );
        }
      }
    } else {
      this.logger.log('Settings not found.. Creating initial settings');
      await this.settingsRepo.insert({
        apikey: this.generateApiKey(),
        clientId: randomUUID(),
      });
      await this.init();
    }
  }

  @OnEvent(MaintainerrEvent.Settings_Updated)
  handleMetadataSettingsUpdate(payload: {
    settings: {
      tmdb_api_key?: string | null;
      tvdb_api_key?: string | null;
      metadata_provider_preference?: MetadataProviderPreference;
    };
  }) {
    if ('tmdb_api_key' in payload.settings) {
      this.tmdb_api_key = payload.settings.tmdb_api_key ?? undefined;
    }

    if ('tvdb_api_key' in payload.settings) {
      this.tvdb_api_key = payload.settings.tvdb_api_key ?? undefined;
    }

    if ('metadata_provider_preference' in payload.settings) {
      this.metadata_provider_preference =
        payload.settings.metadata_provider_preference ??
        MetadataProviderPreference.TMDB_PRIMARY;
    }
  }

  public async getSettings() {
    try {
      return this.settingsRepo.findOne({ where: {} });
    } catch (error) {
      this.logger.error(
        'Something went wrong while getting settings. Is the database file locked?',
      );
      this.logger.debug(error);
      return {
        status: 'NOK',
        code: 0,
        message: getErrorMessage(error, 'Failed to get settings'),
      } as BasicResponseDto;
    }
  }

  /**
   * Returns settings with sensitive fields masked.
   * Used for the public GET /settings endpoint to avoid exposing secrets.
   */
  public async getPublicSettings() {
    const settings = await this.getSettings();

    if (!settings || !(settings instanceof Settings)) {
      return settings;
    }

    return {
      ...settings,
      plex_auth_token: maskSecret(settings.plex_auth_token),
      jellyfin_api_key: maskSecret(settings.jellyfin_api_key),
      emby_api_key: maskSecret(settings.emby_api_key),
      seerr_api_key: maskSecret(settings.seerr_api_key),
      tmdb_api_key: maskSecret(settings.tmdb_api_key),
      tvdb_api_key: maskSecret(settings.tvdb_api_key),
      tautulli_api_key: maskSecret(settings.tautulli_api_key),
      download_client_password: maskSecret(settings.download_client_password),
    };
  }

  public async getRadarrSettings() {
    try {
      return this.radarrSettingsRepo.find();
    } catch (error) {
      this.logger.error(
        'Something went wrong while getting radarr settings. Is the database file locked?',
      );
      this.logger.debug(error);
      return {
        status: 'NOK',
        code: 0,
        message: getErrorMessage(error, 'Failed to get Radarr settings'),
      } as BasicResponseDto;
    }
  }

  public async getRadarrSetting(id: number) {
    try {
      return this.radarrSettingsRepo.findOne({ where: { id: id } });
    } catch (error) {
      this.logger.error(
        `Something went wrong while getting radarr setting ${id}. Is the database file locked?`,
      );
      this.logger.debug(error);
      return {
        status: 'NOK',
        code: 0,
        message: getErrorMessage(error, 'Failed to get Radarr setting'),
      } as BasicResponseDto;
    }
  }

  public async getSonarrSettings() {
    try {
      return this.sonarrSettingsRepo.find();
    } catch (error) {
      this.logger.error(
        'Something went wrong while getting sonarr settings. Is the database file locked?',
      );
      this.logger.debug(error);
      return {
        status: 'NOK',
        code: 0,
        message: getErrorMessage(error, 'Failed to get Sonarr settings'),
      } as BasicResponseDto;
    }
  }

  public async getSonarrSetting(id: number) {
    try {
      return this.sonarrSettingsRepo.findOne({ where: { id: id } });
    } catch (error) {
      this.logger.error(
        `Something went wrong while getting sonarr setting ${id}. Is the database file locked?`,
      );
      this.logger.debug(error);
      return {
        status: 'NOK',
        code: 0,
        message: getErrorMessage(error, 'Failed to get Sonarr setting'),
      } as BasicResponseDto;
    }
  }

  public seerrConfigured(): boolean {
    return this.seerr_url !== null && this.seerr_api_key !== null;
  }

  public tautulliConfigured(): boolean {
    return this.tautulli_url !== null && this.tautulli_api_key !== null;
  }

  public downloadClientConfigured(): boolean {
    return this.download_client_url != null;
  }

  /**
   * Get the current media server type
   */
  public getMediaServerType(): MediaServerType | null {
    return (this.media_server_type as MediaServerType) || null;
  }

  // Test if all required media server settings are set.
  public async testSetup(): Promise<boolean> {
    try {
      // If no media server type is selected, setup is not complete
      if (!this.media_server_type) {
        return false;
      }

      // Check based on configured media server type
      if (this.media_server_type === MediaServerType.JELLYFIN) {
        // Jellyfin requires URL and API key (user ID is optional, can be auto-detected later)
        if (this.jellyfin_url && this.jellyfin_api_key) {
          return true;
        }
      } else if (this.media_server_type === MediaServerType.EMBY) {
        // Emby requires URL and API key (user ID is optional, can be auto-detected later)
        if (this.emby_url && this.emby_api_key) {
          return true;
        }
      } else if (this.media_server_type === MediaServerType.PLEX) {
        // Plex requires hostname, name, port, and auth token
        if (
          this.plex_hostname &&
          this.plex_name &&
          this.plex_port &&
          this.plex_auth_token
        ) {
          return true;
        }
      }
      return false;
    } catch (error) {
      this.logger.debug(
        'Failed to determine whether the application setup is complete',
        error,
      );
      return false;
    }
  }

  /**
   * Get count of Radarr settings (for switch preview)
   */
  public async getRadarrSettingsCount(): Promise<number> {
    return this.radarrSettingsRepo.count();
  }

  /**
   * Get count of Sonarr settings (for switch preview)
   */
  public async getSonarrSettingsCount(): Promise<number> {
    return this.sonarrSettingsRepo.count();
  }

  public generateApiKey(): string {
    return Buffer.from(`Maintainerr${Date.now()}${randomUUID()})`).toString(
      'base64',
    );
  }

  public appVersion(): string {
    return process.env.npm_package_version
      ? process.env.npm_package_version
      : '0.0.0';
  }

  public cronIsValid(schedule: string) {
    if (isValidCron(schedule)) {
      return true;
    }
    return false;
  }

  /**
   * Persist a full settings object and emit the Settings_Updated event.
   *
   * Low-level persistence used by SettingsOperationsService's coordination methods. It
   * does not re-hydrate the in-memory snapshot; callers that need the snapshot
   * refreshed call init() afterwards.
   */
  public async saveSettings(settings: Settings): Promise<Settings> {
    const settingsDb = await this.settingsRepo.findOne({ where: {} });

    const updatedSettings = await this.settingsRepo.save({
      ...settingsDb,
      ...settings,
    });

    this.eventEmitter.emit(MaintainerrEvent.Settings_Updated, {
      oldSettings: settingsDb,
      settings: updatedSettings,
    });

    return updatedSettings;
  }

  /**
   * Update specific Plex connection fields without triggering a full settings
   * reload or re-initialization cycle. Used by PlexApiService during failover
   * to persist the new connection details and machineId.
   */
  public async updatePlexConnectionDetails(
    details: PlexConnectionSettingsUpdate,
  ): Promise<void> {
    const settingsDb = await this.settingsRepo.findOne({ where: {} });
    if (!settingsDb) return;

    await this.settingsRepo.save({ ...settingsDb, ...details });

    // Sync in-memory state so subsequent reads are consistent
    if (details.plex_hostname !== undefined)
      this.plex_hostname = details.plex_hostname;
    if (details.plex_port !== undefined) this.plex_port = details.plex_port;
    if (details.plex_ssl !== undefined) this.plex_ssl = details.plex_ssl;
    if (details.plex_machine_id !== undefined)
      this.plex_machine_id = details.plex_machine_id;
    if (details.plex_manual_mode !== undefined)
      this.plex_manual_mode = details.plex_manual_mode;
  }
}
