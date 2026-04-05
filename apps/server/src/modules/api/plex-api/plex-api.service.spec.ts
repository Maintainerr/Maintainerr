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

  it('builds a single encoded collection uri when adding multiple children', async () => {
    const putQuery = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [{ ratingKey: '123' }] },
    });

    (service as any).machineId = 'machine123';
    (service as any).plexClient = { putQuery };

    await service.addChildrenToCollection('55', ['1', '2']);

    expect(putQuery).toHaveBeenCalledWith({
      uri: '/library/collections/55/items?uri=library://machine123/item/%2Flibrary%2Fmetadata%2F1%2C%2Flibrary%2Fmetadata%2F2',
    });
  });

  it('extracts plex avatar uuids without regex when correcting users', async () => {
    jest.spyOn(service, 'getUsers').mockResolvedValue([
      {
        id: 1,
        name: 'owner',
      } as any,
    ]);
    jest.spyOn(service, 'getUserDataFromPlexTv').mockResolvedValue(undefined);
    jest.spyOn(service, 'getOwnerDataFromPlexTv').mockResolvedValue({
      id: '42',
      username: 'owner',
      thumb: 'https://plex.tv/users/abc123/avatar?c=123456',
    } as any);

    await expect(service.getCorrectedUsers()).resolves.toEqual([
      {
        plexId: 42,
        username: 'owner',
        uuid: 'abc123',
      },
    ]);
  });

  it('ignores avatar urls that do not match the expected plex shape', async () => {
    jest.spyOn(service, 'getUsers').mockResolvedValue([
      {
        id: 1,
        name: 'owner',
      } as any,
    ]);
    jest.spyOn(service, 'getUserDataFromPlexTv').mockResolvedValue(undefined);
    jest.spyOn(service, 'getOwnerDataFromPlexTv').mockResolvedValue({
      id: '42',
      username: 'owner',
      thumb: 'https://example.com/users/abc123/avatar?c=123456',
    } as any);

    await expect(service.getCorrectedUsers()).resolves.toEqual([
      {
        plexId: 42,
        username: 'owner',
      },
    ]);
  });
});
