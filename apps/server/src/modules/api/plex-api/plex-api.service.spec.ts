import { Mocked, TestBed } from '@suites/unit';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import { Settings } from '../../settings/entities/settings.entities';
import { SettingsDataService } from '../../settings/settings-data.service';
import {
  PLEX_PAGE_SIZE,
  WATCH_HISTORY_EXCLUDE_FIELDS,
  WATCH_HISTORY_MAX_ENTRIES,
  watchHistoryCacheKey,
} from './plex-api.constants';
import { PlexConnection } from './interfaces/server.interface';
import { NO_TIMEOUT } from '../lib/httpTimeouts';
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

  // A membership decision made from a stale child list has already produced
  // phantom manual members once (#1446), and nothing invalidated this cache.
  it('drops the cached child pages after a collection add, and after one that failed', async () => {
    const invalidateCachedUri = jest.fn();
    (service as any).plexClient = {
      putQuery: jest
        .fn()
        .mockResolvedValue({ MediaContainer: { Metadata: [{}] } }),
      invalidateCachedUri,
    };
    (service as any).machineId = 'machine-1';

    await service.addChildrenToCollection('col-1', ['item-1']);

    expect(invalidateCachedUri).toHaveBeenCalledWith(
      '/library/collections/col-1/children',
    );

    // The batch path is the one collection sync uses: Plex commits a write it
    // has begun and can answer past the client timeout, so the cached list is
    // no more trustworthy than on the success path.
    invalidateCachedUri.mockClear();
    (service as any).plexClient.putQuery = jest
      .fn()
      .mockRejectedValue(new Error('timeout of 30000ms exceeded'));

    await service.addChildrenToCollection('col-1', ['item-1']);
    expect(invalidateCachedUri).toHaveBeenCalledWith(
      '/library/collections/col-1/children',
    );
  });

  it('drops the cached child pages after a removal, and after one that failed', async () => {
    const invalidateCachedUri = jest.fn();
    (service as any).plexClient = {
      deleteQuery: jest.fn().mockResolvedValue({}),
      invalidateCachedUri,
    };

    await service.deleteChildFromCollection('col-1', 'item-1');
    expect(invalidateCachedUri).toHaveBeenCalledWith(
      '/library/collections/col-1/children',
    );

    // A write that failed may still have been applied, so the cached list is no
    // more trustworthy than on the success path.
    invalidateCachedUri.mockClear();
    (service as any).plexClient.deleteQuery = jest
      .fn()
      .mockRejectedValue(new Error('timeout of 30000ms exceeded'));

    await service.deleteChildFromCollection('col-1', 'item-1');
    expect(invalidateCachedUri).toHaveBeenCalledWith(
      '/library/collections/col-1/children',
    );
  });

  // #3449: a collection still listing deleted media logged one
  // "is the application running?" ERROR per item against a healthy Plex.
  it('reports a 404 as a missing item, not as a communication failure', async () => {
    (service as any).plexClient = {
      query: jest.fn().mockRejectedValue(
        new Error('GET /library/metadata/123 failed: not found', {
          cause: { response: { status: 404 } } as any,
        }),
      ),
    };

    expect(await service.getMetadata('123')).toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('still reports a non-404 metadata failure as a communication failure', async () => {
    (service as any).plexClient = {
      query: jest.fn().mockRejectedValue(
        new Error('GET /library/metadata/123 failed: server error', {
          cause: { response: { status: 503 } } as any,
        }),
      ),
    };

    expect(await service.getMetadata('123')).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Plex api communication failure.. Is the application running?',
    );
  });

  it('reads an all-missing batch as an empty answer, not a failure', async () => {
    (service as any).plexClient = {
      query: jest.fn().mockRejectedValue(
        new Error('GET /library/metadata/1,2 failed: not found', {
          cause: { response: { status: 404 } } as any,
        }),
      ),
    };

    expect(await service.getMetadataBatch(['1', '2'])).toEqual([]);
    expect(logger.error).not.toHaveBeenCalled();
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

  it('asks for external guids so children arrive with provider ids', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [{ ratingKey: '1' }] },
    });

    (service as any).plexClient = { queryAll };

    await service.getCollectionChildren('col-1');

    expect(queryAll).toHaveBeenCalledWith(
      { uri: '/library/collections/col-1/children?includeGuids=1' },
      true,
    );
  });

  it('reads a batch of ids in one guid-carrying metadata request', async () => {
    const query = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [{ ratingKey: '1' }, { ratingKey: '2' }] },
    });

    (service as any).plexClient = { query };

    expect(await service.getMetadataBatch(['1', '2'])).toHaveLength(2);
    expect(query).toHaveBeenCalledWith('/library/metadata/1,2?includeGuids=1');
  });

  it('makes no request for an empty batch', async () => {
    const query = jest.fn();

    (service as any).plexClient = { query };

    expect(await service.getMetadataBatch([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('reports no ids rather than failing the caller when a batch read fails', async () => {
    const query = jest.fn().mockRejectedValue(new Error('boom'));

    (service as any).plexClient = { query };

    expect(await service.getMetadataBatch(['1'])).toEqual([]);
  });

  it('re-throws children query failures instead of reporting an empty collection', async () => {
    const queryAll = jest.fn().mockRejectedValue(new Error('boom'));

    (service as any).plexClient = { queryAll };

    await expect(service.getCollectionChildren('col-1')).rejects.toThrow(
      'boom',
    );
  });

  it('returns a confirmed empty page when a library section has no items', async () => {
    const query = jest.fn().mockResolvedValue({
      MediaContainer: { totalSize: 0 },
    });

    (service as any).plexClient = { query };

    expect(await service.getLibraryContents('1')).toEqual({
      totalSize: 0,
      items: [],
    });
  });

  it('re-throws library page read failures instead of reporting an empty page', async () => {
    const query = jest.fn().mockRejectedValue(new Error('boom'));

    (service as any).plexClient = { query };

    await expect(service.getLibraryContents('1')).rejects.toThrow('boom');
  });

  it('throws on a library page response without a MediaContainer', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    (service as any).plexClient = { query };

    await expect(service.getLibraryContents('1')).rejects.toThrow(
      'no MediaContainer',
    );
  });

  it('builds a single encoded collection uri when adding multiple children', async () => {
    const putQuery = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [{ ratingKey: '123' }] },
    });

    (service as any).machineId = 'machine123';
    (service as any).plexClient = { putQuery, invalidateCachedUri: jest.fn() };

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
    (service as any).plexClient = { putQuery, invalidateCachedUri: jest.fn() };

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
    (service as any).plexClient = { putQuery, invalidateCachedUri: jest.fn() };

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
    (service as any).plexClient = { putQuery, invalidateCachedUri: jest.fn() };

    await service.setCollectionCustomSort('55');

    expect(putQuery).toHaveBeenCalledWith({
      uri: '/library/metadata/55/prefs?collectionSort=2',
    });
  });

  it('omits the after parameter when moving an item to the front', async () => {
    const putQuery = jest.fn().mockResolvedValue(undefined);
    (service as any).plexClient = { putQuery, invalidateCachedUri: jest.fn() };

    await service.moveCollectionItem('55', '99');

    expect(putQuery).toHaveBeenCalledWith({
      uri: '/library/collections/55/items/99/move',
    });
  });

  it('places an item after the given sibling when moving', async () => {
    const putQuery = jest.fn().mockResolvedValue(undefined);
    (service as any).plexClient = { putQuery, invalidateCachedUri: jest.fn() };

    await service.moveCollectionItem('55', '99', '42');

    expect(putQuery).toHaveBeenCalledWith({
      uri: '/library/collections/55/items/99/move?after=42',
    });
  });

  it('uses the canonical Plex items path when deleting a collection child', async () => {
    const deleteQuery = jest.fn().mockResolvedValue(undefined);

    (service as any).plexClient = {
      deleteQuery,
      invalidateCachedUri: jest.fn(),
    };

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
    (service as any).plexClient = { putQuery, invalidateCachedUri: jest.fn() };

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
    jest.spyOn(service, 'getUserDataFromPlexTv').mockResolvedValue([]);
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

  it('throws from getCorrectedUsers when plex.tv user data is unavailable', async () => {
    // A silent fallback to local account names produced plausible-but-wrong
    // lists that rules acted on (#3307). Getters catch this and return the
    // transient `undefined`.
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

    await expect(service.getCorrectedUsers()).rejects.toThrow(
      'plex.tv user data unavailable',
    );
  });

  it('throws from getCorrectedUsers when the plex.tv owner fetch fails', async () => {
    jest.spyOn(service, 'getUsers').mockResolvedValue([
      {
        id: 1,
        name: 'owner',
      } as any,
    ]);
    jest.spyOn(service, 'getUserDataFromPlexTv').mockResolvedValue([]);
    jest.spyOn(service, 'getOwnerDataFromPlexTv').mockResolvedValue(undefined);

    await expect(service.getCorrectedUsers()).rejects.toThrow(
      'plex.tv user data unavailable',
    );
  });

  it('returns a confirmed empty list from getUserDataFromPlexTv when the account has no shared users', async () => {
    (service as any).plexTvClient = {
      getUsers: jest.fn().mockResolvedValue({ MediaContainer: {} }),
    };

    await expect(service.getUserDataFromPlexTv()).resolves.toEqual([]);
  });

  it('returns undefined from getUserDataFromPlexTv when the plex.tv fetch fails', async () => {
    (service as any).plexTvClient = {
      getUsers: jest.fn().mockRejectedValue(new Error('boom')),
    };

    await expect(service.getUserDataFromPlexTv()).resolves.toBeUndefined();
  });

  it('re-throws library count read failures instead of reporting zero', async () => {
    const query = jest.fn().mockRejectedValue(new Error('boom'));

    (service as any).plexClient = { query };

    await expect(service.getLibraryContentCount('1')).rejects.toThrow('boom');
  });

  it('ignores avatar urls that do not match the expected plex shape', async () => {
    jest.spyOn(service, 'getUsers').mockResolvedValue([
      {
        id: 1,
        name: 'owner',
      } as any,
    ]);
    jest.spyOn(service, 'getUserDataFromPlexTv').mockResolvedValue([]);
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

// The diagnostic still distinguishes a missing section from an auth failure;
// #3344 only changed the outcome - every failure now propagates instead of
// reading downstream as "this library has no collections".
describe('PlexApiService.deleteMediaFromDisk', () => {
  let service: PlexApiService;

  beforeEach(async () => {
    const { unit } = await TestBed.solitary(PlexApiService).compile();
    service = unit;
  });

  // Plex removes the file before it answers, so the request waits for it. The
  // failure has to reach the caller: swallowed here, the adapter logged a
  // success and the handler retired an item whose file was still on disk.
  it('waits for the answer and surfaces a refused delete', async () => {
    const deleteQuery = jest.fn().mockRejectedValue(new Error('denied'));
    (service as any).plexClient = { deleteQuery };

    await expect(service.deleteMediaFromDisk('4')).rejects.toThrow('denied');
    expect(deleteQuery).toHaveBeenCalledWith({
      uri: '/library/metadata/4',
      timeout: NO_TIMEOUT,
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

    await expect(service.getCollections('42')).rejects.toThrow();

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

    await expect(service.getCollections('42')).rejects.toThrow();

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

    await expect(service.getCollections('42')).rejects.toThrow();

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

    await expect(service.getCollections('42')).rejects.toThrow();

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

    await expect(service.getCollections('42')).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      'Plex api communication failure.. Is the application running?',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  // #3344: link lookups pass useCache=false, so a collection created since the
  // last read is not reported as missing.
  it('forwards the cache preference to the client', async () => {
    const queryAll = jest.fn().mockResolvedValue({ MediaContainer: {} });
    (service as any).plexClient = { queryAll };

    await service.getCollections('42');
    expect(queryAll).toHaveBeenCalledWith(expect.anything(), true);

    await service.getCollections('42', undefined, false);
    expect(queryAll).toHaveBeenLastCalledWith(expect.anything(), false);
  });
});

// #3344: a duplicate collection appears beside the real one when a failed
// lookup is read as "deleted". Only a 404 may mean deleted.
describe('PlexApiService.getCollection (missing vs unreachable)', () => {
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
  });

  it('returns undefined when Plex answers 404', async () => {
    (service as any).plexClient = {
      query: jest.fn().mockRejectedValue(
        new Error('GET /library/collections/7 failed: not found', {
          cause: { response: { status: 404 } } as any,
        }),
      ),
    };

    await expect(service.getCollection(7)).resolves.toBeUndefined();
  });

  it.each([
    ['a 500 response', { response: { status: 500 } }],
    ['an auth failure', { response: { status: 401 } }],
    ['a transport failure', undefined],
  ])('rethrows on %s', async (label, cause) => {
    const wrapped = new Error('GET /library/collections/7 failed', {
      cause: cause as any,
    });
    (service as any).plexClient = {
      query: jest.fn().mockRejectedValue(wrapped),
    };

    await expect(service.getCollection(7)).rejects.toBe(wrapped);
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
    bulkCache.set(watchHistoryCacheKey('1'), { leaf: new Map([['1', [{}]]]) });

    service.uninitialize();

    expect(bulkCache.has(watchHistoryCacheKey('1'))).toBe(false);
    expect((service as any).watchHistoryPrefetches.size).toBe(0);
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

  const LIBRARY = '3';

  const historyRow = (over: Record<string, unknown> = {}) => ({
    ratingKey: '1',
    type: 'movie',
    accountID: 1,
    viewedAt: 1700000000,
    ...over,
  });

  const episodeRow = (over: Record<string, unknown> = {}) =>
    historyRow({
      type: 'episode',
      parentKey: '/library/metadata/900',
      grandparentKey: '/library/metadata/800',
      ...over,
    });

  // The sweep proves its rollup with one live per-item read; unless a test says
  // otherwise, have that read agree with what the rollup claims.
  const agreeingVerification = (rows: Record<string, unknown>[]) =>
    jest
      .fn()
      .mockImplementation(async (query: { uri: string }) =>
        query.uri.includes('metadataItemID')
          ? { MediaContainer: { Metadata: rows } }
          : { MediaContainer: { Metadata: rows, totalSize: rows.length } },
      );

  const snapshotFor = async (libraryId: string) => {
    const cacheManager = (await import('../lib/cache')).default;
    return cacheManager
      .getCache('plexwatchhistory')
      .data.get<any>(watchHistoryCacheKey(libraryId));
  };

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

    const cacheManager = (await import('../lib/cache')).default;
    cacheManager.getCache('plexwatchhistory')?.data.flushAll();
  });

  it('sweeps only the requested library, trimmed and paged for a long sweep', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [historyRow()], totalSize: 1 },
    });
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    const [request, useCache, signal, onProgress, pageSize] =
      queryAll.mock.calls[0];
    expect(request.uri).toContain(`librarySectionID=${LIBRARY}`);
    expect(request.uri).toContain(
      `excludeFields=${WATCH_HISTORY_EXCLUDE_FIELDS}`,
    );
    // Fields the getters read must never be excluded.
    for (const kept of ['ratingKey', 'viewedAt', 'accountID', 'parentIndex']) {
      expect(WATCH_HISTORY_EXCLUDE_FIELDS.split(',')).not.toContain(kept);
    }
    expect(useCache).toBe(false);
    expect(signal).toBeUndefined();
    expect(onProgress).toEqual(expect.any(Function));
    expect(pageSize).toBe(PLEX_PAGE_SIZE.MAX_PAGE_SIZE);
  });

  it('rolls episodes up to their show and season once Plex confirms the rollup', async () => {
    const rows = [
      episodeRow({ ratingKey: '101', viewedAt: 1 }),
      episodeRow({ ratingKey: '102', viewedAt: 2 }),
      episodeRow({
        ratingKey: '201',
        viewedAt: 3,
        parentKey: '/library/metadata/901',
      }),
    ];
    const queryAll = agreeingVerification(rows);
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    const snapshot = await snapshotFor(LIBRARY);
    expect(snapshot?.rollup?.show.get('800')).toHaveLength(3);
    expect(snapshot?.rollup?.season.get('900')).toHaveLength(2);
    expect(snapshot?.rollup?.season.get('901')).toHaveLength(1);
  });

  it('drops the rollup when Plex disagrees with what it claims for a show', async () => {
    // A connection whose parent keys parse to the wrong id would build a
    // plausible-looking rollup that under-reports the show. The sweep asks
    // Plex the same question and throws the rollup away when it differs.
    const rows = [episodeRow({ ratingKey: '101', viewedAt: 1 })];
    const queryAll = jest
      .fn()
      .mockImplementation(async (query: { uri: string }) =>
        query.uri.includes('metadataItemID')
          ? {
              MediaContainer: {
                Metadata: [
                  ...rows,
                  episodeRow({ ratingKey: '102', viewedAt: 2 }),
                ],
              },
            }
          : { MediaContainer: { Metadata: rows, totalSize: rows.length } },
      );
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    const snapshot = await snapshotFor(LIBRARY);
    expect(snapshot?.leaf.get('101')).toHaveLength(1);
    expect(snapshot?.rollup).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('disagreed with Plex'),
    );
  });

  it('drops the rollup when the verification read fails', async () => {
    const rows = [episodeRow({ ratingKey: '101', viewedAt: 1 })];
    const queryAll = jest
      .fn()
      .mockImplementation(async (query: { uri: string }) => {
        if (query.uri.includes('metadataItemID')) throw new Error('network');
        return { MediaContainer: { Metadata: rows, totalSize: rows.length } };
      });
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    const snapshot = await snapshotFor(LIBRARY);
    expect(snapshot?.leaf.get('101')).toHaveLength(1);
    expect(snapshot?.rollup).toBeUndefined();
  });

  it('stands the rollup down when any episode row lacks its parent keys', async () => {
    const rows = [
      episodeRow({ ratingKey: '101', viewedAt: 1 }),
      episodeRow({ ratingKey: '102', viewedAt: 2, grandparentKey: undefined }),
    ];
    const queryAll = agreeingVerification(rows);
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    const snapshot = await snapshotFor(LIBRARY);
    expect(snapshot?.leaf.get('101')).toHaveLength(1);
    expect(snapshot?.rollup).toBeUndefined();
    // No rollup to prove, so no verification request was spent on it.
    expect(
      queryAll.mock.calls.filter((c: any[]) =>
        c[0].uri.includes('metadataItemID'),
      ),
    ).toHaveLength(0);
  });

  it('never verifies a movie-only library', async () => {
    const rows = [historyRow({ ratingKey: '5' })];
    const queryAll = agreeingVerification(rows);
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    expect(
      queryAll.mock.calls.filter((c: any[]) =>
        c[0].uri.includes('metadataItemID'),
      ),
    ).toHaveLength(0);
    expect((await snapshotFor(LIBRARY))?.rollup?.show.size ?? 0).toBe(0);
  });

  it('abandons an oversized history after one request instead of paging it all', async () => {
    // Nothing else bounds this map, and queryAll materialises every row before
    // returning, so the only place to stop is the totalSize on page one.
    const queryAll = jest
      .fn()
      .mockImplementation(
        async (
          query: unknown,
          useCache: unknown,
          signal: unknown,
          onProgress?: (p: { fetched: number; totalSize: number }) => void,
        ) => {
          onProgress?.({
            fetched: 500,
            totalSize: WATCH_HISTORY_MAX_ENTRIES + 1,
          });
          return { MediaContainer: { Metadata: [], totalSize: 0 } };
        },
      );
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    expect(queryAll).toHaveBeenCalledTimes(1);
    expect(await snapshotFor(LIBRARY)).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(`passed ${WATCH_HISTORY_MAX_ENTRIES} entries`),
    );
  });

  it('indexes movie records in the snapshot by ratingKey', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [
          historyRow({ ratingKey: '1', accountID: 10 }),
          historyRow({ ratingKey: '2', accountID: 11 }),
          historyRow({ ratingKey: '1', accountID: 12 }),
        ],
        totalSize: 3,
      },
    });
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    const snapshot = await snapshotFor(LIBRARY);
    expect(snapshot?.leaf.get('1')).toHaveLength(2);
    expect(snapshot?.leaf.get('2')).toHaveLength(1);
  });

  // Playback finishing mid-sweep shifts every later offset by one, so the row
  // at the boundary comes back on the next page too.
  it('counts a row re-read by a shifted page only once', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [
          historyRow({ ratingKey: '1', accountID: 10, viewedAt: 1700000000 }),
          historyRow({ ratingKey: '1', accountID: 10, viewedAt: 1700000000 }),
          historyRow({ ratingKey: '1', accountID: 10, viewedAt: 1700000900 }),
          historyRow({ ratingKey: '1', accountID: 11, viewedAt: 1700000000 }),
        ],
        totalSize: 4,
      },
    });
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    // The duplicate is dropped; a different view time and a different account
    // are distinct views and stay.
    expect((await snapshotFor(LIBRARY))?.leaf.get('1')).toHaveLength(3);
  });

  it('caches per library, so one library does not answer for another', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [historyRow()], totalSize: 1 },
    });
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory('1');

    expect(await snapshotFor('1')).toBeDefined();
    expect(await snapshotFor('2')).toBeUndefined();

    await service.prefetchWatchHistory('2');
    expect(queryAll).toHaveBeenCalledTimes(2);
    expect(queryAll.mock.calls[1][0].uri).toContain('librarySectionID=2');
  });

  it('logs watch-history prefetch progress in 10% steps as pages arrive', async () => {
    const totalSize = 1000;
    const queryAll = jest
      .fn()
      .mockImplementation(
        async (
          query: unknown,
          useCache: unknown,
          signal: unknown,
          onProgress?: (p: { fetched: number; totalSize: number }) => void,
        ) => {
          // Drive the callback the way queryAll does, one page at a time.
          for (let fetched = 100; fetched <= totalSize; fetched += 100) {
            onProgress?.({ fetched, totalSize });
          }
          return {
            MediaContainer: {
              Metadata: Array.from({ length: totalSize }, (v, i) =>
                historyRow({ ratingKey: String(i % 3), viewedAt: i }),
              ),
              totalSize,
            },
          };
        },
      );

    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    const prefix = `Prefetching watch history for library ${LIBRARY}:`;
    const progressLogs = (logger.log as jest.Mock).mock.calls
      .map((call) => call[0])
      .filter(
        (message) => typeof message === 'string' && message.startsWith(prefix),
      );

    // Deciles 10..90 each logged once; the terminal 100% is left to the
    // "prefetch complete" line, so it is never emitted as progress.
    expect(progressLogs).toHaveLength(9);
    expect(progressLogs[0]).toBe(`${prefix} 100 of 1000 entries (10%)...`);
    expect(progressLogs[8]).toBe(`${prefix} 900 of 1000 entries (90%)...`);
  });

  it('says what the entry count means on the opening line', async () => {
    // A user compared an 88k entry count against a 6.5k-episode library and
    // read it as a bug; the line has to say it counts view events.
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [historyRow()], totalSize: 1 },
    });
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('one entry per view event, across all users'),
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
          query: unknown,
          useCache: unknown,
          signal: unknown,
          onProgress?: (p: { fetched: number; totalSize: number }) => void,
        ) => {
          onProgress?.({ fetched: totalSize, totalSize });
          return {
            MediaContainer: {
              Metadata: Array.from({ length: totalSize }, (v, i) =>
                historyRow({ ratingKey: String(i), viewedAt: i }),
              ),
              totalSize,
            },
          };
        },
      );

    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    const progressLogs = (logger.log as jest.Mock).mock.calls
      .map((call) => call[0])
      .filter(
        (message) =>
          typeof message === 'string' &&
          message.startsWith(
            `Prefetching watch history for library ${LIBRARY}:`,
          ),
      );

    expect(progressLogs).toEqual([]);
  });

  it('skips the fetch when the library is already cached', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [], totalSize: 0 },
    });

    (service as any).plexClient = { queryAll };

    // First call populates the cache
    await service.prefetchWatchHistory(LIBRARY);
    // Second call should not hit the API again
    await service.prefetchWatchHistory(LIBRARY);

    expect(queryAll).toHaveBeenCalledTimes(1);
  });

  it('does not cache the snapshot when the sweep is unverifiable (missing/short totalSize)', async () => {
    // A full-looking page with no totalSize: queryAll may have truncated, so the
    // snapshot must NOT be cached - callers fall back to the per-item query.
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [historyRow()] },
    });
    (service as any).plexClient = { queryAll };

    await service.prefetchWatchHistory(LIBRARY);

    expect(await snapshotFor(LIBRARY)).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unverifiable result'),
    );
  });

  it('logs a warning and does not throw when the Plex API call fails', async () => {
    const queryAll = jest.fn().mockRejectedValue(new Error('network error'));

    (service as any).plexClient = { queryAll };

    await expect(
      service.prefetchWatchHistory(LIBRARY),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Watch history prefetch'),
    );
  });

  it('propagates aborts while the watch-history sweep is in flight', async () => {
    const abortController = new AbortController();
    const requestStarted = createDeferred();
    const queryAll = jest.fn().mockImplementation(async () => {
      requestStarted.resolve();
      await new Promise((resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => reject(abortController.signal.reason),
          { once: true },
        );
      });
    });

    (service as any).plexClient = { queryAll };

    const prefetch = service.prefetchWatchHistory(
      LIBRARY,
      abortController.signal,
    );
    await requestStarted.promise;
    abortController.abort();

    await expect(prefetch).rejects.toMatchObject({ name: 'AbortError' });
    expect(queryAll.mock.calls[0][2]).toBe(abortController.signal);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(await snapshotFor(LIBRARY)).toBeUndefined();
  });
});

