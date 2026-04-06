import { MediaServerType } from '@maintainerr/contracts';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TestBed, type Mocked } from '@suites/unit';
import { Repository } from 'typeorm';
import { InternalApiService } from '../api/internal-api/internal-api.service';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { TautulliApiService } from '../api/tautulli-api/tautulli-api.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { RadarrSettings } from './entities/radarr_settings.entities';
import { Settings } from './entities/settings.entities';
import { SonarrSettings } from './entities/sonarr_settings.entities';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let settingsRepo: Mocked<Repository<Settings>>;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let plexApi: Mocked<PlexApiService>;
  let seerr: Mocked<SeerrApiService>;
  let tautulli: Mocked<TautulliApiService>;
  let internalApi: Mocked<InternalApiService>;
  let eventEmitter: Mocked<EventEmitter2>;

  const createSettings = (overrides: Partial<Settings> = {}): Settings =>
    Object.assign(new Settings(), {
      id: 1,
      clientId: 'client-id',
      applicationTitle: 'Maintainerr',
      applicationUrl: 'http://localhost:6246',
      apikey: 'api-key',
      locale: 'en',
      media_server_type: MediaServerType.PLEX,
      plex_name: 'Plex',
      plex_hostname: 'plex.local',
      plex_port: 32400,
      plex_ssl: 0,
      plex_auth_token: 'plex-token',
      seerr_url: 'http://seerr.local',
      seerr_api_key: 'seerr-key',
      tautulli_url: 'http://tautulli.local',
      tautulli_api_key: 'tautulli-key',
      collection_handler_job_cron: '0 * * * *',
      rules_handler_job_cron: '0 * * * *',
      ...overrides,
    });

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(SettingsService).compile();

    service = unit;
    settingsRepo = unitRef.get('SettingsRepository');
    unitRef.get<Mocked<Repository<RadarrSettings>>>('RadarrSettingsRepository');
    unitRef.get<Mocked<Repository<SonarrSettings>>>('SonarrSettingsRepository');
    mediaServerFactory = unitRef.get(MediaServerFactory);
    plexApi = unitRef.get(PlexApiService);
    unitRef.get(ServarrService);
    seerr = unitRef.get(SeerrApiService);
    tautulli = unitRef.get(TautulliApiService);
    internalApi = unitRef.get(InternalApiService);
    eventEmitter = unitRef.get(EventEmitter2);
    unitRef.get(MaintainerrLogger);

    settingsRepo.findOne.mockResolvedValue(createSettings());
    settingsRepo.save.mockImplementation(
      async (settings) => settings as Settings,
    );
    mediaServerFactory.initialize.mockResolvedValue(undefined);
    plexApi.initialize.mockResolvedValue(undefined);
    plexApi.validateAuthToken.mockResolvedValue(true);
    plexApi.getStatus.mockResolvedValue({ version: '1.0.0' } as never);
    seerr.init.mockImplementation();
    tautulli.init.mockImplementation();
    internalApi.init.mockImplementation();
    eventEmitter.emit.mockImplementation();
  });

  it('rejects Plex server setting changes when no Plex credentials are stored', async () => {
    settingsRepo.findOne.mockResolvedValue(
      createSettings({ plex_auth_token: null }),
    );

    const response = await service.updateSettings(
      createSettings({
        plex_auth_token: null,
        plex_hostname: 'plex.internal',
      }),
    );

    expect(response).toEqual({
      status: 'NOK',
      code: 0,
      message: 'Authenticate with Plex before saving Plex server settings.',
    });
    expect(settingsRepo.save).not.toHaveBeenCalled();
  });

  it('still allows unrelated settings updates when Plex server settings are unchanged', async () => {
    const response = await service.updateSettings(
      createSettings({ applicationTitle: 'Maintainerr Dev' }),
    );

    expect(response).toEqual({ status: 'OK', code: 1, message: 'Success' });
    expect(settingsRepo.save).toHaveBeenCalledTimes(1);
    expect(mediaServerFactory.initialize).toHaveBeenCalledTimes(1);
  });

  it('does not initialize Plex directly when Jellyfin is configured', async () => {
    settingsRepo.findOne.mockResolvedValue(
      createSettings({
        media_server_type: MediaServerType.JELLYFIN,
        jellyfin_url: 'http://jellyfin.local',
        jellyfin_api_key: 'jellyfin-key',
        jellyfin_user_id: 'user-id',
        jellyfin_server_name: 'Jellyfin',
        plex_name: null,
        plex_hostname: null,
        plex_port: null,
        plex_ssl: null,
        plex_auth_token: null,
      }),
    );

    const response = await service.updateSettings(
      createSettings({
        media_server_type: MediaServerType.JELLYFIN,
        jellyfin_url: 'http://jellyfin.local',
        jellyfin_api_key: 'jellyfin-key',
        jellyfin_user_id: 'user-id',
        jellyfin_server_name: 'Jellyfin',
        plex_name: null,
        plex_hostname: null,
        plex_port: null,
        plex_ssl: null,
        plex_auth_token: null,
        applicationTitle: 'Maintainerr Dev',
      }),
    );

    expect(response).toEqual({ status: 'OK', code: 1, message: 'Success' });
    expect(mediaServerFactory.initialize).toHaveBeenCalledTimes(1);
    expect(plexApi.initialize).not.toHaveBeenCalled();
  });

  it('treats equivalent Plex host representations as unchanged for auth enforcement', async () => {
    settingsRepo.findOne.mockResolvedValue(
      createSettings({
        plex_auth_token: null,
        plex_hostname: 'plex.local',
        plex_port: 32400,
        plex_ssl: 0,
      }),
    );

    const response = await service.updateSettings(
      createSettings({
        plex_auth_token: null,
        applicationTitle: 'Maintainerr Dev',
        plex_hostname: 'HTTP://PLEX.LOCAL',
        plex_port: 32400,
        plex_ssl: 0,
      }),
    );

    expect(response).toEqual({ status: 'OK', code: 1, message: 'Success' });
    expect(settingsRepo.save).toHaveBeenCalledTimes(1);
  });

  it('normalizes Plex hostname and derives ssl before saving', async () => {
    await service.updateSettings(
      createSettings({
        plex_hostname: 'HTTPS://Plex.Local',
        plex_port: 32400,
        plex_ssl: 0,
      }),
    );

    expect(settingsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        plex_hostname: 'plex.local',
        plex_port: 32400,
        plex_ssl: 1,
      }),
    );
  });

  it('returns a clear Plex auth message before calling the Plex API test endpoint', async () => {
    service.plex_auth_token = null;

    const response = await service.testPlex();

    expect(response).toEqual({
      status: 'NOK',
      code: 0,
      message: 'Authenticate with Plex before testing the connection.',
    });
    expect(plexApi.getStatus).not.toHaveBeenCalled();
  });

  it('validates stored Plex auth tokens without requiring server settings', async () => {
    service.plex_auth_token = 'masked-plex-token';

    const response = await service.testPlexAuthToken();

    expect(response).toEqual({ status: 'OK', code: 1, message: 'Success' });
    expect(plexApi.validateAuthToken).toHaveBeenCalledTimes(1);
    expect(plexApi.getStatus).not.toHaveBeenCalled();
  });

  it('returns a clear message when no Plex auth token exists for auth validation', async () => {
    service.plex_auth_token = null;

    const response = await service.testPlexAuthToken();

    expect(response).toEqual({
      status: 'NOK',
      code: 0,
      message: 'Authenticate with Plex before validating the connection.',
    });
    expect(plexApi.validateAuthToken).not.toHaveBeenCalled();
  });
});
