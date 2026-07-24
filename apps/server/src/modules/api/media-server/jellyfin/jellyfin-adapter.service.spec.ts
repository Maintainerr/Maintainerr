import { getCollectionApi } from '@jellyfin/sdk/lib/utils/api/index.js';
import {
  MediaItem,
  MediaServerFeature,
  MediaServerType,
} from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { AxiosError } from 'axios';
import { delay } from '../../../../utils/delay';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { SettingsDataService } from '../../../settings/settings-data.service';
import { JellyfinAdapterService } from './jellyfin-adapter.service';
import { JELLYFIN_BATCH_SIZE, JELLYFIN_CACHE_TTL } from './jellyfin.constants';

const jellyfinApiMocks = {
  getPublicSystemInfo: jest.fn(),
  getSystemStorage: jest.fn(),
  getMediaFolders: jest.fn(),
  getAncestors: jest.fn(),
  deleteItem: jest.fn(),
  getUsers: jest.fn(),
  getUserById: jest.fn(),
  getConfiguration: jest.fn(),
  getItems: jest.fn(),
  getItem: jest.fn(),
  getItemUserData: jest.fn(),
  updateItem: jest.fn(),
  refreshItem: jest.fn(),
  getItemImage: jest.fn(),
  setItemImage: jest.fn(),
  getSessions: jest.fn(),
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
      // axios-retry attaches interceptors to this instance during
      // createApiClient; stub them so the real attach call is a no-op in tests.
      axiosInstance: {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      },
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
    ChildCount: 'ChildCount',
    MediaSources: 'MediaSources',
    Genres: 'Genres',
    Tags: 'Tags',
    Overview: 'Overview',
    ParentId: 'ParentId',
    People: 'People',
  },
  LocationType: {
    FileSystem: 'FileSystem',
    Remote: 'Remote',
    Virtual: 'Virtual',
    Offline: 'Offline',
  },
  ItemFilter: {
    IsPlayed: 'IsPlayed',
  },
  ItemSortBy: {
    SortName: 'SortName',
    DateCreated: 'DateCreated',
    Random: 'Random',
  },
  SortOrder: {
    Ascending: 'Ascending',
    Descending: 'Descending',
  },
  ImageType: {
    Primary: 'Primary',
    Thumb: 'Thumb',
    Backdrop: 'Backdrop',
  },
  ImageFormat: {
    Jpg: 'Jpg',
    Png: 'Png',
    Webp: 'Webp',
  },
}));

