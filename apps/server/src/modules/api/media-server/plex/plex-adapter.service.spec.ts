import { MediaServerFeature } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import {
  createPlexCollection,
  createPlexLibrary,
  createPlexLibraryItem,
  createPlexMetadata,
  createPlexSeenBy,
} from '../../../../../test/utils/data';
import { MaintainerrLogger } from '../../../logging/logs.service';
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

  describe('feature detection', () => {
    it.each([
      [MediaServerFeature.LABELS, true],
      [MediaServerFeature.PLAYLISTS, true],
      [MediaServerFeature.COLLECTION_VISIBILITY, true],
      [MediaServerFeature.WATCHLIST, true],
      [MediaServerFeature.CENTRAL_WATCH_HISTORY, true],
      [MediaServerFeature.LIBRARY_STUDIO_SORT, true],
    ])('supportsFeature(%s) is %s', (feature, expected) => {
      expect(service.supportsFeature(feature)).toBe(expected);
    });

    it('asks Plex to sort a library by studio natively', async () => {
      plexApi.getLibraryContents.mockResolvedValue({ items: [], totalSize: 0 });

      await service.getLibraryContents('1', {
        sort: 'studio',
        sortOrder: 'desc',
      });

      expect(plexApi.getLibraryContents).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ sort: 'studio:desc' }),
        undefined,
      );
    });
  });

  describe('getActiveSessions', () => {
    it('collects ratingKey plus season and show ids and de-duplicates', async () => {
      plexApi.getActiveSessions.mockResolvedValue([
        { ratingKey: 'movie1', type: 'movie' },
        {
          ratingKey: 'episode1',
          parentRatingKey: 'season1',
          grandparentRatingKey: 'show1',
          type: 'episode',
        },
        // A second episode of the same show contributes a new episode id but
        // the show id should only appear once.
        {
          ratingKey: 'episode2',
          parentRatingKey: 'season1',
          grandparentRatingKey: 'show1',
          type: 'episode',
        },
      ] as any);

      const playing = await service.getActiveSessions();

      expect(playing).toEqual(
        new Set(['movie1', 'episode1', 'season1', 'show1', 'episode2']),
      );
    });
  });

  describe('refreshItemMetadata', () => {
    it('should reject blank item ids before calling PlexApiService', async () => {
      await expect(service.refreshItemMetadata('   ')).rejects.toThrow(
        'refreshItemMetadata called with empty itemId - aborting metadata refresh request',
      );

      expect(plexApi.refreshMediaMetadata).not.toHaveBeenCalled();
    });
  });

  describe('getLibraries', () => {
    it('should return empty array when PlexApiService returns undefined', async () => {
      plexApi.getLibraries.mockResolvedValue(undefined);
      const libraries = await service.getLibraries();
      expect(libraries).toEqual([]);
    });

    it('computes accurate library sizes via section allLeaves for show libraries', async () => {
      plexApi.getLibraries.mockResolvedValue([
        createPlexLibrary({
          key: 'movie-lib',
          title: 'Movies',
          type: 'movie',
          agent: 'com.plexapp.agents.imdb',
        }),
        createPlexLibrary({
          key: 'show-lib',
          title: 'Shows',
          type: 'show',
          agent: 'com.plexapp.agents.imdb',
        }),
      ]);
      plexApi.getLibraryContents
        .mockResolvedValueOnce({
          items: [
            createPlexLibraryItem('movie', {
              ratingKey: 'movie-1',
              librarySectionID: 1,
              librarySectionKey: 'movie-lib',
              librarySectionTitle: 'Movies',
              Media: [
                {
                  id: 1,
                  duration: 100,
                  bitrate: 100,
                  width: 1920,
                  height: 1080,
                  aspectRatio: 1.78,
                  audioChannels: 2,
                  audioCodec: 'aac',
                  videoCodec: 'h264',
                  videoResolution: '1080',
                  container: 'mp4',
                  videoFrameRate: '24p',
                  videoProfile: 'high',
                  Part: [{ id: 1, size: 400, container: 'mp4' }],
                },
              ],
            }),
          ],
          totalSize: 1,
        })
        .mockResolvedValueOnce({
          items: [
            createPlexLibraryItem('movie', {
              ratingKey: 'unexpected-show-list-item',
              librarySectionID: 2,
              librarySectionKey: 'show-lib',
              librarySectionTitle: 'Shows',
              Media: [],
            }),
          ],
          totalSize: 1,
        });
      plexApi.getLibraryLeaves.mockResolvedValue([
        createPlexLibraryItem('episode', {
          ratingKey: 'episode-1',
          librarySectionID: 2,
          librarySectionKey: 'show-lib',
          librarySectionTitle: 'Shows',
          parentRatingKey: 'season-1',
          grandparentRatingKey: 'show-1',
          Media: [
            {
              id: 2,
              duration: 50,
              bitrate: 50,
              width: 1920,
              height: 1080,
              aspectRatio: 1.78,
              audioChannels: 2,
              audioCodec: 'aac',
              videoCodec: 'h264',
              videoResolution: '1080',
              container: 'mp4',
              videoFrameRate: '24p',
              videoProfile: 'high',
              Part: [{ id: 2, size: 250, container: 'mp4' }],
            },
          ],
        }),
      ]);

      await expect(service.computeLibraryStorageSizes()).resolves.toEqual(
        new Map([
          ['movie-lib', 400],
          ['show-lib', 250],
        ]),
      );
      expect(plexApi.getLibraryLeaves).toHaveBeenCalledWith('show-lib');
      expect(plexApi.getChildrenMetadata).not.toHaveBeenCalled();
    });

    it('returns 0 for a show library when section allLeaves is unavailable', async () => {
      plexApi.getLibraries.mockResolvedValue([
        createPlexLibrary({
          key: 'show-lib',
          title: 'Shows',
          type: 'show',
          agent: 'tv.plex.agents.series',
        }),
      ]);
      plexApi.getLibraryLeaves.mockResolvedValue(undefined);

      await expect(service.computeLibraryStorageSizes()).resolves.toEqual(
        new Map([['show-lib', 0]]),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to compute Plex show library size via allLeaves for library show-lib',
      );
      expect(plexApi.getLibraryContents).not.toHaveBeenCalled();
      expect(plexApi.getChildrenMetadata).not.toHaveBeenCalled();
    });

    it('falls back to metadata lookups when Plex library items omit media sizes', async () => {
      plexApi.getLibraries.mockResolvedValue([
        createPlexLibrary({
          key: 'movie-lib',
          title: 'Movies',
          type: 'movie',
          agent: 'com.plexapp.agents.imdb',
        }),
      ]);
      plexApi.getLibraryContents.mockResolvedValue({
        items: [
          createPlexLibraryItem('movie', {
            ratingKey: 'movie-1',
            librarySectionID: 1,
            librarySectionKey: 'movie-lib',
            librarySectionTitle: 'Movies',
            Media: [],
          }),
        ],
        totalSize: 1,
      });
      plexApi.getMetadata.mockResolvedValue(
        createPlexMetadata({
          ratingKey: 'movie-1',
          type: 'movie',
          Media: [
            {
              id: 1,
              duration: 100,
              bitrate: 100,
              width: 1920,
              height: 1080,
              aspectRatio: 1.78,
              audioChannels: 2,
              audioCodec: 'aac',
              videoCodec: 'h264',
              videoResolution: '1080',
              container: 'mp4',
              videoFrameRate: '24p',
              videoProfile: 'high',
              Part: [{ id: 1, size: 321, container: 'mp4' }],
            },
          ],
        }),
      );

      await expect(service.computeLibraryStorageSizes()).resolves.toEqual(
        new Map([['movie-lib', 321]]),
      );
      expect(plexApi.getMetadata).toHaveBeenCalledWith('movie-1');
    });
  });

  describe('itemExists', () => {
    it('propagates an inconclusive check so callers do not drop state', async () => {
      plexApi.itemExists.mockRejectedValue(new Error('network'));

      await expect(service.itemExists('movie-1')).rejects.toThrow('network');
    });
  });

  describe('getLibraryContents', () => {
    it('should return empty result for empty libraryId', async () => {
      const result = await service.getLibraryContents('');
      expect(result.items).toEqual([]);
      expect(result.totalSize).toBe(0);
    });

    it('propagates page read failures so callers never mistake a failed read for an empty library', async () => {
      plexApi.getLibraryContents.mockRejectedValue(new Error('boom'));

      await expect(
        service.getLibraryContents('1', { offset: 0, limit: 50 }),
      ).rejects.toThrow('boom');
    });
  });

  describe('getWatchHistory', () => {
    it('should propagate errors so callers can distinguish a real outage from a confirmed empty history', async () => {
      plexApi.getWatchHistory.mockRejectedValue(new Error('plex unreachable'));
      await expect(service.getWatchHistory('item123')).rejects.toThrow(
        'plex unreachable',
      );
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
      // Never served from the run snapshot (#3352): this is the current-state
      // read that feeds deletions.
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('item123', false);
    });

    it('keeps the native view count as a floor when history is empty', async () => {
      // Plex writes no history row for a manual "mark as played" or a scrobble.
      plexApi.getWatchHistory.mockResolvedValue([]);

      const watchState = await service.getWatchState('item123', 3);

      expect(watchState).toEqual({ viewCount: 3, isWatched: true });
    });

    it('should keep the server-wide history count when a single account has fewer native views', async () => {
      plexApi.getWatchHistory.mockResolvedValue([
        createPlexSeenBy(),
        createPlexSeenBy(),
      ]);

      const watchState = await service.getWatchState('item123', 1);

      expect(watchState).toEqual({
        viewCount: 2,
        isWatched: true,
      });
    });

    it('should propagate a failed history read instead of reporting never watched', async () => {
      plexApi.getWatchHistory.mockRejectedValue(new Error('Plex unreachable'));

      await expect(service.getWatchState('item123', 0)).rejects.toThrow(
        'Plex unreachable',
      );
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
    // #3344: [] is reserved for a confirmed-empty library. A failed
    // enumeration must reach the caller, or the link lookup reads it as
    // "no collection with that title" and creates a duplicate.
    it('should propagate an enumeration failure', async () => {
      const failure = new Error('Plex unreachable');
      plexApi.getCollections.mockRejectedValue(failure);

      await expect(service.getCollections('lib123')).rejects.toBe(failure);
    });

    // #3344: existence decisions must read live; per-item rule reads stay cached.
    it('should forward the cache preference', async () => {
      plexApi.getCollections.mockResolvedValue([]);

      await service.getCollections('lib123');
      expect(plexApi.getCollections).toHaveBeenCalledWith(
        'lib123',
        undefined,
        true,
      );

      await service.getCollections('lib123', false);
      expect(plexApi.getCollections).toHaveBeenLastCalledWith(
        'lib123',
        undefined,
        false,
      );
    });
  });

  describe('getCollection', () => {
    it('should return undefined when PlexApiService returns undefined', async () => {
      plexApi.getCollection.mockResolvedValue(undefined);

      await expect(service.getCollection('col123')).resolves.toBeUndefined();
    });

    it('should rethrow lookup failures when strict verification is requested', async () => {
      const serverError = new Error('Plex lookup failed');
      plexApi.getCollection.mockRejectedValueOnce(serverError);

      await expect(service.getCollection('col123', true)).rejects.toThrow(
        serverError,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to get collection col123',
      );
      expect(logger.debug).toHaveBeenCalledWith(serverError);
    });
  });

  describe('getMetadataBatch', () => {
    it('reads a whole id list in one request', async () => {
      plexApi.getMetadataBatch.mockResolvedValue([
        createPlexMetadata({ ratingKey: 'movie-1', type: 'movie' }),
        createPlexMetadata({ ratingKey: 'movie-2', type: 'movie' }),
      ]);

      const items = await service.getMetadataBatch(['movie-1', 'movie-2']);

      expect(plexApi.getMetadataBatch).toHaveBeenCalledTimes(1);
      expect(plexApi.getMetadataBatch).toHaveBeenCalledWith([
        'movie-1',
        'movie-2',
      ]);
      expect(items.map((item) => item.id)).toEqual(['movie-1', 'movie-2']);
    });
  });

  describe('getCollectionChildren', () => {
    it('reads no metadata at all when the listing carries provider ids', async () => {
      plexApi.getCollectionChildren.mockResolvedValue([
        createPlexLibraryItem('movie', {
          ratingKey: 'movie-1',
          Guid: [{ id: 'tmdb://321' }],
        }),
      ]);

      const children = await service.getCollectionChildren('col123');

      expect(plexApi.getCollectionChildren).toHaveBeenCalledWith('col123');
      expect(plexApi.getMetadataBatch).not.toHaveBeenCalled();
      expect(children[0].providerIds.tmdb).toEqual(['321']);
    });

    it('looks up the ids Plex withheld from the listing in one batch', async () => {
      plexApi.getCollectionChildren.mockResolvedValue([
        createPlexLibraryItem('episode', {
          ratingKey: 'episode-1',
          Guid: undefined,
        }),
        createPlexLibraryItem('episode', {
          ratingKey: 'episode-2',
          Guid: undefined,
        }),
      ]);
      plexApi.getMetadataBatch.mockResolvedValue([
        createPlexMetadata({
          ratingKey: 'episode-1',
          type: 'episode',
          Guid: [{ id: 'tmdb://321' }],
        }),
        createPlexMetadata({
          ratingKey: 'episode-2',
          type: 'episode',
          Guid: [{ id: 'tmdb://654' }],
        }),
      ]);

      const children = await service.getCollectionChildren('col123');

      expect(plexApi.getMetadataBatch).toHaveBeenCalledTimes(1);
      expect(plexApi.getMetadataBatch).toHaveBeenCalledWith([
        'episode-1',
        'episode-2',
      ]);
      expect(children[0].providerIds.tmdb).toEqual(['321']);
      expect(children[1].providerIds.tmdb).toEqual(['654']);
    });

    // Plex sends no rating at all on an episode or season listing row and puts
    // the audience score in Rating[], which only the per-item read returns. The
    // rating sort compares it, so it has to survive the merge.
    it('takes the ratings the listing row does not carry', async () => {
      plexApi.getCollectionChildren.mockResolvedValue([
        createPlexLibraryItem('episode', {
          ratingKey: 'episode-1',
          Guid: undefined,
          rating: undefined,
          audienceRating: undefined,
        }),
      ]);
      plexApi.getMetadataBatch.mockResolvedValue([
        createPlexMetadata({
          ratingKey: 'episode-1',
          type: 'episode',
          Guid: [{ id: 'tmdb://321' }],
          Rating: [
            { image: 'imdb://image.rating', value: 6.5, type: 'audience' },
          ],
        }),
      ]);

      const children = await service.getCollectionChildren('col123');

      expect(children[0].ratings).toEqual([
        { source: 'imdb://image.rating', value: 6.5, type: 'audience' },
      ]);
    });

    it('keeps the listing entry, and only its ids change, when a lookup resolves', async () => {
      plexApi.getCollectionChildren.mockResolvedValue([
        createPlexLibraryItem('episode', {
          ratingKey: 'episode-1',
          Guid: undefined,
          librarySectionID: 7,
          librarySectionTitle: 'Shows',
          grandparentTitle: 'Sample Series',
        }),
      ]);
      plexApi.getMetadataBatch.mockResolvedValue([
        createPlexMetadata({
          ratingKey: 'episode-1',
          type: 'episode',
          Guid: [{ id: 'tmdb://321' }],
        }),
      ]);

      const children = await service.getCollectionChildren('col123');

      expect(children[0].providerIds.tmdb).toEqual(['321']);
      expect(children[0].grandparentTitle).toBe('Sample Series');
      expect(children[0].library).toEqual({ id: '7', title: 'Shows' });
    });

    it('propagates enumeration failures so callers never mistake a failed read for an empty collection', async () => {
      plexApi.getCollectionChildren.mockRejectedValue(new Error('boom'));

      await expect(service.getCollectionChildren('col123')).rejects.toThrow(
        'boom',
      );
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

    it('creates the collection empty without forwarding item ids', async () => {
      // Items are added afterwards via the batched add path; seeding them into
      // the create request overflows the URL (HTTP 414).
      plexApi.createCollection.mockResolvedValue(
        createPlexCollection({
          ratingKey: 'col456',
          key: '/library/collections/col456',
          guid: 'plex://collection/col456',
          title: 'New',
          subtype: 'movie',
          summary: '',
          index: 0,
          ratingCount: 0,
          thumb: '/thumb/col456',
          addedAt: 1609459200,
          updatedAt: 1609459200,
          childCount: '0',
          maxYear: '2021',
          minYear: '2021',
        }),
      );

      await service.createCollection({
        libraryId: 'lib1',
        title: 'New',
        type: 'movie',
      });

      expect(plexApi.createCollection).not.toHaveBeenCalledWith(
        expect.objectContaining({
          initialItemIds: expect.anything(),
        }),
      );
    });

    // #3344: plexApi reports a refused delete as NOK instead of throwing.
    // Resolving anyway told callers the collection was gone, so they dropped
    // the link and left a live Plex collection behind for good.
    it('should throw when Plex refuses the delete and the collection survives', async () => {
      plexApi.deleteCollection.mockResolvedValue({
        status: 'NOK',
        code: 0,
        message: 'Plex Server denied request',
      });
      plexApi.getCollection.mockResolvedValue(
        createPlexCollection({ ratingKey: 'col123', title: 'Still here' }),
      );

      await expect(service.deleteCollection('col123')).rejects.toThrow(
        'Plex Server denied request',
      );
    });

    it('should succeed when the delete failed because the collection is already gone', async () => {
      plexApi.deleteCollection.mockResolvedValue({
        status: 'NOK',
        code: 0,
        message: 'not found',
      });
      plexApi.getCollection.mockResolvedValue(undefined);

      await expect(service.deleteCollection('col123')).resolves.toBeUndefined();
    });

    // Existence unknown must not read as "already gone", or an unreachable
    // server would silently swallow the failure again.
    it('should throw when the delete failed and existence cannot be verified', async () => {
      plexApi.deleteCollection.mockResolvedValue({
        status: 'NOK',
        code: 0,
        message: 'Plex unreachable',
      });
      plexApi.getCollection.mockRejectedValue(new Error('Plex unreachable'));

      await expect(service.deleteCollection('col123')).rejects.toThrow(
        'Plex unreachable',
      );
    });

    it('should delete an automatic collection on library cleanup', async () => {
      plexApi.deleteCollection.mockResolvedValue(undefined);

      await service.cleanupCollectionForLibrary('col123', 'lib1', false);

      expect(plexApi.deleteCollection).toHaveBeenCalledWith('col123');
    });

    // A manual collection belongs to the user; moving the rule group off it
    // must not destroy it, matching Jellyfin/Emby and the interface contract.
    it('should leave a manual collection standing on library cleanup', async () => {
      await service.cleanupCollectionForLibrary('col123', 'lib1', true);

      expect(plexApi.deleteCollection).not.toHaveBeenCalled();
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
      ).resolves.toEqual({ refused: [], unknown: [] });

      expect(plexApi.addChildrenToCollection).toHaveBeenCalledWith('col123', [
        'good',
        'good-2',
      ]);
      expect(plexApi.addChildToCollection).not.toHaveBeenCalled();
    });

    it('should fall back to per-item adds when a Plex batch add fails', async () => {
      plexApi.addChildrenToCollection.mockResolvedValue({
        status: 'NOK',
        code: 400,
        message: 'batch failed',
      } as any);
      plexApi.addChildToCollection.mockImplementation(
        async (collectionId, itemId) => {
          if (itemId === 'bad') {
            return { status: 'NOK', code: 400, message: 'nope' } as any;
          }

          return { status: 'OK' } as any;
        },
      );

      await expect(
        service.addBatchToCollection('col123', ['good', 'bad', 'good-2']),
      ).resolves.toEqual({ refused: ['bad'], unknown: [] });

      expect(plexApi.addChildrenToCollection).toHaveBeenCalledWith('col123', [
        'good',
        'bad',
        'good-2',
      ]);
      expect(plexApi.addChildToCollection).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledWith(
        'Plex add to collection col123: 1 refused, 0 unconfirmed',
      );
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('reports an unanswered batch add as unconfirmed, without retrying per item', async () => {
      // code 0 is plexApi's "nothing came back". Plex commits a collection write
      // it has begun processing and can answer late, so this is not a refusal -
      // and re-issuing the ids one at a time only spends another timeout each.
      plexApi.addChildrenToCollection.mockResolvedValue({
        status: 'NOK',
        code: 0,
        message: 'timeout of 30000ms exceeded',
      } as any);

      await expect(
        service.addBatchToCollection('col123', ['good', 'good-2']),
      ).resolves.toEqual({ refused: [], unknown: ['good', 'good-2'] });

      expect(plexApi.addChildToCollection).not.toHaveBeenCalled();
    });

    it('treats a 5xx batch add as unconfirmed rather than refused', async () => {
      // The server broke while handling the write, which says nothing about
      // whether it applied.
      plexApi.addChildrenToCollection.mockResolvedValue({
        status: 'NOK',
        code: 500,
        message: 'server error',
      } as any);

      await expect(
        service.addBatchToCollection('col123', ['good']),
      ).resolves.toEqual({ refused: [], unknown: ['good'] });

      expect(plexApi.addChildToCollection).not.toHaveBeenCalled();
    });

    it('reports an unanswered removal as unconfirmed', async () => {
      plexApi.deleteChildFromCollection.mockResolvedValue({
        status: 'NOK',
        code: 0,
        message: 'timeout of 30000ms exceeded',
      } as any);

      await expect(
        service.removeBatchFromCollection('col123', ['good']),
      ).resolves.toEqual({ refused: [], unknown: ['good'] });
    });

    it('should treat 404 removes as successful in batch remove', async () => {
      plexApi.deleteChildFromCollection.mockImplementation(
        async (collectionId, itemId) => {
          if (itemId === 'missing') {
            return { status: 'NOK', code: 404, message: 'not found' } as any;
          }

          if (itemId === 'bad') {
            return { status: 'NOK', code: 0, message: 'no answer' } as any;
          }

          // Read from the status Plex answered with, so a ratingKey that merely
          // contains 404 can never be mistaken for a 404 response.
          if (itemId === '1404') {
            return { status: 'NOK', code: 500, message: 'server error' } as any;
          }

          return { status: 'OK' } as any;
        },
      );

      await expect(
        service.removeBatchFromCollection('col123', [
          'good',
          'missing',
          'bad',
          '1404',
        ]),
      ).resolves.toEqual({ refused: [], unknown: ['bad', '1404'] });
    });

    it('should set custom sort then move items into the requested order', async () => {
      plexApi.getCollectionChildren.mockResolvedValue([
        createPlexLibraryItem('movie', { ratingKey: 'c' }),
        createPlexLibraryItem('movie', { ratingKey: 'b' }),
        createPlexLibraryItem('movie', { ratingKey: 'a' }),
      ]);
      plexApi.setCollectionCustomSort.mockResolvedValue(undefined);
      plexApi.moveCollectionItem.mockResolvedValue(undefined);

      await service.reorderCollectionItems('col123', ['a', 'b', 'c']);

      expect(plexApi.setCollectionCustomSort).toHaveBeenCalledWith('col123');
      expect(plexApi.moveCollectionItem.mock.calls).toEqual([
        ['col123', 'a', undefined],
        ['col123', 'b', 'a'],
        ['col123', 'c', 'b'],
      ]);
    });

    it('should proceed with the reorder when the current-order read fails', async () => {
      plexApi.getCollectionChildren.mockRejectedValue(new Error('boom'));
      plexApi.setCollectionCustomSort.mockResolvedValue(undefined);
      plexApi.moveCollectionItem.mockResolvedValue(undefined);

      await service.reorderCollectionItems('col123', ['a']);

      expect(plexApi.setCollectionCustomSort).toHaveBeenCalledWith('col123');
      expect(plexApi.moveCollectionItem).toHaveBeenCalledWith(
        'col123',
        'a',
        undefined,
      );
    });

    it('should short-circuit without writing when current order already matches', async () => {
      plexApi.getCollectionChildren.mockResolvedValue([
        createPlexLibraryItem('movie', { ratingKey: 'a' }),
        createPlexLibraryItem('movie', { ratingKey: 'b' }),
        createPlexLibraryItem('movie', { ratingKey: 'c' }),
      ]);

      await service.reorderCollectionItems('col123', ['a', 'b', 'c']);

      expect(plexApi.getCollectionChildren).toHaveBeenCalledWith(
        'col123',
        false,
      );
      expect(plexApi.setCollectionCustomSort).not.toHaveBeenCalled();
      expect(plexApi.moveCollectionItem).not.toHaveBeenCalled();
    });

    it('should continue past per-item move failures and log a summary', async () => {
      plexApi.getCollectionChildren.mockResolvedValue([
        createPlexLibraryItem('movie', { ratingKey: 'c' }),
        createPlexLibraryItem('movie', { ratingKey: 'b' }),
        createPlexLibraryItem('movie', { ratingKey: 'a' }),
      ]);
      plexApi.setCollectionCustomSort.mockResolvedValue(undefined);
      plexApi.moveCollectionItem.mockImplementation(
        async (collectionId, itemId) => {
          if (itemId === 'b') {
            throw new Error('plex move 409');
          }
        },
      );

      await expect(
        service.reorderCollectionItems('col123', ['a', 'b', 'c']),
      ).resolves.toBeUndefined();

      expect(plexApi.moveCollectionItem.mock.calls).toEqual([
        ['col123', 'a', undefined],
        ['col123', 'b', 'a'],
        ['col123', 'c', 'a'],
      ]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('1 failed move(s)'),
      );
    });
  });
});
