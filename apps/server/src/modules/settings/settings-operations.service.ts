import {
  BasicResponseDto,
  EmbySetting,
  JellyfinSetting,
  MediaServerType,
  SeerrSetting,
  StreamystatsSetting,
  TautulliSetting,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  formatConnectionFailureMessage,
  getErrorMessage,
  logConnectionTestError,
} from '../../utils/connection-error';
import { InternalApiService } from '../api/internal-api/internal-api.service';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { StreamystatsApiService } from '../api/streamystats-api/streamystats-api.service';
import { TautulliApiService } from '../api/tautulli-api/tautulli-api.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsDataService } from './settings-data.service';
import {
  DeleteRadarrSettingResponseDto,
  RadarrSettingRawDto,
  RadarrSettingResponseDto,
} from "./dto's/radarr-setting.dto";
import {
  DeleteSonarrSettingResponseDto,
  SonarrSettingRawDto,
  SonarrSettingResponseDto,
} from "./dto's/sonarr-setting.dto";
import { RadarrSettings } from './entities/radarr_settings.entities';
import { Settings } from './entities/settings.entities';
import { SonarrSettings } from './entities/sonarr_settings.entities';

@Injectable()
export class SettingsOperationsService {
  constructor(
    private readonly settingsDataService: SettingsDataService,
    private readonly plexApi: PlexApiService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly servarr: ServarrService,
    private readonly seerr: SeerrApiService,
    private readonly tautulli: TautulliApiService,
    private readonly streamystats: StreamystatsApiService,
    private readonly internalApi: InternalApiService,
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
    @InjectRepository(RadarrSettings)
    private readonly radarrSettingsRepo: Repository<RadarrSettings>,
    @InjectRepository(SonarrSettings)
    private readonly sonarrSettingsRepo: Repository<SonarrSettings>,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SettingsOperationsService.name);
  }

  // ==========================================================================
  // Read API — delegated to the passive settings store
  // ==========================================================================

  public init() {
    return this.settingsDataService.init();
  }

  public getSettings() {
    return this.settingsDataService.getSettings();
  }

  public getPublicSettings() {
    return this.settingsDataService.getPublicSettings();
  }

  public getMediaServerType(): MediaServerType | null {
    return this.settingsDataService.getMediaServerType();
  }

  public seerrConfigured(): boolean {
    return this.settingsDataService.seerrConfigured();
  }

  public tautulliConfigured(): boolean {
    return this.settingsDataService.tautulliConfigured();
  }

  public getRadarrSettings() {
    return this.settingsDataService.getRadarrSettings();
  }

  public getRadarrSetting(id: number) {
    return this.settingsDataService.getRadarrSetting(id);
  }

  public getSonarrSettings() {
    return this.settingsDataService.getSonarrSettings();
  }

  public getSonarrSetting(id: number) {
    return this.settingsDataService.getSonarrSetting(id);
  }

  public getRadarrSettingsCount(): Promise<number> {
    return this.settingsDataService.getRadarrSettingsCount();
  }

  public getSonarrSettingsCount(): Promise<number> {
    return this.settingsDataService.getSonarrSettingsCount();
  }

  public generateApiKey(): string {
    return this.settingsDataService.generateApiKey();
  }

  public appVersion(): string {
    return this.settingsDataService.appVersion();
  }

  public cronIsValid(schedule: string) {
    return this.settingsDataService.cronIsValid(schedule);
  }

  public async updatePlexConnectionDetails(
    details: Partial<
      Pick<
        Settings,
        | 'plex_hostname'
        | 'plex_port'
        | 'plex_ssl'
        | 'plex_machine_id'
        | 'plex_manual_mode'
      >
    >,
  ): Promise<void> {
    return this.settingsDataService.updatePlexConnectionDetails(details);
  }

  // ==========================================================================
  // Coordination — test / save / reinit flows
  // ==========================================================================

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
    } catch (error) {
      this.logger.error('Error while adding Radarr setting');
      this.logger.debug(error);
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
    } catch (error) {
      this.logger.error('Error while updating Radarr settings');
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public async deleteRadarrSetting(
    id: number,
  ): Promise<DeleteRadarrSettingResponseDto> {
    try {
      const settingsDb = await this.radarrSettingsRepo.findOne({
        where: { id: id },
        relations: { collections: true },
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
    } catch (error) {
      this.logger.error('Error while deleting Radarr setting');
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failure', data: null };
    }
  }

  public async removeTautulliSetting() {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.settingsDataService.saveSettings({
        ...settingsDb,
        tautulli_url: null,
        tautulli_api_key: null,
      });

      await this.settingsDataService.init();
      this.tautulli.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error('Error removing Tautulli settings');
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async updateTautulliSetting(
    settings: TautulliSetting,
  ): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.settingsDataService.saveSettings({
        ...settingsDb,
        tautulli_url: settings.url,
        tautulli_api_key: settings.api_key,
      });

      await this.settingsDataService.init();
      this.tautulli.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error('Error while updating Tautulli settings');
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async removeStreamystatsSetting() {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.settingsDataService.saveSettings({
        ...settingsDb,
        streamystats_url: null,
      });

      await this.settingsDataService.init();
      this.streamystats.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error('Error removing Streamystats settings');
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async updateStreamystatsSetting(
    settings: StreamystatsSetting,
  ): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.settingsDataService.saveSettings({
        ...settingsDb,
        streamystats_url: settings.url,
      });

      await this.settingsDataService.init();
      this.streamystats.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error('Error while updating Streamystats settings');
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async removeSeerrSetting() {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.settingsDataService.saveSettings({
        ...settingsDb,
        seerr_url: null,
        seerr_api_key: null,
      });

      await this.settingsDataService.init();
      this.seerr.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error('Error removing Seerr settings');
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async updateSeerrSetting(
    settings: SeerrSetting,
  ): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.settingsDataService.saveSettings({
        ...settingsDb,
        seerr_url: settings.url,
        seerr_api_key: settings.api_key,
      });

      await this.settingsDataService.init();
      this.seerr.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error('Error while updating Seerr settings');
      this.logger.debug(error);
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
    try {
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
      }

      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          result.error,
          'Failed to connect to Jellyfin. Verify URL and API key.',
        ),
      };
    } catch (error) {
      logConnectionTestError(this.logger, 'Jellyfin');
      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to Jellyfin. Verify URL and API key.',
        ),
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

      await this.settingsDataService.saveSettings({
        ...settingsDb,
        jellyfin_url: settings.jellyfin_url,
        jellyfin_api_key: settings.jellyfin_api_key,
        jellyfin_user_id: userId || null,
        jellyfin_server_name: testResult.serverName || null,
        media_server_type: MediaServerType.JELLYFIN,
      });

      // Uninitialize service so it reinitializes with new credentials on next use
      this.mediaServerFactory.uninitializeServer(MediaServerType.JELLYFIN);

      await this.settingsDataService.init();

      // Streamystats uses the Jellyfin API key + server identity. Re-init so
      // the cached client and resolved serverId track the new credentials.
      this.streamystats.init();

      this.logger.log('Jellyfin settings saved successfully');
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error('Error while saving Jellyfin settings');
      this.logger.debug(error);
      const message =
        error instanceof Error ? error.message : 'Failed to save settings';
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
      this.logger.error('Failed to auto-detect Jellyfin admin user');
      this.logger.debug(error);
      return undefined;
    }
  }

  /**
   * Remove Jellyfin settings
   */
  public async removeJellyfinSettings(): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      // Streamystats can't authenticate without Jellyfin credentials; clear
      // its URL alongside Jellyfin so we don't leave a half-configured state.
      await this.settingsDataService.saveSettings({
        ...settingsDb,
        jellyfin_url: null,
        jellyfin_api_key: null,
        jellyfin_user_id: null,
        jellyfin_server_name: null,
        streamystats_url: null,
      });

      // Uninitialize service to clear credentials
      this.mediaServerFactory.uninitializeServer(MediaServerType.JELLYFIN);

      await this.settingsDataService.init();
      this.streamystats.init();

      this.logger.log('Jellyfin settings cleared');
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error('Error removing Jellyfin settings');
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  // ==========================================================================
  // Emby
  // ==========================================================================

  /**
   * Test connection to an Emby server using the API-key flow.
   */
  public async testEmby(settings: EmbySetting): Promise<
    BasicResponseDto & {
      serverName?: string;
      version?: string;
      users?: Array<{ id: string; name: string }>;
    }
  > {
    try {
      const result = await this.mediaServerFactory.testEmbyConnection(
        settings.emby_url,
        settings.emby_api_key,
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
      }

      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          result.error,
          'Failed to connect to Emby. Verify URL and API key.',
        ),
      };
    } catch (error) {
      logConnectionTestError(this.logger, 'Emby');
      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to Emby. Verify URL and API key.',
        ),
      };
    }
  }

  /**
   * Authenticate against Emby with admin username/password and return the
   * library/user lists for the post-login confirmation step (Plex-style UX).
   */
  public async loginEmby(
    url: string,
    username: string,
    password: string,
  ): Promise<
    BasicResponseDto & {
      token?: string;
      userId?: string;
      serverName?: string;
      users?: Array<{ id: string; name: string }>;
      libraries?: Array<{ id: string; name: string; type: string }>;
    }
  > {
    try {
      const result = await this.mediaServerFactory.loginEmbyWithCredentials(
        url,
        username,
        password,
      );
      if (result.success) {
        return {
          status: 'OK',
          code: 1,
          message: `Authenticated against ${result.serverName ?? url}`,
          token: result.token,
          userId: result.userId,
          serverName: result.serverName,
          users: result.users,
          libraries: result.libraries,
        };
      }
      return {
        status: 'NOK',
        code: 0,
        message: result.error || 'Emby authentication failed',
      };
    } catch (error) {
      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to authenticate with Emby. Verify URL and credentials.',
        ),
      };
    }
  }

  /**
   * Save Emby settings and initialize the service.
   */
  public async saveEmbySettings(
    settings: EmbySetting,
  ): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      const testResult = await this.testEmby(settings);
      if (testResult.code !== 1) {
        return {
          status: 'NOK',
          code: 0,
          message: testResult.message || 'Connection test failed',
        };
      }

      // Validate selected user is an admin when provided
      const userId = settings.emby_user_id;
      if (userId && testResult.users && testResult.users.length > 0) {
        const selectedUser = testResult.users.find((u) => u.id === userId);
        if (!selectedUser) {
          return {
            status: 'NOK',
            code: 0,
            message:
              'Selected Emby user must be an admin. Re-test the connection and pick a valid admin.',
          };
        }
      }

      await this.settingsDataService.saveSettings({
        ...settingsDb,
        emby_url: settings.emby_url,
        emby_api_key: settings.emby_api_key,
        emby_user_id: userId || null,
        emby_server_name: testResult.serverName || null,
        media_server_type: MediaServerType.EMBY,
      });

      this.mediaServerFactory.uninitializeServer(MediaServerType.EMBY);

      await this.settingsDataService.init();

      this.logger.log('Emby settings saved successfully');
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error('Error while saving Emby settings');
      this.logger.debug(error);
      const message =
        error instanceof Error ? error.message : 'Failed to save settings';
      return { status: 'NOK', code: 0, message };
    }
  }

  /**
   * Remove Emby settings.
   */
  public async removeEmbySettings(): Promise<BasicResponseDto> {
    try {
      const settingsDb = await this.settingsRepo.findOne({ where: {} });

      await this.settingsDataService.saveSettings({
        ...settingsDb,
        emby_url: null,
        emby_api_key: null,
        emby_user_id: null,
        emby_server_name: null,
      });

      this.mediaServerFactory.uninitializeServer(MediaServerType.EMBY);

      await this.settingsDataService.init();

      this.logger.log('Emby settings cleared');
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error('Error removing Emby settings');
      this.logger.debug(error);
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
    } catch (error) {
      this.logger.error('Error while adding Sonarr setting');
      this.logger.debug(error);
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
    } catch (error) {
      this.logger.error('Error while updating Sonarr settings');
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public async deleteSonarrSetting(
    id: number,
  ): Promise<DeleteSonarrSettingResponseDto> {
    try {
      const settingsDb = await this.sonarrSettingsRepo.findOne({
        where: { id: id },
        relations: { collections: true },
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
    } catch (error) {
      this.logger.error('Error while deleting Sonarr setting');
      this.logger.debug(error);
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

      await this.settingsDataService.init();
      this.plexApi.uninitialize();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error(
        'Something went wrong while deleting the Plex auth token',
      );
      this.logger.debug(error);
      return {
        status: 'NOK',
        code: 0,
        message: getErrorMessage(error, 'Failed to delete the Plex auth token'),
      };
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

      await this.settingsDataService.init();

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error('Error while updating Plex auth token');
      this.logger.debug(error);
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

  private stripPlexProtocolPrefix(hostname: string | null | undefined) {
    if (!hostname) {
      return hostname;
    }

    if (hostname.startsWith('https://')) {
      return hostname.slice('https://'.length);
    }

    if (hostname.startsWith('http://')) {
      return hostname.slice('http://'.length);
    }

    return hostname;
  }

  private normalizePlexServerConnectionSettings({
    hostname,
    port,
  }: {
    hostname: string | null | undefined;
    port: number | null | undefined;
  }) {
    const normalizedHostnameInput = hostname?.trim().toLowerCase();
    const normalizedHostname = this.stripPlexProtocolPrefix(
      normalizedHostnameInput,
    );
    const normalizedSsl =
      normalizedHostnameInput?.startsWith('https://') || port === 443 ? 1 : 0;

    return {
      hostname: normalizedHostname,
      port,
      ssl: normalizedSsl,
    };
  }

  private isPlexServerSettingsUpdate(
    currentSettings: Settings,
    nextSettings: Settings,
  ): boolean {
    const currentMediaServerType =
      nextSettings.media_server_type ?? currentSettings.media_server_type;

    if (currentMediaServerType !== MediaServerType.PLEX) {
      return false;
    }

    const normalizedCurrent = this.normalizePlexServerConnectionSettings({
      hostname: currentSettings.plex_hostname,
      port: currentSettings.plex_port,
    });
    const normalizedNext = this.normalizePlexServerConnectionSettings({
      hostname: nextSettings.plex_hostname,
      port: nextSettings.plex_port,
    });

    return (
      currentSettings.plex_name !== nextSettings.plex_name ||
      normalizedCurrent.hostname !== normalizedNext.hostname ||
      normalizedCurrent.port !== normalizedNext.port ||
      normalizedCurrent.ssl !== normalizedNext.ssl
    );
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

      if (!settingsDb) {
        this.logger.error('Settings could not be loaded for update.');
        return {
          status: 'NOK',
          code: 0,
          message: 'No settings found to update',
        };
      }

      if (
        this.isPlexServerSettingsUpdate(settingsDb, settings) &&
        !settingsDb.plex_auth_token
      ) {
        return {
          status: 'NOK',
          code: 0,
          message: 'Authenticate with Plex before saving Plex server settings.',
        };
      }

      settings.seerr_url = settings.seerr_url?.toLowerCase();
      settings.tautulli_url = settings.tautulli_url?.toLowerCase();

      const normalizedPlexServerSettings =
        this.normalizePlexServerConnectionSettings({
          hostname: settings.plex_hostname,
          port: settings.plex_port,
        });

      settings.plex_hostname = normalizedPlexServerSettings.hostname;
      settings.plex_ssl = normalizedPlexServerSettings.ssl;

      await this.settingsDataService.saveSettings({
        ...settingsDb,
        ...settings,
      });

      await this.settingsDataService.init();
      this.logger.log('Settings updated');
      await this.mediaServerFactory.initialize();
      this.seerr.init();
      this.tautulli.init();
      this.internalApi.init();

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
    } catch (error) {
      this.logger.error('Error while updating settings');
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failure' };
    }
  }

  public async testSeerr(setting?: SeerrSetting): Promise<BasicResponseDto> {
    return await this.seerr.testConnection(
      setting
        ? {
            apiKey: setting.api_key,
            url: setting.url,
          }
        : undefined,
    );
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
    } catch (error) {
      logConnectionTestError(this.logger, 'Tautulli');
      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to Tautulli. Verify URL and API key.',
        ),
      };
    }
  }

  public async testStreamystats(
    setting?: StreamystatsSetting,
  ): Promise<BasicResponseDto> {
    if (setting) {
      // testConnection only hits Streamystats's unauthenticated /api/version
      // endpoint, so we deliberately do not send the stored Jellyfin API key
      // here. This avoids handing the stored credential to a URL the caller
      // just supplied via the test endpoint.
      return await this.streamystats.testConnection({
        url: setting.url,
      });
    }

    try {
      const info = await this.streamystats.info();
      return info?.currentVersion
        ? {
            status: 'OK',
            code: 1,
            message: info.currentVersion,
          }
        : { status: 'NOK', code: 0, message: 'Failure' };
    } catch (error) {
      logConnectionTestError(this.logger, 'Streamystats');
      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to Streamystats. Verify URL and that the service is running.',
        ),
      };
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
    } catch (error) {
      logConnectionTestError(this.logger, 'Radarr');
      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to Radarr. Verify URL and API key.',
        ),
      };
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
    } catch (error) {
      logConnectionTestError(this.logger, 'Sonarr');
      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to Sonarr. Verify URL and API key.',
        ),
      };
    }
  }

  public async testPlex(): Promise<BasicResponseDto> {
    if (!this.settingsDataService.plex_auth_token) {
      return {
        status: 'NOK',
        code: 0,
        message: 'Authenticate with Plex before testing the connection.',
      };
    }

    try {
      const resp = await this.plexApi.getStatus();
      return resp?.version != null
        ? { status: 'OK', code: 1, message: resp.version }
        : { status: 'NOK', code: 0, message: 'Failure' };
    } catch (error) {
      logConnectionTestError(this.logger, 'Plex');
      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to Plex. Verify host and credentials.',
        ),
      };
    }
  }

  public async testPlexAuthToken(): Promise<BasicResponseDto> {
    if (!this.settingsDataService.plex_auth_token) {
      return {
        status: 'NOK',
        code: 0,
        message: 'Authenticate with Plex before validating the connection.',
      };
    }

    try {
      const valid = await this.plexApi.validateAuthToken();

      return valid
        ? { status: 'OK', code: 1, message: 'Success' }
        : {
            status: 'NOK',
            code: 0,
            message:
              'Stored Plex credentials are invalid. Re-authenticate with Plex.',
          };
    } catch (error) {
      logConnectionTestError(this.logger, 'Plex auth');
      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Stored Plex credentials could not be validated. Re-authenticate with Plex.',
        ),
      };
    }
  }

  public async testMediaServerConnection(): Promise<boolean> {
    if (!this.settingsDataService.media_server_type) {
      return false;
    }

    switch (this.settingsDataService.media_server_type) {
      case MediaServerType.JELLYFIN: {
        if (
          !this.settingsDataService.jellyfin_url ||
          !this.settingsDataService.jellyfin_api_key
        ) {
          return false;
        }

        return (
          (
            await this.testJellyfin({
              jellyfin_url: this.settingsDataService.jellyfin_url,
              jellyfin_api_key: this.settingsDataService.jellyfin_api_key,
              jellyfin_user_id: this.settingsDataService.jellyfin_user_id,
            })
          ).status === 'OK'
        );
      }
      case MediaServerType.EMBY: {
        if (
          !this.settingsDataService.emby_url ||
          !this.settingsDataService.emby_api_key
        ) {
          return false;
        }
        return (
          (
            await this.testEmby({
              emby_url: this.settingsDataService.emby_url,
              emby_api_key: this.settingsDataService.emby_api_key,
              emby_user_id: this.settingsDataService.emby_user_id,
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
      if (!this.settingsDataService.media_server_type) {
        return false;
      }

      const [radarrSettings, sonarrSettings] = await Promise.all([
        this.radarrSettingsRepo.find(),
        this.sonarrSettingsRepo.find(),
      ]);

      const [
        mediaServerState,
        radarrResults,
        sonarrResults,
        seerrState,
        tautulliState,
      ] = await Promise.all([
        this.testMediaServerConnection(),
        Promise.all(
          radarrSettings.map((s) =>
            this.testRadarr(s.id).then((r) => r.status === 'OK'),
          ),
        ),
        Promise.all(
          sonarrSettings.map((s) =>
            this.testSonarr(s.id).then((r) => r.status === 'OK'),
          ),
        ),
        this.seerrConfigured()
          ? this.testSeerr().then((r) => r.status === 'OK')
          : true,
        this.tautulliConfigured()
          ? this.testTautulli().then((r) => r.status === 'OK')
          : true,
      ]);

      return (
        mediaServerState &&
        radarrResults.every(Boolean) &&
        sonarrResults.every(Boolean) &&
        seerrState &&
        tautulliState
      );
    } catch (error) {
      this.logger.debug(
        'Failed to verify external service connectivity',
        error,
      );
      return false;
    }
  }

  // Test if all required settings are set.
  public async testSetup(): Promise<boolean> {
    return this.settingsDataService.testSetup();
  }

  public async getPlexServers() {
    return await this.plexApi.getAvailableServers();
  }
}
