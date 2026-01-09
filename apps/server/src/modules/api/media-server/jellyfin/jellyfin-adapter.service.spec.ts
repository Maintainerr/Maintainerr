import { MediaServerFeature, MediaServerType } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { SettingsService } from '../../../settings/settings.service';
import { JellyfinAdapterService } from './jellyfin-adapter.service';

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

jest.mock('@jellyfin/sdk/lib/utils/api', () => ({
  __esModule: true,
  getSystemApi: jest.fn().mockReturnValue({
    getPublicSystemInfo: jest.fn().mockResolvedValue({
      data: {
        Id: 'server123',
        ServerName: 'Test Server',
        Version: '10.11.0',
        OperatingSystem: 'Linux',
      },
    }),
  }),
  getItemsApi: jest.fn(),
  getLibraryApi: jest.fn(),
  getUserApi: jest.fn().mockReturnValue({
    getUsers: jest.fn().mockResolvedValue({ data: [] }),
    getUserById: jest.fn(),
  }),
  getCollectionApi: jest.fn(),
  getSearchApi: jest.fn(),
  getPlaylistsApi: jest.fn(),
  getUserViewsApi: jest.fn(),
}));

// Mock the cacheManager module
jest.mock('../../lib/cache', () => ({
  __esModule: true,
  default: {
    getCache: jest.fn().mockReturnValue({
      flush: jest.fn(),
      data: {
        has: jest.fn().mockReturnValue(false),
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        flushAll: jest.fn(),
      },
    }),
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
    it('should support LABELS feature', () => {
      expect(service.supportsFeature(MediaServerFeature.LABELS)).toBe(true);
    });

    it('should support PLAYLISTS feature', () => {
      expect(service.supportsFeature(MediaServerFeature.PLAYLISTS)).toBe(true);
    });

    it('should NOT support COLLECTION_VISIBILITY feature', () => {
      expect(
        service.supportsFeature(MediaServerFeature.COLLECTION_VISIBILITY),
      ).toBe(false);
    });

    it('should NOT support WATCHLIST feature', () => {
      expect(service.supportsFeature(MediaServerFeature.WATCHLIST)).toBe(false);
    });

    it('should NOT support CENTRAL_WATCH_HISTORY feature', () => {
      expect(
        service.supportsFeature(MediaServerFeature.CENTRAL_WATCH_HISTORY),
      ).toBe(false);
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

  describe('getStatus', () => {
    it('should return undefined when not initialized', async () => {
      const status = await service.getStatus();
      expect(status).toBeUndefined();
    });
  });

  describe('getUsers', () => {
    it('should return empty array when not initialized', async () => {
      const users = await service.getUsers();
      expect(users).toEqual([]);
    });
  });

  describe('getLibraries', () => {
    it('should return empty array when not initialized', async () => {
      const libraries = await service.getLibraries();
      expect(libraries).toEqual([]);
    });
  });

  describe('getMetadata', () => {
    it('should return undefined when not initialized', async () => {
      const metadata = await service.getMetadata('item123');
      expect(metadata).toBeUndefined();
    });
  });

  describe('getWatchHistory', () => {
    it('should return empty array when not initialized', async () => {
      const history = await service.getWatchHistory('item123');
      expect(history).toEqual([]);
    });
  });

  describe('getCollections', () => {
    it('should return empty array when not initialized', async () => {
      const collections = await service.getCollections('lib123');
      expect(collections).toEqual([]);
    });
  });

  describe('searchContent', () => {
    it('should return empty array when not initialized', async () => {
      const results = await service.searchContent('test');
      expect(results).toEqual([]);
    });
  });
});
