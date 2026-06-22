import { AxiosError } from 'axios';
import { KodiRpcError } from '../../kodi-api/kodi-api.helper';
import { KodiAdapterService } from './kodi-adapter.service';

jest.mock('../../lib/cache', () => ({
  __esModule: true,
  default: {
    getCache: jest.fn().mockImplementation(() => ({
      flush: jest.fn(),
      data: {
        has: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        keys: jest.fn().mockReturnValue([]),
      },
    })),
  },
}));

describe('KodiAdapterService', () => {
  let service: KodiAdapterService;
  let call: jest.Mock;
  let collectionRepo: Record<string, jest.Mock>;
  let memberRepo: Record<string, jest.Mock>;
  let logger: Record<string, jest.Mock>;

  const setClient = () => {
    (service as unknown as { client: { call: jest.Mock } }).client = {
      call,
    } as any;
    (service as unknown as { initialized: boolean }).initialized = true;
    (service as unknown as { kodiUrl: string }).kodiUrl =
      'http://kodi.test:8080';
  };

  beforeEach(() => {
    jest.clearAllMocks();
    call = jest.fn();
    logger = {
      setContext: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    };
    collectionRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    memberRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      delete: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => ({
        delete: () => ({
          where: () => ({ andWhere: () => ({ execute: jest.fn() }) }),
        }),
      })),
    };
    service = new KodiAdapterService(
      {
        kodi_url: 'http://kodi.test:8080',
        kodi_username: 'kodi',
        kodi_password: 'kodi',
      } as any,
      logger as any,
      collectionRepo as any,
      memberRepo as any,
    );
    setClient();
  });

  describe('basic identity', () => {
    it('reports two synthetic libraries and a single synthetic user', async () => {
      const libs = await service.getLibraries();
      expect(libs.map((l) => l.id)).toEqual(['movies', 'tvshows']);
      const users = await service.getUsers();
      expect(users).toEqual([{ id: 'kodi', name: 'Kodi' }]);
    });

    it('supports no optional features', () => {
      // Every MediaServerFeature is off for Kodi.
      const anyFeature = 'labels' as any;
      expect(service.supportsFeature(anyFeature)).toBe(false);
    });
  });

  describe('itemExists', () => {
    it('returns true when the item resolves', async () => {
      call.mockResolvedValue({ moviedetails: { movieid: 1, title: 'X' } });
      await expect(service.itemExists('movie-1')).resolves.toBe(true);
    });

    it('returns false only on JSON-RPC -32602 (definitely absent)', async () => {
      call.mockRejectedValue(new KodiRpcError(-32602, 'Invalid params.'));
      await expect(service.itemExists('movie-999')).resolves.toBe(false);
    });

    it('throws on transient/auth failures so a live item is never dropped', async () => {
      const authError = Object.assign(new AxiosError('401'), {
        response: { status: 401 },
      });
      call.mockRejectedValue(authError);
      await expect(service.itemExists('movie-1')).rejects.toBe(authError);
    });
  });

  describe('deleteFromDisk', () => {
    it('fails loud — Kodi cannot delete files over JSON-RPC', async () => {
      await expect(service.deleteFromDisk('movie-1')).rejects.toThrow(
        /cannot delete files from disk/i,
      );
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('watch state', () => {
    it('maps playcount to viewCount and derives isWatched', async () => {
      call.mockResolvedValue({
        moviedetails: { movieid: 1, title: 'X', playcount: 3 },
      });
      await expect(service.getWatchState('movie-1')).resolves.toEqual({
        viewCount: 3,
        isWatched: true,
      });
    });

    it('falls back to nativeViewCount for isWatched when unplayed', async () => {
      call.mockResolvedValue({
        moviedetails: { movieid: 1, title: 'X', playcount: 0 },
      });
      await expect(service.getWatchState('movie-1', 1)).resolves.toEqual({
        viewCount: 0,
        isWatched: true,
      });
    });

    it('returns no watch history for a never-watched item', async () => {
      call.mockResolvedValue({
        moviedetails: { movieid: 1, title: 'X', playcount: 0, lastplayed: '' },
      });
      await expect(service.getWatchHistory('movie-1')).resolves.toEqual([]);
      await expect(service.getItemSeenBy('movie-1')).resolves.toEqual([]);
    });

    it('synthesizes a single watch record for a watched item', async () => {
      call.mockResolvedValue({
        moviedetails: {
          movieid: 1,
          title: 'X',
          playcount: 2,
          lastplayed: '2026-05-01 20:00:00',
        },
      });
      const history = await service.getWatchHistory('movie-1');
      expect(history).toHaveLength(1);
      expect(history[0].userId).toBe('kodi');
      await expect(service.getItemSeenBy('movie-1')).resolves.toEqual(['kodi']);
    });
  });

  describe('prefetchWatchHistory', () => {
    it('throws (no central history on Kodi)', async () => {
      await expect(service.prefetchWatchHistory()).rejects.toThrow();
    });
  });

  describe('getActiveSessions', () => {
    it('protects the playing episode and its show', async () => {
      call.mockImplementation((method: string) => {
        if (method === 'Player.GetActivePlayers') {
          return Promise.resolve([{ playerid: 1, type: 'video' }]);
        }
        return Promise.resolve({
          item: { id: 5, type: 'episode', tvshowid: 9 },
        });
      });
      await expect(service.getActiveSessions()).resolves.toEqual(
        new Set(['episode-5', 'show-9']),
      );
    });

    it('returns an empty set on failure', async () => {
      call.mockRejectedValue(new Error('boom'));
      await expect(service.getActiveSessions()).resolves.toEqual(new Set());
    });
  });

  describe('tag-backed collections (movie/show)', () => {
    it('add reads existing tags then writes the union; returns no failures', async () => {
      const created = await service.createCollection({
        libraryId: 'movies',
        title: 'Old Films',
        type: 'movie',
      } as any);
      expect(created.id.startsWith('kc_tag:movie:')).toBe(true);

      call.mockImplementation((method: string) => {
        if (method === 'VideoLibrary.GetMovieDetails') {
          return Promise.resolve({ moviedetails: { movieid: 2, tag: ['x'] } });
        }
        return Promise.resolve('OK');
      });

      const failed = await service.addBatchToCollection(created.id, [
        'movie-2',
      ]);
      expect(failed).toEqual([]);
      const setCall = call.mock.calls.find(
        ([m]) => m === 'VideoLibrary.SetMovieDetails',
      );
      expect(setCall).toBeDefined();
      // Existing tag preserved, managed tag appended (full-replace write).
      expect(setCall![1].tag).toContain('x');
      expect(setCall![1].tag).toHaveLength(2);
    });

    it('getCollectionChildren filters movies by the managed tag', async () => {
      const created = await service.createCollection({
        libraryId: 'movies',
        title: 'Old Films',
        type: 'movie',
      } as any);
      call.mockResolvedValue({
        movies: [{ movieid: 7, title: 'Z' }],
        limits: { start: 0, end: 1, total: 1 },
      });
      const children = await service.getCollectionChildren(created.id);
      expect(children.map((c) => c.id)).toEqual(['movie-7']);
      const filterCall = call.mock.calls.find(
        ([m]) => m === 'VideoLibrary.GetMovies',
      );
      expect(filterCall![1].filter.field).toBe('tag');
    });
  });

  describe('shadow collections (season/episode)', () => {
    it('createCollection persists a shadow row and seeds the initial member', async () => {
      const created = await service.createCollection({
        libraryId: 'tvshows',
        title: 'Stale Episodes',
        type: 'episode',
        initialItemId: 'episode-3',
      } as any);
      expect(created.id.startsWith('kc_shadow:')).toBe(true);
      expect(collectionRepo.save).toHaveBeenCalled();
      expect(memberRepo.save).toHaveBeenCalled();
    });

    it('addBatchToCollection inserts members and reports no failures', async () => {
      memberRepo.findOne.mockResolvedValue(undefined);
      const failed = await service.addBatchToCollection('kc_shadow:abc', [
        'episode-4',
        'episode-5',
      ]);
      expect(failed).toEqual([]);
      expect(memberRepo.save).toHaveBeenCalledTimes(2);
    });

    it('getCollectionChildren resolves members via metadata', async () => {
      memberRepo.find.mockResolvedValue([
        { collectionId: 'kc_shadow:abc', itemId: 'episode-4' },
      ]);
      call.mockResolvedValue({
        episodedetails: { episodeid: 4, title: 'Ep' },
      });
      const children = await service.getCollectionChildren('kc_shadow:abc');
      expect(children.map((c) => c.id)).toEqual(['episode-4']);
    });
  });

  describe('unsupported write features fail loud', () => {
    it('updateCollectionVisibility / reorder / poster throw', async () => {
      await expect(
        service.updateCollectionVisibility({} as any),
      ).rejects.toThrow();
      await expect(
        service.reorderCollectionItems('kc_tag:movie:x', []),
      ).rejects.toThrow();
      await expect(
        service.setCollectionImage(
          'kc_tag:movie:x',
          Buffer.from(''),
          'image/png',
        ),
      ).rejects.toThrow();
    });
  });
});
