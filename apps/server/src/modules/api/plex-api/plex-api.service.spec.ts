import { Mocked, TestBed } from '@suites/unit';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import { Settings } from '../../settings/entities/settings.entities';
import { SettingsService } from '../../settings/settings.service';
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
  let settingsService: PlexApiSettingsStub;
  let logger: Mocked<MaintainerrLogger>;
  let loggerFactory: Mocked<MaintainerrLoggerFactory>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();

    service = unit;
    settingsService = unitRef.get(
      SettingsService,
    ) as unknown as PlexApiSettingsStub;
    logger = unitRef.get(MaintainerrLogger);
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
    settingsService.plex_auth_token = null as any;

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
});

describe('PlexApiService.initialize', () => {
  let service: PlexApiService;
  let settingsService: PlexApiSettingsStub;
  let logger: Mocked<MaintainerrLogger>;
  let loggerFactory: Mocked<MaintainerrLoggerFactory>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(PlexApiService).compile();

    service = unit;
    settingsService = unitRef.get(
      SettingsService,
    ) as unknown as PlexApiSettingsStub;
    logger = unitRef.get(MaintainerrLogger);
    loggerFactory = unitRef.get(MaintainerrLoggerFactory);

    settingsService.plex_hostname = 'plex.local';
    settingsService.plex_port = 32400;
    settingsService.plex_ssl = 0;
    settingsService.plex_auth_token = 'token';
    settingsService.plex_manual_mode = 0;
    settingsService.plex_machine_id = 'machine123';
    settingsService.updatePlexConnectionDetails = jest
      .fn()
      .mockResolvedValue(undefined);
    loggerFactory.createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any);
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
    settingsService.plex_manual_mode = 1;
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
    (service as any).plexClient = {
      query: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
    };

    await expect(service.getStatus()).resolves.toBeUndefined();

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith('Plex status probe failed');
  });
});
