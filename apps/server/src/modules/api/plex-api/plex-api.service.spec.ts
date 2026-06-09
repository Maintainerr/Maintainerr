import { Mocked, TestBed } from '@suites/unit';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import { Settings } from '../../settings/entities/settings.entities';
import { SettingsDataService } from '../../settings/settings-data.service';
import {
  WATCH_HISTORY_BULK_CACHE_KEY,
  WATCH_HISTORY_SEASON_BULK_CACHE_KEY,
  WATCH_HISTORY_SHOW_BULK_CACHE_KEY,
} from './plex-api.constants';
import { PlexConnection } from './interfaces/server.interface';
import { PlexApiService } from './plex-api.service';

type PlexApiSettingsStub = Pick<
  Settings,
  | 'plex_hostname'
  | 'plex_port'
  | 'plex_ssl'
  | 'plex_auth_token'
  | 'plex_manual_mode'
  | 'plex_machine_id'
> & {
  updatePlexConnectionDetails: jest.Mock;
};

describe('PlexApiService.rankConnections', () => {
  const conn = (overrides: Partial<PlexConnection> = {}): PlexConnection => ({
    protocol: 'http',
    address: '192.168.1.50',
    port: 32400,
    uri: 'http://192.168.1.50:32400',
    local: true,
    status: 200,
    ...overrides,
  });

  it('prefers reachable connections over unreachable ones', () => {
    const ranked = PlexApiService.rankConnections([
      conn({ address: '10.0.0.1', status: undefined }),
      conn({ address: '10.0.0.2', status: 200 }),
    ]);
    expect(ranked[0].address).toBe('10.0.0.2');
  });

  it('prefers local connections over remote ones', () => {
    const ranked = PlexApiService.rankConnections([
      conn({ address: '1.2.3.4', local: false }),
      conn({ address: '192.168.1.50', local: true }),
    ]);
    expect(ranked[0].address).toBe('192.168.1.50');
  });

  it('prefers direct IP over plex.direct hostnames', () => {
    const ranked = PlexApiService.rankConnections([
      conn({ address: 'abc123.plex.direct' }),
      conn({ address: '192.168.1.50' }),
    ]);
    expect(ranked[0].address).toBe('192.168.1.50');
  });

  it('treats IPv6 literals as direct IP connections', () => {
    const ranked = PlexApiService.rankConnections([
      conn({ address: 'abc123.plex.direct' }),
      conn({ address: '2001:db8::10' }),
    ]);
    expect(ranked[0].address).toBe('2001:db8::10');
  });

  it('sorts by latency when all else is equal', () => {
    const ranked = PlexApiService.rankConnections([
      conn({ address: '192.168.1.2', latency: 100 }),
      conn({ address: '192.168.1.1', latency: 10 }),
    ]);
    expect(ranked[0].address).toBe('192.168.1.1');
  });

  it('does not mutate the input array', () => {
    const input = [
      conn({ address: '10.0.0.1', local: false }),
      conn({ address: '10.0.0.2', local: true }),
    ];
    const ranked = PlexApiService.rankConnections(input);
    expect(ranked).not.toBe(input);
    expect(input[0].address).toBe('10.0.0.1');
  });
});

