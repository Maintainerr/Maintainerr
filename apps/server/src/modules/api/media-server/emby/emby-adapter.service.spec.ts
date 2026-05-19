import { MediaServerFeature } from '@maintainerr/contracts';
import { AxiosError } from 'axios';
import cacheManager from '../../lib/cache';
import { EmbyAdapterService } from './emby-adapter.service';

jest.mock('../../lib/cache', () => ({
  __esModule: true,
  default: {
    getCache: jest.fn().mockReturnValue({
      flush: jest.fn(),
      data: {
        get: jest.fn(),
        set: jest.fn(),
        has: jest.fn(),
        del: jest.fn(),
        keys: jest.fn(),
        flushAll: jest.fn(),
      },
    }),
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

  it('reports bulk-collection-create capability for Emby', () => {
    expect(
      service.supportsFeature(MediaServerFeature.BULK_COLLECTION_CREATE),
    ).toBe(true);
    expect(cacheManager.getCache).toHaveBeenCalledWith('emby');
  });

  describe('createCollection', () => {
    it('passes initial item ids on create and hydrates the created collection', async () => {
      http.post.mockResolvedValueOnce({ data: { Id: 'collection-1' } });
      http.get.mockResolvedValueOnce({
        data: {
          Id: 'collection-1',
          Name: 'Seeded Collection',
          Overview: 'summary',
          ChildCount: 2,
        },
      });

      const result = await service.createCollection({
        libraryId: 'library-1',
        title: 'Seeded Collection',
        type: 'show',
        initialItemIds: ['item-1', 'item-2'],
      });

      expect(http.post).toHaveBeenCalledWith('/Collections', null, {
        params: {
          Name: 'Seeded Collection',
          ParentId: 'library-1',
          Ids: 'item-1,item-2',
          IsLocked: true,
        },
      });
      expect(http.get).toHaveBeenCalledWith('/Users/user-1/Items/collection-1');
      expect(result).toEqual(
        expect.objectContaining({
          id: 'collection-1',
          title: 'Seeded Collection',
        }),
      );
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
          Limit: 500,
          StartIndex: 2,
          EnableTotalRecordCount: true,
          CollapseBoxSetItems: false,
        },
      });
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
  });

  describe('itemExists', () => {
    it('returns true when Emby returns the item', async () => {
      http.get.mockResolvedValueOnce({ data: { Id: '42' } });

      await expect(service.itemExists('42')).resolves.toBe(true);
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
