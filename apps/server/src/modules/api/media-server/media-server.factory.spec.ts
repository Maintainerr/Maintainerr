import { MediaServerType } from '@maintainerr/contracts';
import { ServiceUnavailableException } from '@nestjs/common';
import { MaintainerrLogger } from '../../logging/logs.service';
import { Settings } from '../../settings/entities/settings.entities';
import { SettingsDataService } from '../../settings/settings-data.service';
import { EmbyAdapterService } from './emby/emby-adapter.service';
import { JellyfinAdapterService } from './jellyfin/jellyfin-adapter.service';
import { MediaServerSwitchState } from './media-server-switch-state.service';
import { MediaServerFactory } from './media-server.factory';
import { PlexAdapterService } from './plex/plex-adapter.service';

describe('MediaServerFactory', () => {
  let factory: MediaServerFactory;
  const logger = {
    setContext: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
  } as unknown as jest.Mocked<MaintainerrLogger>;

  const settingsDataService = {
    getSettings: jest.fn(),
  } as unknown as jest.Mocked<SettingsDataService>;

  const mediaServerSwitchState = {
    isSwitching: jest.fn(),
  } as unknown as jest.Mocked<MediaServerSwitchState>;

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

  const embyAdapter = {
    isSetup: jest.fn(),
    initialize: jest.fn(),
    uninitialize: jest.fn(),
    testConnection: jest.fn(),
    loginWithCredentials: jest.fn(),
  } as unknown as jest.Mocked<EmbyAdapterService>;

  const createSettings = (overrides: Partial<Settings> = {}): Settings =>
    Object.assign(new Settings(), {
      media_server_type: null,
      plex_hostname: null,
      plex_name: null,
      plex_port: null,
      plex_auth_token: null,
      jellyfin_url: null,
      jellyfin_api_key: null,
      emby_url: null,
      emby_api_key: null,
      ...overrides,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    factory = new MediaServerFactory(
      settingsDataService,
      mediaServerSwitchState,
      plexAdapter,
      jellyfinAdapter,
      embyAdapter,
      logger,
    );

    mediaServerSwitchState.isSwitching.mockReturnValue(false);
    plexAdapter.isSetup.mockReturnValue(true);
    jellyfinAdapter.isSetup.mockReturnValue(true);
    embyAdapter.isSetup.mockReturnValue(true);
  });

  it('throws ServiceUnavailableException while switch is in progress', async () => {
    mediaServerSwitchState.isSwitching.mockReturnValue(true);

    await expect(factory.getService()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws when no media server type is configured', async () => {
    settingsDataService.getSettings.mockResolvedValue({
      status: 'NOK',
      code: 0,
      message: 'missing settings',
    });

    await expect(factory.getService()).rejects.toThrow(
      'No media server type configured',
    );
  });

  it('returns and initializes Jellyfin adapter when configured', async () => {
    settingsDataService.getSettings.mockResolvedValue(
      createSettings({
        media_server_type: MediaServerType.JELLYFIN,
        jellyfin_url: 'http://jellyfin.local:8096',
        jellyfin_api_key: 'key',
      }),
    );
    jellyfinAdapter.isSetup
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const service = await factory.getService();

    expect(jellyfinAdapter.initialize).toHaveBeenCalledTimes(1);
    expect(service).toBe(jellyfinAdapter);
  });

  it('throws when Jellyfin remains uninitialized after initialize', async () => {
    settingsDataService.getSettings.mockResolvedValue(
      createSettings({
        media_server_type: MediaServerType.JELLYFIN,
        jellyfin_url: 'http://jellyfin.local:8096',
        jellyfin_api_key: 'key',
      }),
    );
    jellyfinAdapter.isSetup.mockReturnValue(false);

    await expect(factory.getService()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException when the configured server has no credentials yet', async () => {
    settingsDataService.getSettings.mockResolvedValue(
      createSettings({ media_server_type: MediaServerType.JELLYFIN }),
    );

    await expect(factory.getService()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(jellyfinAdapter.initialize).not.toHaveBeenCalled();
  });

  it('throws when Plex remains uninitialized after initialize', async () => {
    settingsDataService.getSettings.mockResolvedValue(
      createSettings({
        media_server_type: MediaServerType.PLEX,
        plex_hostname: 'plex.local',
        plex_name: 'Plex',
        plex_port: 32400,
        plex_auth_token: 'token',
      }),
    );
    plexAdapter.isSetup.mockReturnValue(false);

    await expect(factory.getService()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns Plex adapter without initialization if already setup', async () => {
    settingsDataService.getSettings.mockResolvedValue(
      createSettings({
        media_server_type: MediaServerType.PLEX,
        plex_hostname: 'plex.local',
        plex_name: 'Plex',
        plex_port: 32400,
        plex_auth_token: 'token',
      }),
    );
    plexAdapter.isSetup.mockReturnValue(true);

    const service = await factory.getService();

    expect(plexAdapter.initialize).not.toHaveBeenCalled();
    expect(service).toBe(plexAdapter);
  });

  it('infers Jellyfin when only Jellyfin credentials exist and type is unset', async () => {
    settingsDataService.getSettings.mockResolvedValue(
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
    settingsDataService.getSettings.mockResolvedValue(
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

  it('returns and initializes Emby adapter when configured', async () => {
    settingsDataService.getSettings.mockResolvedValue(
      createSettings({
        media_server_type: MediaServerType.EMBY,
        emby_url: 'http://emby.local:8096',
        emby_api_key: 'key',
      }),
    );
    embyAdapter.isSetup.mockReturnValueOnce(false).mockReturnValueOnce(true);

    const service = await factory.getService();

    expect(embyAdapter.initialize).toHaveBeenCalledTimes(1);
    expect(service).toBe(embyAdapter);
  });

  it('throws when Emby remains uninitialized after initialize', async () => {
    settingsDataService.getSettings.mockResolvedValue(
      createSettings({
        media_server_type: MediaServerType.EMBY,
        emby_url: 'http://emby.local:8096',
        emby_api_key: 'key',
      }),
    );
    embyAdapter.isSetup.mockReturnValue(false);

    await expect(factory.getService()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('infers Emby when only Emby credentials exist and type is unset', async () => {
    settingsDataService.getSettings.mockResolvedValue(
      createSettings({
        media_server_type: null,
        emby_url: 'http://emby.local:8096',
        emby_api_key: 'key',
      }),
    );

    await expect(factory.getConfiguredServerType()).resolves.toBe(
      MediaServerType.EMBY,
    );
  });

  it('uninitializes the correct adapter by server type', () => {
    factory.uninitializeServer(MediaServerType.PLEX);
    factory.uninitializeServer(MediaServerType.JELLYFIN);
    factory.uninitializeServer(MediaServerType.EMBY);

    expect(plexAdapter.uninitialize).toHaveBeenCalledTimes(1);
    expect(jellyfinAdapter.uninitialize).toHaveBeenCalledTimes(1);
    expect(embyAdapter.uninitialize).toHaveBeenCalledTimes(1);
  });

  it('throws for unsupported type in getServiceByType', async () => {
    await expect(
      factory.getServiceByType('unknown' as unknown as MediaServerType),
    ).rejects.toThrow('Unsupported media server type: unknown');
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
      settingsDataService.getSettings.mockResolvedValue(
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
