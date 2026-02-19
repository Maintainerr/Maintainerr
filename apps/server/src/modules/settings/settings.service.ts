import {
  BasicResponseDto,
  JellyfinSetting,
  JellyseerrSetting,
  MaintainerrEvent,
  MediaServerType,
  OverseerrSetting,
  TautulliSetting,
} from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { isValidCron } from 'cron-validator';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { InternalApiService } from '../api/internal-api/internal-api.service';
import { JellyseerrApiService } from '../api/jellyseerr-api/jellyseerr-api.service';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { OverseerrApiService } from '../api/overseerr-api/overseerr-api.service';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { TautulliApiService } from '../api/tautulli-api/tautulli-api.service';
import { MaintainerrLogger } from '../logging/logs.service';
import {
  DeleteRadarrSettingResponseDto,
  RadarrSettingRawDto,
  RadarrSettingResponseDto,
} from "./dto's/radarr-setting.dto";
import { SettingDto } from "./dto's/setting.dto";
import {
  DeleteSonarrSettingResponseDto,
  SonarrSettingRawDto,
  SonarrSettingResponseDto,
} from "./dto's/sonarr-setting.dto";
import { RadarrSettings } from './entities/radarr_settings.entities';
import { Settings } from './entities/settings.entities';
import { SonarrSettings } from './entities/sonarr_settings.entities';

@Injectable()
export class SettingsService implements SettingDto {
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

  jellyfin_url?: string;

  jellyfin_api_key?: string;

  jellyfin_user_id?: string;

  jellyfin_server_name?: string;

  overseerr_url: string;

  overseerr_api_key: string;

  tautulli_url: string;

  tautulli_api_key: string;

  jellyseerr_url: string;

  jellyseerr_api_key: string;

  collection_handler_job_cron: string;

  rules_handler_job_cron: string;

  constructor(
    @Inject(forwardRef(() => PlexApiService))
    private readonly plexApi: PlexApiService,
    @Inject(forwardRef(() => MediaServerFactory))
    private readonly mediaServerFactory: MediaServerFactory,
    @Inject(forwardRef(() => ServarrService))
    private readonly servarr: ServarrService,
    @Inject(forwardRef(() => OverseerrApiService))
    private readonly overseerr: OverseerrApiService,
    @Inject(forwardRef(() => TautulliApiService))
    private readonly tautulli: TautulliApiService,
    @Inject(forwardRef(() => JellyseerrApiService))
    private readonly jellyseerr: JellyseerrApiService,
    @Inject(forwardRef(() => InternalApiService))
    private readonly internalApi: InternalApiService,
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
    @InjectRepository(RadarrSettings)
    private readonly radarrSettingsRepo: Repository<RadarrSettings>,
    @InjectRepository(SonarrSettings)
    private readonly sonarrSettingsRepo: Repository<SonarrSettings>,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SettingsService.name);
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
      this.jellyfin_url = settingsDb?.jellyfin_url;
      this.jellyfin_api_key = settingsDb?.jellyfin_api_key;
      this.jellyfin_user_id = settingsDb?.jellyfin_user_id;
      this.jellyfin_server_name = settingsDb?.jellyfin_server_name;
      this.overseerr_url = settingsDb?.overseerr_url;
      this.overseerr_api_key = settingsDb?.overseerr_api_key;
      this.tautulli_url = settingsDb?.tautulli_url;
      this.tautulli_api_key = settingsDb?.tautulli_api_key;
      this.jellyseerr_url = settingsDb?.jellyseerr_url;
      this.jellyseerr_api_key = settingsDb?.jellyseerr_api_key;
      this.collection_handler_job_cron =
        settingsDb?.collection_handler_job_cron;
      this.rules_handler_job_cron = settingsDb?.rules_handler_job_cron;

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

  public async getSettings() {
    try {
      return this.settingsRepo.findOne({ where: {} });
    } catch (err) {
      this.logger.error(
        'Something went wrong while getting settings. Is the database file locked?',
      );
      return { status: 'NOK', code: 0, message: err } as BasicResponseDto;
    }
  }