jest.mock('@jellyfin/sdk/lib/utils/api/index.js', () => ({
  __esModule: true,
  getSystemApi: jest.fn().mockImplementation(() => ({
    getPublicSystemInfo: (...args: unknown[]) =>
      jellyfinApiMocks.getPublicSystemInfo(...args),
    getSystemStorage: (...args: unknown[]) =>
      jellyfinApiMocks.getSystemStorage(...args),
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
  getLibraryApi: jest.fn().mockImplementation(() => ({
    getMediaFolders: (...args: unknown[]) =>
      jellyfinApiMocks.getMediaFolders(...args),
    getAncestors: (...args: unknown[]) =>
      jellyfinApiMocks.getAncestors(...args),
    deleteItem: (...args: unknown[]) => jellyfinApiMocks.deleteItem(...args),
  })),
  getUserApi: jest.fn().mockImplementation(() => ({
    getUsers: (...args: unknown[]) => jellyfinApiMocks.getUsers(...args),
    getUserById: (...args: unknown[]) => jellyfinApiMocks.getUserById(...args),
  })),
  getUserLibraryApi: jest.fn().mockImplementation(() => ({
    getItem: (...args: unknown[]) => jellyfinApiMocks.getItem(...args),
  })),
  getCollectionApi: jest.fn().mockImplementation(() => ({
    createCollection: (...args: unknown[]) =>
      collectionApiMocks.createCollection(...args),
    addToCollection: (...args: unknown[]) =>
      collectionApiMocks.addToCollection(...args),
    removeFromCollection: (...args: unknown[]) =>
      collectionApiMocks.removeFromCollection(...args),
  })),
  getItemUpdateApi: jest.fn().mockImplementation(() => ({
    updateItem: (...args: unknown[]) => jellyfinApiMocks.updateItem(...args),
  })),
  getItemRefreshApi: jest.fn().mockImplementation(() => ({
    refreshItem: (...args: unknown[]) => jellyfinApiMocks.refreshItem(...args),
  })),
  getImageApi: jest.fn().mockImplementation(() => ({
    getItemImage: (...args: unknown[]) =>
      jellyfinApiMocks.getItemImage(...args),
    setItemImage: (...args: unknown[]) =>
      jellyfinApiMocks.setItemImage(...args),
  })),
  getSessionApi: jest.fn().mockImplementation(() => ({
    getSessions: (...args: unknown[]) => jellyfinApiMocks.getSessions(...args),
  })),
  getSearchApi: jest.fn(),
  getPlaylistsApi: jest.fn(),
  getUserViewsApi: jest.fn(),
}));

jest.mock('../../../../utils/delay', () => ({
  __esModule: true,
  delay: jest.fn().mockResolvedValue(undefined),
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
  let settingsDataService: Mocked<SettingsDataService>;
  let logger: Mocked<MaintainerrLogger>;

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
    jellyfinApiMocks.getSystemStorage.mockResolvedValue({
      data: { Libraries: [] },
    });
    jellyfinApiMocks.getMediaFolders.mockResolvedValue({ data: { Items: [] } });
    jellyfinApiMocks.getAncestors.mockResolvedValue({ data: [] });
    jellyfinApiMocks.deleteItem.mockResolvedValue(undefined);
    jellyfinApiMocks.getUsers.mockResolvedValue({ data: [] });
    jellyfinApiMocks.getUserById.mockResolvedValue({ data: undefined });
    jellyfinApiMocks.getConfiguration.mockResolvedValue({
      data: { MaxResumePct: 90 },
    });
    jellyfinApiMocks.getItems.mockResolvedValue({ data: { Items: [] } });
    jellyfinApiMocks.getItem.mockResolvedValue({ data: undefined });
    jellyfinApiMocks.updateItem.mockResolvedValue(undefined);
    jellyfinApiMocks.refreshItem.mockResolvedValue(undefined);
    collectionApiMocks.createCollection.mockResolvedValue({
      data: { Id: 'collection-1' },
    });
    collectionApiMocks.addToCollection.mockResolvedValue(undefined);
    collectionApiMocks.removeFromCollection.mockResolvedValue(undefined);
    jellyfinApiMocks.getItemUserData.mockResolvedValue({ data: undefined });
    jellyfinApiMocks.getItemImage.mockResolvedValue({
      data: new ArrayBuffer(0),
    });
    jellyfinApiMocks.setItemImage.mockResolvedValue(undefined);
    jellyfinCacheMocks.data.has.mockReturnValue(false);
    jellyfinCacheMocks.data.get.mockReturnValue(undefined);
    jellyfinCacheMocks.data.keys.mockReturnValue([]);

    const { unit, unitRef } = await TestBed.solitary(
      JellyfinAdapterService,
    ).compile();

    service = unit;
    settingsDataService = unitRef.get(SettingsDataService);
    logger = unitRef.get(MaintainerrLogger);
  });

  const createRetryableError = (code: string): AxiosError => {
    const error = new AxiosError(`temporary failure (${code})`);
    error.code = code;
    return error;
  };

  const createResponseError = (status: number): AxiosError => {
    const error = new AxiosError(`request failed with status ${status}`);
    Object.assign(error, {
      response: {
        status,
        statusText: status === 401 ? 'Unauthorized' : 'Bad Gateway',
        data: {},
        headers: {},
        config: {},
      },
    });
    return error;
  };

  describe('lifecycle', () => {
    it('should not be setup initially', () => {
      expect(service.isSetup()).toBe(false);
    });

    it('should return JELLYFIN as server type', () => {
      expect(service.getServerType()).toBe(MediaServerType.JELLYFIN);
    });

    it('should initialize successfully with valid settings', async () => {
      settingsDataService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
        >,
      );
      await service.initialize();
      expect(service.isSetup()).toBe(true);
    });

    it('logs successful test connections at debug level', async () => {
      await expect(
        service.testConnection('http://jellyfin.test:8096', 'test-api-key'),
      ).resolves.toMatchObject({
        success: true,
        serverName: 'Test Server',
        version: '10.11.0',
      });

      expect(logger.debug).toHaveBeenCalledWith(
        'Jellyfin connection test successful: Test Server (10.11.0)',
      );
      expect(logger.log).not.toHaveBeenCalledWith(
        'Jellyfin connection test successful: Test Server (10.11.0)',
      );
    });

    it('should throw error when settings are missing', async () => {
      settingsDataService.getSettings.mockResolvedValue(
        null as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
        >,
      );
      await expect(service.initialize()).rejects.toThrow(
        'Settings not available',
      );
    });

    it('should throw error when Jellyfin URL is missing', async () => {
      settingsDataService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_url: undefined,
      } as unknown as Awaited<ReturnType<SettingsDataService['getSettings']>>);
      await expect(service.initialize()).rejects.toThrow(
        'Jellyfin settings not configured',
      );
    });

    it('should throw error when API key is missing', async () => {
      settingsDataService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_api_key: undefined,
      } as unknown as Awaited<ReturnType<SettingsDataService['getSettings']>>);
      await expect(service.initialize()).rejects.toThrow(
        'Jellyfin settings not configured',
      );
    });

    it('should uninitialize correctly', async () => {
      settingsDataService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
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
      [MediaServerFeature.COLLECTION_SORT, false],
    ])('supportsFeature(%s) is %s', (feature, expected) => {
      expect(service.supportsFeature(feature)).toBe(expected);
    });

    it('reorderCollectionItems throws because Jellyfin lacks a boxset reorder API', async () => {
      await expect(
        service.reorderCollectionItems('col1', ['a', 'b']),
      ).rejects.toThrow('Collection sort not supported on Jellyfin');
    });

    it('prefetchWatchHistory throws because Jellyfin has no central history endpoint', async () => {
      await expect(service.prefetchWatchHistory()).rejects.toThrow(
        'not supported on Jellyfin',
      );
    });
  });

  describe('getLibraryContents', () => {
    beforeEach(async () => {
      settingsDataService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_user_id: 'user-1',
      } as unknown as Awaited<ReturnType<SettingsDataService['getSettings']>>);
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

      settingsDataService.getSettings.mockClear();

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

      expect(settingsDataService.getSettings).not.toHaveBeenCalled();
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

      settingsDataService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_user_id: null,
      } as unknown as Awaited<ReturnType<SettingsDataService['getSettings']>>);

      await service.initialize();
      settingsDataService.getSettings.mockClear();

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

      expect(settingsDataService.getSettings).toHaveBeenCalledTimes(2);
      expect(jellyfinApiMocks.getItems).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ userId: undefined, startIndex: 0 }),
      );
      expect(jellyfinApiMocks.getItems).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ userId: undefined, startIndex: 10 }),
      );
    });

    it('retries once after a transient library-content failure', async () => {
      jellyfinApiMocks.getItems
        .mockRejectedValueOnce(createRetryableError('EAI_AGAIN'))
        .mockResolvedValueOnce({
          data: {
            Items: [],
            TotalRecordCount: 0,
          },
        });

      const result = await service.getLibraryContents('library-1', {
        offset: 0,
        limit: 30,
        type: 'movie',
      });

      expect(delay).toHaveBeenCalledWith(300);
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Transient Jellyfin failure during get Jellyfin library contents for library-1; retrying once in 300ms',
      );
      expect(result).toEqual({
        items: [],
        totalSize: 0,
        offset: 0,
        limit: 30,
      });
    });

    it('does not retry non-transient library-content failures and rethrows', async () => {
      jellyfinApiMocks.getItems.mockRejectedValueOnce(createResponseError(401));

      await expect(
        service.getLibraryContents('library-1', {
          offset: 0,
          limit: 30,
          type: 'movie',
        }),
      ).rejects.toThrow('request failed with status 401');

      expect(delay).not.toHaveBeenCalled();
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledTimes(1);
    });

    it('rethrows when the transient retry is exhausted instead of fabricating an empty page', async () => {
      jellyfinApiMocks.getItems.mockRejectedValue(createResponseError(503));

      await expect(
        service.getLibraryContents('library-1', {
          offset: 0,
          limit: 30,
          type: 'movie',
        }),
      ).rejects.toThrow('request failed with status 503');

      expect(jellyfinApiMocks.getItems).toHaveBeenCalledTimes(2);
    });
  });

  // Jellyfin libraries with "Group films into collections" hide BoxSet members
  // unless the query opts out. Locks every library-scoped getItems call to the
  // shared default so a Maintainerr-managed BoxSet does not flip movies in and
  // out of library listings between rule runs (#2554).
  describe('library queries opt out of BoxSet collapsing', () => {
    beforeEach(async () => {
      settingsDataService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_user_id: 'user-1',
      } as unknown as Awaited<ReturnType<SettingsDataService['getSettings']>>);
      await service.initialize();
      jellyfinApiMocks.getItems.mockResolvedValue({
        data: { Items: [], TotalRecordCount: 0 },
      });
    });

    const expectCollapseFalse = () =>
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith(
        expect.objectContaining({ collapseBoxSetItems: false }),
      );

    it('getLibraryContents passes collapseBoxSetItems: false', async () => {
      await service.getLibraryContents('library-1', { offset: 0, limit: 30 });
      expectCollapseFalse();
    });

    it('getLibraryContentCount passes collapseBoxSetItems: false', async () => {
      await service.getLibraryContentCount('library-1', 'movie');
      expectCollapseFalse();
    });

    it('searchLibraryContents passes collapseBoxSetItems: false', async () => {
      await service.searchLibraryContents('library-1', 'query', 'movie');
      expectCollapseFalse();
    });

    it('getRecentlyAdded passes collapseBoxSetItems: false', async () => {
      await service.getRecentlyAdded('library-1', { limit: 10 });
      expectCollapseFalse();
    });

    it('searchContent passes collapseBoxSetItems: false', async () => {
      await service.searchContent('query');
      expectCollapseFalse();
    });

    it('findRandomItem passes collapseBoxSetItems: false', async () => {
      await service.findRandomItem(['library-1'], ['Movie' as any]);
      expectCollapseFalse();
    });

    it('computeLibraryStorageSizes passes collapseBoxSetItems: false', async () => {
      jellyfinApiMocks.getMediaFolders.mockResolvedValueOnce({
        data: {
          Items: [
            { Id: 'library-1', Name: 'Movies', CollectionType: 'movies' },
          ],
        },
      });
      jellyfinApiMocks.getItems.mockResolvedValueOnce({
        data: { Items: [], TotalRecordCount: 0 },
      });
      await service.computeLibraryStorageSizes();
      expectCollapseFalse();
    });
  });

  describe('getLibraries', () => {
    beforeEach(async () => {
      settingsDataService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
        >,
      );
      await service.initialize();
    });

    it('retries once after a transient libraries failure', async () => {
      jellyfinApiMocks.getMediaFolders
        .mockRejectedValueOnce(createRetryableError('ECONNRESET'))
        .mockResolvedValueOnce({
          data: {
            Items: [
              {
                Id: 'library-1',
                Name: 'Movies',
                CollectionType: 'movies',
              },
            ],
          },
        });

      const result = await service.getLibraries();

      expect(delay).toHaveBeenCalledWith(300);
      expect(jellyfinApiMocks.getMediaFolders).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Transient Jellyfin failure during get Jellyfin libraries; retrying once in 300ms',
      );
      expect(result).toEqual([
        {
          id: 'library-1',
          title: 'Movies',
          type: 'movie',
        },
      ]);
    });

    it('deduplicates device-level UsedSpace when a library has multiple folders on the same drive', async () => {
      jellyfinApiMocks.getSystemStorage.mockResolvedValue({
        data: {
          Libraries: [
            {
              Id: 'library-1',
              Folders: [
                {
                  DeviceId: 'disk-1',
                  Path: '/mnt/media/movies-a',
                  UsedSpace: 100,
                },
                {
                  DeviceId: 'disk-1',
                  Path: '/mnt/media/movies-b',
                  UsedSpace: 100,
                },
                {
                  DeviceId: 'disk-2',
                  Path: '/mnt/archive/movies',
                  UsedSpace: 50,
                },
              ],
            },
          ],
        },
      });

      await expect(service.getLibrariesStorage()).resolves.toEqual(
        new Map([['library-1', 150]]),
      );
    });
  });

  describe('getChildrenMetadata', () => {
    beforeEach(async () => {
      settingsDataService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_user_id: 'user-1',
      } as unknown as Awaited<ReturnType<SettingsDataService['getSettings']>>);
      await service.initialize();
    });

    it('excludes virtual Jellyfin episodes from episode child queries', async () => {
      jellyfinApiMocks.getItems.mockResolvedValue({
        data: {
          Items: [
            {
              Id: 'episode-1',
              Name: 'Episode One',
              Type: 'Episode',
              ParentId: 'season-1',
              SeriesId: 'show-1',
              UserData: {},
            },
          ],
        },
      });

      await service.getChildrenMetadata('season-1', 'episode');

      expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          parentId: 'season-1',
          includeItemTypes: ['Episode'],
          excludeLocationTypes: ['Virtual'],
        }),
      );
    });

    it('does not apply location filtering to non-episode child queries', async () => {
      jellyfinApiMocks.getItems.mockResolvedValue({
        data: {
          Items: [],
        },
      });

      await service.getChildrenMetadata('library-1', 'movie');

      expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          parentId: 'library-1',
          includeItemTypes: ['Movie'],
          excludeLocationTypes: undefined,
        }),
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
      settingsDataService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
        >,
      );
      await service.initialize();
    });

    it('queues refresh for valid Jellyfin item ids', async () => {
      const itemId = 'a852a27afe324084ae66db579ee3ee18';

      await service.refreshItemMetadata(itemId);

      expect(jellyfinApiMocks.refreshItem).toHaveBeenCalledWith({
        itemId,
        metadataRefreshMode: 'Default',
        imageRefreshMode: 'Default',
      });
    });

    it('rejects blank Jellyfin item ids before calling the API', async () => {
      await expect(service.refreshItemMetadata('   ')).rejects.toThrow(
        'refreshItemMetadata called with empty itemId - aborting metadata refresh request',
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

  describe('getActiveSessions', () => {
    beforeEach(async () => {
      settingsDataService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
        >,
      );
      await service.initialize();
    });

    it('collects the playing item plus its season and series ids', async () => {
      jellyfinApiMocks.getSessions.mockResolvedValue({
        data: [
          { NowPlayingItem: { Id: 'movie1', Type: 'Movie' } },
          {
            NowPlayingItem: {
              Id: 'episode1',
              SeasonId: 'season1',
              SeriesId: 'series1',
              Type: 'Episode',
            },
          },
          // No NowPlayingItem (idle/remote-control session) is skipped.
          { Id: 'idle-session' },
        ],
      });

      const playing = await service.getActiveSessions();

      expect(playing).toEqual(
        new Set(['movie1', 'episode1', 'season1', 'series1']),
      );
    });

    it('returns an empty set when the sessions request fails', async () => {
      jellyfinApiMocks.getSessions.mockRejectedValue(new Error('boom'));
      await expect(service.getActiveSessions()).resolves.toEqual(
        new Set<string>(),
      );
    });
  });

  describe('getWatchHistory', () => {
    beforeEach(async () => {
      settingsDataService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
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
        JELLYFIN_CACHE_TTL.WATCH_HISTORY,
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

    it('should re-throw when the played threshold cannot be loaded', async () => {
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

      await expect(service.getWatchHistory('item123')).rejects.toThrow(
        'Configuration unavailable',
      );
    });

    it('should re-throw when the Jellyfin users lookup fails', async () => {
      jellyfinApiMocks.getUsers.mockRejectedValue(
        new Error('Users unavailable'),
      );
      jellyfinApiMocks.getConfiguration.mockResolvedValue({
        data: { MaxResumePct: 95 },
      });

      await expect(service.getWatchHistory('item123')).rejects.toThrow(
        'Users unavailable',
      );
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

  describe('getDescendantEpisodeWatchers', () => {
    beforeEach(async () => {
      settingsDataService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
        >,
      );
      await service.initialize();
    });

    it('returns users who played any episode under a show', async () => {
      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [
          { Id: 'user-1', Name: 'Alice' },
          { Id: 'user-2', Name: 'Bob' },
          { Id: 'user-3', Name: 'Carol' },
        ],
      });
      jellyfinApiMocks.getConfiguration.mockResolvedValue({
        data: { MaxResumePct: 90 },
      });

      // Alice finished an episode, Bob only has unplayed episodes, Carol
      // is above the PlayedPercentage threshold on a partial play.
      jellyfinApiMocks.getItems.mockImplementation(
        ({ userId }: { userId: string }) => {
          if (userId === 'user-1') {
            return Promise.resolve({
              data: {
                Items: [
                  { UserData: { Played: true } },
                  { UserData: { Played: false, PlayedPercentage: 10 } },
                ],
              },
            });
          }
          if (userId === 'user-2') {
            return Promise.resolve({
              data: {
                Items: [
                  { UserData: { Played: false, PlayedPercentage: 0 } },
                  { UserData: { Played: false, PlayedPercentage: 20 } },
                ],
              },
            });
          }
          if (userId === 'user-3') {
            return Promise.resolve({
              data: {
                Items: [{ UserData: { Played: false, PlayedPercentage: 95 } }],
              },
            });
          }
          return Promise.resolve({ data: { Items: [] } });
        },
      );

      const result = await service.getDescendantEpisodeWatchers('show-1');

      expect(result).toEqual(expect.arrayContaining(['user-1', 'user-3']));
      expect(result).not.toContain('user-2');
      expect(result).toHaveLength(2);

      // One getItems call per user, scoped to Episode descendants.
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          parentId: 'show-1',
          recursive: true,
          includeItemTypes: ['Episode'],
          enableUserData: true,
        }),
      );
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledTimes(3);
    });

    it('returns an empty list when nobody has watched an episode', async () => {
      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [{ Id: 'user-1', Name: 'Alice' }],
      });
      jellyfinApiMocks.getItems.mockResolvedValue({
        data: {
          Items: [{ UserData: { Played: false, PlayedPercentage: 0 } }],
        },
      });

      const result = await service.getDescendantEpisodeWatchers('show-1');
      expect(result).toEqual([]);
    });

    it('deduplicates users who watched multiple episodes', async () => {
      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [{ Id: 'user-1', Name: 'Alice' }],
      });
      jellyfinApiMocks.getItems.mockResolvedValue({
        data: {
          Items: [
            { UserData: { Played: true } },
            { UserData: { Played: true } },
            { UserData: { Played: true } },
          ],
        },
      });

      const result = await service.getDescendantEpisodeWatchers('show-1');
      expect(result).toEqual(['user-1']);
    });

    it('caches results per parent id', async () => {
      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [{ Id: 'user-1', Name: 'Alice' }],
      });
      jellyfinCacheMocks.data.get.mockReturnValue(['user-1']);

      const result = await service.getDescendantEpisodeWatchers('show-1');

      expect(result).toEqual(['user-1']);
      expect(jellyfinApiMocks.getItems).not.toHaveBeenCalled();
    });

    it('skips users whose per-user query fails without aborting others', async () => {
      jellyfinApiMocks.getUsers.mockResolvedValue({
        data: [
          { Id: 'user-1', Name: 'Alice' },
          { Id: 'user-2', Name: 'Bob' },
        ],
      });
      jellyfinApiMocks.getItems.mockImplementation(
        ({ userId }: { userId: string }) => {
          if (userId === 'user-1') {
            return Promise.reject(new Error('boom'));
          }
          return Promise.resolve({
            data: { Items: [{ UserData: { Played: true } }] },
          });
        },
      );

      const result = await service.getDescendantEpisodeWatchers('show-1');
      expect(result).toEqual(['user-2']);
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
      settingsDataService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
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
        JELLYFIN_CACHE_TTL.USER_DATA,
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
      settingsDataService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
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
        JELLYFIN_CACHE_TTL.USER_DATA,
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
    it('clears every watch-history entry (incl. descendant episodes) plus this item’s favorite/play-count, keeping aggregates', () => {
      jellyfinCacheMocks.data.keys.mockReturnValue([
        'jellyfin:watch:90:item123', // this item's watch history
        'jellyfin:watch:95:item123', // ...at another played threshold
        'jellyfin:watch:90:episode-999', // a DESCENDANT episode (#3274) - different id
        'jellyfin:watch:90:episode-watchers:item123', // descendant-watchers rollup
        'jellyfin:favorited-by:item123',
        'jellyfin:total-play-count:item123',
        'jellyfin:favorited-by:other-item', // unrelated item - must be kept
        'jellyfin:users', // server-wide aggregate - must be kept
        'jellyfin:libraries', // server-wide aggregate - must be kept
      ]);

      service.resetMetadataCache('item123');

      // Every watch-history key is cleared, including the descendant episode
      // whose id != itemId - the regression that caused #3274.
      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:watch:90:item123',
      );
      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:watch:95:item123',
      );
      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:watch:90:episode-999',
      );
      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:watch:90:episode-watchers:item123',
      );
      // This item's per-item favorite/play-count entries still cleared as before.
      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:favorited-by:item123',
      );
      expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
        'jellyfin:total-play-count:item123',
      );
      // Unrelated per-item and server-wide aggregate caches are preserved.
      expect(jellyfinCacheMocks.data.del).not.toHaveBeenCalledWith(
        'jellyfin:favorited-by:other-item',
      );
      expect(jellyfinCacheMocks.data.del).not.toHaveBeenCalledWith(
        'jellyfin:users',
      );
      expect(jellyfinCacheMocks.data.del).not.toHaveBeenCalledWith(
        'jellyfin:libraries',
      );
    });

    it('flushes the whole cache when called without an item id', () => {
      service.resetMetadataCache();

      expect(jellyfinCacheMocks.data.flushAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('collection operations', () => {
    beforeEach(async () => {
      settingsDataService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
        >,
      );
      await service.initialize();
      logger.warn.mockClear();
      logger.debug.mockClear();
    });

    it('treats missing Jellyfin collections as absent without warning noise', async () => {
      const notFoundError = createResponseError(404);
      notFoundError.message = 'Request failed with status code 404';
      jellyfinApiMocks.getItem.mockRejectedValueOnce(notFoundError);

      await expect(
        service.getCollection('collection-1'),
      ).resolves.toBeUndefined();

      expect(logger.warn).not.toHaveBeenCalledWith(
        'Failed to get collection collection-1',
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'Jellyfin collection collection-1 not found; treating it as missing',
      );
      expect(logger.debug).not.toHaveBeenCalledWith(notFoundError);
    });

    it('logs unexpected Jellyfin collection lookup failures at debug level', async () => {
      const serverError = createResponseError(502);
      jellyfinApiMocks.getItem.mockRejectedValueOnce(serverError);

      await expect(
        service.getCollection('collection-1'),
      ).resolves.toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith(
        'Failed to get collection collection-1',
      );
      expect(logger.debug).toHaveBeenCalledWith(serverError);
    });

    it('re-throws unexpected lookup failures when strict verification is requested', async () => {
      const serverError = createResponseError(502);
      jellyfinApiMocks.getItem.mockRejectedValueOnce(serverError);

      await expect(service.getCollection('collection-1', true)).rejects.toThrow(
        serverError,
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'Failed to get collection collection-1',
      );
      expect(logger.debug).toHaveBeenCalledWith(serverError);
    });

    it('retries once after a transient collection-children failure', async () => {
      jellyfinApiMocks.getItems
        .mockRejectedValueOnce(createRetryableError('ETIMEDOUT'))
        .mockResolvedValueOnce({
          data: {
            Items: [
              {
                Id: 'item-1',
                Name: 'Movie One',
                Type: 'Movie',
                UserData: {},
              },
            ],
          },
        });

      const result = await service.getCollectionChildren('collection-1');

      expect(delay).toHaveBeenCalledWith(300);
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Transient Jellyfin failure during get Jellyfin collection children for collection-1; retrying once in 300ms',
      );
      expect(result).toEqual([
        expect.objectContaining({
          id: 'item-1',
          title: 'Movie One',
        }),
      ]);
    });

    it('retries once after a transient recursive collection-children failure', async () => {
      jellyfinApiMocks.getItems
        .mockResolvedValueOnce({
          data: {
            Items: [],
          },
        })
        .mockRejectedValueOnce(createRetryableError('ECONNRESET'))
        .mockResolvedValueOnce({
          data: {
            Items: [
              {
                Id: 'item-2',
                Name: 'Series One',
                Type: 'Series',
                UserData: {},
              },
            ],
          },
        });

      const result = await service.getCollectionChildren('collection-1');

      expect(delay).toHaveBeenCalledWith(300);
      expect(jellyfinApiMocks.getItems).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledWith(
        'Transient Jellyfin failure during get Jellyfin collection children recursively for collection-1; retrying once in 300ms',
      );
      expect(result).toEqual([
        expect.objectContaining({
          id: 'item-2',
          title: 'Series One',
        }),
      ]);
    });

    it('re-throws when Jellyfin returns 400 (deleted collection)', async () => {
      const axiosError = createResponseError(400);
      jellyfinApiMocks.getItems.mockRejectedValueOnce(axiosError);

      await expect(
        service.getCollectionChildren('deleted-collection'),
      ).rejects.toThrow(axiosError);
    });

    it('re-throws when Jellyfin returns 404', async () => {
      const axiosError = createResponseError(404);
      jellyfinApiMocks.getItems.mockRejectedValueOnce(axiosError);

      await expect(
        service.getCollectionChildren('missing-collection'),
      ).rejects.toThrow(axiosError);
    });

    it('re-throws non-400/404 errors so callers never mistake a failed read for an empty collection', async () => {
      const serverError = createResponseError(500);
      jellyfinApiMocks.getItems.mockRejectedValue(serverError);

      await expect(
        service.getCollectionChildren('collection-1'),
      ).rejects.toThrow(serverError);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get collection children for collection-1',
        serverError,
      );
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
      // Collections are created empty - item ids must never be sent on create
      // (they go in the query string → HTTP 414 at scale); items are added via
      // addBatchToCollection.
      expect(collectionApiMocks.createCollection).not.toHaveBeenCalledWith(
        expect.objectContaining({ ids: expect.anything() }),
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

    it('should fall back to per-item adds and return item ids that still fail', async () => {
      const items = Array.from(
        { length: JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION * 2 },
        (_, index) => `item-${index + 1}`,
      );

      collectionApiMocks.addToCollection.mockImplementation(
        async ({ ids }: { ids: string[] }) => {
          if (
            ids.length === JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION &&
            ids[0] === `item-${JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION + 1}`
          ) {
            throw new Error('Request line too long');
          }

          if (
            ids.length === 1 &&
            ids[0] === `item-${JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION + 1}`
          ) {
            throw new Error('still bad');
          }

          return undefined;
        },
      );

      await expect(
        service.addBatchToCollection('collection-1', items),
      ).resolves.toEqual([
        `item-${JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION + 1}`,
      ]);

      expect(collectionApiMocks.addToCollection).toHaveBeenCalledTimes(
        JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION + 2,
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'Jellyfin batch add fallback left 1 failed item(s) for collection collection-1',
      );
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('should stay silent when per-item fallback recovers all Jellyfin batch add failures', async () => {
      collectionApiMocks.addToCollection.mockImplementation(
        async ({ ids }: { ids: string[] }) => {
          if (ids.length > 1) {
            throw new Error('Request line too long');
          }

          return undefined;
        },
      );

      await expect(
        service.addBatchToCollection('collection-1', ['item-1', 'item-2']),
      ).resolves.toEqual([]);

      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
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

    it('should remove only items from the specified library and keep manual shared collections', async () => {
      settingsDataService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_user_id: 'user-1',
      } as unknown as Awaited<ReturnType<SettingsDataService['getSettings']>>);
      await service.initialize();

      jest.spyOn(service, 'getCollectionChildren').mockResolvedValue([
        {
          id: 'item-old-1',
          type: 'movie',
          library: { id: 'old-library', title: 'Old Library', type: 'movie' },
        } as unknown as MediaItem,
        {
          id: 'item-other-1',
          type: 'movie',
          library: {
            id: 'other-library',
            title: 'Other Library',
            type: 'movie',
          },
        } as unknown as MediaItem,
      ]);

      jellyfinApiMocks.getAncestors.mockImplementation(({ itemId }) => {
        return Promise.resolve({
          data:
            itemId === 'item-old-1'
              ? [{ Id: 'old-library' }]
              : [{ Id: 'other-library' }],
        });
      });

      await service.cleanupCollectionForLibrary(
        'collection-1',
        'old-library',
        true,
      );

      expect(collectionApiMocks.removeFromCollection).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        ids: ['item-old-1'],
      });
      expect(jellyfinApiMocks.deleteItem).not.toHaveBeenCalled();
    });

    it('should keep automatic collections when library membership lookup is incomplete', async () => {
      settingsDataService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_user_id: 'user-1',
      } as unknown as Awaited<ReturnType<SettingsDataService['getSettings']>>);
      await service.initialize();

      jest.spyOn(service, 'getCollectionChildren').mockResolvedValue([
        {
          id: 'item-old-1',
          type: 'movie',
          library: { id: 'old-library', title: 'Old Library', type: 'movie' },
        } as unknown as MediaItem,
        {
          id: 'item-unknown-1',
          type: 'movie',
          library: { id: 'old-library', title: 'Old Library', type: 'movie' },
        } as unknown as MediaItem,
      ]);

      jellyfinApiMocks.getAncestors.mockImplementation(({ itemId }) => {
        if (itemId === 'item-old-1') {
          return Promise.resolve({ data: [{ Id: 'old-library' }] });
        }

        return Promise.reject(new Error('ancestor lookup failed'));
      });

      await service.cleanupCollectionForLibrary(
        'collection-1',
        'old-library',
        false,
      );

      expect(collectionApiMocks.removeFromCollection).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        ids: ['item-old-1'],
      });
      expect(jellyfinApiMocks.deleteItem).not.toHaveBeenCalled();
    });

    it('should delete empty automatic collections after removing the old library items', async () => {
      settingsDataService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_user_id: 'user-1',
      } as unknown as Awaited<ReturnType<SettingsDataService['getSettings']>>);
      await service.initialize();

      jest.spyOn(service, 'getCollectionChildren').mockResolvedValue([
        {
          id: 'item-old-1',
          type: 'movie',
          library: { id: 'old-library', title: 'Old Library', type: 'movie' },
        } as unknown as MediaItem,
        {
          id: 'item-old-2',
          type: 'movie',
          library: { id: 'old-library', title: 'Old Library', type: 'movie' },
        } as unknown as MediaItem,
      ]);

      jellyfinApiMocks.getAncestors.mockResolvedValue({
        data: [{ Id: 'old-library' }],
      });

      await service.cleanupCollectionForLibrary(
        'collection-1',
        'old-library',
        false,
      );

      expect(collectionApiMocks.removeFromCollection).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        ids: ['item-old-1', 'item-old-2'],
      });
      expect(jellyfinApiMocks.deleteItem).toHaveBeenCalledWith({
        itemId: 'collection-1',
      });
    });

    describe('caching', () => {
      it('caches non-empty getCollections results and serves them on the next call', async () => {
        jellyfinApiMocks.getItems.mockResolvedValueOnce({
          data: {
            Items: [
              {
                Id: 'collection-1',
                Name: 'C1',
                ChildCount: 2,
                ParentId: 'library-1',
              },
            ],
          },
        });

        await service.getCollections('library-1');

        expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith(
          expect.objectContaining({ parentId: 'library-1' }),
        );

        expect(jellyfinCacheMocks.data.set).toHaveBeenCalledWith(
          'jellyfin:collections:library-1',
          expect.arrayContaining([
            expect.objectContaining({ id: 'collection-1' }),
          ]),
          600,
        );

        const cached = [{ id: 'cached', title: 'Cached' }];
        jellyfinCacheMocks.data.get.mockReturnValueOnce(cached);

        const second = await service.getCollections('library-1');
        expect(second).toBe(cached);
        // Only the first call hit the API
        expect(jellyfinApiMocks.getItems).toHaveBeenCalledTimes(1);
      });

      it('does not cache an empty getCollections result', async () => {
        jellyfinApiMocks.getItems.mockResolvedValueOnce({
          data: { Items: [] },
        });

        await service.getCollections('library-1');

        expect(jellyfinCacheMocks.data.set).not.toHaveBeenCalledWith(
          'jellyfin:collections:library-1',
          expect.anything(),
          expect.anything(),
        );
      });

      it('does not cache an empty getCollectionChildren result', async () => {
        // Both parentId and recursive lookups return zero items
        jellyfinApiMocks.getItems.mockResolvedValue({ data: { Items: [] } });

        await service.getCollectionChildren('collection-1');

        expect(jellyfinCacheMocks.data.set).not.toHaveBeenCalledWith(
          'jellyfin:collections:children:collection-1',
          expect.anything(),
          expect.anything(),
        );
      });

      it('invalidates the children cache after addToCollection', async () => {
        await service.addToCollection('collection-1', 'item-1');

        expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
          'jellyfin:collections:children:collection-1',
        );
      });

      it('invalidates the children cache once after addBatchToCollection (multi-chunk)', async () => {
        const items = Array.from(
          { length: JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION + 1 },
          (_, i) => `item-${i}`,
        );

        await service.addBatchToCollection('collection-1', items);

        const childInvalidations =
          jellyfinCacheMocks.data.del.mock.calls.filter(
            (call) => call[0] === 'jellyfin:collections:children:collection-1',
          );
        expect(childInvalidations).toHaveLength(1);
      });

      it('invalidates the children cache after removeBatchFromCollection', async () => {
        await service.removeBatchFromCollection('collection-1', ['item-1']);

        expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
          'jellyfin:collections:children:collection-1',
        );
      });

      it('invalidates the per-library collections cache after createCollection', async () => {
        collectionApiMocks.createCollection.mockResolvedValueOnce({
          data: { Id: 'collection-new' },
        });

        await service.createCollection({
          libraryId: 'library-1',
          title: 'New',
          type: 'movie',
        });

        expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
          'jellyfin:collections:library-1',
        );
      });

      it('invalidates the per-library collections cache after updateCollection', async () => {
        jellyfinApiMocks.getItems
          .mockResolvedValueOnce({
            data: {
              Items: [
                {
                  Id: 'collection-1',
                  Name: 'Old Name',
                  ParentId: 'library-1',
                  Tags: [],
                  Genres: [],
                  Studios: [],
                  People: [],
                },
              ],
            },
          })
          .mockResolvedValueOnce({
            data: {
              Items: [
                {
                  Id: 'collection-1',
                  Name: 'New Name',
                  ParentId: 'library-1',
                },
              ],
            },
          });

        await service.updateCollection({
          collectionId: 'collection-1',
          libraryId: 'library-1',
          title: 'New Name',
          summary: 'Updated summary',
          sortTitle: 'New Name',
        });

        expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
          'jellyfin:collections:library-1',
        );
      });

      it('clears every per-library collections entry on deleteCollection (libraryId unknown) and the children cache', async () => {
        jellyfinCacheMocks.data.keys.mockReturnValueOnce([
          'jellyfin:collections:library-1',
          'jellyfin:collections:library-2',
          'jellyfin:collections:children:collection-99',
          'jellyfin:users',
        ]);

        await service.deleteCollection('collection-1');

        expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith([
          'jellyfin:collections:library-1',
          'jellyfin:collections:library-2',
        ]);
        expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
          'jellyfin:collections:children:collection-1',
        );
      });

      it('swallows deleteCollection failure when the collection is already gone (Jellyfin auto-delete race)', async () => {
        jellyfinApiMocks.deleteItem.mockRejectedValueOnce(
          createResponseError(500),
        );
        jellyfinApiMocks.getItem.mockRejectedValueOnce(
          createResponseError(404),
        );

        await expect(
          service.deleteCollection('collection-1'),
        ).resolves.toBeUndefined();

        expect(jellyfinCacheMocks.data.del).toHaveBeenCalledWith(
          'jellyfin:collections:children:collection-1',
        );
      });

      it('rethrows deleteCollection failure when the collection still exists', async () => {
        const serverError = createResponseError(500);
        jellyfinApiMocks.deleteItem.mockRejectedValueOnce(serverError);
        jellyfinApiMocks.getItem.mockResolvedValueOnce({
          data: { Id: 'collection-1', Name: 'Still here' },
        });

        await expect(service.deleteCollection('collection-1')).rejects.toBe(
          serverError,
        );
      });
    });
  });

  describe('overlay helpers', () => {
    const initializeAdapter = async () => {
      settingsDataService.getSettings.mockResolvedValue(
        mockSettings as unknown as Awaited<
          ReturnType<SettingsDataService['getSettings']>
        >,
      );
      await service.initialize();
    };

    describe('findRandomItem', () => {
      it('queries getItems with Random sort and returns the first item', async () => {
        await initializeAdapter();

        jellyfinApiMocks.getItems.mockResolvedValue({
          data: { Items: [{ Id: 'jf-42', Name: 'Random Item' }] },
        });

        const item = await service.findRandomItem(
          ['lib-1'],
          ['Movie' as any, 'Series' as any],
        );

        expect(item).toEqual({ Id: 'jf-42', Name: 'Random Item' });
        expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith(
          expect.objectContaining({
            parentId: 'lib-1',
            sortBy: ['Random'],
            limit: 1,
            recursive: true,
            excludeLocationTypes: ['Virtual'],
          }),
        );
      });

      it('returns null when no items match', async () => {
        await initializeAdapter();
        jellyfinApiMocks.getItems.mockResolvedValue({ data: { Items: [] } });

        await expect(
          service.findRandomItem(undefined, ['Movie' as any]),
        ).resolves.toBeNull();
      });

      it('returns null when the adapter is not initialised', async () => {
        await expect(
          service.findRandomItem(['lib-1'], ['Movie' as any]),
        ).resolves.toBeNull();
        expect(jellyfinApiMocks.getItems).not.toHaveBeenCalled();
      });
    });

    describe('findRandomEpisode', () => {
      it('queries getItems with Episode kind and Random sort', async () => {
        await initializeAdapter();
        jellyfinApiMocks.getItems.mockResolvedValue({
          data: {
            Items: [
              {
                Id: 'ep-1',
                Name: 'Episode One',
                SeriesName: 'Series Name',
              },
            ],
          },
        });

        const ep = await service.findRandomEpisode(['lib-shows']);

        expect(ep).toMatchObject({ Id: 'ep-1', Name: 'Episode One' });
        expect(jellyfinApiMocks.getItems).toHaveBeenCalledWith(
          expect.objectContaining({
            parentId: 'lib-shows',
            includeItemTypes: ['Episode'],
            sortBy: ['Random'],
          }),
        );
      });
    });

    describe('getItemImageBuffer', () => {
      it('requests the given image type as arraybuffer and wraps in Buffer', async () => {
        await initializeAdapter();
        const payload = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
        jellyfinApiMocks.getItemImage.mockResolvedValue({ data: payload });

        const buf = await service.getItemImageBuffer('42', 'Primary' as any);

        expect(buf).toBeInstanceOf(Buffer);
        expect(buf?.length).toBe(3);
        expect(jellyfinApiMocks.getItemImage).toHaveBeenCalledWith(
          { itemId: '42', imageType: 'Primary', format: 'Jpg' },
          { responseType: 'arraybuffer' },
        );
      });

      it('passes Thumb through when requested', async () => {
        await initializeAdapter();
        jellyfinApiMocks.getItemImage.mockResolvedValue({
          data: new ArrayBuffer(1),
        });

        await service.getItemImageBuffer('42', 'Thumb' as any);

        expect(jellyfinApiMocks.getItemImage).toHaveBeenCalledWith(
          { itemId: '42', imageType: 'Thumb', format: 'Jpg' },
          { responseType: 'arraybuffer' },
        );
      });

      it('returns null on 404', async () => {
        await initializeAdapter();
        jellyfinApiMocks.getItemImage.mockRejectedValue(
          createResponseError(404),
        );

        await expect(
          service.getItemImageBuffer('42', 'Primary' as any),
        ).resolves.toBeNull();
      });

      it('returns null and logs on non-404 errors', async () => {
        await initializeAdapter();
        jellyfinApiMocks.getItemImage.mockRejectedValue(
          createResponseError(500),
        );

        await expect(
          service.getItemImageBuffer('42', 'Primary' as any),
        ).resolves.toBeNull();
        expect(logger.warn).toHaveBeenCalled();
      });
    });

    describe('setItemImage', () => {
      it('POSTs the image as base64 with the given Content-Type', async () => {
        await initializeAdapter();
        const buf = Buffer.from('jpeg-bytes');

        await service.setItemImage('42', 'Primary' as any, buf, 'image/jpeg');

        expect(jellyfinApiMocks.setItemImage).toHaveBeenCalledWith(
          {
            itemId: '42',
            imageType: 'Primary',
            body: buf.toString('base64'),
          },
          { headers: { 'Content-Type': 'image/jpeg' } },
        );
      });

      it('passes Thumb through unchanged when requested', async () => {
        await initializeAdapter();
        const buf = Buffer.from('tc');

        await service.setItemImage('42', 'Thumb' as any, buf, 'image/jpeg');

        expect(jellyfinApiMocks.setItemImage).toHaveBeenCalledWith(
          expect.objectContaining({ imageType: 'Thumb' }),
          expect.any(Object),
        );
      });

      it('throws when the adapter is not initialised', async () => {
        await expect(
          service.setItemImage(
            '42',
            'Primary' as any,
            Buffer.from('x'),
            'image/jpeg',
          ),
        ).rejects.toThrow('Jellyfin API not initialized');
      });
    });

    describe('setCollectionImage', () => {
      it('reuses setItemImage with the Primary image type', async () => {
        await initializeAdapter();
        const buf = Buffer.from('jpeg-bytes');

        await service.setCollectionImage('col1', buf, 'image/jpeg');

        expect(jellyfinApiMocks.setItemImage).toHaveBeenCalledWith(
          expect.objectContaining({
            itemId: 'col1',
            imageType: 'Primary',
            body: buf.toString('base64'),
          }),
          { headers: { 'Content-Type': 'image/jpeg' } },
        );
      });
    });

    describe('itemExists', () => {
      it('returns true when getItems returns the item', async () => {
        await initializeAdapter();
        jellyfinApiMocks.getItems.mockResolvedValue({
          data: { Items: [{ Id: '42' }] },
        });

        await expect(service.itemExists('42')).resolves.toBe(true);
      });

      it('returns false when getItems returns no items (item gone)', async () => {
        await initializeAdapter();
        jellyfinApiMocks.getItems.mockResolvedValue({ data: { Items: [] } });

        await expect(service.itemExists('42')).resolves.toBe(false);
      });

      it('returns false on a 404 from Jellyfin', async () => {
        await initializeAdapter();
        jellyfinApiMocks.getItems.mockRejectedValue(createResponseError(404));

        await expect(service.itemExists('42')).resolves.toBe(false);
      });

      it('rethrows non-404 errors so revert callers preserve state', async () => {
        await initializeAdapter();
        const err = createResponseError(502);
        jellyfinApiMocks.getItems.mockRejectedValue(err);

        await expect(service.itemExists('42')).rejects.toBe(err);
      });

      it('throws when the adapter is not initialised so revert callers preserve state', async () => {
        await expect(service.itemExists('42')).rejects.toThrow(
          'Jellyfin API not initialized',
        );
        expect(jellyfinApiMocks.getItems).not.toHaveBeenCalled();
      });
    });
  });
});
