import { AxiosError } from 'axios';
import { EMBY_CACHE_TTL } from './emby.constants';
import { EmbyAdapterService } from './emby-adapter.service';

const embyCacheMocks = {
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

jest.mock('../../lib/cache', () => ({
  __esModule: true,
  default: {
    getCache: jest.fn().mockImplementation(() => ({
      flush: (...args: unknown[]) => embyCacheMocks.flush(...args),
      data: {
        has: (...args: unknown[]) => embyCacheMocks.data.has(...args),
        get: (...args: unknown[]) => embyCacheMocks.data.get(...args),
        set: (...args: unknown[]) => embyCacheMocks.data.set(...args),
        del: (...args: unknown[]) => embyCacheMocks.data.del(...args),
        flushAll: (...args: unknown[]) => embyCacheMocks.data.flushAll(...args),
        keys: (...args: unknown[]) => embyCacheMocks.data.keys(...args),
      },
    })),
  },
}));

describe('EmbyAdapterService', () => {
  let service: EmbyAdapterService;
  let http: {
    get: jest.Mock;
    post: jest.Mock;
    delete: jest.Mock;
  };
  let logger: {
    setContext: jest.Mock;
    debug: jest.Mock;
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };

  const createResponseError = (status: number): AxiosError => {
    const error = new AxiosError(`request failed with status ${status}`);
    Object.assign(error, {
      response: {
        status,
        statusText: status === 404 ? 'Not Found' : 'Bad Gateway',
        data: {},
        headers: {},
        config: {},
      },
    });
    return error;
  };

  const setHttp = (userId = 'user-1') => {
    (service as unknown as { http: typeof http }).http = http as any;
    (service as unknown as { embyUserId?: string }).embyUserId = userId;
    (service as unknown as { initialized: boolean }).initialized = true;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    logger = {
      setContext: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    http = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
    };

    service = new EmbyAdapterService(
      {
        emby_url: 'http://emby.test:8096',
        emby_api_key: 'key',
        emby_user_id: 'user-1',
      } as any,
      logger as any,
    );
    setHttp();
  });

  describe('getActiveSessions', () => {
    it('collects the playing item plus its season and series ids', async () => {
      http.get.mockResolvedValue({
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

      expect(http.get).toHaveBeenCalledWith('/Sessions');
      expect(playing).toEqual(
        new Set(['movie1', 'episode1', 'season1', 'series1']),
      );
    });

    it('returns an empty set when the sessions request fails', async () => {
      http.get.mockRejectedValue(new Error('boom'));
      await expect(service.getActiveSessions()).resolves.toEqual(
        new Set<string>(),
      );
    });
  });

  describe('createCollection', () => {
    it('omits Ids when no initial item is provided', async () => {
      // The full item set must never be sent on create (the ids go in the query
      // string → HTTP 414 at scale); they are added via addBatchToCollection.
      http.post.mockResolvedValueOnce({ data: { Id: 'collection-1' } });
      http.get.mockResolvedValueOnce({
        data: {
          Id: 'collection-1',
          Name: 'New Collection',
          Overview: 'summary',
          ChildCount: 0,
        },
      });

      const result = await service.createCollection({
        libraryId: 'library-1',
        title: 'New Collection',
        type: 'show',
      });

      expect(http.post).toHaveBeenCalledWith('/Collections', null, {
        params: {
          Name: 'New Collection',
          ParentId: 'library-1',
          IsLocked: true,
        },
      });
      expect(http.get).toHaveBeenCalledWith('/Users/user-1/Items/collection-1');
      expect(result).toEqual(
        expect.objectContaining({
          id: 'collection-1',
          title: 'New Collection',
        }),
      );
    });

    it('creates with a single initial item id when provided', async () => {
      // Emby 500s on an empty create, so it gets exactly one item; the rest are
      // added via addBatchToCollection (#3075). One id keeps it under the URL
      // length limit that an all-ids create would hit (#3001).
      http.post.mockResolvedValueOnce({
        data: { Id: 'collection-1', Name: 'New Collection', ChildCount: 1 },
      });

      await service.createCollection({
        libraryId: 'library-1',
        title: 'New Collection',
        type: 'show',
        initialItemId: 'item-1',
      });

      expect(http.post).toHaveBeenCalledWith('/Collections', null, {
        params: {
          Name: 'New Collection',
          ParentId: 'library-1',
          Ids: 'item-1',
          IsLocked: true,
        },
      });
    });

    it('runs the metadata follow-up when sortTitle is provided without summary', async () => {
      const updateCollection = jest
        .spyOn(service, 'updateCollection')
        .mockResolvedValue({ id: 'collection-1', title: 'Sorted' } as any);
      http.post.mockResolvedValueOnce({
        data: {
          Id: 'collection-1',
          Name: 'Sorted',
          ChildCount: 0,
        },
      });

      await service.createCollection({
        libraryId: 'library-1',
        title: 'Sorted',
        type: 'movie',
        sortTitle: 'A Sorted Title',
      });

      expect(updateCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          collectionId: 'collection-1',
          sortTitle: 'A Sorted Title',
        }),
      );
    });
  });

  // Mirrors the Jellyfin adapter's collection cache so the cross-library
  // manual-collection lookup stays cheap on repeated rule runs, while
  // create/rename/delete stay immediately visible.
  describe('collection caching', () => {
    it('caches non-empty getCollections results and serves them on the next call', async () => {
      http.get.mockResolvedValueOnce({
        data: { Items: [{ Id: 'box-1', Name: 'Shared', ChildCount: 2 }] },
      });

      await service.getCollections('library-1');

      // A configured Emby user means the user-scoped read: literal /Items path
      // with UserId in the query param (no user value in the request path).
      expect(http.get).toHaveBeenCalledWith(
        '/Items',
        expect.objectContaining({
          params: expect.objectContaining({
            UserId: 'user-1',
            ParentId: 'library-1',
            IncludeItemTypes: 'BoxSet',
          }),
        }),
      );
      expect(embyCacheMocks.data.set).toHaveBeenCalledWith(
        'emby:collections:library-1',
        expect.arrayContaining([expect.objectContaining({ id: 'box-1' })]),
        EMBY_CACHE_TTL.COLLECTIONS,
      );

      const cached = [{ id: 'cached', title: 'Cached' }];
      embyCacheMocks.data.get.mockReturnValueOnce(cached);

      const second = await service.getCollections('library-1');
      expect(second).toBe(cached);
      // Only the first call hit the API.
      expect(http.get).toHaveBeenCalledTimes(1);
    });

    it('does not cache an empty getCollections result', async () => {
      http.get.mockResolvedValueOnce({ data: { Items: [] } });

      await service.getCollections('library-1');

      expect(embyCacheMocks.data.set).not.toHaveBeenCalledWith(
        'emby:collections:library-1',
        expect.anything(),
        expect.anything(),
      );
    });

    it('invalidates the per-library collections cache after createCollection', async () => {
      http.post.mockResolvedValueOnce({ data: { Id: 'box-new', Name: 'New' } });

      await service.createCollection({
        libraryId: 'library-1',
        title: 'New',
        type: 'movie',
      });

      expect(embyCacheMocks.data.del).toHaveBeenCalledWith(
        'emby:collections:library-1',
      );
    });

    it('invalidates the per-library collections cache after updateCollection', async () => {
      http.get.mockResolvedValueOnce({ data: { Id: 'box-1', Name: 'Old' } });
      http.post.mockResolvedValueOnce({ data: undefined });
      jest
        .spyOn(service, 'getCollection')
        .mockResolvedValue({ id: 'box-1', title: 'New', smart: false } as any);

      await service.updateCollection({
        libraryId: 'library-1',
        collectionId: 'box-1',
        title: 'New',
      });

      expect(embyCacheMocks.data.del).toHaveBeenCalledWith(
        'emby:collections:library-1',
      );
    });

    it('clears every per-library collections entry on deleteCollection', async () => {
      embyCacheMocks.data.keys.mockReturnValueOnce([
        'emby:collections:library-1',
        'emby:collections:library-2',
        'emby:users',
      ]);

      await service.deleteCollection('box-1');

      expect(embyCacheMocks.data.del).toHaveBeenCalledWith([
        'emby:collections:library-1',
        'emby:collections:library-2',
      ]);
    });
  });

  describe('getCollectionChildren', () => {
    it('re-throws enumeration failures so callers never mistake a failed read for an empty collection', async () => {
      http.get.mockRejectedValueOnce(new Error('boom'));

      await expect(service.getCollectionChildren('box-1')).rejects.toThrow(
        'boom',
      );
    });
  });

  describe('getLibraryContents', () => {
    it('re-throws page read failures so callers never mistake a failed read for an empty library', async () => {
      http.get.mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.getLibraryContents('library-1', { offset: 0, limit: 50 }),
      ).rejects.toThrow('boom');
    });
  });

  // Collection reads must be user-scoped: Emby resolves the BoxSet query
  // against a user's library view, so the plain /Items path can miss or 404,
  // which would break the manual-collection bootstrap (incl. the cross-library
  // lookup). Maintainerr only ever operates as an admin, so when no user is
  // configured we resolve one rather than degrade to /Items.
  describe('user-scoped collection reads', () => {
    const clearConfiguredUser = () => {
      // Clear the user directly: setHttp(undefined) would hit its default param.
      (service as unknown as { embyUserId?: string }).embyUserId = undefined;
    };

    it('scopes reads to the configured admin user without querying /Users', async () => {
      http.get.mockResolvedValue({ data: { Items: [] } });

      await service.getCollections('library-1');
      await service.getCollectionChildren('box-1');

      expect(http.get).toHaveBeenCalledWith(
        '/Items',
        expect.objectContaining({
          params: expect.objectContaining({
            UserId: 'user-1',
            ParentId: 'library-1',
          }),
        }),
      );
      expect(http.get).toHaveBeenCalledWith(
        '/Items',
        expect.objectContaining({
          params: expect.objectContaining({
            UserId: 'user-1',
            ParentId: 'box-1',
          }),
        }),
      );
      expect(http.get).not.toHaveBeenCalledWith('/Users/Query');
    });

    it('auto-resolves an admin user when none is configured (token-only setup)', async () => {
      clearConfiguredUser();
      http.get.mockImplementation((path: string) =>
        path === '/Users/Query'
          ? Promise.resolve({
              data: [
                { Id: 'viewer-1', Policy: { IsAdministrator: false } },
                { Id: 'admin-9', Policy: { IsAdministrator: true } },
              ],
            })
          : Promise.resolve({ data: { Items: [] } }),
      );

      await service.getCollections('library-1');

      expect(http.get).toHaveBeenCalledWith(
        '/Items',
        expect.objectContaining({
          params: expect.objectContaining({
            UserId: 'admin-9',
            ParentId: 'library-1',
          }),
        }),
      );
    });

    it('falls back to an unscoped read (no UserId) when no admin can be resolved', async () => {
      clearConfiguredUser();
      http.get.mockImplementation((path: string) =>
        path === '/Users/Query'
          ? Promise.resolve({ data: { Items: [] } })
          : Promise.resolve({ data: { Items: [] } }),
      );

      await service.getCollections('library-1');

      const itemsCall = http.get.mock.calls.find((c) => c[0] === '/Items');
      expect(itemsCall).toBeDefined();
      expect(itemsCall[1].params.ParentId).toBe('library-1');
      expect(itemsCall[1].params.UserId).toBeUndefined();
    });
  });

  describe('updateCollection', () => {
    it('persists ForcedSortName when sortTitle is provided', async () => {
      http.get.mockResolvedValueOnce({
        data: {
          Id: 'collection-1',
          Name: 'Current',
          Overview: 'Existing',
          ForcedSortName: 'Old Sort',
        },
      });
      http.post.mockResolvedValueOnce({ data: undefined });
      jest.spyOn(service, 'getCollection').mockResolvedValue({
        id: 'collection-1',
        title: 'Current',
        smart: false,
      } as any);

      await service.updateCollection({
        libraryId: 'library-1',
        collectionId: 'collection-1',
        sortTitle: 'New Sort',
      });

      expect(http.get).toHaveBeenCalledWith('/Users/user-1/Items/collection-1');
      expect(http.post).toHaveBeenCalledWith(
        '/Items/collection-1',
        expect.objectContaining({ ForcedSortName: 'New Sort' }),
      );
    });
  });

  describe('computeLibraryStorageSizes', () => {
    it('pages through user-scoped items and sums item sizes', async () => {
      jest.spyOn(service, 'getLibraries').mockResolvedValue([
        {
          id: 'library-1',
          title: 'Movies',
          type: 'movie',
        } as any,
      ]);
      http.get
        .mockResolvedValueOnce({
          data: {
            Items: [
              { Id: 'movie-1', Size: 100 },
              { Id: 'episode-1', MediaSources: [{ Size: 200 }] },
            ],
            TotalRecordCount: 3,
          },
        })
        .mockResolvedValueOnce({
          data: {
            Items: [{ Id: 'episode-2', Size: 300 }],
            TotalRecordCount: 3,
          },
        });

      await expect(service.computeLibraryStorageSizes()).resolves.toEqual(
        new Map([['library-1', 600]]),
      );

      expect(http.get).toHaveBeenNthCalledWith(1, '/Users/user-1/Items', {
        params: {
          ParentId: 'library-1',
          Recursive: true,
          IncludeItemTypes: 'Movie,Episode',
          Fields: 'MediaSources',
          Limit: 500,
          StartIndex: 0,
          EnableTotalRecordCount: true,
          CollapseBoxSetItems: false,
        },
      });
      expect(http.get).toHaveBeenNthCalledWith(2, '/Users/user-1/Items', {
        params: {
          ParentId: 'library-1',
          Recursive: true,
          IncludeItemTypes: 'Movie,Episode',
          Fields: 'MediaSources',
          Limit: 500,
          StartIndex: 2,
          EnableTotalRecordCount: true,
          CollapseBoxSetItems: false,
        },
      });
    });

    it('requests the MediaSources field so size data is populated', async () => {
      jest.spyOn(service, 'getLibraries').mockResolvedValue([
        {
          id: 'library-1',
          title: 'Movies',
          type: 'movie',
        } as any,
      ]);
      http.get.mockResolvedValueOnce({
        data: {
          Items: [{ Id: 'movie-1', MediaSources: [{ Size: 100 }] }],
          TotalRecordCount: 1,
        },
      });

      await service.computeLibraryStorageSizes();

      // Regression guard for #2924: omitting Fields makes Emby return items
      // without MediaSources, so every size sums to 0 and the library map is
      // empty. The query must explicitly request MediaSources.
      expect(http.get).toHaveBeenCalledWith(
        '/Users/user-1/Items',
        expect.objectContaining({
          params: expect.objectContaining({ Fields: 'MediaSources' }),
        }),
      );
    });
  });

  describe('getAllIdsForContextAction', () => {
    it('resolves show context to episode ids via seasons', async () => {
      const getChildrenMetadata = jest
        .spyOn(service, 'getChildrenMetadata')
        .mockResolvedValueOnce([{ id: 'season-1' } as any])
        .mockResolvedValueOnce([
          { id: 'episode-1' } as any,
          { id: 'episode-2' } as any,
        ]);

      await expect(
        service.getAllIdsForContextAction(
          'episode',
          { type: 'show', id: 'show-1' },
          'show-1',
        ),
      ).resolves.toEqual(['episode-1', 'episode-2']);

      expect(getChildrenMetadata).toHaveBeenNthCalledWith(
        1,
        'show-1',
        'season',
      );
      expect(getChildrenMetadata).toHaveBeenNthCalledWith(
        2,
        'season-1',
        'episode',
      );
    });
  });

  describe('cleanupCollectionForLibrary', () => {
    it('checks ancestor membership before removing items from a shared collection', async () => {
      jest
        .spyOn(service, 'getCollectionChildren')
        .mockResolvedValueOnce([
          { id: 'item-1' } as any,
          { id: 'item-2' } as any,
        ])
        .mockResolvedValueOnce([{ id: 'item-2' } as any]);
      const removeBatchFromCollection = jest
        .spyOn(service, 'removeBatchFromCollection')
        .mockResolvedValue([]);
      const deleteCollection = jest
        .spyOn(service, 'deleteCollection')
        .mockResolvedValue(undefined);
      http.get.mockImplementation(async (path: string) => {
        if (path === '/Items/item-1/Ancestors') {
          return { data: [{ Id: 'library-1' }] };
        }
        if (path === '/Items/item-2/Ancestors') {
          return { data: [{ Id: 'other-library' }] };
        }
        throw new Error(`Unexpected path ${path}`);
      });

      await service.cleanupCollectionForLibrary(
        'collection-1',
        'library-1',
        false,
      );

      expect(removeBatchFromCollection).toHaveBeenCalledWith('collection-1', [
        'item-1',
      ]);
      expect(deleteCollection).not.toHaveBeenCalled();
    });
  });

  describe('getWatchHistory', () => {
    it('skips individual user visibility misses but keeps other users', async () => {
      http.get.mockImplementation(async (path: string) => {
        if (path === '/Users/Query') {
          return {
            data: [
              { Id: 'user-1', Name: 'Alice' },
              { Id: 'user-2', Name: 'Bob' },
            ],
          };
        }
        if (path === '/Users/user-1/Items/item-1') {
          throw new Error('forbidden');
        }
        if (path === '/Users/user-2/Items/item-1') {
          return {
            data: {
              Id: 'item-1',
              UserData: {
                Played: true,
                LastPlayedDate: '2024-01-01T00:00:00.000Z',
              },
            },
          };
        }
        throw new Error(`Unexpected path ${path}`);
      });

      await expect(service.getWatchHistory('item-1')).resolves.toEqual([
        expect.objectContaining({ userId: 'user-2', itemId: 'item-1' }),
      ]);
    });

    it('rethrows top-level user lookup failures instead of treating them as empty history', async () => {
      const error = createResponseError(502);
      http.get.mockRejectedValueOnce(error);

      await expect(service.getWatchHistory('item-1')).rejects.toBe(error);
    });

    it('prefetchWatchHistory throws because Emby has no central history endpoint', async () => {
      await expect(service.prefetchWatchHistory()).rejects.toThrow(
        'not supported on Emby',
      );
    });
  });

  describe('itemExists', () => {
    it('returns true when Emby returns the item, scoped to the user', async () => {
      http.get.mockResolvedValueOnce({ data: { Id: '42' } });

      await expect(service.itemExists('42')).resolves.toBe(true);
      expect(http.get).toHaveBeenCalledWith('/Users/user-1/Items/42');
    });

    it('returns false on a 404 from Emby', async () => {
      http.get.mockRejectedValueOnce(createResponseError(404));

      await expect(service.itemExists('42')).resolves.toBe(false);
    });

    it('rethrows non-404 errors so overlay revert callers preserve backups', async () => {
      const error = createResponseError(500);
      http.get.mockRejectedValueOnce(error);

      await expect(service.itemExists('42')).rejects.toBe(error);
    });
  });
});
