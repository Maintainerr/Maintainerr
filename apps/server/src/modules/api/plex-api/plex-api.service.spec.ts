import { Mocked, TestBed } from '@suites/unit';
import { SettingsService } from '../../settings/settings.service';
import { MaintainerrLoggerFactory } from '../../logging/logs.service';
import { PlexApiService } from './plex-api.service';

describe('PlexApiService.getMetadata', () => {
  let service: PlexApiService;
  let settingsService: Mocked<SettingsService>;
  let loggerFactory: Mocked<MaintainerrLoggerFactory>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();

    service = unit;
    settingsService = unitRef.get(SettingsService);
    loggerFactory = unitRef.get(MaintainerrLoggerFactory);

    settingsService.plex_hostname = 'plex.local';
    settingsService.plex_port = 32400;
    settingsService.plex_ssl = 0;
    settingsService.plex_auth_token = 'token';
    loggerFactory.createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any);
  });

  it('requests external media enrichment when includeExternalMedia is enabled', async () => {
    const query = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [{ ratingKey: '123' }] },
    });

    (service as any).plexClient = { query };

    await service.getMetadata('123', { includeExternalMedia: true });

    expect(query).toHaveBeenCalledWith(
      '/library/metadata/123?includeExternalMedia=1&asyncAugmentMetadata=1',
      true,
    );
  });

  it('preserves includeChildren queries while requesting external media enrichment', async () => {
    const query = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [{ ratingKey: '123' }] },
    });

    (service as any).plexClient = { query };

    await service.getMetadata('123', { includeChildren: true });

    expect(query).toHaveBeenCalledWith(
      '/library/metadata/123?includeChildren=1&includeExternalMedia=1&asyncAugmentMetadata=1',
      true,
    );
  });
});