describe('PlexApiService.getMetadata', () => {
  let service: PlexApiService;
  let settingsDataService: PlexApiSettingsStub;
  let logger: Mocked<MaintainerrLogger>;
  let loggerFactory: Mocked<MaintainerrLoggerFactory>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();

    service = unit;
    settingsDataService = unitRef.get(
      SettingsDataService,
    ) as unknown as PlexApiSettingsStub;
    logger = unitRef.get(MaintainerrLogger);
    loggerFactory = unitRef.get(MaintainerrLoggerFactory);

    settingsDataService.plex_hostname = 'plex.local';
    settingsDataService.plex_port = 32400;
    settingsDataService.plex_ssl = 0;
    settingsDataService.plex_auth_token = 'token';
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

  it('queries the live sessions endpoint without caching', async () => {
    const query = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [{ ratingKey: '123' }] },
    });

    (service as any).plexClient = { query };

    const result = await service.getActiveSessions();

    expect(query).toHaveBeenCalledWith({ uri: '/status/sessions' }, false);
    expect(result).toEqual([{ ratingKey: '123' }]);
  });

  it('returns an empty array when nothing is playing (no Metadata)', async () => {
    const query = jest.fn().mockResolvedValue({
      MediaContainer: { size: 0 },
    });

    (service as any).plexClient = { query };

    expect(await service.getActiveSessions()).toEqual([]);
  });

  it('returns an empty array when the sessions query fails', async () => {
    const query = jest.fn().mockRejectedValue(new Error('boom'));

    (service as any).plexClient = { query };

    expect(await service.getActiveSessions()).toEqual([]);
  });

  it('builds a single encoded collection uri when adding multiple children', async () => {
    const putQuery = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [{ ratingKey: '123' }] },
    });

    (service as any).machineId = 'machine123';
    (service as any).plexClient = { putQuery };

    await service.addChildrenToCollection('55', ['1', '2']);

    expect(putQuery).toHaveBeenCalledWith({
      uri: '/library/collections/55/items?uri=server%3A%2F%2Fmachine123%2Fcom.plexapp.plugins.library%2Flibrary%2Fmetadata%2F1%2C2',
    });
  });

  it('returns an HTTP request failure for 400 batch add responses', async () => {
    const putQuery = jest.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        statusText: 'Bad Request',
        data: { error: 'duplicate items' },
      },
    });

    (service as any).machineId = 'machine123';
    (service as any).plexClient = { putQuery };

    const result = await service.addChildrenToCollection('55', ['1', '2']);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'NOK',
        code: 400,
        message:
          'Plex request failed with 400 Bad Request. Response body: {"error":"duplicate items"}',
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('switches a collection into custom sort mode via prefs', async () => {
    const putQuery = jest.fn().mockResolvedValue(undefined);
    (service as any).plexClient = { putQuery };

    await service.setCollectionCustomSort('55');

    expect(putQuery).toHaveBeenCalledWith({
      uri: '/library/metadata/55/prefs?collectionSort=2',
    });
  });

  it('omits the after parameter when moving an item to the front', async () => {
    const putQuery = jest.fn().mockResolvedValue(undefined);
    (service as any).plexClient = { putQuery };

    await service.moveCollectionItem('55', '99');

    expect(putQuery).toHaveBeenCalledWith({
      uri: '/library/collections/55/items/99/move',
    });
  });

  it('places an item after the given sibling when moving', async () => {
    const putQuery = jest.fn().mockResolvedValue(undefined);
    (service as any).plexClient = { putQuery };

    await service.moveCollectionItem('55', '99', '42');

    expect(putQuery).toHaveBeenCalledWith({
      uri: '/library/collections/55/items/99/move?after=42',
    });
  });

  it('uses the canonical Plex items path when deleting a collection child', async () => {
    const deleteQuery = jest.fn().mockResolvedValue(undefined);

    (service as any).plexClient = { deleteQuery };

    await expect(
      service.deleteChildFromCollection('55', '99'),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'OK',
        code: 1,
      }),
    );

    expect(deleteQuery).toHaveBeenCalledWith({
      uri: '/library/collections/55/items/99',
    });
  });

  it('keeps network failures distinct from HTTP request failures', async () => {
    const putQuery = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:32400'));

    (service as any).machineId = 'machine123';
    (service as any).plexClient = { putQuery };

    const result = await service.addChildrenToCollection('55', ['1']);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'NOK',
        code: 0,
        message: 'connect ECONNREFUSED 127.0.0.1:32400',
      }),
    );
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

  it('throws when auth validation is attempted without a token', async () => {
    settingsDataService.plex_auth_token = null as any;

    await expect(service.validateAuthToken()).rejects.toThrow(
      'Plex auth token is required for validation',
    );
  });

  it('returns an empty cheap storage map without querying undocumented endpoints', async () => {
    const queryAll = jest.fn();

    (service as any).plexClient = { queryAll };

    await expect(service.getLibrariesStorage()).resolves.toEqual(new Map());
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('requests section allLeaves when retrieving Plex show library leaves', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [] },
    });

    (service as any).plexClient = { queryAll };

    await service.getLibraryLeaves('7');

    expect(queryAll).toHaveBeenCalledWith(
      {
        uri: '/library/sections/7/allLeaves?includeGuids=1',
      },
      true,
    );
  });

  describe('itemExists', () => {
    it('returns true when Plex returns metadata for the item', async () => {
      const query = jest.fn().mockResolvedValue({
        MediaContainer: { Metadata: [{ ratingKey: '123' }] },
      });
      (service as any).plexClient = { query };

      await expect(service.itemExists('123')).resolves.toBe(true);
    });

    it('returns false when Plex explicitly reports the item is gone (404)', async () => {
      const wrapped = new Error(
        'GET /library/metadata/123 failed with exception: Plex Server didnt respond with a valid 2xx status code, response code: 404',
        { cause: { response: { status: 404 } } as any },
      );
      const query = jest.fn().mockRejectedValue(wrapped);
      (service as any).plexClient = { query };

      await expect(service.itemExists('123')).resolves.toBe(false);
    });

    it('rethrows non-404 failures so revert callers can preserve state', async () => {
      const wrapped = new Error('boom', {
        cause: { response: { status: 500 } } as any,
      });
      const query = jest.fn().mockRejectedValue(wrapped);
      (service as any).plexClient = { query };

      await expect(service.itemExists('123')).rejects.toBe(wrapped);
    });

    it('rethrows network errors with no response status', async () => {
      const wrapped = new Error('connect ECONNREFUSED');
      const query = jest.fn().mockRejectedValue(wrapped);
      (service as any).plexClient = { query };

      await expect(service.itemExists('123')).rejects.toBe(wrapped);
    });
  });
});

