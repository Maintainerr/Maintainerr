import { MediaServerFeature, MediaServerType } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import {
  createPlexCollection,
  createPlexLibrary,
  createPlexLibraryItem,
  createPlexMetadata,
  createPlexSeenBy,
  createPlexUserAccount,
} from '../../../../../test/utils/data';
import { MaintainerrLogger } from '../../../logging/logs.service';
import type { PlexStatusResponse } from '../../plex-api/interfaces/server.interface';
import { PlexApiService } from '../../plex-api/plex-api.service';
import { PlexAdapterService } from './plex-adapter.service';

describe('PlexAdapterService', () => {
  let service: PlexAdapterService;
  let plexApi: Mocked<PlexApiService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexAdapterService).compile();

    service = unit;
    plexApi = unitRef.get(PlexApiService);
    logger = unitRef.get(MaintainerrLogger);
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

  describe('refreshItemMetadata', () => {
    it('should delegate metadata refresh for non-empty item ids', async () => {
      plexApi.refreshMediaMetadata.mockResolvedValue(undefined);

      await service.refreshItemMetadata('12345');

      expect(plexApi.refreshMediaMetadata).toHaveBeenCalledWith('12345');
    });

    it('should reject blank item ids before calling PlexApiService', async () => {
      await expect(service.refreshItemMetadata('   ')).rejects.toThrow(
        'refreshItemMetadata called with empty itemId — aborting metadata refresh request',
      );

      expect(plexApi.refreshMediaMetadata).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return undefined when PlexApiService returns undefined', async () => {
      plexApi.getStatus.mockResolvedValue(undefined);
      const status = await service.getStatus();
      expect(status).toBeUndefined();
    });

    it('should map Plex status to MediaServerStatus', async () => {
      const plexStatus: PlexStatusResponse['MediaContainer'] = {
        machineIdentifier: 'machine123',
        version: '1.25.0',
      };

      plexApi.getStatus.mockResolvedValue(plexStatus);

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
        createPlexUserAccount({
          id: 1,
          key: '1',
          name: 'user1',
          thumb: '/thumb1',
        }),
        createPlexUserAccount({
          id: 2,
          key: '2',
          name: 'user2',
          thumb: '/thumb2',
        }),
      ]);

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
        createPlexLibrary({
          key: '1',
          title: 'Movies',
          type: 'movie',
          agent: 'com.plexapp.agents.imdb',
        }),
        createPlexLibrary({
          key: '2',
          title: 'TV Shows',
          type: 'show',
          agent: 'com.plexapp.agents.imdb',
        }),
        createPlexLibrary({
          key: '3',
          title: 'Music',
          type: 'artist',
          agent: 'tv.plex.agents.music',
        }),
      ]);

      const libraries = await service.getLibraries();
      expect(libraries).toHaveLength(2);
      expect(libraries[0].id).toBe('1');
      expect(libraries[0].title).toBe('Movies');
      expect(libraries.map((library) => library.type)).toEqual([
        'movie',
        'show',
      ]);
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
        items: [],
        totalSize: 0,
      });

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
        createPlexSeenBy({
          accountID: 1,
          ratingKey: 'item123',
          viewedAt: 1609459200,
        }),
      ]);

      const history = await service.getWatchHistory('item123');
      expect(history).toHaveLength(1);
      expect(history[0].userId).toBe('1');
      expect(history[0].itemId).toBe('item123');
    });
  });

  describe('getWatchState', () => {
    it('should derive watched state from watch history when entries exist', async () => {
      plexApi.getWatchHistory.mockResolvedValue([createPlexSeenBy()]);

      const watchState = await service.getWatchState('item123');

      expect(watchState).toEqual({
        viewCount: 1,
        isWatched: true,
      });
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('item123', false);
    });

    it('should return unwatched state when history is empty', async () => {
      plexApi.getWatchHistory.mockResolvedValue([]);

      const watchState = await service.getWatchState('item123');

      expect(watchState).toEqual({
        viewCount: 0,
        isWatched: false,
      });
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('item123', false);
    });

    it('should fall back to nativeViewCount for isWatched when history is empty', async () => {
      plexApi.getWatchHistory.mockResolvedValue([]);

      const watchState = await service.getWatchState('item123', 2);

      expect(watchState).toEqual({
        viewCount: 0,
        isWatched: true,
      });
    });

    it('should not mark as watched when nativeViewCount is 0 and history is empty', async () => {
      plexApi.getWatchHistory.mockResolvedValue([]);

      const watchState = await service.getWatchState('item123', 0);

      expect(watchState).toEqual({
        viewCount: 0,
        isWatched: false,
      });
    });
  });

  describe('getCollections', () => {
    it('should return empty array when PlexApiService returns undefined', async () => {
      plexApi.getCollections.mockResolvedValue(undefined);
      const collections = await service.getCollections('lib123');
      expect(collections).toEqual([]);
    });
  });

  describe('getCollectionChildren', () => {
    it('refreshes incomplete Plex collection children via full metadata lookups', async () => {
      plexApi.getCollectionChildren.mockResolvedValue([
        createPlexLibraryItem('movie', {
          ratingKey: 'movie-1',
          Guid: undefined,
        }),
      ]);
      plexApi.getMetadata.mockResolvedValue(
        createPlexMetadata({
          ratingKey: 'movie-1',
          type: 'movie',
          Guid: [{ id: 'tmdb://321' }],
        }),
      );

      const children = await service.getCollectionChildren('col123');

      expect(plexApi.getCollectionChildren).toHaveBeenCalledWith('col123');
      expect(plexApi.getMetadata).toHaveBeenCalledWith('movie-1');
      expect(children[0].providerIds.tmdb).toEqual(['321']);
    });

    it('keeps the original collection child when the metadata refresh is unavailable', async () => {
      plexApi.getCollectionChildren.mockResolvedValue([
        createPlexLibraryItem('movie', {
          ratingKey: 'movie-1',
          Guid: undefined,
        }),
      ]);
      plexApi.getMetadata.mockResolvedValue(undefined);

      const children = await service.getCollectionChildren('col123');

      expect(children[0].id).toBe('movie-1');
      expect(children[0].providerIds.tmdb).toEqual([]);
      expect(children[0].providerIds.tvdb).toEqual([]);
      expect(children[0].providerIds.imdb).toEqual([]);
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
      plexApi.createCollection.mockResolvedValue(
        createPlexCollection({
          ratingKey: 'col123',
          key: '/library/collections/col123',
          guid: 'plex://collection/col123',
          title: 'Test Collection',
          subtype: 'movie',
          summary: '',
          index: 0,
          ratingCount: 0,
          thumb: '/thumb/col123',
          addedAt: 1609459200,
          updatedAt: 1609459200,
          childCount: '0',
          maxYear: '2021',
          minYear: '2021',
        }),
      );

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

    it('should treat NOK add responses as failures', async () => {
      plexApi.addChildToCollection.mockResolvedValue({
        status: 'NOK',
        code: 0,
        message: 'boom',
      } as any);

      await expect(service.addToCollection('col123', 'bad')).rejects.toThrow(
        'boom',
      );
    });

    it('should prefer explicit OK status over a zero code', async () => {
      plexApi.addChildToCollection.mockResolvedValue({
        status: 'OK',
        code: 0,
      } as any);

      await expect(
        service.addToCollection('col123', 'good'),
      ).resolves.toBeUndefined();
    });

    it('should add a batch of items in a single Plex request when possible', async () => {
      plexApi.addChildrenToCollection.mockResolvedValue({
        status: 'OK',
      } as any);

      await expect(
        service.addBatchToCollection('col123', ['good', 'good-2']),
      ).resolves.toEqual([]);

      expect(plexApi.addChildrenToCollection).toHaveBeenCalledWith('col123', [
        'good',
        'good-2',
      ]);
      expect(plexApi.addChildToCollection).not.toHaveBeenCalled();
    });

    it('should fall back to per-item adds when a Plex batch add fails', async () => {
      plexApi.addChildrenToCollection.mockResolvedValue({
        status: 'NOK',
        code: 0,
        message: 'batch failed',
      } as any);
      plexApi.addChildToCollection.mockImplementation(
        async (_collectionId, itemId) => {
          if (itemId === 'bad') {
            throw new Error('boom');
          }

          return { status: 'OK' } as any;
        },
      );

      await expect(
        service.addBatchToCollection('col123', ['good', 'bad', 'good-2']),
      ).resolves.toEqual(['bad']);

      expect(plexApi.addChildrenToCollection).toHaveBeenCalledWith('col123', [
        'good',
        'bad',
        'good-2',
      ]);
      expect(plexApi.addChildToCollection).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledWith(
        'Plex batch add fell back to per-item adds for collection col123 on 1 chunk(s) (3 item(s) total). 1 item(s) failed after fallback.',
      );
    });

    it('should treat 404 removes as successful in batch remove', async () => {
      plexApi.deleteChildFromCollection.mockImplementation(
        async (_collectionId, itemId) => {
          if (itemId === 'missing') {
            throw new Error('404 Not Found');
          }

          if (itemId === 'bad') {
            throw new Error('boom');
          }

          return { status: 'OK' } as any;
        },
      );

      await expect(
        service.removeBatchFromCollection('col123', ['good', 'missing', 'bad']),
      ).resolves.toEqual(['bad']);
    });

    it('should default optional visibility flags to false', async () => {
      plexApi.UpdateCollectionSettings.mockResolvedValue({} as any);

      await service.updateCollectionVisibility({
        libraryId: 'lib1',
        collectionId: 'col123',
      });

      expect(plexApi.UpdateCollectionSettings).toHaveBeenCalledWith({
        libraryId: 'lib1',
        collectionId: 'col123',
        recommended: false,
        ownHome: false,
        sharedHome: false,
      });
    });
  });
});