describe('PlexApiService.getWatchHistory snapshot', () => {
  let service: PlexApiService;
  let loggerFactory: Mocked<MaintainerrLoggerFactory>;

  const LIBRARY = '3';

  const setSnapshot = async (libraryId: string, snapshot: unknown) => {
    const cacheManager = (await import('../lib/cache')).default;
    cacheManager
      .getCache('plexwatchhistory')
      .data.set(watchHistoryCacheKey(libraryId), snapshot);
  };

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

    const cacheManager = (await import('../lib/cache')).default;
    cacheManager.getCache('plexwatchhistory')?.data.flushAll();
  });

  it('returns results from the snapshot for movie items', async () => {
    await setSnapshot(LIBRARY, {
      leaf: new Map([
        ['42', [{ ratingKey: '42', accountID: 10, viewedAt: 1700000000 }]],
      ]),
    });

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('42', true, 'movie', LIBRARY);

    expect(result).toHaveLength(1);
    expect((result[0] as any).ratingKey).toBe('42');
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('returns an empty array for a movie missing from a swept library', async () => {
    await setSnapshot(LIBRARY, { leaf: new Map<string, unknown[]>() });

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('99', true, 'movie', LIBRARY);

    expect(result).toEqual([]);
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('reads live when the item belongs to a library we never swept', async () => {
    // The snapshot is authoritative for "never watched" only inside its own
    // library. Answering library 4 from library 3's snapshot would report a
    // false never-watched and delete a watched item.
    await setSnapshot('3', {
      leaf: new Map<string, unknown[]>(),
    });

    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '99', accountID: 7, viewedAt: 1700000000 }],
      },
    });
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('99', true, 'movie', '4');

    expect(result).toHaveLength(1);
    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=99'),
      }),
      true,
    );
  });

  it('reads live when the caller names no library at all', async () => {
    await setSnapshot(LIBRARY, {
      leaf: new Map([['42', [{ ratingKey: '42' }]]]),
    });

    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [] },
    });
    (service as any).plexClient = { queryAll };

    await service.getWatchHistory('42', true, 'movie');

    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=42'),
      }),
      true,
    );
  });

  it('serves show and season queries from a proven rollup', async () => {
    await setSnapshot(LIBRARY, {
      leaf: new Map(),
      rollup: {
        show: new Map([['10', [{ ratingKey: '101', viewedAt: 1 }]]]),
        season: new Map([['20', [{ ratingKey: '201', viewedAt: 2 }]]]),
      },
    });

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    expect(
      await service.getWatchHistory('10', true, 'show', LIBRARY),
    ).toHaveLength(1);
    expect(
      await service.getWatchHistory('20', true, 'season', LIBRARY),
    ).toHaveLength(1);
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('returns a copy of rollup entries so in-place sorts cannot corrupt them', async () => {
    const records = [
      { ratingKey: '101', viewedAt: 2 },
      { ratingKey: '102', viewedAt: 1 },
    ];
    await setSnapshot(LIBRARY, {
      leaf: new Map(),
      rollup: { show: new Map([['10', records]]), season: new Map() },
    });
    (service as any).plexClient = { queryAll: jest.fn() };

    (await service.getWatchHistory('10', true, 'show', LIBRARY)).pop();

    expect(
      await service.getWatchHistory('10', true, 'show', LIBRARY),
    ).toHaveLength(2);
  });

  it('always rolls show queries up server-side via the per-item query', async () => {
    await setSnapshot(LIBRARY, {
      leaf: new Map([['10', [{ ratingKey: '10' }]]]),
    });

    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '101', accountID: 7, viewedAt: 1700000000 }],
      },
    });
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('10', true, 'show', LIBRARY);

    expect(result).toHaveLength(1);
    expect(result[0].ratingKey).toBe('101');
    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=10'),
      }),
      true,
    );
  });

  it('always rolls season queries up server-side via the per-item query', async () => {
    await setSnapshot(LIBRARY, {
      leaf: new Map([['20', [{ ratingKey: '20' }]]]),
    });

    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '201', accountID: 3, viewedAt: 1700000001 }],
      },
    });
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('20', true, 'season', LIBRARY);

    expect(result).toHaveLength(1);
    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=20'),
      }),
      true,
    );
  });

  it('serves episode queries from the snapshot without a per-item call', async () => {
    await setSnapshot(LIBRARY, {
      leaf: new Map([
        [
          '301',
          [
            {
              ratingKey: '301',
              type: 'episode',
              accountID: 5,
              viewedAt: 1700000002,
            },
          ],
        ],
      ]),
    });

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory(
      '301',
      true,
      'episode',
      LIBRARY,
    );

    expect(result).toHaveLength(1);
    expect(result[0].ratingKey).toBe('301');
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('bypasses the snapshot for explicit useCache: false callers and reads per-item', async () => {
    // Keep an escape hatch for callers that explicitly need a live per-item
    // read; rule evaluation uses useCache: true to share the run snapshot.
    await setSnapshot(LIBRARY, {
      leaf: new Map([
        ['42', [{ ratingKey: '42', accountID: 10, viewedAt: 1700000000 }]],
      ]),
    });

    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '42', accountID: 99, viewedAt: 1720000000 }],
      },
    });
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('42', false, 'movie', LIBRARY);

    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=42'),
      }),
      false,
    );
    expect(result[0].accountID).toBe(99);
  });

  it('passes useCache: false through to the per-item query when no snapshot exists', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: { Metadata: [] },
    });
    (service as any).plexClient = { queryAll };

    await service.getWatchHistory('42', false, 'movie', LIBRARY);

    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=42'),
      }),
      false,
    );
  });

  it('serves untyped callers from the snapshot on a hit', async () => {
    await setSnapshot(LIBRARY, {
      leaf: new Map([
        ['42', [{ ratingKey: '42', accountID: 10, viewedAt: 1700000000 }]],
      ]),
    });

    const queryAll = jest.fn();
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory(
      '42',
      true,
      undefined,
      LIBRARY,
    );

    expect(result).toHaveLength(1);
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('falls through to per-item query for untyped callers on a miss', async () => {
    // Untyped callers may pass show or season ratingKeys, which are not leaf
    // entries - a miss must not be reported as confirmed-empty history.
    await setSnapshot(LIBRARY, { leaf: new Map() });

    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '101', accountID: 7, viewedAt: 1700000000 }],
      },
    });
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory(
      '10',
      true,
      undefined,
      LIBRARY,
    );

    expect(result).toHaveLength(1);
    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=10'),
      }),
      true,
    );
  });

  it('returns a copy so callers sorting in place do not mutate the cached array', async () => {
    const records = [
      { ratingKey: '42', accountID: 10, viewedAt: 2 },
      { ratingKey: '42', accountID: 11, viewedAt: 1 },
    ];
    await setSnapshot(LIBRARY, { leaf: new Map([['42', records]]) });

    (service as any).plexClient = { queryAll: jest.fn() };

    const first = await service.getWatchHistory('42', true, 'movie', LIBRARY);
    first.sort((a: any, b: any) => a.viewedAt - b.viewedAt);
    first.pop();

    const second = await service.getWatchHistory('42', true, 'movie', LIBRARY);
    expect(second.map((r: any) => r.accountID)).toEqual([10, 11]);
  });

  it('falls through to per-item query when no snapshot exists at all', async () => {
    const queryAll = jest.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '42', accountID: 1, viewedAt: 1 }],
      },
    });
    (service as any).plexClient = { queryAll };

    const result = await service.getWatchHistory('42', true, 'movie', LIBRARY);

    expect(result).toHaveLength(1);
    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringContaining('metadataItemID=42'),
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

