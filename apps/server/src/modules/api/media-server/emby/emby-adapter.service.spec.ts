import { AxiosError } from 'axios';
import { batchIdsByRequestCost } from '../metadata-batch.util';
import { EMBY_METADATA_FIELDS } from './emby-adapter.service';
import { EMBY_CACHE_TTL } from './emby.constants';
import { EmbyAdapterService } from './emby-adapter.service';
import { EmbyMapper } from './emby.mapper';

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

  describe('deleteFromDisk', () => {
    it.each(['', '   '])(
      'refuses a blank item id (%j) rather than calling /Items/',
      async (itemId) => {
        setHttp();

        await expect(service.deleteFromDisk(itemId)).rejects.toThrow(
          'aborting to prevent unintended deletion',
        );
        expect(http.delete).not.toHaveBeenCalled();
      },
    );

    it('deletes a real item', async () => {
      setHttp();
      http.delete.mockResolvedValue({ data: {} });

      await service.deleteFromDisk('42');

      expect(http.delete).toHaveBeenCalledWith('/Items/42');
    });
  });

  describe('getMetadata caching (#3355)', () => {
    it('caches a resolved item so repeat conditions do not re-read it', async () => {
      http.get.mockResolvedValue({
        data: { Id: 'series-1', Type: 'Series', Name: 'A Show' },
      });

      const item = await service.getMetadata('series-1');

      expect(item?.id).toBe('series-1');
      expect(embyCacheMocks.data.set).toHaveBeenCalledWith(
        'emby:metadata:series-1',
        expect.objectContaining({ id: 'series-1' }),
        EMBY_CACHE_TTL.METADATA,
      );
    });

    it('serves a cached item without touching the API', async () => {
      embyCacheMocks.data.get.mockReturnValueOnce({ id: 'series-1' });

      await expect(service.getMetadata('series-1')).resolves.toEqual({
        id: 'series-1',
      });
      expect(http.get).not.toHaveBeenCalled();
    });

    it('does not cache a failed read', async () => {
      http.get.mockRejectedValue(new Error('boom'));

      await expect(service.getMetadata('item-1')).resolves.toBeUndefined();
      expect(embyCacheMocks.data.set).not.toHaveBeenCalled();
    });
  });

  describe('getMetadataBatch', () => {
    it('reads a whole id list in one user-scoped request and caches each item', async () => {
      http.get.mockResolvedValue({
        data: {
          Items: [
            { Id: 'movie-1', Type: 'Movie', Name: 'One' },
            { Id: 'movie-2', Type: 'Movie', Name: 'Two' },
          ],
        },
      });

      const items = await service.getMetadataBatch(['movie-1', 'movie-2']);

      expect(http.get).toHaveBeenCalledTimes(1);
      expect(http.get).toHaveBeenCalledWith(
        '/Items',
        expect.objectContaining({
          params: expect.objectContaining({ Ids: 'movie-1,movie-2' }),
        }),
      );
      expect(items.map((item) => item.id)).toEqual(['movie-1', 'movie-2']);
      // Batched list-route rows stub UserData, so they live in their own
      // namespace and are never served to getMetadata callers.
      expect(embyCacheMocks.data.set).toHaveBeenCalledWith(
        'emby:metadata-batch:movie-1',
        expect.objectContaining({ id: 'movie-1' }),
        EMBY_CACHE_TTL.METADATA,
      );
    });

    it('splits a long id list', async () => {
      http.get.mockResolvedValue({ data: { Items: [] } });
      const itemIds = Array.from(
        { length: 1500 },
        (unused, index) => `movie-${index}`,
      );

      await service.getMetadataBatch(itemIds);

      // The shared helper decides the split from the ids themselves.
      expect(http.get).toHaveBeenCalledTimes(
        batchIdsByRequestCost(itemIds, 1).length,
      );
      expect(http.get.mock.calls.length).toBeGreaterThan(1);
    });

    it('keeps only the ids it was asked for', async () => {
      http.get.mockResolvedValue({
        data: {
          Items: [
            { Id: 'movie-1', Type: 'Movie', Name: 'One' },
            { Id: 'somebody-else', Type: 'Movie', Name: 'Unrelated' },
          ],
        },
      });

      await expect(service.getMetadataBatch(['movie-1'])).resolves.toEqual([
        expect.objectContaining({ id: 'movie-1' }),
      ]);
    });

    it('serves cached ids without asking for them again', async () => {
      embyCacheMocks.data.get.mockImplementation((key: string) =>
        key === 'emby:metadata-batch:movie-1' ? { id: 'movie-1' } : undefined,
      );
      http.get.mockResolvedValue({
        data: { Items: [{ Id: 'movie-2', Type: 'Movie', Name: 'Two' }] },
      });

      const items = await service.getMetadataBatch(['movie-1', 'movie-2']);

      expect(http.get).toHaveBeenCalledWith(
        '/Items',
        expect.objectContaining({
          params: expect.objectContaining({ Ids: 'movie-2' }),
        }),
      );
      expect(items.map((item) => item.id).sort()).toEqual([
        'movie-1',
        'movie-2',
      ]);
    });

    // Emby answers 500 for a malformed id, so a bad id costs its batch. Same
    // contract as getMetadata: those ids are absent, not reported missing.
    it('leaves out the ids of a failed read', async () => {
      embyCacheMocks.data.get.mockReturnValue(undefined);
      http.get.mockRejectedValue(new Error('boom'));

      await expect(service.getMetadataBatch(['movie-1'])).resolves.toEqual([]);
    });

    // Unscoped, the list route answers rows with no UserData at all, so a
    // missing user must leave the ids unresolved rather than read unscoped.
    it('resolves nothing rather than reading unscoped when no user resolves', async () => {
      setHttp('');
      embyCacheMocks.data.get.mockReturnValue(undefined);
      http.get.mockResolvedValue({ data: [] });

      await expect(service.getMetadataBatch(['movie-1'])).resolves.toEqual([]);
      expect(http.get).not.toHaveBeenCalledWith(
        '/Items',
        expect.objectContaining({
          params: expect.objectContaining({ Ids: 'movie-1' }),
        }),
      );
    });
  });

  // Emby answers fewer fields on `/Items` than on `/Users/{id}/Items/{id}`, and a
  // batch result is cached under the key getMetadata reads, so the two reads have
  // to ask for exactly the same set.
  describe('metadata read parity', () => {
    const fieldsOf = (call: unknown[]) =>
      (call[1] as { params: { Fields: string } }).params.Fields;

    it('asks for the same fields in the batch read as in the single read', async () => {
      http.get.mockResolvedValue({
        data: { Id: 'movie-1', Type: 'Movie', Name: 'One' },
      });
      await service.getMetadata('movie-1');
      const singleFields = fieldsOf(http.get.mock.calls[0]);

      http.get.mockClear();
      embyCacheMocks.data.get.mockReturnValue(undefined);
      http.get.mockResolvedValue({
        data: { Items: [{ Id: 'movie-1', Type: 'Movie', Name: 'One' }] },
      });
      await service.getMetadataBatch(['movie-1']);

      expect(fieldsOf(http.get.mock.calls[0])).toBe(singleFields);
    });

    // Verified on Emby 4.9.5: a list read omits each of these unless it is named,
    // and the mapper reads all of them.
    it.each([
      ['ParentId', 'parentId'],
      ['ChildCount', 'childCount'],
      ['PremiereDate', 'originallyAvailableAt'],
      ['CommunityRating', 'ratings'],
      ['OfficialRating', 'contentRating'],
      ['ProductionYear', 'year'],
      ['IndexNumberEnd', 'indexEnd'],
    ])('names %s, which the mapper needs for %s', (field) => {
      expect(EMBY_METADATA_FIELDS.split(',')).toContain(field);
    });

    // The keys the list route answers without being asked, verified on 4.9.5
    // for a movie and an episode. Everything else the mapper consumes must be
    // named in EMBY_METADATA_FIELDS or the batched row silently loses it.
    const LIST_ROUTE_BASE_KEYS = [
      'BackdropImageTags',
      'Id',
      'ImageTags',
      'IndexNumber',
      'IsFolder',
      'MediaType',
      'Name',
      'ParentIndexNumber',
      'RunTimeTicks',
      'SeasonId',
      'SeasonName',
      'SeriesId',
      'SeriesName',
      'ServerId',
      'Type',
      // Answered as a stub (PlayCount 0, no LastPlayedDate), which is why the
      // batch caches apart from getMetadata rather than asking for it.
      'UserData',
      // Read only to classify library folders, which no metadata batch holds.
      'CollectionType',
    ];

    it('asks for every field the mapper actually reads', () => {
      const accessed = new Set<string>();
      const record = (payload: Record<string, unknown>) =>
        new Proxy(payload, {
          get(target, key) {
            if (typeof key === 'string') accessed.add(key);
            return target[key as keyof typeof payload];
          },
        });

      for (const type of ['Movie', 'Series', 'Season', 'Episode']) {
        EmbyMapper.toMediaItem(
          record({ Id: 'item-1', Type: type, Name: 'One' }) as never,
        );
      }

      const askedFor = new Set(EMBY_METADATA_FIELDS.split(','));
      const unrequested = [...accessed].filter(
        (key) => !askedFor.has(key) && !LIST_ROUTE_BASE_KEYS.includes(key),
      );
      expect(unrequested).toEqual([]);
    });

    it('maps a batch item to the same shape as a single item', async () => {
      // DateCreated is set because the mapper falls back to `new Date()`
      // without it, which the two reads below stamp a few milliseconds apart.
      const payload = {
        Id: 'movie-1',
        Type: 'Movie',
        Name: 'One',
        DateCreated: '2026-01-02T03:04:05.0000000Z',
        ParentId: '6',
        ChildCount: 1,
        PremiereDate: '2008-05-20T00:00:00.0000000Z',
        CommunityRating: 7.5,
        OfficialRating: 'PG',
        ProviderIds: { Tmdb: '10378' },
      };

      http.get.mockResolvedValue({ data: payload });
      const single = await service.getMetadata('movie-1');

      embyCacheMocks.data.get.mockReturnValue(undefined);
      http.get.mockResolvedValue({ data: { Items: [payload] } });
      const [batched] = await service.getMetadataBatch(['movie-1']);

      expect(batched).toEqual(single);
      expect(batched.parentId).toBe('6');
      expect(batched.originallyAvailableAt).toBeInstanceOf(Date);
      expect(batched.ratings).not.toEqual([]);
      expect(batched.contentRating).toBe('PG');
    });
  });

  describe('getChildrenMetadata caching (#3355)', () => {
    it('keys seasons and episodes of one parent separately', async () => {
      http.get.mockResolvedValue({ data: { Items: [{ Id: 'child-1' }] } });

      await service.getChildrenMetadata('show-1', 'season');
      await service.getChildrenMetadata('show-1', 'episode');

      expect(embyCacheMocks.data.set).toHaveBeenCalledWith(
        'emby:children:show-1:season',
        [expect.objectContaining({ id: 'child-1' })],
        EMBY_CACHE_TTL.METADATA,
      );
      expect(embyCacheMocks.data.set).toHaveBeenCalledWith(
        'emby:children:show-1:episode',
        [expect.objectContaining({ id: 'child-1' })],
        EMBY_CACHE_TTL.METADATA,
      );
    });

    it('serves a cached list without touching the API', async () => {
      embyCacheMocks.data.get.mockReturnValueOnce([{ id: 'ep-1' }]);

      await expect(
        service.getChildrenMetadata('season-1', 'episode'),
      ).resolves.toEqual([{ id: 'ep-1' }]);
      expect(http.get).not.toHaveBeenCalled();
    });

    it('does not cache a failed read', async () => {
      http.get.mockRejectedValue(new Error('boom'));

      await expect(
        service.getChildrenMetadata('season-1', 'episode'),
      ).resolves.toEqual([]);
      expect(embyCacheMocks.data.set).not.toHaveBeenCalled();
    });
  });

  describe('getMetadata in-flight dedupe (#3356)', () => {
    it('shares one request between concurrent reads of the same id', async () => {
      let resolveItem: (value: unknown) => void = () => {};
      http.get.mockReturnValue(
        new Promise((resolve) => {
          resolveItem = resolve;
        }),
      );

      // Concurrently evaluated siblings all miss the cold cache key together,
      // so the cache alone cannot stop the first read fanning out.
      const reads = Promise.all([
        service.getMetadata('series-1'),
        service.getMetadata('series-1'),
      ]);
      resolveItem({ data: { Id: 'series-1', Type: 'Series' } });

      const results = await reads;
      expect(results.map((item) => item?.id)).toEqual(['series-1', 'series-1']);
      expect(http.get).toHaveBeenCalledTimes(1);
    });

    it('drops the in-flight entry once the request settles', async () => {
      http.get.mockResolvedValue({ data: { Id: 'series-1', Type: 'Series' } });

      await service.getMetadata('series-1');
      await service.getMetadata('series-1');

      // The map only ever holds an unsettled request - a later read is served
      // by the cache above it, never by a retained promise. The cache is
      // mocked to always miss here, so the second read reaching the API is
      // what proves the entry was released.
      expect(http.get).toHaveBeenCalledTimes(2);
    });
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

  // A truncated page is an HTTP 200, so the fail-closed contract cannot catch
  // it - the link lookup would read a partial listing as a confirmed miss.
  // Plex and Jellyfin throw here; #2594's verify-and-retry-with-a-corrected-id
  // path only runs on a rejection, so swallowing left it dead on Emby.
  describe('refreshItemMetadata', () => {
    it('propagates a failed refresh so the retry path can run', async () => {
      const failure = new Error('boom');
      http.post.mockRejectedValueOnce(failure);

      await expect(service.refreshItemMetadata('item-1')).rejects.toBe(failure);
    });

    it('throws when not initialized', async () => {
      (service as unknown as { http?: unknown }).http = undefined;
      await expect(service.refreshItemMetadata('item-1')).rejects.toThrow(
        'Emby not initialized',
      );
    });
  });

  describe('getCollections cache preference', () => {
    it('bypasses the cached listing when the caller needs a live answer', async () => {
      embyCacheMocks.data.get.mockReturnValue([
        { id: 'stale', title: 'Stale', childCount: 1 },
      ]);
      http.get.mockResolvedValueOnce({
        data: { Items: [{ Id: 'fresh', Name: 'Fresh', ChildCount: 1 }] },
      });

      // Cached by default (per-item rule reads), live when asked.
      expect((await service.getCollections('library-1'))[0].id).toBe('stale');
      expect((await service.getCollections('library-1', false))[0].id).toBe(
        'fresh',
      );
    });
  });

  describe('getCollections paging', () => {
    it('pages past the batch limit instead of truncating', async () => {
      const page = (start: number, count: number) => ({
        data: {
          Items: Array.from({ length: count }, (_, i) => ({
            Id: `box-${start + i}`,
            Name: `Box ${start + i}`,
            ChildCount: 1,
          })),
          TotalRecordCount: 501,
        },
      });
      embyCacheMocks.data.get.mockReturnValue(undefined);
      http.get
        .mockResolvedValueOnce(page(0, 500))
        .mockResolvedValueOnce(page(500, 1));

      const collections = await service.getCollections('library-1');

      expect(collections).toHaveLength(501);
      expect(http.get).toHaveBeenNthCalledWith(
        2,
        '/Items',
        expect.objectContaining({
          params: expect.objectContaining({ StartIndex: 500 }),
        }),
      );
    });
  });

  describe('getCollectionChildren', () => {
    it('re-throws enumeration failures so callers never mistake a failed read for an empty collection', async () => {
      http.get.mockRejectedValueOnce(new Error('boom'));

      await expect(service.getCollectionChildren('box-1')).rejects.toThrow(
        'boom',
      );
    });

    // A bare Limit truncated at MAX_PAGE_SIZE while callers treat a non-empty
    // children list as a complete snapshot, so everything past the cap looked
    // absent - clearing rule-removal markers and mis-reconciling membership.
    it('pages past the batch limit instead of truncating', async () => {
      const page = (start: number, count: number) => ({
        data: {
          Items: Array.from({ length: count }, (_, i) => ({
            Id: `item-${start + i}`,
            Name: `Item ${start + i}`,
            Type: 'Movie',
          })),
          TotalRecordCount: 501,
        },
      });
      http.get
        .mockResolvedValueOnce(page(0, 500))
        .mockResolvedValueOnce(page(500, 1));

      const children = await service.getCollectionChildren('box-1');

      expect(children).toHaveLength(501);
      expect(children[500].id).toBe('item-500');
      expect(http.get).toHaveBeenNthCalledWith(
        2,
        '/Items',
        expect.objectContaining({
          params: expect.objectContaining({ StartIndex: 500 }),
        }),
      );
    });

    it('stops paging when the server reports no more items', async () => {
      http.get.mockResolvedValueOnce({
        data: {
          Items: [{ Id: 'only', Name: 'Only', Type: 'Movie' }],
          TotalRecordCount: 1,
        },
      });

      const children = await service.getCollectionChildren('box-1');

      expect(children).toHaveLength(1);
      expect(http.get).toHaveBeenCalledTimes(1);
    });
  });

  // #3550: a library grouping films into collections answered a Movie-typed
  // listing with BoxSet rows, which the mapper turns into a movie with no
  // external IDs.
  describe('listings drop kinds the query did not ask for', () => {
    beforeEach(() => {
      http.get.mockResolvedValue({
        data: {
          Items: [
            { Id: 'movie-1', Type: 'Movie' },
            { Id: 'boxset-1', Type: 'BoxSet' },
          ],
          TotalRecordCount: 2,
        },
      });
    });

    it.each([
      [
        'getLibraryContents',
        async () =>
          (
            await service.getLibraryContents('library-1', {
              offset: 0,
              limit: 30,
              type: 'movie' as const,
            })
          ).items,
      ],
      [
        'searchLibraryContents',
        () => service.searchLibraryContents('library-1', 'query', 'movie'),
      ],
      ['searchContent', () => service.searchContent('query')],
    ])('%s drops the BoxSet row', async (_method, read) => {
      expect((await read()).map((item) => item.id)).toEqual(['movie-1']);
    });

    // /Users/{id}/Items/Latest groups episodes under their series, so an
    // Episode request answers with Series rows (Emby 4.9.5). Filtering to the
    // requested kinds alone would empty recently-added TV.
    it('getRecentlyAdded keeps grouped Series rows', async () => {
      http.get.mockResolvedValue({
        data: [
          { Id: 'series-1', Type: 'Series' },
          { Id: 'boxset-1', Type: 'BoxSet' },
        ],
      });

      const items = await service.getRecentlyAdded('library-1', { limit: 10 });

      expect(items.map((item) => item.id)).toEqual(['series-1']);
    });
  });

  // Every library-scoped Emby query opts out of BoxSet collapsing, as
  // JELLYFIN_LIBRARY_QUERY_DEFAULTS does on the Jellyfin side (#2554, #3550).
  describe('library queries opt out of BoxSet collapsing', () => {
    beforeEach(() => {
      http.get.mockResolvedValue({ data: { Items: [], TotalRecordCount: 0 } });
    });

    it.each([
      [
        'getLibraryContents',
        () => service.getLibraryContents('library-1', { offset: 0, limit: 30 }),
      ],
      [
        'getLibraryContentCount',
        () => service.getLibraryContentCount('library-1', 'movie'),
      ],
      [
        'searchLibraryContents',
        () => service.searchLibraryContents('library-1', 'query', 'movie'),
      ],
      ['searchContent', () => service.searchContent('query')],
      [
        'findRandomItem',
        () => service.findRandomItem(['library-1'], ['Movie']),
      ],
      [
        'getRecentlyAdded',
        () => {
          http.get.mockResolvedValue({ data: [] });
          return service.getRecentlyAdded('library-1', { limit: 10 });
        },
      ],
    ])('%s opts out', async (_method, read) => {
      await read();

      expect(http.get.mock.calls.at(-1)?.[1]?.params).toEqual(
        expect.objectContaining({ CollapseBoxSetItems: false }),
      );
    });
  });

  describe('getLibraryContents', () => {
    it('uses Emby native studio sorting', async () => {
      http.get
        .mockResolvedValueOnce({ data: { Items: [], TotalRecordCount: 0 } })
        .mockResolvedValueOnce({ data: { Items: [], TotalRecordCount: 0 } });

      await service.getLibraryContents('library-1', {
        offset: 0,
        limit: 30,
        type: 'movie',
        sort: 'studio',
        sortOrder: 'desc',
      });

      const itemsCall = http.get.mock.calls.find(([path]) => path === '/Items');
      expect(itemsCall?.[1]?.params).toEqual(
        expect.objectContaining({
          SortBy: 'Studio',
          SortOrder: 'Descending',
        }),
      );
    });

    it('re-throws page read failures so callers never mistake a failed read for an empty library', async () => {
      http.get.mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.getLibraryContents('library-1', { offset: 0, limit: 50 }),
      ).rejects.toThrow('boom');
    });

    it('re-throws library count read failures instead of reporting zero', async () => {
      http.get.mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.getLibraryContentCount('library-1', 'movie'),
      ).rejects.toThrow('boom');
    });
  });

  // Collection reads must be user-scoped: Emby resolves the BoxSet query
  // against a user's library view, so the plain /Items path can miss or 404,
  // which would break the manual-collection bootstrap (incl. the cross-library
  // lookup). Maintainerr only ever operates as an admin, so when no user is
  // configured we resolve one rather than degrade to /Items.
  // #3344: undefined must mean "the server says it is gone", so callers that
  // unlink on a missing collection never act on an unreachable server.
  // #3344: these guards sit above the try, so they answered "confirmed
  // absent" for "adapter not ready" - what callers unlink and truncate on.
  describe('uninitialized client', () => {
    const clearHttp = () => {
      (service as unknown as { http?: unknown }).http = undefined;
    };

    it('getCollection honours throwOnError', async () => {
      clearHttp();
      await expect(service.getCollection('box-1', true)).rejects.toThrow(
        'Emby not initialized',
      );
      await expect(service.getCollection('box-1')).resolves.toBeUndefined();
    });

    it('getLibraryContents throws instead of returning an empty page', async () => {
      clearHttp();
      await expect(service.getLibraryContents('library-1')).rejects.toThrow(
        'Emby not initialized',
      );
    });
  });

  describe('getCollection missing vs unreachable', () => {
    it('returns undefined on 404 even when asked to throw', async () => {
      setHttp();
      http.get.mockRejectedValueOnce(createResponseError(404));

      await expect(
        service.getCollection('box-1', true),
      ).resolves.toBeUndefined();
    });

    it('throws on any other failure when asked to throw', async () => {
      setHttp();
      const error = createResponseError(502);
      http.get.mockRejectedValueOnce(error);

      await expect(service.getCollection('box-1', true)).rejects.toBe(error);
    });
  });

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

    // Emby answers 404 on the unscoped route for a collection that exists, so
    // the caller read a live collection as gone and dropped its link.
    it('resolves a user before reading a collection instead of going unscoped', async () => {
      clearConfiguredUser();
      http.get.mockImplementation((path: string) =>
        path === '/Users/Query'
          ? Promise.resolve({
              data: [{ Id: 'admin-9', Policy: { IsAdministrator: true } }],
            })
          : Promise.resolve({ data: { Id: 'box-1', Name: 'Box' } }),
      );

      await expect(service.getCollection('box-1', true)).resolves.toEqual(
        expect.objectContaining({ id: 'box-1' }),
      );
      expect(http.get).toHaveBeenCalledWith('/Users/admin-9/Items/box-1');
      expect(http.get).not.toHaveBeenCalledWith('/Items/box-1');
    });

    it('does not call a collection missing when no user can scope the lookup', async () => {
      clearConfiguredUser();
      http.get.mockResolvedValue({ data: { Items: [] } });

      await expect(service.getCollection('box-1', true)).rejects.toThrow(
        'no user to scope the lookup',
      );
      await expect(service.getCollection('box-1')).resolves.toBeUndefined();
      expect(http.get).not.toHaveBeenCalledWith('/Items/box-1');
    });

    // The unscoped read 404s, so the update failed outright on a token-only
    // setup; the list form would answer a trimmed item and write back a wipe.
    it('reads the collection to update through the user-scoped route', async () => {
      clearConfiguredUser();
      http.get.mockImplementation((path: string) =>
        path === '/Users/Query'
          ? Promise.resolve({
              data: [{ Id: 'admin-9', Policy: { IsAdministrator: true } }],
            })
          : Promise.resolve({ data: { Id: 'box-1', Name: 'Box' } }),
      );
      http.post.mockResolvedValue({ data: {} });

      await service.updateCollection({
        collectionId: 'box-1',
        libraryId: 'library-1',
        title: 'Renamed',
      } as any);

      expect(http.get).toHaveBeenCalledWith('/Users/admin-9/Items/box-1');
    });

    // Unscoped, Emby answers the physical folder tree, which never holds the
    // CollectionFolder id stored as the library, so every child read as "not in
    // this library" and the cleanup silently removed nothing.
    it('scopes the library-membership check so cleanup can match its children', async () => {
      jest
        .spyOn(service, 'getCollectionChildren')
        .mockResolvedValueOnce([{ id: 'item-1' }] as any)
        .mockResolvedValueOnce([]);
      const removeBatch = jest
        .spyOn(service, 'removeBatchFromCollection')
        .mockResolvedValue(undefined as never);
      jest.spyOn(service, 'deleteCollection').mockResolvedValue(undefined);
      http.get.mockResolvedValue({ data: [{ Id: 'library-1' }] });

      await service.cleanupCollectionForLibrary('box-1', 'library-1', false);

      expect(http.get).toHaveBeenCalledWith('/Items/item-1/Ancestors', {
        params: { UserId: 'user-1' },
      });
      expect(removeBatch).toHaveBeenCalledWith('box-1', ['item-1']);
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

      // Throwing reads: an expansion that silently resolved to nothing
      // reported the action as done (#3381).
      expect(getChildrenMetadata).toHaveBeenNthCalledWith(
        1,
        'show-1',
        'season',
        true,
      );
      expect(getChildrenMetadata).toHaveBeenNthCalledWith(
        2,
        'season-1',
        'episode',
        true,
      );
    });

    it('propagates a failed children read instead of resolving to nothing', async () => {
      jest
        .spyOn(service, 'getChildrenMetadata')
        .mockRejectedValue(new Error('emby down'));

      await expect(
        service.getAllIdsForContextAction(
          'season',
          { type: 'show', id: 'show-1' },
          'show-1',
        ),
      ).rejects.toThrow('emby down');
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
        .mockResolvedValue({ refused: [], unknown: [] });
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
          throw createResponseError(403);
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

    it('rethrows a per-user transport failure rather than understating the history', async () => {
      // Swallowing it drops a user who may have watched the item, and callers
      // read the shortened result as a confirmed date (#3531).
      const error = createResponseError(502);
      http.get.mockImplementation(async (path: string) => {
        if (path === '/Users/Query') {
          return { data: [{ Id: 'user-1', Name: 'Alice' }] };
        }
        throw error;
      });

      await expect(service.getWatchHistory('item-1')).rejects.toBe(error);
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

  describe('getLastPlayedAt', () => {
    const users = [
      { Id: 'user-1', Name: 'Alice' },
      { Id: 'user-2', Name: 'Bob' },
    ];

    it('includes partial playback when Played is false', async () => {
      http.get.mockImplementation(async (path: string) => {
        if (path === '/Users/Query') return { data: [users[0]] };
        return {
          data: {
            UserData: {
              Played: false,
              LastPlayedDate: '2024-06-01T00:00:00.000Z',
            },
          },
        };
      });

      await expect(service.getLastPlayedAt('item-1')).resolves.toEqual(
        new Date('2024-06-01T00:00:00.000Z'),
      );
    });

    it('returns the newest playback timestamp across multiple users', async () => {
      http.get.mockImplementation(async (path: string) => {
        if (path === '/Users/Query') return { data: users };
        const isSecondUser = path.includes('/user-2/');
        return {
          data: {
            UserData: {
              Played: !isSecondUser,
              LastPlayedDate: isSecondUser
                ? '2024-06-03T00:00:00.000Z'
                : '2024-06-01T00:00:00.000Z',
            },
          },
        };
      });

      await expect(service.getLastPlayedAt('item-1')).resolves.toEqual(
        new Date('2024-06-03T00:00:00.000Z'),
      );
      expect(http.get).toHaveBeenCalledWith('/Users/user-1/Items/item-1');
      expect(http.get).toHaveBeenCalledWith('/Users/user-2/Items/item-1');
    });

    it('returns null when no user has playback history', async () => {
      http.get.mockImplementation(async (path: string) =>
        path === '/Users/Query'
          ? { data: users }
          : { data: { UserData: { Played: false } } },
      );

      await expect(service.getLastPlayedAt('item-1')).resolves.toBeNull();
    });

    it('rejects when a user-scoped item lookup fails', async () => {
      http.get.mockImplementation(async (path: string) => {
        if (path === '/Users/Query') return { data: users };
        if (path.includes('/user-2/')) throw new Error('lookup failed');
        return { data: { UserData: {} } };
      });

      await expect(service.getLastPlayedAt('item-1')).rejects.toThrow(
        'lookup failed',
      );
    });

    it('rejects when the user list lookup fails', async () => {
      http.get.mockRejectedValue(new Error('users failed'));

      await expect(service.getLastPlayedAt('item-1')).rejects.toThrow(
        'users failed',
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

    // Emby 404s the unscoped /Items/{id} route for an item that exists.
    describe('without a configured user', () => {
      beforeEach(() => {
        (service as unknown as { embyUserId?: string }).embyUserId = undefined;
      });

      const withResolvedAdmin = (item: unknown) =>
        http.get.mockImplementation((path: string) =>
          path === '/Users/Query'
            ? Promise.resolve({
                data: [{ Id: 'admin-9', Policy: { IsAdministrator: true } }],
              })
            : Promise.resolve({ data: item }),
        );

      it('resolves a single id through the auto-resolved user', async () => {
        withResolvedAdmin({ Id: '42' });

        await expect(service.itemExists('42')).resolves.toBe(true);
        expect(http.get).toHaveBeenCalledWith('/Users/admin-9/Items/42');
      });

      it('reports a 404 on that route as a confirmed absence', async () => {
        http.get.mockImplementation((path: string) =>
          path === '/Users/Query'
            ? Promise.resolve({
                data: [{ Id: 'admin-9', Policy: { IsAdministrator: true } }],
              })
            : Promise.reject(createResponseError(404)),
        );

        await expect(service.itemExists('42')).resolves.toBe(false);
      });

      // Without a user the answer is unknown, and an unknown must never reach
      // the caller as "deleted" - that is what removes live media.
      it('stays inconclusive when no user can be resolved', async () => {
        http.get.mockResolvedValue({ data: { Items: [] } });

        await expect(service.itemExists('42')).rejects.toThrow(
          'no user to scope the lookup',
        );
      });

      // The list form would answer a trimmed item here, which is a metadata
      // read silently losing most of its fields.
      it('reads metadata through the same user-scoped route', async () => {
        withResolvedAdmin({ Id: '42', Name: 'Sample Movie', Type: 'Movie' });

        await expect(service.getMetadata('42')).resolves.toMatchObject({
          id: '42',
        });
        expect(http.get).toHaveBeenCalledWith('/Users/admin-9/Items/42', {
          params: { Fields: EMBY_METADATA_FIELDS },
        });
      });
    });
  });
});
