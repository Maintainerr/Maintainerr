import {
  MediaServerType,
  MetadataProviderPreference,
} from '@maintainerr/contracts';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { InternalApiService } from '../api/internal-api/internal-api.service';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { TautulliApiService } from '../api/tautulli-api/tautulli-api.service';
import { TmdbApiService } from '../api/tmdb-api/tmdb.service';
import { TvdbApiService } from '../api/tvdb-api/tvdb.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { RadarrSettings } from './entities/radarr_settings.entities';
import { Settings } from './entities/settings.entities';
import { SonarrSettings } from './entities/sonarr_settings.entities';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;

  const plexApi = {} as jest.Mocked<PlexApiService>;
  const mediaServerFactory = {} as jest.Mocked<MediaServerFactory>;
  const servarr = {} as jest.Mocked<ServarrService>;
  const seerr = {} as jest.Mocked<SeerrApiService>;
  const tautulli = {} as jest.Mocked<TautulliApiService>;
  const tmdbApi = {} as jest.Mocked<TmdbApiService>;
  const tvdbApi = {} as jest.Mocked<TvdbApiService>;
  const internalApi = {} as jest.Mocked<InternalApiService>;
  const eventEmitter = {} as jest.Mocked<EventEmitter2>;
  const logger = {
    setContext: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as jest.Mocked<MaintainerrLogger>;

  const settingsRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
  } as unknown as jest.Mocked<Repository<Settings>>;

  const radarrSettingsRepo = {} as jest.Mocked<Repository<RadarrSettings>>;
  const sonarrSettingsRepo = {} as jest.Mocked<Repository<SonarrSettings>>;

  const createSettings = (overrides: Partial<Settings> = {}): Settings =>
    Object.assign(new Settings(), {
      id: 1,
      clientId: 'client-1',
      applicationTitle: 'Maintainerr',
      applicationUrl: 'http://localhost',
      apikey: 'key',
      locale: 'en',
      metadata_provider_preference: MetadataProviderPreference.TMDB_PRIMARY,
      media_server_type: null,
      plex_name: null,
      plex_hostname: null,
      plex_port: null,
      plex_ssl: null,
      plex_auth_token: null,
      jellyfin_url: null,
      jellyfin_api_key: null,
      jellyfin_user_id: null,
      jellyfin_server_name: null,
      collection_handler_job_cron: '0 0-23/12 * * *',
      rules_handler_job_cron: '0 0-23/8 * * *',
      ...overrides,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SettingsService(
      plexApi,
      mediaServerFactory,
      servarr,
      seerr,
      tautulli,
      tmdbApi,
      tvdbApi,
      internalApi,
      settingsRepo,
      radarrSettingsRepo,
      sonarrSettingsRepo,
      eventEmitter,
      logger,
    );
  });

  it('does not auto-select a media server when Plex and Jellyfin are both configured', async () => {
    settingsRepo.findOne.mockResolvedValue(
      createSettings({
        jellyfin_url: 'http://jellyfin.local:8096',
        jellyfin_api_key: 'jf-key',
        plex_hostname: 'plex.local',
        plex_name: 'Plex',
        plex_port: 32400,
        plex_auth_token: 'plex-token',
      }),
    );

    await service.init();

    expect(service.getMediaServerType()).toBeNull();
    expect(settingsRepo.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('still auto-selects Jellyfin when only Jellyfin is configured', async () => {
    settingsRepo.findOne.mockResolvedValue(
      createSettings({
        jellyfin_url: 'http://jellyfin.local:8096',
        jellyfin_api_key: 'jf-key',
      }),
    );

    await service.init();

    expect(service.getMediaServerType()).toBe(MediaServerType.JELLYFIN);
    expect(settingsRepo.update).toHaveBeenCalledWith(
      { id: 1 },
      { media_server_type: MediaServerType.JELLYFIN },
    );
  });
});
