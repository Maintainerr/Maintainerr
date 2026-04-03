import { getCollectionApi } from '@jellyfin/sdk/lib/utils/api/index.js';
import { MediaServerFeature, MediaServerType } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { SettingsService } from '../../../settings/settings.service';
import { JellyfinAdapterService } from './jellyfin-adapter.service';
import { JELLYFIN_BATCH_SIZE } from './jellyfin.constants';

const jellyfinApiMocks = {
  getPublicSystemInfo: jest.fn(),
  getUsers: jest.fn(),
  getUserById: jest.fn(),
  getConfiguration: jest.fn(),
  getItems: jest.fn(),
  getItemUserData: jest.fn(),
  refreshItem: jest.fn(),
};

const collectionApiMocks = {
  createCollection: jest.fn(),
  addToCollection: jest.fn(),
  removeFromCollection: jest.fn(),
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
    getItemUserData: (...args: unknown[]) =>
      jellyfinApiMocks.getItemUserData(...args),
  })),
  getLibraryApi: jest.fn(),
  getUserApi: jest.fn().mockImplementation(() => ({
    getUsers: (...args: unknown[]) => jellyfinApiMocks.getUsers(...args),
    getUserById: (...args: unknown[]) => jellyfinApiMocks.getUserById(...args),
  })),
  getCollectionApi: jest.fn().mockImplementation(() => ({
    createCollection: (...args: unknown[]) =>
      collectionApiMocks.createCollection(...args),
    addToCollection: (...args: unknown[]) =>
      collectionApiMocks.addToCollection(...args),
    removeFromCollection: (...args: unknown[]) =>
      collectionApiMocks.removeFromCollection(...args),
  })),
  getItemRefreshApi: jest.fn().mockImplementation(() => ({
    refreshItem: (...args: unknown[]) => jellyfinApiMocks.refreshItem(...args),
  })),
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
    jellyfinApiMocks.refreshItem.mockResolvedValue(undefined);
    collectionApiMocks.createCollection.mockResolvedValue({
      data: { Id: 'collection-1' },
    });
    collectionApiMocks.addToCollection.mockResolvedValue(undefined);
    collectionApiMocks.removeFromCollection.mockResolvedValue(undefined);
    jellyfinApiMocks.getItemUserData.mockResolvedValue({ data: undefined });
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

  describe('getLibraryContents', () => {
    beforeEach(async () => {
      settingsService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_user_id: 'user-1',
      } as unknown as Awaited<ReturnType<SettingsService['getSettings']>>);
      await service.initialize();
    });

    it('requests only the lightweight fields needed for overview lists', async () => {
      jellyfinApiMocks.getItems.mockResolvedValue({
        data: {
          Items: [],
          TotalRecordCount: 0,
        },
      });

      await service.getLibraryContents('library-1', {
        offset: 0,
        limit: 30,
        type: 'movie',
      });

      expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          parentId: 'library-1',
          recursive: true,
          startIndex: 0,
          limit: 30,
          fields: ['ProviderIds', 'DateCreated', 'Overview'],
        }),
      );
    });

    it('reuses the cached jellyfin user id across repeated overview list requests', async () => {
      jellyfinApiMocks.getItems.mockResolvedValue({
        data: {
          Items: [],
          TotalRecordCount: 0,
        },
      });

      settingsService.getSettings.mockClear();

      await service.getLibraryContents('library-1', {
        offset: 0,
        limit: 30,
        type: 'movie',
      });
      await service.getLibraryContents('library-1', {
        offset: 30,
        limit: 30,
        type: 'movie',
      });

      expect(settingsService.getSettings).not.toHaveBeenCalled();
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledTimes(2);
      expect(jellyfinApiMocks.getItems).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ userId: 'user-1', startIndex: 0 }),
      );
      expect(jellyfinApiMocks.getItems).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ userId: 'user-1', startIndex: 30 }),
      );
    });

    it('treats a null jellyfin_user_id from settings as undefined', async () => {
      jellyfinApiMocks.getItems.mockResolvedValue({
        data: {
          Items: [],
          TotalRecordCount: 0,
        },
      });

      settingsService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_user_id: null,
      } as unknown as Awaited<ReturnType<SettingsService['getSettings']>>);

      await service.initialize();
      settingsService.getSettings.mockClear();

      await service.getLibraryContents('library-1', {
        offset: 0,
        limit: 10,
        type: 'movie',
      });
      await service.getLibraryContents('library-1', {
        offset: 10,
        limit: 10,
        type: 'movie',
      });

      expect(settingsService.getSettings).toHaveBeenCalledTimes(2);
      expect(jellyfinApiMocks.getItems).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ userId: undefined, startIndex: 0 }),
      );
      expect(jellyfinApiMocks.getItems).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ userId: undefined, startIndex: 10 }),
      );
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

  describe('refreshItemMetadata', () => {
    beforeEach(async () => {
      settingsService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsService['getSettings']>
        >,
      );
      await service.initialize();
    });

    it('queues refresh for valid Jellyfin item ids', async () => {
      const itemId = 'a852a27afe324084ae66db579ee3ee18';

      await service.refreshItemMetadata(itemId);

      expect(jellyfinApiMocks.refreshItem).toHaveBeenCalledWith({ itemId });
    });

    it('rejects blank Jellyfin item ids before calling the API', async () => {
      await expect(service.refreshItemMetadata('   ')).rejects.toThrow(
        'refreshItemMetadata called with empty itemId — aborting metadata refresh request',
      );

      expect(jellyfinApiMocks.refreshItem).not.toHaveBeenCalled();
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
                  UserData: {
                    Played: false,
                    PlayedPercentage: userId === 'user-1' ? 94 : 95,
                    LastPlayedDate:
                      userId === 'user-1'
                        ? '2024-06-01T00:00:00.000Z'
                        : '2024-06-02T00:00:00.000Z',
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
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith({
        userId: 'user-1',
        ids: ['item123'],
        enableUserData: true,
      });
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith({
        userId: 'user-2',
        ids: ['item123'],
        enableUserData: true,
      });
    });

    it('should log debug details when a per-user lookup fails', async () => {
      const debugSpy = jest
        .spyOn(service['logger'], 'debug')
        .mockImplementation(() => undefined);

      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [{ Id: 'user-1', Name: 'Alice' }],
      });
      jellyfinApiMocks.getItems.mockRejectedValue(
        new Error('User data unavailable'),
      );

      const history = await service.getWatchHistory('item123');

      expect(history).toEqual([]);
      expect(debugSpy).toHaveBeenNthCalledWith(
        1,
        'Failed to get Jellyfin user data for item item123 and user user-1',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(2, expect.any(Error));
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

  describe('getWatchState', () => {
    it('should derive count and watched state from watch history', async () => {
      jest.spyOn(service, 'getWatchHistory').mockResolvedValue([
        {
          userId: 'user-1',
          itemId: 'item123',
          watchedAt: new Date('2024-06-03T00:00:00.000Z'),
        },
      ]);

      const watchState = await service.getWatchState('item123');

      expect(watchState).toEqual({
        viewCount: 1,
        isWatched: true,
      });
    });

    it('should return unwatched state when no history exists', async () => {
      jest.spyOn(service, 'getWatchHistory').mockResolvedValue([]);

      const watchState = await service.getWatchState('item123');

      expect(watchState).toEqual({
        viewCount: 0,
        isWatched: false,
      });
    });
  });

  describe('getItemFavoritedBy', () => {
    beforeEach(async () => {
      settingsService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsService['getSettings']>
        >,
      );
      await service.initialize();
    });

    it('should return user ids for users who favorited the item', async () => {
      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [
          { Id: 'user-1', Name: 'Alice' },
          { Id: 'user-2', Name: 'Bob' },
        ],
      });
      jellyfinApiMocks.getItems.mockImplementation(
        ({ userId }: { userId: string }) =>
          Promise.resolve({
            data: {
              Items: [
                {
                  UserData: {
                    IsFavorite: userId === 'user-2',
                  },
                },
              ],
            },
          }),
      );

      const favoritedBy = await service.getItemFavoritedBy('item123');

      expect(favoritedBy).toEqual(['user-2']);
      expect(jellyfinCacheMocks.data.set).toHaveBeenCalledWith(
        'jellyfin:favorited-by:item123',
        ['user-2'],
        300000,
      );
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith({
        userId: 'user-1',
        ids: ['item123'],
        enableUserData: true,
      });
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith({
        userId: 'user-2',
        ids: ['item123'],
        enableUserData: true,
      });
    });

    it('should return cached favorited-by results when available', async () => {
      jellyfinCacheMocks.data.has.mockImplementation(
        (key: string) => key === 'jellyfin:favorited-by:item123',
      );
      jellyfinCacheMocks.data.get.mockImplementation((key: string) =>
        key === 'jellyfin:favorited-by:item123' ? ['user-9'] : undefined,
      );

      const favoritedBy = await service.getItemFavoritedBy('item123');

      expect(favoritedBy).toEqual(['user-9']);
      expect(jellyfinApiMocks.getItems).not.toHaveBeenCalled();
    });
  });

  describe('getTotalPlayCount', () => {
    beforeEach(async () => {
      settingsService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsService['getSettings']>
        >,
      );
      await service.initialize();
    });

    it('should sum play counts across all users', async () => {
      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [
          { Id: 'user-1', Name: 'Alice' },
          { Id: 'user-2', Name: 'Bob' },
          { Id: 'user-3', Name: 'Carol' },
        ],
      });
      jellyfinApiMocks.getItems.mockImplementation(
        ({ userId }: { userId: string }) =>
          Promise.resolve({
            data: {
              Items: [
                {
                  UserData: {
                    PlayCount:
                      userId === 'user-1' ? 1 : userId === 'user-2' ? 3 : 0,
                  },
                },
              ],
            },
          }),
      );

      const totalPlayCount = await service.getTotalPlayCount('item123');

      expect(totalPlayCount).toBe(4);
      expect(jellyfinCacheMocks.data.set).toHaveBeenCalledWith(
        'jellyfin:total-play-count:item123',
        4,
        300000,
      );
    });

    it('should return cached play count when available', async () => {
      jellyfinCacheMocks.data.has.mockImplementation(
        (key: string) => key === 'jellyfin:total-play-count:item123',
      );
      jellyfinCacheMocks.data.get.mockImplementation((key: string) =>
        key === 'jellyfin:total-play-count:item123' ? 7 : undefined,
      );

      const totalPlayCount = await service.getTotalPlayCount('item123');

      expect(totalPlayCount).toBe(7);
      expect(jellyfinApiMocks.getItems).not.toHaveBeenCalled();
    });
  });

  describe('resetMetadataCache', () => {
    it('should remove threshold-specific watch history entries for one item', () => {
      jellyfinCacheMocks.data.keys.mockReturnValue([
        'jellyfin:watch:90:item123',
        'jellyfin:watch:95:item123',
        'jellyfin:favorited-by:item123',
        'jellyfin:total-play-count:item123',
        'jellyfin:watch:90:item999',
      ]);

      service.resetMetadataCache('item123');

      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:watch:90:item123',
      );
      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:watch:95:item123',
      );
      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:favorited-by:item123',
      );
      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:total-play-count:item123',
      );
      expect(jellyfinCacheMocks.data.del).not.toHaveBeenCalledWith(
        'jellyfin:watch:90:item999',
      );
    });
  });

  describe('collection operations', () => {
    beforeEach(async () => {
      settingsService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsService['getSettings']>
        >,
      );
      await service.initialize();
    });

    it('should create a collection without initial item ids', async () => {
      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [{ Id: 'user-1', Name: 'Alice' }],
      });
      jellyfinApiMocks.getItems.mockResolvedValue({
        data: {
          Items: [
            {
              Id: 'collection-1',
              Name: 'Test Collection',
              Overview: 'Summary',
              ChildCount: 2,
            },
          ],
        },
      });

      const result = await service.createCollection({
        libraryId: 'library-1',
        title: 'Test Collection',
        type: 'movie',
      });

      expect(jest.mocked(getCollectionApi)).toHaveBeenCalled();
      expect(collectionApiMocks.createCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Collection',
          parentId: 'library-1',
          isLocked: true,
        }),
      );
      expect(collectionApiMocks.createCollection).toHaveBeenCalledWith(
        expect.not.objectContaining({
          ids: expect.anything(),
        }),
      );
      expect(result.id).toBe('collection-1');
    });

    it('should add a batch of items in one Jellyfin request', async () => {
      await expect(
        service.addBatchToCollection('collection-1', ['item-1', 'item-2']),
      ).resolves.toEqual([]);

      expect(collectionApiMocks.addToCollection).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        ids: ['item-1', 'item-2'],
      });
    });

    it('should split large add batches across multiple Jellyfin requests', async () => {
      const items = Array.from(
        { length: JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION * 2 + 1 },
        (_, index) => `item-${index + 1}`,
      );

      await expect(
        service.addBatchToCollection('collection-1', items),
      ).resolves.toEqual([]);

      expect(collectionApiMocks.addToCollection).toHaveBeenCalledTimes(3);
      expect(collectionApiMocks.addToCollection).toHaveBeenNthCalledWith(1, {
        collectionId: 'collection-1',
        ids: items.slice(0, JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION),
      });
      expect(collectionApiMocks.addToCollection).toHaveBeenNthCalledWith(2, {
        collectionId: 'collection-1',
        ids: items.slice(
          JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION,
          JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION * 2,
        ),
      });
      expect(collectionApiMocks.addToCollection).toHaveBeenNthCalledWith(3, {
        collectionId: 'collection-1',
        ids: items.slice(JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION * 2),
      });
    });

    it('should continue add batching and return failed ids for failed chunks', async () => {
      const items = Array.from(
        { length: JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION * 2 },
        (_, index) => `item-${index + 1}`,
      );

      collectionApiMocks.addToCollection
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Request line too long'));

      await expect(
        service.addBatchToCollection('collection-1', items),
      ).resolves.toEqual(items.slice(JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION));

      expect(collectionApiMocks.addToCollection).toHaveBeenCalledTimes(2);
    });

    it('should remove a batch of items in one Jellyfin request', async () => {
      await expect(
        service.removeBatchFromCollection('collection-1', ['item-1', 'item-2']),
      ).resolves.toEqual([]);

      expect(collectionApiMocks.removeFromCollection).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        ids: ['item-1', 'item-2'],
      });
    });

    it('should split large remove batches across multiple Jellyfin requests', async () => {
      const items = Array.from(
        { length: JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION * 2 + 1 },
        (_, index) => `item-${index + 1}`,
      );

      await expect(
        service.removeBatchFromCollection('collection-1', items),
      ).resolves.toEqual([]);

      expect(collectionApiMocks.removeFromCollection).toHaveBeenCalledTimes(3);
    });
  });
});
