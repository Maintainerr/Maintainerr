import { Mocked, TestBed } from '@suites/unit';
import { SettingsService } from '../../settings/settings.service';
import {
  PlexMetadata,
  PlexMetadataResponse,
} from './interfaces/media.interface';
import { PlexApiService } from './plex-api.service';

describe('PlexApiService', () => {
  let service: PlexApiService;
  let settings: Mocked<SettingsService>;
  let plexClient: {
    query: jest.Mock<
      Promise<PlexMetadataResponse | undefined>,
      [string, boolean]
    >;
  };

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();

    service = unit;
    settings = unitRef.get(SettingsService);

    plexClient = {
      query: jest.fn(),
    };

    (service as unknown as { plexClient: typeof plexClient }).plexClient =
      plexClient;

    settings.plex_name = 'Plex';
    settings.plex_hostname = 'plex.local';
    settings.plex_port = 32400;
    settings.plex_auth_token = 'token';
    settings.plex_ssl = 0;
  });

  it('requests external media without children when explicitly enabled', async () => {
    const metadata = { ratingKey: '5633' } as PlexMetadata;
    plexClient.query.mockResolvedValue({
      MediaContainer: { Metadata: [metadata] },
    });

    const result = await service.getMetadata('5633', {
      includeExternalMedia: true,
    });

    expect(result).toBe(metadata);
    expect(plexClient.query).toHaveBeenCalledWith(
      '/library/metadata/5633?includeExternalMedia=1',
      true,
    );
  });

  it('keeps child expansion params when includeChildren is enabled', async () => {
    const metadata = { ratingKey: '5633' } as PlexMetadata;
    plexClient.query.mockResolvedValue({
      MediaContainer: { Metadata: [metadata] },
    });

    await service.getMetadata('5633', {
      includeChildren: true,
    });

    expect(plexClient.query).toHaveBeenCalledWith(
      '/library/metadata/5633?includeChildren=1&includeExternalMedia=1&asyncAugmentMetadata=1&asyncCheckFiles=1&asyncRefreshAnalysis=1',
      true,
    );
  });
});
