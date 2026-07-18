import { Mocked, TestBed } from '@suites/unit';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import { Settings } from '../../settings/entities/settings.entities';
import { SettingsDataService } from '../../settings/settings-data.service';
import { WATCH_HISTORY_BULK_CACHE_KEY } from './plex-api.constants';
import { PlexConnection } from './interfaces/server.interface';
import { PlexApiService } from './plex-api.service';

const createDeferred = () => {
  let resolve: () => void;
  let reject: (error?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
};

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

  it('returns a confirmed empty list when a collection has no children', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { size: 0 },
    });

    (service as any).plexClient = { queryAll };

    expect(await service.getCollectionChildren('col-1')).toEqual([]);
  });

  it('re-throws children query failures instead of reporting an empty collection', async () => {
    const queryAll = jest.fn().mockRejectedValue(new Error('boom'));

    (service as any).plexClient = { queryAll };

    await expect(service.getCollectionChildren('col-1')).rejects.toThrow(
      'boom',
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

  it('unwraps lib/plexApi-wrapped errors to surface the 400 response body', async () => {
    // lib/plexApi throws a plain Error with the axios failure on `cause`.
    const putQuery = jest.fn().mockRejectedValue(
      new Error(
        'PUT http://plex.local:32400/li...55 failed with exception: Plex Server didnt respond with a valid 2xx status code, response code: 400',
        {
          cause: {
            isAxiosError: true,
            response: {
              status: 400,
              statusText: 'Bad Request',
              data: { errors: [{ message: 'unable to match items' }] },
            },
          },
        },
      ),
    );

    (service as any).machineId = 'machine123';
    (service as any).plexClient = { putQuery };

    const result = await service.addChildrenToCollection('55', ['1', '2']);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'NOK',
        code: 400,
        message:
          'Plex request failed with 400 Bad Request. Response body: {"errors":[{"message":"unable to match items"}]}',
      }),
    );
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

  it('flushes the watch-history snapshot on uninitialize (server/token switch)', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    const bulkCache = cacheManager.getCache('plexwatchhistory').data;
    bulkCache.set(WATCH_HISTORY_BULK_CACHE_KEY, new Map([['1', [{}]]]));

    service.uninitialize();

    expect(bulkCache.has(WATCH_HISTORY_BULK_CACHE_KEY)).toBe(false);
    expect((service as any).watchHistoryPrefetch).toBeUndefined();
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

  it('probes /identity (not bare /) so it works behind reverse proxies', async () => {
    jest.restoreAllMocks();
    // Bare `/` 401s behind reverse proxies; `/identity` returns the same
    // machineIdentifier + version without auth quirks.
    const query = jest.fn().mockResolvedValue({
      MediaContainer: { machineIdentifier: 'm1', version: '1.43.2' },
    });
    (service as any).plexClient = { query };

    const status = await service.getStatus();

    expect(query).toHaveBeenCalledWith('/identity', false);
    expect(status).toEqual({ machineIdentifier: 'm1', version: '1.43.2' });
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

    // Clear the bulk watch-history cache entries between tests
    const cacheManager = (await import('../lib/cache')).default;
    const bulkCache = cacheManager.getCache('plexwatchhistory')?.data;
    bulkCache?.del(WATCH_HISTORY_BULK_CACHE_KEY);
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
        totalSize: 3,
      },
    });

    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory();

    expect(queryAll).toHaveBeenCalledWith(
      { uri: '/status/sessions/history/all?sort=viewedAt:desc' },
      false,
      undefined,
      expect.any(Function),
    );

    const cacheManager = (await import('../lib/cache')).default;
    const leafMap = cacheManager
      .getCache('plexwatchhistory')
      .data.get<Map<string, unknown[]>>(WATCH_HISTORY_BULK_CACHE_KEY);

    expect(leafMap).toBeDefined();
    expect(leafMap?.get('1')).toHaveLength(2);
    expect(leafMap?.get('2')).toHaveLength(1);
  });

  it('logs watch-history prefetch progress in 10% steps as pages arrive', async () => {
    const totalSize = 1000;
    const queryAll = jest
      .fn()
      .mockImplementation(
        async (
          _query: unknown,
          _useCache: unknown,
          _signal: unknown,
          onProgress?: (p: { fetched: number; totalSize: number }) => void,
        ) => {
          // Drive the callback the way queryAll does, one page at a time.
          for (let fetched = 100; fetched <= totalSize; fetched += 100) {
            onProgress?.({ fetched, totalSize });
          }
          return {
            MediaContainer: {
              Metadata: Array.from({ length: totalSize }, (_v, i) => ({
                ratingKey: String(i % 3),
                type: 'movie',
                accountID: 1,
                viewedAt: i,
              })),
              totalSize,
            },
          };
        },
      );

    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory();

    const progressLogs = (logger.log as jest.Mock).mock.calls
      .map((call) => call[0])
      .filter(
        (message) =>
          typeof message === 'string' &&
          message.startsWith('Prefetching watch history:'),
      );

    // Deciles 10..90 each logged once; the terminal 100% is left to the
    // "prefetch complete" line, so it is never emitted as progress.
    expect(progressLogs).toHaveLength(9);
    expect(progressLogs[0]).toBe(
      'Prefetching watch history: 100 of 1000 records (10%)...',
    );
    expect(progressLogs[8]).toBe(
      'Prefetching watch history: 900 of 1000 records (90%)...',
    );
  });

  it('emits no progress line when the whole history fits in one page', async () => {
    // The single (final) page reports fetched == totalSize; logging it would
    // print a misleading partial percentage, so it must stay silent and let the
    // completion line report the total.
    const totalSize = 42;
    const queryAll = jest
      .fn()
      .mockImplementation(
        async (
          _query: unknown,
          _useCache: unknown,
          _signal: unknown,
          onProgress?: (p: { fetched: number; totalSize: number }) => void,
        ) => {
          onProgress?.({ fetched: totalSize, totalSize });
          return {
            MediaContainer: {
              Metadata: Array.from({ length: totalSize }, (_v, i) => ({
                ratingKey: String(i),
                type: 'movie',
                accountID: 1,
                viewedAt: i,
              })),
              totalSize,
            },
          };
        },
      );

    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory();

    const progressLogs = (logger.log as jest.Mock).mock.calls
      .map((call) => call[0])
      .filter(
        (message) =>
          typeof message === 'string' &&
          message.startsWith('Prefetching watch history:'),
      );

    expect(progressLogs).toEqual([]);
  });

  it('indexes episode records in the leaf map by ratingKey', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [
          {
            ratingKey: '101',
            type: 'episode',
            accountID: 1,
            viewedAt: 1700000001,
          },
          {
            ratingKey: '101',
            type: 'episode',
            accountID: 2,
            viewedAt: 1700000002,
          },
          {
            ratingKey: '103',
            type: 'episode',
            accountID: 2,
            viewedAt: 1700000003,
          },
        ],
        totalSize: 3,
      },
    });

    (service as any).plexClient = { queryAll };
    await service.prefetchWatchHistory();

    const cacheManager = (await import('../lib/cache')).default;
    const leafMap = cacheManager
      .getCache('plexwatchhistory')
      .data.get<Map<string, unknown[]>>(WATCH_HISTORY_BULK_CACHE_KEY);

    expect(leafMap?.get('101')).toHaveLength(2);
    expect(leafMap?.get('103')).toHaveLength(1);
  });

  it('skips the fetch when the bulk map is already cached', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [], totalSize: 0 },
    });

    (service as any).plexClient = { queryAll };

    // First call populates the cache
    await service.prefetchWatchHistory();
    // Second call should not hit the API again
    await service.prefetchWatchHistory();

    expect(queryAll).toHaveBeenCalledTimes(1);
  });

  it('does not cache the map when the sweep is unverifiable (missing/short totalSize)', async () => {
    const cacheManager = (await import('../lib/cache')).default;

    // A full-looking page with no totalSize: queryAll may have truncated, so the
    // map must NOT be cached - callers fall back to the per-item query instead.
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [
          { ratingKey: '1', type: 'movie', accountID: 1, viewedAt: 1 },
        ],
      },
    });
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory();

    expect(
      cacheManager
        .getCache('plexwatchhistory')
        .data.has(WATCH_HISTORY_BULK_CACHE_KEY),
    ).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unverifiable result'),
    );
  });

  it('logs a warning and does not throw when the Plex API call fails', async () => {
    const queryAll = jest.fn().mockRejectedValue(new Error('network error'));

    (service as any).plexClient = { queryAll };

    await expect(service.prefetchWatchHistory()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Watch history prefetch failed'),
    );
  });

  it('propagates aborts while the bulk watch-history fetch is in flight', async () => {
    const abortController = new AbortController();
    const requestStarted = createDeferred();
    const queryAll = jest.fn().mockImplementation(async () => {
      requestStarted.resolve();
      await new Promise((_resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => reject(abortController.signal.reason),
          { once: true },
        );
      });
    });

    (service as any).plexClient = { queryAll };

    const prefetch = service.prefetchWatchHistory(abortController.signal);
    await requestStarted.promise;
    abortController.abort();

    await expect(prefetch).rejects.toMatchObject({ name: 'AbortError' });
    expect(queryAll).toHaveBeenCalledWith(
      { uri: '/status/sessions/history/all?sort=viewedAt:desc' },
      false,
      abortController.signal,
      expect.any(Function),
    );
    expect(logger.warn).not.toHaveBeenCalled();

    const cacheManager = (await import('../lib/cache')).default;
    expect(
      cacheManager
        .getCache('plexwatchhistory')
        .data.has(WATCH_HISTORY_BULK_CACHE_KEY),
    ).toBe(false);
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

    // Clear the bulk watch-history cache entries between tests
    const cacheManager = (await import('../lib/cache')).default;
    const bulkCache = cacheManager.getCache('plexwatchhistory')?.data;
    bulkCache?.del(WATCH_HISTORY_BULK_CACHE_KEY);
  });

  it('returns results from the bulk map for movie items when the map is populated', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    const bulkMap = new Map([
      ['42', [{ ratingKey: '42', accountID: 10, viewedAt: 1700000000 }]],
    ]);
    cacheManager
      .getCache('plexwatchhistory')
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
      .getCache('plexwatchhistory')
      .data.set(WATCH_HISTORY_BULK_CACHE_KEY, bulkMap);

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('99', true, 'movie');

    expect(result).toEqual([]);
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('always rolls up show queries server-side via the per-item query, even when the leaf map is populated', async () => {
    // Show/season history is not in the bulk (leaf) map; it must come from the
    // per-item metadataItemID query so Plex rolls up descendant episodes.
    const cacheManager = (await import('../lib/cache')).default;
    cacheManager
      .getCache('plexwatchhistory')
      .data.set(
        WATCH_HISTORY_BULK_CACHE_KEY,
        new Map([['10', [{ ratingKey: '10' }]]]),
      );

    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '101', accountID: 7, viewedAt: 1700000000 }],
      },
    });
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('10', true, 'show');

    expect(result).toHaveLength(1);
    expect(result[0].ratingKey).toBe('101');
    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=10'),
      }),
      true,
    );
  });

  it('always rolls up season queries server-side via the per-item query, even when the leaf map is populated', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    cacheManager
      .getCache('plexwatchhistory')
      .data.set(
        WATCH_HISTORY_BULK_CACHE_KEY,
        new Map([['20', [{ ratingKey: '20' }]]]),
      );

    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '201', accountID: 3, viewedAt: 1700000001 }],
      },
    });
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('20', true, 'season');

    expect(result).toHaveLength(1);
    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=20'),
      }),
      true,
    );
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
      .getCache('plexwatchhistory')
      .data.set(WATCH_HISTORY_BULK_CACHE_KEY, leafMap);

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('301', true, 'episode');

    expect(result).toHaveLength(1);
    expect(result[0].ratingKey).toBe('301');
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('bypasses the bulk snapshot for explicit useCache: false callers and reads per-item', async () => {
    // Keep an escape hatch for callers that explicitly need a live per-item
    // read; rule evaluation uses useCache: true to share the run snapshot.
    const cacheManager = (await import('../lib/cache')).default;
    const bulkMap = new Map([
      ['42', [{ ratingKey: '42', accountID: 10, viewedAt: 1700000000 }]],
    ]);
    cacheManager
      .getCache('plexwatchhistory')
      .data.set(WATCH_HISTORY_BULK_CACHE_KEY, bulkMap);

    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '42', accountID: 99, viewedAt: 1720000000 }],
      },
    });
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('42', false, 'movie');

    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=42'),
      }),
      false,
    );
    expect(result[0].accountID).toBe(99);
  });

  it('passes useCache: false through to the per-item query when the bulk map is absent', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [] },
    });
    (service as any).plexClient = { queryAll };

    await service.getWatchHistory('42', false, 'movie');

    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=42'),
      }),
      false,
    );
  });

  it('serves untyped callers from the leaf map on a hit', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    const bulkMap = new Map([
      ['42', [{ ratingKey: '42', accountID: 10, viewedAt: 1700000000 }]],
    ]);
    cacheManager
      .getCache('plexwatchhistory')
      .data.set(WATCH_HISTORY_BULK_CACHE_KEY, bulkMap);

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('42');

    expect(result).toHaveLength(1);
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('falls through to per-item query for untyped callers on a leaf-map miss', async () => {
    // Untyped callers may pass show or season ratingKeys, which are never in
    // the leaf map - a miss must not be reported as confirmed-empty history.
    const cacheManager = (await import('../lib/cache')).default;
    cacheManager
      .getCache('plexwatchhistory')
      .data.set(WATCH_HISTORY_BULK_CACHE_KEY, new Map());

    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '101', accountID: 7, viewedAt: 1700000000 }],
      },
    });
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('10');

    expect(result).toHaveLength(1);
    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=10'),
      }),
      true,
    );
  });

  it('returns a copy so callers sorting in place do not mutate the cached array', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    const records = [
      { ratingKey: '42', accountID: 10, viewedAt: 2 },
      { ratingKey: '42', accountID: 11, viewedAt: 1 },
    ];
    const bulkMap = new Map([['42', records]]);
    cacheManager
      .getCache('plexwatchhistory')
      .data.set(WATCH_HISTORY_BULK_CACHE_KEY, bulkMap);

    (service as any).plexClient = { queryAll: jest.fn() };

    const first = await service.getWatchHistory('42', true, 'movie');
    first.sort((a: any, b: any) => a.viewedAt - b.viewedAt);
    first.pop();

    const second = await service.getWatchHistory('42', true, 'movie');
    expect(second.map((r: any) => r.accountID)).toEqual([10, 11]);
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
