import { Test, TestingModule } from '@nestjs/testing';
import { EMediaServerType, EMediaServerFeature } from '@maintainerr/contracts';
import { JellyfinService } from './jellyfin.service';
import { SettingsService } from '../../../settings/settings.service';

// Mock the cacheManager module
const mockNodeCache = {
  has: jest.fn().mockReturnValue(false),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  flushAll: jest.fn(),
};

jest.mock('../../lib/cache', () => ({
  __esModule: true,
  default: {
    getCache: jest.fn().mockReturnValue({
      data: mockNodeCache,
    }),
  },
}));

// Mock the @jellyfin/sdk module
jest.mock('@jellyfin/sdk', () => ({
  Jellyfin: jest.fn().mockImplementation(() => ({
    createApi: jest.fn().mockReturnValue({
      accessToken: '',
      configuration: {},
    }),
  })),
}));

jest.mock('@jellyfin/sdk/lib/utils/api', () => ({
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
  getUserApi: jest.fn(),
  getCollectionApi: jest.fn(),
  getSearchApi: jest.fn(),
  getPlaylistsApi: jest.fn(),
  getUserViewsApi: jest.fn(),
}));

describe('JellyfinService', () => {
  let service: JellyfinService;
  let settingsService: jest.Mocked<SettingsService>;

  const mockSettings = {
    jellyfin_url: 'http://jellyfin.test:8096',
    jellyfin_api_key: 'test-api-key',
    clientId: 'test-client-id',
  };

  beforeEach(async () => {
    // Reset mock cache
    mockNodeCache.has.mockReturnValue(false);
    mockNodeCache.get.mockReturnValue(undefined);
    mockNodeCache.set.mockClear();
    mockNodeCache.del.mockClear();
    mockNodeCache.flushAll.mockClear();

    const mockSettingsService = {
      getSettings: jest.fn().mockResolvedValue(mockSettings),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JellyfinService,
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
      ],
    }).compile();

    service = module.get<JellyfinService>(JellyfinService);
    settingsService = module.get(SettingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('lifecycle', () => {
    it('should not be setup initially', () => {
      expect(service.isSetup()).toBe(false);
    });

    it('should return JELLYFIN as server type', () => {
      expect(service.getServerType()).toBe(EMediaServerType.JELLYFIN);
    });

    it('should initialize successfully with valid settings', async () => {
      await service.initialize();
      expect(service.isSetup()).toBe(true);
    });

    it('should throw error when settings are missing', async () => {
      settingsService.getSettings.mockResolvedValue(null as any);
      await expect(service.initialize()).rejects.toThrow('Settings not available');
    });

    it('should throw error when Jellyfin URL is missing', async () => {
      settingsService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_url: undefined,
      } as any);
      await expect(service.initialize()).rejects.toThrow('Jellyfin settings not configured');
    });

    it('should throw error when API key is missing', async () => {
      settingsService.getSettings.mockResolvedValue({
        ...mockSettings,
        jellyfin_api_key: undefined,
      } as any);
      await expect(service.initialize()).rejects.toThrow('Jellyfin settings not configured');
    });

    it('should uninitialize correctly', async () => {
      await service.initialize();
      expect(service.isSetup()).toBe(true);
      
      service.uninitialize();
      expect(service.isSetup()).toBe(false);
    });
  });

  describe('feature detection', () => {
    it('should support LABELS feature', () => {
      expect(service.supportsFeature(EMediaServerFeature.LABELS)).toBe(true);
    });

    it('should support PLAYLISTS feature', () => {
      expect(service.supportsFeature(EMediaServerFeature.PLAYLISTS)).toBe(true);
    });

    it('should NOT support COLLECTION_VISIBILITY feature', () => {
      expect(service.supportsFeature(EMediaServerFeature.COLLECTION_VISIBILITY)).toBe(false);
    });

    it('should NOT support WATCHLIST feature', () => {
      expect(service.supportsFeature(EMediaServerFeature.WATCHLIST)).toBe(false);
    });

    it('should NOT support CENTRAL_WATCH_HISTORY feature', () => {
      expect(service.supportsFeature(EMediaServerFeature.CENTRAL_WATCH_HISTORY)).toBe(false);
    });
  });

  describe('cache management', () => {
    it('should delete specific item cache when itemId is provided', () => {
      service.resetMetadataCache('item123');
      expect(mockNodeCache.del).toHaveBeenCalledWith('jellyfin:watch:item123');
    });

    it('should flush all cache when no itemId is provided', () => {
      service.resetMetadataCache();
      expect(mockNodeCache.flushAll).toHaveBeenCalled();
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
