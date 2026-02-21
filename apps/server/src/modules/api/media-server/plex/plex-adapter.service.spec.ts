import { MediaServerFeature, MediaServerType } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { PlexApiService } from '../../plex-api/plex-api.service';
import { PlexAdapterService } from './plex-adapter.service';

describe('PlexAdapterService', () => {
  let service: PlexAdapterService;
  let plexApi: Mocked<PlexApiService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexAdapterService).compile();

    service = unit;
    plexApi = unitRef.get(PlexApiService);
  });

  describe('lifecycle', () => {
    it('should delegate isSetup to PlexApiService', () => {
      plexApi.isPlexSetup.mockReturnValue(false);
      expect(service.isSetup()).toBe(false);

      plexApi.isPlexSetup.mockReturnValue(true);
      expect(service.isSetup()).toBe(true);
    });

    it('should return PLEX as server type', () => {
      expect(service.getServerType()).toBe(MediaServerType.PLEX);
    });

    it('should delegate initialize to PlexApiService', async () => {
      plexApi.initialize.mockResolvedValue(undefined);
      await service.initialize();
      expect(plexApi.initialize).toHaveBeenCalled();
    });

    it('should delegate uninitialize to PlexApiService', () => {
      service.uninitialize();
      expect(plexApi.uninitialize).toHaveBeenCalled();
    });
  });

  describe('feature detection', () => {
    it.each([
      [MediaServerFeature.LABELS, true],
      [MediaServerFeature.PLAYLISTS, true],
      [MediaServerFeature.COLLECTION_VISIBILITY, true],
      [MediaServerFeature.WATCHLIST, true],
      [MediaServerFeature.CENTRAL_WATCH_HISTORY, true],
    ])('supportsFeature(%s) is %s', (feature, expected) => {
      expect(service.supportsFeature(feature)).toBe(expected);
    });
  });

  describe('cache management', () => {
    it('should delegate resetMetadataCache to PlexApiService when itemId provided', () => {
      service.resetMetadataCache('item123');
      expect(plexApi.resetMetadataCache).toHaveBeenCalledWith('item123');
    });

    it('should not call PlexApiService when itemId is undefined', () => {
      service.resetMetadataCache();
      expect(plexApi.resetMetadataCache).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return undefined when PlexApiService returns undefined', async () => {
      plexApi.getStatus.mockResolvedValue(undefined);
      const status = await service.getStatus();
      expect(status).toBeUndefined();
    });

    it('should map Plex status to MediaServerStatus', async () => {
      plexApi.getStatus.mockResolvedValue({
        machineIdentifier: 'machine123',
        version: '1.25.0',
      } as any);

      const status = await service.getStatus();
      expect(status).toBeDefined();
      expect(status?.machineId).toBe('machine123');
      expect(status?.version).toBe('1.25.0');
      // Note: name is passed separately to the mapper and is undefined in adapter
      expect(status?.name).toBeUndefined();
    });
  });

  describe('getUsers', () => {
    it('should return empty array when PlexApiService returns undefined', async () => {
      plexApi.getUsers.mockResolvedValue(undefined);
      const users = await service.getUsers();
      expect(users).toEqual([]);
    });

    it('should map Plex users to MediaUser array', async () => {
      plexApi.getUsers.mockResolvedValue([
        { id: 1, name: 'user1', thumb: '/thumb1' },
        { id: 2, name: 'user2', thumb: '/thumb2' },
      ] as any);

      const users = await service.getUsers();
      expect(users).toHaveLength(2);
      expect(users[0].id).toBe('1');
      expect(users[0].name).toBe('user1');
    });
  });

  describe('getLibraries', () => {
    it('should return empty array when PlexApiService returns undefined', async () => {
      plexApi.getLibraries.mockResolvedValue(undefined);
      const libraries = await service.getLibraries();
      expect(libraries).toEqual([]);
    });

    it('should map Plex libraries to MediaLibrary array', async () => {
      plexApi.getLibraries.mockResolvedValue([
        { key: '1', title: 'Movies', type: 'movie' },
        { key: '2', title: 'TV Shows', type: 'show' },
      ] as any);

      const libraries = await service.getLibraries();
      expect(libraries).toHaveLength(2);
      expect(libraries[0].id).toBe('1');
      expect(libraries[0].title).toBe('Movies');
    });
  });

  describe('getLibraryContents', () => {
    it('should return empty result for empty libraryId', async () => {
      const result = await service.getLibraryContents('');
      expect(result.items).toEqual([]);
      expect(result.totalSize).toBe(0);
    });

    it('should return empty result for Jellyfin-style UUID', async () => {
      // Jellyfin uses 32-char hex UUIDs
      const result = await service.getLibraryContents(
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      );
      expect(result.items).toEqual([]);
      expect(result.totalSize).toBe(0);
    });

    it('should call PlexApiService with correct parameters', async () => {
      plexApi.getLibraryContents.mockResolvedValue({
        MediaContainer: {
          Metadata: [],
          totalSize: 0,
        },
      } as any);

      await service.getLibraryContents('1', { offset: 0, limit: 50 });
      expect(plexApi.getLibraryContents).toHaveBeenCalled();
    });
  });

  describe('getWatchHistory', () => {
    it('should return empty array when PlexApiService returns undefined', async () => {
      plexApi.getWatchHistory.mockResolvedValue(undefined);
      const history = await service.getWatchHistory('item123');
      expect(history).toEqual([]);
    });

    it('should map Plex watch history to WatchRecord array', async () => {
      plexApi.getWatchHistory.mockResolvedValue([
        {
          accountID: 1,
          ratingKey: 'item123',
          viewedAt: 1609459200,
        },
      ] as any);

      const history = await service.getWatchHistory('item123');
      expect(history).toHaveLength(1);
      expect(history[0].userId).toBe('1');
      expect(history[0].itemId).toBe('item123');
    });
  });

  describe('getCollections', () => {
    it('should return empty array when PlexApiService returns undefined', async () => {
      plexApi.getCollections.mockResolvedValue(undefined);
      const collections = await service.getCollections('lib123');
      expect(collections).toEqual([]);
    });
  });

  describe('searchContent', () => {
    it('should return empty array when PlexApiService returns undefined', async () => {
      plexApi.searchContent.mockResolvedValue(undefined);
      const results = await service.searchContent('test');
      expect(results).toEqual([]);
    });
  });

  describe('collection operations', () => {
    it('should delegate createCollection to PlexApiService', async () => {
      plexApi.createCollection.mockResolvedValue({
        ratingKey: 'col123',
        title: 'Test Collection',
      } as any);

      const result = await service.createCollection({
        libraryId: 'lib1',
        title: 'Test Collection',
        type: 'movie',
      });

      expect(plexApi.createCollection).toHaveBeenCalled();
      expect(result.id).toBe('col123');
    });

    it('should throw error when collection creation fails', async () => {
      plexApi.createCollection.mockResolvedValue(undefined);

      await expect(
        service.createCollection({
          libraryId: 'lib1',
          title: 'Test Collection',
          type: 'movie',
        }),
      ).rejects.toThrow('Failed to create collection');
    });

    it('should delegate deleteCollection to PlexApiService', async () => {
      plexApi.deleteCollection.mockResolvedValue(undefined);
      await service.deleteCollection('col123');
      expect(plexApi.deleteCollection).toHaveBeenCalledWith('col123');
    });
  });
});
