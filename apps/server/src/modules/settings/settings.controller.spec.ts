import { StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { DatabaseDownloadService } from './database-download.service';
import { Settings } from './entities/settings.entities';
import { MediaServerSwitchService } from './media-server-switch.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  let controller: SettingsController;

  const settingsService = {
    getSettings: jest.fn(),
    getPublicSettings: jest.fn(),
    cronIsValid: jest.fn(),
    updateRadarrSetting: jest.fn(),
    updateSonarrSetting: jest.fn(),
    saveJellyfinSettings: jest.fn(),
    testJellyfin: jest.fn(),
    removeJellyfinSettings: jest.fn(),
  } as unknown as jest.Mocked<SettingsService>;

  const mediaServerSwitchService = {
    previewSwitch: jest.fn(),
    executeSwitch: jest.fn(),
  } as unknown as jest.Mocked<MediaServerSwitchService>;

  const databaseDownloadService = {
    getDatabaseDownload: jest.fn(),
  } as unknown as jest.Mocked<DatabaseDownloadService>;

  const createSettings = (overrides: Partial<Settings> = {}): Settings =>
    Object.assign(new Settings(), {
      tautulli_api_key: null,
      tautulli_url: null,
      jellyseerr_api_key: null,
      jellyseerr_url: null,
      overseerr_api_key: null,
      overseerr_url: null,
      jellyfin_url: null,
      jellyfin_api_key: null,
      jellyfin_user_id: null,
      ...overrides,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SettingsController(
      settingsService,
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
        name: 'Jellyseerr',
        method: 'getJellyseerrSetting' as const,
        entityOverrides: {
          jellyseerr_url: 'http://jellyseerr.local',
          jellyseerr_api_key: 'jellyseerr-key',
        },
        expected: {
          api_key: 'jellyseerr-key',
          url: 'http://jellyseerr.local',
        },
      },
      {
        name: 'Overseerr',
        method: 'getOverseerrSetting' as const,
        entityOverrides: {
          overseerr_url: 'http://overseerr.local',
          overseerr_api_key: 'overseerr-key',
        },
        expected: {
          api_key: 'overseerr-key',
          url: 'http://overseerr.local',
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
    ])(
      'maps $name settings from entity values',
      async ({ method, entityOverrides, expected }) => {
        settingsService.getSettings.mockResolvedValue(
          createSettings(entityOverrides),
        );

        await expect(controller[method]()).resolves.toEqual(expected);
      },
    );

    it.each([
      { name: 'Tautulli', method: 'getTautulliSetting' as const },
      { name: 'Jellyseerr', method: 'getJellyseerrSetting' as const },
      { name: 'Overseerr', method: 'getOverseerrSetting' as const },
      { name: 'Jellyfin', method: 'getJellyfinSetting' as const },
    ])(
      'passes through non-entity response for $name settings',
      async ({ method }) => {
        const response = {
          status: 'NOK' as const,
          code: 0 as const,
          message: 'settings not found',
        };
        settingsService.getSettings.mockResolvedValue(response);

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

      expect(settingsService[serviceMethod]).toHaveBeenCalledWith({
        id,
        ...payload,
      });
    },
  );
});