describe('PlexApiService.getCollections (invalid section vs auth)', () => {
  let service: PlexApiService;
  let settingsDataService: PlexApiSettingsStub;
  let logger: Mocked<MaintainerrLogger>;
  let loggerFactory: Mocked<MaintainerrLoggerFactory>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();

    service = unit;
    settingsDataService = unitRef.get(
      SettingsDataService,
    ) as unknown as PlexApiSettingsStub;
    logger = unitRef.get(MaintainerrLogger);
    loggerFactory = unitRef.get(MaintainerrLoggerFactory);

    settingsDataService.plex_hostname = 'plex.local';
    settingsDataService.plex_port = 32400;
    settingsDataService.plex_ssl = 0;
    settingsDataService.plex_auth_token = 'token';
    loggerFactory.createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any);
  });

  it('warns about a stale section when Plex returns 200 with no MediaContainer', async () => {
    (service as any).plexClient = {
      queryAll: jest.fn().mockResolvedValue({}),
    };

    await expect(service.getCollections('42')).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Plex library section '42' returned no data"),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('warns about a stale section on a 404 response', async () => {
    const wrapped = new Error(
      'GET /library/sections/42/collections failed: not found',
      { cause: { response: { status: 404 } } as any },
    );
    (service as any).plexClient = {
      queryAll: jest.fn().mockRejectedValue(wrapped),
    };

    await expect(service.getCollections('42')).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Plex library section '42' returned no data"),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('emits the generic communication-failure error on a 401 auth failure', async () => {
    const wrapped = new Error(
      'GET /library/sections/42/collections failed: Plex Server denied request',
      { cause: { response: { status: 401 } } as any },
    );
    (service as any).plexClient = {
      queryAll: jest.fn().mockRejectedValue(wrapped),
    };

    await expect(service.getCollections('42')).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Plex api communication failure.. Is the application running?',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('emits the generic communication-failure error on a 403 permission failure', async () => {
    const wrapped = new Error(
      'GET /library/sections/42/collections failed: managed user permissions',
      { cause: { response: { status: 403 } } as any },
    );
    (service as any).plexClient = {
      queryAll: jest.fn().mockRejectedValue(wrapped),
    };

    await expect(service.getCollections('42')).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Plex api communication failure.. Is the application running?',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('emits the generic communication-failure error on a non-HTTP transport failure', async () => {
    const wrapped = new Error('connect ECONNREFUSED');
    (service as any).plexClient = {
      queryAll: jest.fn().mockRejectedValue(wrapped),
    };

    await expect(service.getCollections('42')).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Plex api communication failure.. Is the application running?',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('PlexApiService.initialize', () => {
  let service: PlexApiService;
  let settingsDataService: PlexApiSettingsStub;
  let logger: Mocked<MaintainerrLogger>;
  let loggerFactory: Mocked<MaintainerrLoggerFactory>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();

    service = unit;
    settingsDataService = unitRef.get(
      SettingsDataService,
    ) as unknown as PlexApiSettingsStub;
    logger = unitRef.get(MaintainerrLogger);
    loggerFactory = unitRef.get(MaintainerrLoggerFactory);

    settingsDataService.plex_hostname = 'plex.local';
    settingsDataService.plex_port = 32400;
    settingsDataService.plex_ssl = 0;
    settingsDataService.plex_auth_token = 'token';
    settingsDataService.plex_manual_mode = 0;
    settingsDataService.plex_machine_id = 'machine123';
    settingsDataService.updatePlexConnectionDetails = jest
      .fn()
      .mockResolvedValue(undefined);
    loggerFactory.createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any);

    // Prevent real network calls from plexClient.query inside getStatus
    jest.spyOn(service, 'getStatus').mockResolvedValue(undefined);
  });

  it('clears plexClient when primary connection and rediscovery both fail', async () => {
    // Mock getStatus to fail on the primary connection
    jest.spyOn(service, 'getAvailableServers').mockResolvedValue([]);

    await service.initialize();

    expect(service.isPlexSetup()).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      'Plex connection failed after re-discovery attempt. Please check your settings',
    );
  });

  it('skips rediscovery in manual mode when primary connection fails', async () => {
    settingsDataService.plex_manual_mode = 1;
    const getServersSpy = jest
      .spyOn(service, 'getAvailableServers')
      .mockResolvedValue([]);

    await service.initialize();

    expect(getServersSpy).not.toHaveBeenCalled();
    expect(service.isPlexSetup()).toBe(false);
  });

  it('attempts rediscovery when primary connection fails', async () => {
    const getServersSpy = jest
      .spyOn(service, 'getAvailableServers')
      .mockResolvedValue([]);

    await service.initialize();

    // Verify rediscovery was attempted (getAvailableServers called)
    expect(getServersSpy).toHaveBeenCalled();
    // No working connection found, so client should be cleared
    expect(service.isPlexSetup()).toBe(false);
  });

  it('returns undefined from getStatus without logging an error when Plex is unreachable', async () => {
    jest.restoreAllMocks();
    (service as any).plexClient = {
      query: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
    };

    await expect(service.getStatus()).resolves.toBeUndefined();

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith('Plex status probe failed');
  });
});