  public async getRadarrSettings() {
    try {
      return this.radarrSettingsRepo.find();
    } catch (err) {
      this.logger.error(
        'Something went wrong while getting radarr settings. Is the database file locked?',
      );
      return { status: 'NOK', code: 0, message: err } as BasicResponseDto;
    }
  }

  public async getRadarrSetting(id: number) {
    try {
      return this.radarrSettingsRepo.findOne({ where: { id: id } });
    } catch (err) {
      this.logger.error(
        `Something went wrong while getting radarr setting ${id}. Is the database file locked?`,
      );
      return { status: 'NOK', code: 0, message: err } as BasicResponseDto;
    }
  }

  public async addRadarrSetting(
    settings: Omit<RadarrSettings, 'id' | 'collections'>,
  ): Promise<RadarrSettingResponseDto> {
    try {
      settings.url = settings.url.toLowerCase();

      const savedSetting = await this.radarrSettingsRepo.save(settings);

      this.logger.log('Radarr setting added');
      return {
        data: savedSetting,
        status: 'OK',
        code: 1,
        message: 'Success',
      };
    } catch (e) {
      this.logger.error('Error while adding Radarr setting: ', e);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public async updateRadarrSetting(
    settings: Omit<RadarrSettings, 'collections'>,
  ): Promise<RadarrSettingResponseDto> {
    try {
      settings.url = settings.url.toLowerCase();

      const settingsDb = await this.radarrSettingsRepo.findOne({
        where: { id: settings.id },
      });

      const data = {
        ...settingsDb,
        ...settings,
      };

      await this.radarrSettingsRepo.save(data);

      this.servarr.deleteCachedRadarrApiClient(settings.id);
      this.logger.log('Radarr settings updated');
      return { data, status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error while updating Radarr settings: ', e);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public async deleteRadarrSetting(
    id: number,
  ): Promise<DeleteRadarrSettingResponseDto> {
    try {
      const settingsDb = await this.radarrSettingsRepo.findOne({
        where: { id: id },
        relations: ['collections'],
      });

      if (settingsDb.collections.length > 0) {
        return {
          status: 'NOK',
          code: 0,
          message: 'Cannot delete setting with associated collections',
          data: {
            collectionsInUse: settingsDb.collections,
          },
        };
      }

      await this.radarrSettingsRepo.delete({
        id,
      });

      this.servarr.deleteCachedRadarrApiClient(id);

      this.logger.log('Radarr setting deleted');
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error while deleting Radarr setting: ', e);
      return { status: 'NOK', code: 0, message: 'Failure', data: null };
    }
  }

  public async getSonarrSettings() {
    try {
      return this.sonarrSettingsRepo.find();
    } catch (err) {
      this.logger.error(
        'Something went wrong while getting sonarr settings. Is the database file locked?',
      );
      return { status: 'NOK', code: 0, message: err } as BasicResponseDto;
    }
  }

  public async getSonarrSetting(id: number) {
    try {
      return this.sonarrSettingsRepo.findOne({ where: { id: id } });
    } catch (err) {
      this.logger.error(
        `Something went wrong while getting sonarr setting ${id}. Is the database file locked?`,
      );
      return { status: 'NOK', code: 0, message: err } as BasicResponseDto;
    }
  }

  public async removeTautulliSetting() {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.saveSettings({
        ...settingsDb,
        tautulli_url: null,
        tautulli_api_key: null,
      });

      this.tautulli_url = null;
      this.tautulli_api_key = null;
      this.tautulli.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error removing Tautulli settings: ', e);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async updateTautulliSetting(
    settings: TautulliSetting,
  ): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.saveSettings({
        ...settingsDb,
        tautulli_url: settings.url,
        tautulli_api_key: settings.api_key,
      });

      this.tautulli_url = settings.url;
      this.tautulli_api_key = settings.api_key;
      this.tautulli.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error while updating Tautulli settings: ', e);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async removeOverseerrSetting() {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.saveSettings({
        ...settingsDb,
        overseerr_url: null,
        overseerr_api_key: null,
      });

      this.overseerr_url = null;
      this.overseerr_api_key = null;
      this.overseerr.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error removing Overseerr settings: ', e);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async updateOverseerrSetting(
    settings: OverseerrSetting,
  ): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.saveSettings({
        ...settingsDb,
        overseerr_url: settings.url,
        overseerr_api_key: settings.api_key,
      });

      this.overseerr_url = settings.url;
      this.overseerr_api_key = settings.api_key;
      this.overseerr.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error while updating Overseerr settings: ', e);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  /**
   * Test connection to a Jellyfin server
   */
  public async testJellyfin(settings: JellyfinSetting): Promise<
    BasicResponseDto & {
      serverName?: string;
      version?: string;
      users?: Array<{ id: string; name: string }>;
    }
  > {
    const result = await this.mediaServerFactory.testJellyfinConnection(
      settings.jellyfin_url,
      settings.jellyfin_api_key,
    );

    if (result.success) {
      return {
        status: 'OK',
        code: 1,
        message: `Connected to ${result.serverName}`,
        serverName: result.serverName,
        version: result.version,
        users: result.users,
      };
    } else {
      return {
        status: 'NOK',
        code: 0,
        message: result.error || 'Connection failed',
      };
    }
  }

  /**
   * Save Jellyfin settings and initialize the service
   */
  public async saveJellyfinSettings(
    settings: JellyfinSetting,
  ): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      // Test connection - block save on failure
      const testResult = await this.testJellyfin(settings);
      if (testResult.code !== 1) {
        return {
          status: 'NOK',
          code: 0,
          message: testResult.message || 'Connection test failed',
        };
      }

      // Auto-detect admin user if not provided
      let userId = settings.jellyfin_user_id;
      if (!userId) {
        userId = await this.autoDetectJellyfinAdminUser(settings);
        if (userId) {
          this.logger.log(`Auto-detected Jellyfin admin user ID: ${userId}`);
        } else {
          this.logger.warn(
            'Could not auto-detect Jellyfin admin user. Some features may not work correctly.',
          );
        }
      }

      // Validate selected user is an admin when provided
      if (userId && testResult.users && testResult.users.length > 0) {
        const selectedUser = testResult.users.find((u) => u.id === userId);
        if (!selectedUser) {
          return {
            status: 'NOK',
            code: 0,
            message:
              'Selected Jellyfin user must be an admin. Please re-test connection and select a valid admin.',
          };
        }
      }

      await this.saveSettings({
        ...settingsDb,
        jellyfin_url: settings.jellyfin_url,
        jellyfin_api_key: settings.jellyfin_api_key,
        jellyfin_user_id: userId || null,
        jellyfin_server_name: testResult.serverName || null,
        media_server_type: MediaServerType.JELLYFIN,
      });

      // Uninitialize service so it reinitializes with new credentials on next use
      this.mediaServerFactory.uninitializeServer(MediaServerType.JELLYFIN);

      this.jellyfin_url = settings.jellyfin_url;
      this.jellyfin_api_key = settings.jellyfin_api_key;
      this.jellyfin_user_id = userId;
      this.jellyfin_server_name = testResult.serverName;
      this.media_server_type = MediaServerType.JELLYFIN;

      this.logger.log('Jellyfin settings saved successfully');
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error while saving Jellyfin settings: ', e);
      const message =
        e instanceof Error ? e.message : 'Failed to save settings';
      return { status: 'NOK', code: 0, message };
    }
  }

  /**
   * Auto-detect an admin user from Jellyfin
   */
  private async autoDetectJellyfinAdminUser(
    settings: Pick<JellyfinSetting, 'jellyfin_url' | 'jellyfin_api_key'>,
  ): Promise<string | undefined> {
    try {
      const { Jellyfin } = await import('@jellyfin/sdk');
      const { getUserApi } =
        await import('@jellyfin/sdk/lib/utils/api/index.js');

      const jellyfin = new Jellyfin({
        clientInfo: { name: 'Maintainerr', version: '2.0.0' },
        deviceInfo: {
          name: 'Maintainerr-AutoDetect',
          id: 'maintainerr-detect',
        },
      });

      const api = jellyfin.createApi(
        settings.jellyfin_url,
        settings.jellyfin_api_key,
      );

      const response = await getUserApi(api).getUsers();
      const users = response.data || [];

      // Find first admin user
      const adminUser = users.find((user) => user.Policy?.IsAdministrator);
      if (adminUser?.Id) {
        this.logger.debug(
          `Found Jellyfin admin user: ${adminUser.Name} (${adminUser.Id})`,
        );
        return adminUser.Id;
      }

      return undefined;
    } catch (error) {
      this.logger.error('Failed to auto-detect Jellyfin admin user: ', error);
      return undefined;
    }
  }

  /**
   * Remove Jellyfin settings
   */
  public async removeJellyfinSettings(): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.saveSettings({
        ...settingsDb,
        jellyfin_url: null,
        jellyfin_api_key: null,
        jellyfin_user_id: null,
        jellyfin_server_name: null,
      });

      // Uninitialize service to clear credentials
      this.mediaServerFactory.uninitializeServer(MediaServerType.JELLYFIN);

      this.jellyfin_url = undefined;
      this.jellyfin_api_key = undefined;
      this.jellyfin_user_id = undefined;
      this.jellyfin_server_name = undefined;

      this.logger.log('Jellyfin settings cleared');
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error removing Jellyfin settings: ', e);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async addSonarrSetting(
    settings: Omit<SonarrSettings, 'id' | 'collections'>,
  ): Promise<SonarrSettingResponseDto> {
    try {
      settings.url = settings.url.toLowerCase();

      const savedSetting = await this.sonarrSettingsRepo.save(settings);

      this.logger.log('Sonarr setting added');
      return {
        data: savedSetting,
        status: 'OK',
        code: 1,
        message: 'Success',
      };
    } catch (e) {
      this.logger.error('Error while adding Sonarr setting: ', e);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public async updateSonarrSetting(
    settings: Omit<SonarrSettings, 'collections'>,
  ): Promise<SonarrSettingResponseDto> {
    try {
      settings.url = settings.url.toLowerCase();

      const settingsDb = await this.sonarrSettingsRepo.findOne({
        where: { id: settings.id },
      });

      const data = {
        ...settingsDb,
        ...settings,
      };

      await this.sonarrSettingsRepo.save(data);

      this.servarr.deleteCachedSonarrApiClient(settings.id);

      this.logger.log('Sonarr settings updated');
      return { data, status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error while updating Sonarr settings: ', e);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public async deleteSonarrSetting(
    id: number,
  ): Promise<DeleteSonarrSettingResponseDto> {
    try {
      const settingsDb = await this.sonarrSettingsRepo.findOne({
        where: { id: id },
        relations: ['collections'],
      });

      if (settingsDb.collections.length > 0) {
        return {
          status: 'NOK',
          code: 0,
          message: 'Cannot delete setting with associated collections',
          data: {
            collectionsInUse: settingsDb.collections,
          },
        };
      }

      await this.sonarrSettingsRepo.delete({
        id,
      });
      this.servarr.deleteCachedSonarrApiClient(id);

      this.logger.log('Sonarr settings deleted');
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error while deleting Sonarr setting: ', e);
      return { status: 'NOK', code: 0, message: 'Failure', data: null };
    }
  }

  public async deletePlexApiAuth(): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.settingsRepo.update(
        {
          id: settingsDb.id,
        },
        { plex_auth_token: null },
      );

      this.plex_auth_token = null;
      this.plexApi.uninitialize();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (err) {
      this.logger.error(
        'Something went wrong while deleting the Plex auth token',
        err,
      );
      return { status: 'NOK', code: 0, message: err };
    }
  }

  public async savePlexApiAuthToken(plex_auth_token: string) {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.settingsRepo.update(
        {
          id: settingsDb.id,
        },
        {
          plex_auth_token: plex_auth_token,
        },
      );

      this.plex_auth_token = plex_auth_token;

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error while updating Plex auth token: ', e);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async patchSettings(
    settings: Partial<Settings>,
  ): Promise<BasicResponseDto> {
    const settingsDb = await this.settingsRepo.findOne({ where: {} });

    if (!settingsDb) {
      this.logger.error('Settings could not be loaded for partial update.');
      return {
        status: 'NOK',
        code: 0,
        message: 'No settings found to update',
      };
    }

    const mergedSettings: Settings = {
      ...settingsDb,
      ...settings,
    };

    return this.updateSettings(mergedSettings);
  }

  private async saveSettings(settings: Settings): Promise<Settings> {
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

  public async updateSettings(settings: Settings): Promise<BasicResponseDto> {
    if (
      !this.cronIsValid(settings.collection_handler_job_cron) ||
      !this.cronIsValid(settings.rules_handler_job_cron)
    ) {
      this.logger.error(
        'Invalid CRON configuration found, settings update aborted.',
      );
      return {
        status: 'NOK',
        code: 0,
        message: 'Update failed, invalid CRON value was found',
      };
    }

    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      settings.plex_hostname = settings.plex_hostname?.toLowerCase();
      settings.overseerr_url = settings.overseerr_url?.toLowerCase();
      settings.tautulli_url = settings.tautulli_url?.toLowerCase();
      settings.plex_ssl =
        settings.plex_hostname?.includes('https://') ||
        settings.plex_port == 443
          ? 1
          : 0;
      settings.plex_hostname = settings.plex_hostname
        ?.replace('https://', '')
        ?.replace('http://', '');

      await this.saveSettings({
        ...settingsDb,
        ...settings,
      });

      await this.init();
      this.logger.log('Settings updated');
      await this.plexApi.initialize();
      this.overseerr.init();
      this.tautulli.init();
      this.internalApi.init();
      this.jellyseerr.init();

      // reload Collection handler job if changed
      if (
        settingsDb.collection_handler_job_cron !==
        settings.collection_handler_job_cron
      ) {
        this.logger.log(
          `Collection Handler cron schedule changed.. Reloading job.`,
        );
        await this.internalApi
          .getApi()
          .put(
            '/collections/schedule/update',
            `{"schedule": "${settings.collection_handler_job_cron}"}`,
          );
      }

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error while updating settings: ', e);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public generateApiKey(): string {
    return Buffer.from(`Maintainerr${Date.now()}${randomUUID()})`).toString(
      'base64',
    );
  }

  public async testOverseerr(
    setting?: OverseerrSetting,
  ): Promise<BasicResponseDto> {
    return await this.overseerr.testConnection(
      setting
        ? {
            apiKey: setting.api_key,
            url: setting.url,
          }
        : undefined,
    );
  }

  public async testJellyseerr(
    setting?: JellyseerrSetting,
  ): Promise<BasicResponseDto> {
    return await this.jellyseerr.testConnection(
      setting
        ? {
            apiKey: setting.api_key,
            url: setting.url,
          }
        : undefined,
    );
  }

  public async removeJellyseerrSetting() {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.saveSettings({
        ...settingsDb,
        jellyseerr_url: null,
        jellyseerr_api_key: null,
      });

      this.jellyseerr_url = null;
      this.jellyseerr_api_key = null;
      this.jellyseerr.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error removing Jellyseerr settings: ', e);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async updateJellyseerrSetting(
    settings: JellyseerrSetting,
  ): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.saveSettings({
        ...settingsDb,
        jellyseerr_url: settings.url,
        jellyseerr_api_key: settings.api_key,
      });

      this.jellyseerr_url = settings.url;
      this.jellyseerr_api_key = settings.api_key;
      this.jellyseerr.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error('Error while updating Jellyseerr settings: ', e);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async testTautulli(
    setting?: TautulliSetting,
  ): Promise<BasicResponseDto> {
    if (setting) {
      return await this.tautulli.testConnection({
        apiKey: setting.api_key,
        url: setting.url,
      });
    }

    try {
      const resp = await this.tautulli.info();
      return resp?.response && resp?.response.result == 'success'
        ? {
            status: 'OK',
            code: 1,
            message: resp.response.data?.tautulli_version,
          }
        : { status: 'NOK', code: 0, message: 'Failure' };
    } catch (e) {
      this.logger.debug(e);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public async testRadarr(
    id: number | RadarrSettingRawDto,
  ): Promise<BasicResponseDto> {
    try {
      const apiClient = await this.servarr.getRadarrApiClient(id);

      const resp = await apiClient.info();
      //Make sure it's actually Radarr and not Sonarr
      if (resp?.appName && resp.appName.toLowerCase() !== 'radarr') {
        return {
          status: 'NOK',
          code: 0,
          message: `Unexpected application name returned: ${resp.appName}`,
        };
      }
      return resp?.version != null
        ? { status: 'OK', code: 1, message: resp.version }
        : { status: 'NOK', code: 0, message: 'Failure' };
    } catch (e) {
      this.logger.debug(e);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public async testSonarr(
    id: number | SonarrSettingRawDto,
  ): Promise<BasicResponseDto> {
    try {
      const apiClient = await this.servarr.getSonarrApiClient(id);

      const resp = await apiClient.info();
      //Make sure it's actually Sonarr and not Radarr
      if (resp?.appName && resp.appName.toLowerCase() !== 'sonarr') {
        return {
          status: 'NOK',
          code: 0,
          message: `Unexpected application name returned: ${resp.appName}`,
        };
      }
      return resp?.version != null
        ? { status: 'OK', code: 1, message: resp.version }
        : { status: 'NOK', code: 0, message: 'Failure' };
    } catch (e) {
      this.logger.debug(e);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public async testPlex(): Promise<any> {
    try {
      const resp = await this.plexApi.getStatus();
      return resp?.version != null
        ? { status: 'OK', code: 1, message: resp.version }
        : { status: 'NOK', code: 0, message: 'Failure' };
    } catch (e) {
      this.logger.debug(e);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public async testMediaServerConnection(): Promise<boolean> {
    if (!this.media_server_type) {
      return false;
    }

    switch (this.media_server_type) {
      case MediaServerType.JELLYFIN: {
        if (!this.jellyfin_url || !this.jellyfin_api_key) {
          return false;
        }

        return (
          (
            await this.testJellyfin({
              jellyfin_url: this.jellyfin_url,
              jellyfin_api_key: this.jellyfin_api_key,
              jellyfin_user_id: this.jellyfin_user_id,
            })
          ).status === 'OK'
        );
      }
      case MediaServerType.PLEX:
        return (await this.testPlex()).status === 'OK';
      default:
        return false;
    }
  }

  // Test if all configured applications are reachable. Media server is required.
  public async testConnections(): Promise<boolean> {
    try {
      // If no media server type is configured, connections cannot be tested
      if (!this.media_server_type) {
        return false;
      }

      const mediaServerState = await this.testMediaServerConnection();

      let radarrState = true;
      let sonarrState = true;
      let overseerrState = true;
      let tautulliState = true;
      let jellyseerrState = true;

      const radarrSettings = await this.radarrSettingsRepo.find();
      for (const radarrSetting of radarrSettings) {
        radarrState =
          (await this.testRadarr(radarrSetting.id)).status === 'OK' &&
          radarrState;
      }

      const sonarrSettings = await this.sonarrSettingsRepo.find();
      for (const sonarrSetting of sonarrSettings) {
        sonarrState =
          (await this.testSonarr(sonarrSetting.id)).status === 'OK' &&
          sonarrState;
      }

      if (this.overseerrConfigured()) {
        overseerrState = (await this.testOverseerr()).status === 'OK';
      }

      if (this.tautulliConfigured()) {
        tautulliState = (await this.testTautulli()).status === 'OK';
      }

      if (this.jellyseerrConfigured()) {
        jellyseerrState = (await this.testJellyseerr()).status === 'OK';
      }

      if (
        mediaServerState &&
        radarrState &&
        sonarrState &&
        overseerrState &&
        tautulliState &&
        jellyseerrState
      ) {
        return true;
      } else {
        return false;
      }
    } catch (e) {
      this.logger.debug(e);
      return false;
    }
  }

  public overseerrConfigured(): boolean {
    return this.overseerr_url !== null && this.overseerr_api_key !== null;
  }

  public tautulliConfigured(): boolean {
    return this.tautulli_url !== null && this.tautulli_api_key !== null;
  }

  public jellyseerrConfigured(): boolean {
    return this.jellyseerr_url !== null && this.jellyseerr_api_key !== null;
  }

  /**
   * Get the current media server type
   */
  public getMediaServerType(): MediaServerType | null {
    return (this.media_server_type as MediaServerType) || null;
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

  // Test if all required settings are set.
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
    } catch (e) {
      this.logger.debug(e);
      return false;
    }
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

  public async getPlexServers() {
    return await this.plexApi.getAvailableServers();
  }
}
