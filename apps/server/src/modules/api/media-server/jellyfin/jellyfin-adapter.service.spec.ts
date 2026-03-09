import { MediaServerFeature, MediaServerType } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { SettingsService } from '../../../settings/settings.service';
import { JellyfinAdapterService } from './jellyfin-adapter.service';

const jellyfinApiMocks = {
  getPublicSystemInfo: jest.fn(),
  getUsers: jest.fn(),
  getUserById: jest.fn(),
  getConfiguration: jest.fn(),
  getItems: jest.fn(),
};

const jellyfinCacheMocks = {
  flush: jest.fn(),
  data: {
    has: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    flushAll: jest.fn(),
    keys: jest.fn(),
  },
};

// Mock the @jellyfin/sdk module and its generated client
jest.mock('@jellyfin/sdk', () => ({
  __esModule: true,
  Jellyfin: jest.fn().mockImplementation(() => ({
    createApi: jest.fn().mockReturnValue({
      accessToken: '',
      configuration: {},
    }),
  })),
}));

jest.mock('@jellyfin/sdk/lib/generated-client/models', () => ({
  __esModule: true,
  BaseItemKind: {
    Movie: 'Movie',
    Series: 'Series',
    Season: 'Season',
    Episode: 'Episode',
    BoxSet: 'BoxSet',
    Playlist: 'Playlist',
  },
  ItemFields: {
    ProviderIds: 'ProviderIds',
    Path: 'Path',
    DateCreated: 'DateCreated',
    MediaSources: 'MediaSources',
    Genres: 'Genres',
    Tags: 'Tags',
    Overview: 'Overview',
    People: 'People',
  },
  ItemFilter: {
    IsPlayed: 'IsPlayed',
  },
  ItemSortBy: {
    SortName: 'SortName',
    DateCreated: 'DateCreated',
  },
  SortOrder: {
    Ascending: 'Ascending',
    Descending: 'Descending',
  },
}));

jest.mock('@jellyfin/sdk/lib/utils/api/index.js', () => ({
  __esModule: true,
  getSystemApi: jest.fn().mockImplementation(() => ({
    getPublicSystemInfo: (...args: unknown[]) =>
      jellyfinApiMocks.getPublicSystemInfo(...args),
  })),
  getConfigurationApi: jest.fn().mockImplementation(() => ({
    getConfiguration: (...args: unknown[]) =>
      jellyfinApiMocks.getConfiguration(...args),
  })),
  getItemsApi: jest.fn().mockImplementation(() => ({
    getItems: (...args: unknown[]) => jellyfinApiMocks.getItems(...args),
  })),
  getLibraryApi: jest.fn(),
  getUserApi: jest.fn().mockImplementation(() => ({
    getUsers: (...args: unknown[]) => jellyfinApiMocks.getUsers(...args),
    getUserById: (...args: unknown[]) => jellyfinApiMocks.getUserById(...args),
  })),
  getCollectionApi: jest.fn(),
  getSearchApi: jest.fn(),
  getPlaylistsApi: jest.fn(),
  getUserViewsApi: jest.fn(),
}));

// Mock the cacheManager module
jest.mock('../../lib/cache', () => ({
  __esModule: true,
  default: {
    getCache: jest.fn().mockImplementation(() => ({
      flush: (...args: unknown[]) => jellyfinCacheMocks.flush(...args),
      data: {
        has: (...args: unknown[]) => jellyfinCacheMocks.data.has(...args),
        get: (...args: unknown[]) => jellyfinCacheMocks.data.get(...args),
        set: (...args: unknown[]) => jellyfinCacheMocks.data.set(...args),
        del: (...args: unknown[]) => jellyfinCacheMocks.data.del(...args),
        flushAll: (...args: unknown[]) =>
          jellyfinCacheMocks.data.flushAll(...args),
        keys: (...args: unknown[]) => jellyfinCacheMocks.data.keys(...args),
      },
    })),
  },
}));