describe('PlexApiService.prefetchWatchHistory', () => {
  let service: PlexApiService;
  let logger: Mocked<MaintainerrLogger>;
  let loggerFactory: Mocked<MaintainerrLoggerFactory>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();

    service = unit;
    logger = unitRef.get(MaintainerrLogger);
    loggerFactory = unitRef.get(MaintainerrLoggerFactory);

    loggerFactory.createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any);

    // Clear all three plexguid bulk cache entries between tests
    const cacheManager = (await import('../lib/cache')).default;
    const plexguid = cacheManager.getCache('plexguid')?.data;
    plexguid?.del(WATCH_HISTORY_BULK_CACHE_KEY);
    plexguid?.del(WATCH_HISTORY_SHOW_BULK_CACHE_KEY);
    plexguid?.del(WATCH_HISTORY_SEASON_BULK_CACHE_KEY);
  });

  it('indexes movie records in the leaf map by ratingKey', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [
          {
            ratingKey: '1',
            type: 'movie',
            accountID: 10,
            viewedAt: 1700000000,
          },
          {
            ratingKey: '2',
            type: 'movie',
            accountID: 11,
            viewedAt: 1710000000,
          },
          {
            ratingKey: '1',
            type: 'movie',
            accountID: 12,
            viewedAt: 1720000000,
          },
        ],
      },
    });

    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory();

    expect(queryAll).toHaveBeenCalledWith(
      { uri: '/status/sessions/history/all?sort=viewedAt:desc' },
      false,
    );

    const cacheManager = (await import('../lib/cache')).default;
    const leafMap = cacheManager
      .getCache('plexguid')
      .data.get<Map<string, unknown[]>>(WATCH_HISTORY_BULK_CACHE_KEY);

    expect(leafMap).toBeDefined();
    expect(leafMap?.get('1')).toHaveLength(2);
    expect(leafMap?.get('2')).toHaveLength(1);
  });

  it('indexes episode records in the leaf, show, and season maps', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [
          {
            ratingKey: '101',
            type: 'episode',
            grandparentKey: '/library/metadata/10',
            parentKey: '/library/metadata/20',
            accountID: 1,
            viewedAt: 1700000001,
          },
          {
            ratingKey: '102',
            type: 'episode',
            grandparentKey: '/library/metadata/10',
            parentKey: '/library/metadata/21',
            accountID: 1,
            viewedAt: 1700000002,
          },
          {
            ratingKey: '103',
            type: 'episode',
            grandparentKey: '/library/metadata/11',
            parentKey: '/library/metadata/21',
            accountID: 2,
            viewedAt: 1700000003,
          },
        ],
      },
    });

    (service as any).plexClient = { queryAll };
    await service.prefetchWatchHistory();

    const cacheManager = (await import('../lib/cache')).default;
    const plexguid = cacheManager.getCache('plexguid').data;

    const leafMap = plexguid.get<Map<string, unknown[]>>(
      WATCH_HISTORY_BULK_CACHE_KEY,
    );
    expect(leafMap?.get('101')).toHaveLength(1);
    expect(leafMap?.get('102')).toHaveLength(1);
    expect(leafMap?.get('103')).toHaveLength(1);

    const showMap = plexguid.get<Map<string, unknown[]>>(
      WATCH_HISTORY_SHOW_BULK_CACHE_KEY,
    );
    expect(showMap?.get('10')).toHaveLength(2); // episodes 101 + 102
    expect(showMap?.get('11')).toHaveLength(1); // episode 103

    const seasonMap = plexguid.get<Map<string, unknown[]>>(
      WATCH_HISTORY_SEASON_BULK_CACHE_KEY,
    );
    expect(seasonMap?.get('20')).toHaveLength(1); // episode 101
    expect(seasonMap?.get('21')).toHaveLength(2); // episodes 102 + 103 (different shows, same season id)
  });

  it('skips the fetch when the bulk map is already cached', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [] },
    });

    (service as any).plexClient = { queryAll };

    // First call populates the cache
    await service.prefetchWatchHistory();
    // Second call should not hit the API again
    await service.prefetchWatchHistory();

    expect(queryAll).toHaveBeenCalledTimes(1);
  });

  it('logs a warning and does not throw when the Plex API call fails', async () => {
    const queryAll = jest.fn().mockRejectedValue(new Error('network error'));

    (service as any).plexClient = { queryAll };

    await expect(service.prefetchWatchHistory()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Watch history prefetch failed'),
    );
  });
});