describe('PlexApiService.resetMetadataCache', () => {
  let service: PlexApiService;
  let cache: { set: (k: string, v: unknown) => void; keys: () => string[] };

  const key = (uri: string) => JSON.stringify({ uri });

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();
    service = unit;

    unitRef.get(MaintainerrLoggerFactory).createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any);

    const cacheManager = (await import('../lib/cache')).default;
    cache = cacheManager.getCache('plexguid').data as unknown as typeof cache;
    (cache as unknown as { flushAll: () => void }).flushAll();
  });

  // The rule getter always passes includeExternalMedia, so its entries land
  // under a query-string uri. Deleting only the bare uri invalidated nothing on
  // the one path that caches, and rules testing kept serving stale metadata.
  it('drops every option variant for the item, and nothing else', () => {
    const withOptions = key(
      '/library/metadata/12?includeExternalMedia=1&asyncAugmentMetadata=1',
    );
    cache.set(key('/library/metadata/12'), 'bare');
    cache.set(withOptions, 'from the rule getter');
    cache.set(key('/library/metadata/12/children'), 'children');
    cache.set(key('/library/metadata/123'), 'a different item');

    service.resetMetadataCache('12');

    expect(cache.keys().sort()).toEqual(
      [
        key('/library/metadata/12/children'),
        key('/library/metadata/123'),
      ].sort(),
    );
  });

  // A batch caches a whole id list under one key, which matching the uri as a
  // whole never found.
  it('drops a batched entry that holds the item among its ids', () => {
    cache.set(key('/library/metadata/9,12,15?includeGuids=1'), 'batched');
    cache.set(key('/library/metadata/9,15?includeGuids=1'), 'without the item');
    cache.set(key('/library/metadata/121,123?includeGuids=1'), 'longer ids');

    service.resetMetadataCache('12');

    expect(cache.keys().sort()).toEqual(
      [
        key('/library/metadata/9,15?includeGuids=1'),
        key('/library/metadata/121,123?includeGuids=1'),
      ].sort(),
    );
  });

  // Jellyfin and Emby both drop watch state on reset; Plex did not, so a
  // just-watched item kept testing stale. History entries are keyed by leaf
  // ratingKey - not the id passed in - so the whole namespace goes.
  it('drops watch history entries and the bulk snapshot too', async () => {
    const cacheManager = (await import('../lib/cache')).default;
    const watchCache = cacheManager.getCache('plexwatchhistory').data;

    cache.set(
      key('/status/sessions/history/all?sort=viewedAt:desc&metadataItemID=99'),
      'another item',
    );
    cache.set(
      key('/status/sessions/history/all?sort=viewedAt:desc'),
      'bulk page',
    );
    cache.set(key('/library/sections'), 'sections listing');
    watchCache.set('watch-history-bulk', 'snapshot');

    service.resetMetadataCache('12');

    expect(cache.keys()).toEqual([key('/library/sections')]);
    expect(watchCache.keys()).toEqual([]);
  });
});

