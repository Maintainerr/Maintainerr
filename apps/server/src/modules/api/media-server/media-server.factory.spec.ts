import { MediaServerType } from '@maintainerr/contracts';
import { ServiceUnavailableException } from '@nestjs/common';
import { MaintainerrLogger } from '../../logging/logs.service';
import { Settings } from '../../settings/entities/settings.entities';
import { MediaServerSwitchService } from '../../settings/media-server-switch.service';
import { SettingsService } from '../../settings/settings.service';
import { JellyfinAdapterService } from './jellyfin/jellyfin-adapter.service';
import { MediaServerFactory } from './media-server.factory';
import { PlexAdapterService } from './plex/plex-adapter.service';

describe('MediaServerFactory', () => {
  let factory: MediaServerFactory;
  const logger = {
    setContext: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
  } as unknown as jest.Mocked<MaintainerrLogger>;

  const settingsService = {
    getSettings: jest.fn(),
  } as unknown as jest.Mocked<SettingsService>;

  const mediaServerSwitchService = {
    isSwitching: jest.fn(),
  } as unknown as jest.Mocked<MediaServerSwitchService>;

  const plexAdapter = {
    isSetup: jest.fn(),
    initialize: jest.fn(),
    uninitialize: jest.fn(),
  } as unknown as jest.Mocked<PlexAdapterService>;

  const jellyfinAdapter = {
    isSetup: jest.fn(),
    initialize: jest.fn(),
    uninitialize: jest.fn(),
    testConnection: jest.fn(),
  } as unknown as jest.Mocked<JellyfinAdapterService>;

  const createSettings = (overrides: Partial<Settings> = {}): Settings =>
    Object.assign(new Settings(), {
      media_server_type: null,
      plex_hostname: null,
      plex_name: null,
      plex_port: null,
      plex_auth_token: null,
      jellyfin_url: null,
      jellyfin_api_key: null,
      ...overrides,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    factory = new MediaServerFactory(
      settingsService,
      mediaServerSwitchService,
      plexAdapter,
      jellyfinAdapter,
      logger,
    );

    mediaServerSwitchService.isSwitching.mockReturnValue(false);
    plexAdapter.isSetup.mockReturnValue(true);
    jellyfinAdapter.isSetup.mockReturnValue(true);
  });

  it('throws ServiceUnavailableException while switch is in progress', async () => {
    mediaServerSwitchService.isSwitching.mockReturnValue(true);

    await expect(factory.getService()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws when no media server type is configured', async () => {
    settingsService.getSettings.mockResolvedValue({
      status: 'NOK',
      code: 0,
      message: 'missing settings',
    });

    await expect(factory.getService()).rejects.toThrow(
      'No media server type configured',
    );
  });

  it('returns and initializes Jellyfin adapter when configured', async () => {
    settingsService.getSettings.mockResolvedValue(
      createSettings({ media_server_type: MediaServerType.JELLYFIN }),
    );
    jellyfinAdapter.isSetup
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const service = await factory.getService();

    expect(jellyfinAdapter.initialize).toHaveBeenCalledTimes(1);
    expect(service).toBe(jellyfinAdapter);
  });

  it('throws when Jellyfin remains uninitialized after initialize', async () => {
    settingsService.getSettings.mockResolvedValue(
      createSettings({ media_server_type: MediaServerType.JELLYFIN }),
    );
    jellyfinAdapter.isSetup.mockReturnValue(false);

    await expect(factory.getService()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws when Plex remains uninitialized after initialize', async () => {
    settingsService.getSettings.mockResolvedValue(
      createSettings({ media_server_type: MediaServerType.PLEX }),
    );
    plexAdapter.isSetup.mockReturnValue(false);

    await expect(factory.getService()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns Plex adapter without initialization if already setup', async () => {
    settingsService.getSettings.mockResolvedValue(
      createSettings({ media_server_type: MediaServerType.PLEX }),
    );
    plexAdapter.isSetup.mockReturnValue(true);

    const service = await factory.getService();

    expect(plexAdapter.initialize).not.toHaveBeenCalled();
    expect(service).toBe(plexAdapter);
  });

  it('infers Jellyfin when only Jellyfin credentials exist and type is unset', async () => {
    settingsService.getSettings.mockResolvedValue(
      createSettings({
        media_server_type: null,
        jellyfin_url: 'http://jellyfin.local:8096',
        jellyfin_api_key: 'key',
      }),
    );

    await expect(factory.getConfiguredServerType()).resolves.toBe(
      MediaServerType.JELLYFIN,
    );
  });

  it('prefers explicit configured type over inferred mismatch', async () => {
    settingsService.getSettings.mockResolvedValue(
      createSettings({
        media_server_type: MediaServerType.JELLYFIN,
        plex_hostname: 'plex.local',
        plex_name: 'Plex',
        plex_port: 32400,
        plex_auth_token: 'plex-token',
      }),
    );

    await expect(factory.getConfiguredServerType()).resolves.toBe(
      MediaServerType.JELLYFIN,
    );
  });

  it('uninitializes the correct adapter by server type', () => {
    factory.uninitializeServer(MediaServerType.PLEX);
    factory.uninitializeServer(MediaServerType.JELLYFIN);

    expect(plexAdapter.uninitialize).toHaveBeenCalledTimes(1);
    expect(jellyfinAdapter.uninitialize).toHaveBeenCalledTimes(1);
  });

  it('throws for unsupported type in getServiceByType', async () => {
    await expect(
      factory.getServiceByType('EMBY' as unknown as MediaServerType),
    ).rejects.toThrow('Unsupported media server type: EMBY');
  });

  it('initialize does not throw when server type is not configured', async () => {
    jest
      .spyOn(factory, 'getService')
      .mockRejectedValue(new Error('No media server type configured'));

    await expect(factory.initialize()).resolves.toBeUndefined();
  });

  it('initialize does not throw on other initialization errors', async () => {
    jest
      .spyOn(factory, 'getService')
      .mockRejectedValue(new Error('startup failure'));

    await expect(factory.initialize()).resolves.toBeUndefined();
  });

  describe('verifyConnection', () => {
    beforeEach(() => {
      settingsService.getSettings.mockResolvedValue(
        createSettings({ media_server_type: MediaServerType.PLEX }),
      );
      plexAdapter.isSetup.mockReturnValue(true);
      (plexAdapter as any).getStatus = jest.fn();
      (logger as any).debug = jest.fn();
    });

    it('returns the adapter when status check succeeds', async () => {
      jest.spyOn(factory, 'getService').mockResolvedValue(plexAdapter as any);
      (plexAdapter as any).getStatus.mockResolvedValue({
        machineIdentifier: 'abc',
      });

      const result = await factory.verifyConnection();
      expect(result).toBe(plexAdapter);
    });

    it('re-initializes and verifies again when first status check fails', async () => {
      const getServiceSpy = jest
        .spyOn(factory, 'getService')
        .mockResolvedValue(plexAdapter as any);
      jest
        .spyOn(factory, 'getConfiguredServerType')
        .mockResolvedValue(MediaServerType.PLEX);

      // First status: fails. After re-init: succeeds.
      (plexAdapter as any).getStatus
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ machineIdentifier: 'abc' });

      const result = await factory.verifyConnection();

      expect(plexAdapter.uninitialize).toHaveBeenCalled();
      expect(getServiceSpy).toHaveBeenCalledTimes(2);
      expect(result).toBe(plexAdapter);
    });

    it('throws when re-initialization also fails to produce a live connection', async () => {
      jest.spyOn(factory, 'getService').mockResolvedValue(plexAdapter as any);
      jest
        .spyOn(factory, 'getConfiguredServerType')
        .mockResolvedValue(MediaServerType.PLEX);

      (plexAdapter as any).getStatus.mockResolvedValue(undefined);

      await expect(factory.verifyConnection()).rejects.toThrow(
        'Media server still unreachable after re-initialization',
      );
    });
  });
});