describe('PlexApiService.getWatchHistory bulk map', () => {
  let service: PlexApiService;
  let loggerFactory: Mocked<MaintainerrLoggerFactory>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();

    service = unit;
    loggerFactory = unitRef.get(MaintainerrLoggerFactory);

    loggerFactory.createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any);

    // Clear all three plexguid bulk cache entries between tests
    const cacheManager = (await import('../lib/cache')).default;
    const plexguid = cacheManager.getCache('plexguid')?.data;
    plexguid?.del(WATCH_HISTORY_BULK_CACHE_KEY);
    plexguid?.del(WATCH_HISTORY_SHOW_BULK_CACHE_KEY);
    plexguid?.del(WATCH_HISTORY_SEASON_BULK_CACHE_KEY);
  });

  it('returns results from the bulk map for movie items when the map is populated', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    const bulkMap = new Map([
      ['42', [{ ratingKey: '42', accountID: 10, viewedAt: 1700000000 }]],
    ]);
    cacheManager
      .getCache('plexguid')
      .data.set(WATCH_HISTORY_BULK_CACHE_KEY, bulkMap);

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('42', true, 'movie');

    expect(result).toHaveLength(1);
    expect((result[0] as any).ratingKey).toBe('42');
    // Should NOT have hit the network
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('returns an empty array for a movie not in the bulk map', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    const bulkMap = new Map<string, unknown[]>();
    cacheManager
      .getCache('plexguid')
      .data.set(WATCH_HISTORY_BULK_CACHE_KEY, bulkMap);

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('99', true, 'movie');

    expect(result).toEqual([]);
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('serves show queries from the show map without a per-item call', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    const showRecord = {
      ratingKey: '101',
      type: 'episode',
      accountID: 7,
      viewedAt: 1700000000,
    };
    const showMap = new Map([['10', [showRecord]]]);
    cacheManager
      .getCache('plexguid')
      .data.set(WATCH_HISTORY_SHOW_BULK_CACHE_KEY, showMap);

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('10', true, 'show');

    expect(result).toHaveLength(1);
    expect(result[0].ratingKey).toBe('101');
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('returns empty array for a show not in the show map', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    cacheManager
      .getCache('plexguid')
      .data.set(WATCH_HISTORY_SHOW_BULK_CACHE_KEY, new Map());

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('99', true, 'show');

    expect(result).toEqual([]);
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('serves season queries from the season map without a per-item call', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    const seasonRecord = {
      ratingKey: '201',
      type: 'episode',
      accountID: 3,
      viewedAt: 1700000001,
    };
    const seasonMap = new Map([['20', [seasonRecord]]]);
    cacheManager
      .getCache('plexguid')
      .data.set(WATCH_HISTORY_SEASON_BULK_CACHE_KEY, seasonMap);

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('20', true, 'season');

    expect(result).toHaveLength(1);
    expect(result[0].ratingKey).toBe('201');
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('serves episode queries from the leaf map without a per-item call', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    const epRecord = {
      ratingKey: '301',
      type: 'episode',
      accountID: 5,
      viewedAt: 1700000002,
    };
    const leafMap = new Map([['301', [epRecord]]]);
    cacheManager
      .getCache('plexguid')
      .data.set(WATCH_HISTORY_BULK_CACHE_KEY, leafMap);

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('301', true, 'episode');

    expect(result).toHaveLength(1);
    expect(result[0].ratingKey).toBe('301');
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('falls through to per-item query for show type when show map is absent', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '101', accountID: 7, viewedAt: 1700000000 }],
      },
    });
    (service as any).plexClient = { queryAll };

    await service.getWatchHistory('10', true, 'show');

    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=10'),
      }),
      true,
    );
  });

  it('falls through to per-item query when the bulk map is absent', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [] },
    });
    (service as any).plexClient = { queryAll };

    await service.getWatchHistory('5', true, 'movie');

    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=5'),
      }),
      true,
    );
  });
});

describe('PlexApiService overlay helpers', () => {
  let service: PlexApiService;
  let logger: Mocked<MaintainerrLogger>;
  let loggerFactory: Mocked<MaintainerrLoggerFactory>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();

    service = unit;
    logger = unitRef.get(MaintainerrLogger);
    loggerFactory = unitRef.get(MaintainerrLoggerFactory);

    loggerFactory.createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any);
  });

  it('returns an empty library list when the Plex client is not initialized', async () => {
    await expect(service.getLibraries()).resolves.toEqual([]);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Plex client not initialized, skipping getLibraries',
    );
  });

  it('returns no overlay sections when Plex is not initialized', async () => {
    await expect(service.getOverlayLibrarySections()).resolves.toEqual([]);
  });
});