describe('JellyfinAdapterService', () => {
  let service: JellyfinAdapterService;
  let settingsService: Mocked<SettingsService>;

  const mockSettings = {
    jellyfin_url: 'http://jellyfin.test:8096',
    jellyfin_api_key: 'test-api-key',
    clientId: 'test-client-id',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    jellyfinApiMocks.getPublicSystemInfo.mockResolvedValue({
      data: {
        Id: 'server123',
        ServerName: 'Test Server',
        Version: '10.11.0',
        OperatingSystem: 'Linux',
      },
    });
    jellyfinApiMocks.getUsers.mockResolvedValue({ data: [] });
    jellyfinApiMocks.getUserById.mockResolvedValue({ data: undefined });
    jellyfinApiMocks.getConfiguration.mockResolvedValue({
      data: { MaxResumePct: 90 },
    });
    jellyfinApiMocks.getItems.mockResolvedValue({ data: { Items: [] } });
    jellyfinCacheMocks.data.has.mockReturnValue(false);
    jellyfinCacheMocks.data.get.mockReturnValue(undefined);
    jellyfinCacheMocks.data.keys.mockReturnValue([]);

    const { unit, unitRef } = await TestBed.solitary(
      JellyfinAdapterService,
    ).compile();

    service = unit;
    settingsService = unitRef.get(SettingsService);
  });

  describe('lifecycle', () => {
    it('should not be setup initially', () => {
      expect(service.isSetup()).toBe(false);
    });

    it('should return JELLYFIN as server type', () => {
      expect(service.getServerType()).toBe(MediaServerType.JELLYFIN);
    });

    it('should initialize successfully with valid settings', async () => {
      settingsService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsService['getSettings']>
        >,
      );
      await service.initialize();
      expect(service.isSetup()).toBe(true);
    });

    it('should throw error when settings are missing', async () => {
      settingsService.getSettings.mockResolvedValue(
        null as unknown as Awaited<ReturnType<SettingsService['getSettings']>>,
      );
      await expect(service.initialize()).rejects.toThrow(
        'Settings not available',
      );
    });

    it('should throw error when Jellyfin URL is missing', async () => {
      settingsService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_url: undefined,
      } as unknown as Awaited<ReturnType<SettingsService['getSettings']>>);
      await expect(service.initialize()).rejects.toThrow(
        'Jellyfin settings not configured',
      );
    });

    it('should throw error when API key is missing', async () => {
      settingsService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_api_key: undefined,
      } as unknown as Awaited<ReturnType<SettingsService['getSettings']>>);
      await expect(service.initialize()).rejects.toThrow(
        'Jellyfin settings not configured',
      );
    });

    it('should uninitialize correctly', async () => {
      settingsService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsService['getSettings']>
        >,
      );
      await service.initialize();
      expect(service.isSetup()).toBe(true);

      service.uninitialize();
      expect(service.isSetup()).toBe(false);
    });
  });

  describe('feature detection', () => {
    it.each([
      [MediaServerFeature.LABELS, true],
      [MediaServerFeature.PLAYLISTS, true],
      [MediaServerFeature.COLLECTION_VISIBILITY, false],
      [MediaServerFeature.WATCHLIST, false],
      [MediaServerFeature.CENTRAL_WATCH_HISTORY, false],
    ])('supportsFeature(%s) is %s', (feature, expected) => {
      expect(service.supportsFeature(feature)).toBe(expected);
    });
  });

  describe('cache management', () => {
    it('should not throw when resetting cache with itemId', () => {
      expect(() => service.resetMetadataCache('item123')).not.toThrow();
    });

    it('should not throw when resetting all cache', () => {
      expect(() => service.resetMetadataCache()).not.toThrow();
    });
  });

  describe('uninitialized state', () => {
    it.each([
      ['getStatus', undefined, () => service.getStatus()],
      ['getMetadata', undefined, () => service.getMetadata('item123')],
      ['getUsers', [], () => service.getUsers()],
      ['getLibraries', [], () => service.getLibraries()],
      ['getWatchHistory', [], () => service.getWatchHistory('item123')],
      ['getCollections', [], () => service.getCollections('lib123')],
      ['searchContent', [], () => service.searchContent('test')],
    ] as [string, unknown, () => Promise<unknown>][])(
      '%s returns %j when not initialized',
      async (_method, expected, call) => {
        const result = await call();
        if (expected === undefined) {
          expect(result).toBeUndefined();
        } else {
          expect(result).toEqual(expected);
        }
      },
    );
  });

  describe('getWatchHistory', () => {
    beforeEach(async () => {
      settingsService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsService['getSettings']>
        >,
      );
      await service.initialize();
    });

    it('should apply Jellyfin MaxResumePct when filtering completed views', async () => {
      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [
          { Id: 'user-1', Name: 'Alice' },
          { Id: 'user-2', Name: 'Bob' },
        ],
      });
      jellyfinApiMocks.getConfiguration.mockResolvedValue({
        data: { MaxResumePct: 95 },
      });
      jellyfinApiMocks.getItems.mockImplementation(
        ({ userId }: { userId: string }) =>
          Promise.resolve({
            data: {
              Items: [
                {
                  UserData:
                    userId === 'user-1'
                      ? {
                          Played: false,
                          PlayedPercentage: 94,
                          LastPlayedDate: '2024-06-01T00:00:00.000Z',
                        }
                      : {
                          Played: false,
                          PlayedPercentage: 95,
                          LastPlayedDate: '2024-06-02T00:00:00.000Z',
                        },
                },
              ],
            },
          }),
      );

      const history = await service.getWatchHistory('item123');

      expect(history).toEqual([
        {
          userId: 'user-2',
          itemId: 'item123',
          watchedAt: new Date('2024-06-02T00:00:00.000Z'),
          progress: 95,
        },
      ]);
      expect(jellyfinCacheMocks.data.set).toHaveBeenCalledWith(
        'jellyfin:watch:95:item123',
        history,
        300000,
      );
    });

    it('should fall back to Jellyfin played state when threshold cannot be loaded', async () => {
      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [{ Id: 'user-1', Name: 'Alice' }],
      });
      jellyfinApiMocks.getConfiguration.mockRejectedValue(
        new Error('Configuration unavailable'),
      );
      jellyfinApiMocks.getItems.mockResolvedValue({
        data: {
          Items: [
            {
              UserData: {
                Played: false,
                PlayedPercentage: 95,
                LastPlayedDate: '2024-06-03T00:00:00.000Z',
              },
            },
          ],
        },
      });

      const history = await service.getWatchHistory('item123');

      expect(history).toEqual([]);
    });

    it('should keep Jellyfin played items when no percentage is available', async () => {
      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [{ Id: 'user-1', Name: 'Alice' }],
      });
      jellyfinApiMocks.getConfiguration.mockResolvedValue({
        data: { MaxResumePct: 95 },
      });
      jellyfinApiMocks.getItems.mockResolvedValue({
        data: {
          Items: [
            {
              UserData: {
                Played: true,
                LastPlayedDate: '2024-06-03T00:00:00.000Z',
              },
            },
          ],
        },
      });

      const history = await service.getWatchHistory('item123');

      expect(history).toEqual([
        {
          userId: 'user-1',
          itemId: 'item123',
          watchedAt: new Date('2024-06-03T00:00:00.000Z'),
          progress: 100,
        },
      ]);
    });
  });

  describe('resetMetadataCache', () => {
    it('should remove threshold-specific watch history entries for one item', () => {
      jellyfinCacheMocks.data.keys.mockReturnValue([
        'jellyfin:watch:90:item123',
        'jellyfin:watch:95:item123',
        'jellyfin:watch:90:item999',
      ]);

      service.resetMetadataCache('item123');

      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:watch:90:item123',
      );
      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:watch:95:item123',
      );
      expect(jellyfinCacheMocks.data.del).not.toHaveBeenCalledWith(
        'jellyfin:watch:90:item999',
      );
    });
  });
});