describe('PlexApiService.getWatchlistIdsForUser', () => {
  let service: PlexApiService;
  let communityLogger: { warn: jest.Mock; debug: jest.Mock };

  const entry = {
    id: 'movieuuid',
    key: '/movieuuid',
    title: 'Fixture Movie',
    type: 'MOVIE',
  };

  const page = (nodes: unknown[], hasNextPage = false, endCursor = null) => ({
    data: {
      user: { watchlist: { nodes, pageInfo: { hasNextPage, endCursor } } },
    },
  });

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();
    service = unit;

    communityLogger = { warn: jest.fn(), debug: jest.fn() };
    unitRef.get(MaintainerrLoggerFactory).createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      ...communityLogger,
    } as any);
    Object.assign(unitRef.get(MaintainerrLogger), communityLogger);
  });

  const withQuery = (query: jest.Mock) => {
    (service as any).plexCommunityClient = { query };
    return query;
  };

  it('collects every page of the watchlist', async () => {
    const query = withQuery(
      jest
        .fn()
        .mockResolvedValueOnce(page([entry], true, 'cursor'))
        .mockResolvedValueOnce(page([{ ...entry, id: 'showuuid' }])),
    );

    await expect(
      service.getWatchlistIdsForUser('uuid-a', 'alice'),
    ).resolves.toEqual([entry, { ...entry, id: 'showuuid' }]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  // plex.tv answers HTTP 200 with a `User not found:` GraphQL error for an
  // account that hides its watchlist. That is definitive, so the caller must be
  // able to skip the user instead of stalling the whole rule (#3395).
  it.each([
    ['a private watchlist', 'User not found: User privacy prevents viewing'],
    [
      'an account plex.tv does not know',
      'User not found: Data loader item not found: users uuid=0000000000000000',
    ],
  ])('resolves null for %s', async (label, message) => {
    withQuery(
      jest.fn().mockResolvedValue({ errors: [{ message }], data: null }),
    );

    await expect(
      service.getWatchlistIdsForUser('uuid-a', 'alice'),
    ).resolves.toBeNull();
    expect(communityLogger.warn).not.toHaveBeenCalled();
  });

  // Anything else stays transient: collapsing it would let a rule act on a
  // watchlist that was never read (#3307).
  it('resolves undefined for any other GraphQL error', async () => {
    withQuery(
      jest.fn().mockResolvedValue({
        errors: [{ message: 'Internal server error' }],
        data: null,
      }),
    );

    await expect(
      service.getWatchlistIdsForUser('uuid-a', 'alice'),
    ).resolves.toBeUndefined();
    expect(communityLogger.warn).toHaveBeenCalled();
  });

  it('resolves undefined when the request itself fails', async () => {
    withQuery(jest.fn().mockResolvedValue(undefined));

    await expect(
      service.getWatchlistIdsForUser('uuid-a', 'alice'),
    ).resolves.toBeUndefined();
  });

  it('resolves undefined when the community client throws', async () => {
    withQuery(jest.fn().mockRejectedValue(new Error('boom')));

    await expect(
      service.getWatchlistIdsForUser('uuid-a', 'alice'),
    ).resolves.toBeUndefined();
  });
});
