import {
  embyLoginRequestSchema,
  radarrSettingSchema,
} from '@maintainerr/contracts';
import { StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { ZodValidationPipe } from 'nestjs-zod';
import { DatabaseDownloadService } from './database-download.service';
import { Settings } from './entities/settings.entities';
import { MediaServerSwitchService } from './media-server-switch.service';
import { MetadataSettingsService } from './metadata-settings.service';
import { SettingsController } from './settings.controller';
import { SettingsOperationsService } from './settings-operations.service';
import { SettingsDataService } from './settings-data.service';

describe('SettingsController', () => {
  let controller: SettingsController;

  const settingsOperationsService = {
    getSettings: jest.fn(),
    getPublicSettings: jest.fn(),
    cronIsValid: jest.fn(),
    updateRadarrSetting: jest.fn(),
    updateSonarrSetting: jest.fn(),
    saveJellyfinSettings: jest.fn(),
    testJellyfin: jest.fn(),
    testPlex: jest.fn(),
    testPlexAuthToken: jest.fn(),
    removeJellyfinSettings: jest.fn(),
    testKodi: jest.fn(),
    saveKodiSettings: jest.fn(),
    removeKodiSettings: jest.fn(),
  } as unknown as jest.Mocked<SettingsOperationsService>;

  const settingsDataService = {
    media_server_type: undefined,
  } as unknown as jest.Mocked<SettingsDataService>;

  const mediaServerSwitchService = {
    previewSwitch: jest.fn(),
    executeSwitch: jest.fn(),
  } as unknown as jest.Mocked<MediaServerSwitchService>;

  const metadataSettingsService = {
    updateTmdbSetting: jest.fn(),
    removeTmdbSetting: jest.fn(),
    testTmdb: jest.fn(),
    updateTvdbSetting: jest.fn(),
    removeTvdbSetting: jest.fn(),
    testTvdb: jest.fn(),
    updateMetadataProviderPreference: jest.fn(),
  } as unknown as jest.Mocked<MetadataSettingsService>;

  const databaseDownloadService = {
    getDatabaseDownload: jest.fn(),
  } as unknown as jest.Mocked<DatabaseDownloadService>;

  const createSettings = (overrides: Partial<Settings> = {}): Settings =>
    Object.assign(new Settings(), {
      tautulli_api_key: null,
      tautulli_url: null,
      seerr_api_key: null,
      seerr_url: null,
      jellyfin_url: null,
      jellyfin_api_key: null,
      jellyfin_user_id: null,
      kodi_url: null,
      kodi_username: null,
      kodi_password: null,
      ...overrides,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SettingsController(
      settingsOperationsService,
      settingsDataService,
      metadataSettingsService,
      mediaServerSwitchService,
      databaseDownloadService,
    );
  });

  describe('settings endpoint field mapping', () => {
    it.each([
      {
        name: 'Tautulli',
        method: 'getTautulliSetting' as const,
        entityOverrides: {
          tautulli_url: 'http://tautulli.local',
          tautulli_api_key: 'tautulli-key',
        },
        expected: {
          api_key: 'tautulli-key',
          url: 'http://tautulli.local',
        },
      },
      {
        name: 'Seerr',
        method: 'getSeerrSetting' as const,
        entityOverrides: {
          seerr_url: 'http://seerr.local',
          seerr_api_key: 'seerr-key',
        },
        expected: {
          api_key: 'seerr-key',
          url: 'http://seerr.local',
        },
      },
      {
        name: 'Jellyfin',
        method: 'getJellyfinSetting' as const,
        entityOverrides: {
          jellyfin_url: 'http://jellyfin.local:8096',
          jellyfin_api_key: 'jf-key',
          jellyfin_user_id: 'u-1',
        },
        expected: {
          jellyfin_url: 'http://jellyfin.local:8096',
          jellyfin_api_key: 'jf-key',
          jellyfin_user_id: 'u-1',
        },
      },
      {
        name: 'Kodi',
        method: 'getKodiSetting' as const,
        entityOverrides: {
          kodi_url: 'http://kodi.local:8080',
          kodi_username: 'kodi',
          kodi_password: 'secret',
        },
        expected: {
          kodi_url: 'http://kodi.local:8080',
          kodi_username: 'kodi',
          kodi_password: 'secret',
        },
      },
    ])(
      'maps $name settings from entity values',
      async ({ method, entityOverrides, expected }) => {
        settingsOperationsService.getSettings.mockResolvedValue(
          createSettings(entityOverrides),
        );

        await expect(controller[method]()).resolves.toEqual(expected);
      },
    );

    it.each([
      { name: 'Tautulli', method: 'getTautulliSetting' as const },
      { name: 'Seerr', method: 'getSeerrSetting' as const },
      { name: 'Jellyfin', method: 'getJellyfinSetting' as const },
      { name: 'Kodi', method: 'getKodiSetting' as const },
    ])(
      'passes through non-entity response for $name settings',
      async ({ method }) => {
        const response = {
          status: 'NOK' as const,
          code: 0 as const,
          message: 'settings not found',
        };
        settingsOperationsService.getSettings.mockResolvedValue(response);

        await expect(controller[method]()).resolves.toEqual(response);
      },
    );
  });

  it('sets database download headers and returns streamable file', async () => {
    const fileStream = createReadStream('/etc/hosts');
    databaseDownloadService.getDatabaseDownload.mockResolvedValue({
      fileStream,
      fileName: 'maintainerr.db',
      fileSize: 1234,
    });

    const response = {
      setHeader: jest.fn(),
    } as unknown as Response;

    const result = await controller.downloadDatabase(response);

    expect(databaseDownloadService.getDatabaseDownload).toHaveBeenCalledTimes(
      1,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="maintainerr.db"',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', '1234');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it.each([
    {
      name: 'Radarr',
      method: 'updateRadarrSetting' as const,
      serviceMethod: 'updateRadarrSetting' as const,
      id: 9,
      payload: {
        url: 'http://radarr.local',
        apiKey: 'key',
        serverName: 'radarr',
      },
    },
    {
      name: 'Sonarr',
      method: 'updateSonarrSetting' as const,
      serviceMethod: 'updateSonarrSetting' as const,
      id: 11,
      payload: {
        url: 'http://sonarr.local',
        apiKey: 'key',
        serverName: 'sonarr',
      },
    },
  ])(
    'merges route id into $name update payload',
    async ({ method, serviceMethod, id, payload }) => {
      await controller[method](id, payload);

      expect(settingsOperationsService[serviceMethod]).toHaveBeenCalledWith({
        id,
        ...payload,
      });
    },
  );

  it('rejects invalid Radarr URLs with the shared Zod schema', () => {
    const pipe = new ZodValidationPipe(radarrSettingSchema);

    expect(() =>
      pipe.transform(
        {
          serverName: 'radarr',
          url: 'radarr.local',
          apiKey: 'key',
        },
        {
          type: 'body',
          metatype: Object,
          data: '',
        },
      ),
    ).toThrow('Validation failed');
  });

  it('rejects invalid Emby login requests with the shared Zod schema', () => {
    const pipe = new ZodValidationPipe(embyLoginRequestSchema);

    expect(() =>
      pipe.transform(
        {
          emby_url: 'emby.local',
          username: 'admin',
          password: 'secret',
        },
        {
          type: 'body',
          metatype: Object,
          data: '',
        },
      ),
    ).toThrow('Validation failed');
  });

  it('delegates Plex connectivity testing to the settings service', async () => {
    settingsOperationsService.testPlex.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: '1.0.0',
    });

    await expect(controller.testPlex()).resolves.toEqual({
      status: 'OK',
      code: 1,
      message: '1.0.0',
    });

    expect(settingsOperationsService.testPlex).toHaveBeenCalledTimes(1);
  });

  it('delegates Plex auth validation to the settings service', async () => {
    settingsOperationsService.testPlexAuthToken.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Success',
    });

    await expect(controller.testPlexAuth()).resolves.toEqual({
      status: 'OK',
      code: 1,
      message: 'Success',
    });

    expect(settingsOperationsService.testPlexAuthToken).toHaveBeenCalledTimes(
      1,
    );
  });

  it('delegates Kodi connectivity testing to the settings service', async () => {
    const payload = {
      kodi_url: 'http://kodi.local:8080',
      kodi_username: 'kodi',
      kodi_password: 'secret',
    };
    settingsOperationsService.testKodi.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Success',
    });

    await expect(controller.testKodi(payload)).resolves.toEqual({
      status: 'OK',
      code: 1,
      message: 'Success',
    });

    expect(settingsOperationsService.testKodi).toHaveBeenCalledTimes(1);
    expect(settingsOperationsService.testKodi).toHaveBeenCalledWith(payload);
  });

  it('delegates saving Kodi settings to the settings service', async () => {
    const payload = {
      kodi_url: 'http://kodi.local:8080',
      kodi_username: 'kodi',
      kodi_password: 'secret',
    };
    settingsOperationsService.saveKodiSettings.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Success',
    });

    await expect(controller.saveKodiSettings(payload)).resolves.toEqual({
      status: 'OK',
      code: 1,
      message: 'Success',
    });

    expect(settingsOperationsService.saveKodiSettings).toHaveBeenCalledTimes(1);
    expect(settingsOperationsService.saveKodiSettings).toHaveBeenCalledWith(
      payload,
    );
  });

  it('delegates removing Kodi settings to the settings service', async () => {
    settingsOperationsService.removeKodiSettings.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Success',
    });

    await expect(controller.removeKodiSettings()).resolves.toEqual({
      status: 'OK',
      code: 1,
      message: 'Success',
    });

    expect(settingsOperationsService.removeKodiSettings).toHaveBeenCalledTimes(
      1,
    );
  });
});
