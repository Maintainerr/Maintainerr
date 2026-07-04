import { Mocked, TestBed } from '@suites/unit';
import { SettingsDataService } from '../../settings/settings-data.service';
import cacheManager from '../lib/cache';
import { SEERR_REQUESTS_CACHE_ID } from './seerr-api.constants';
import {
  SeerrApiService,
  SeerrRequest,
  SeerrRequestStatus,
} from './seerr-api.service';

describe('SeerrApiService', () => {
  let service: SeerrApiService;
  let settings: Mocked<SettingsDataService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(SeerrApiService).compile();

    service = unit;
    settings = unitRef.get(
      SettingsDataService,
    ) as unknown as Mocked<SettingsDataService>;
    settings.seerrConfigured.mockReturnValue(true);
  });

  it('should return false when no other requested seasons remain', async () => {
    jest.spyOn(service, 'getShow').mockResolvedValue({
      id: 1,
      mediaInfo: {
        id: 1,
        tmdbId: 100,
        tvdbId: 200,
        status: 1,
        updatedAt: '2026-03-14T00:00:00.000Z',
        mediaAddedAt: '2026-03-14T00:00:00.000Z',
        externalServiceId: 1,
        externalServiceId4k: 1,
        mediaType: 'tv',
        requests: [
          {
            id: 10,
            type: 'tv',
            status: SeerrRequestStatus.APPROVED,
            createdAt: '2026-03-14T00:00:00.000Z',
            updatedAt: '2026-03-14T00:00:00.000Z',
            requestedBy: {} as never,
            modifiedBy: {} as never,
            is4k: false,
            serverId: 1,
            profileId: 1,
            rootFolder: '/',
            media: {} as never,
            seasons: [
              {
                id: 1,
                name: 'Season 1',
                seasonNumber: 1,
                status: SeerrRequestStatus.APPROVED,
              },
            ],
          },
          {
            id: 11,
            type: 'tv',
            status: SeerrRequestStatus.DECLINED,
            createdAt: '2026-03-14T00:00:00.000Z',
            updatedAt: '2026-03-14T00:00:00.000Z',
            requestedBy: {} as never,
            modifiedBy: {} as never,
            is4k: false,
            serverId: 1,
            profileId: 1,
            rootFolder: '/',
            media: {} as never,
            seasons: [
              {
                id: 2,
                name: 'Season 2',
                seasonNumber: 2,
                status: SeerrRequestStatus.DECLINED,
              },
            ],
          },
          {
            id: 12,
            type: 'tv',
            status: SeerrRequestStatus.APPROVED,
            createdAt: '2026-03-14T00:00:00.000Z',
            updatedAt: '2026-03-14T00:00:00.000Z',
            requestedBy: {} as never,
            modifiedBy: {} as never,
            is4k: false,
            serverId: 1,
            profileId: 1,
            rootFolder: '/',
            media: {} as never,
            seasons: [
              {
                id: 3,
                name: 'Season 3',
                seasonNumber: 3,
                status: SeerrRequestStatus.COMPLETED,
              },
            ],
          },
        ],
      },
      firstAirDate: new Date('2020-01-01'),
    });

    await expect(service.hasRemainingSeasonRequests(100, 1)).resolves.toBe(
      false,
    );
  });

  it('should return true when another active requested season remains', async () => {
    jest.spyOn(service, 'getShow').mockResolvedValue({
      id: 1,
      mediaInfo: {
        id: 1,
        tmdbId: 100,
        tvdbId: 200,
        status: 1,
        updatedAt: '2026-03-14T00:00:00.000Z',
        mediaAddedAt: '2026-03-14T00:00:00.000Z',
        externalServiceId: 1,
        externalServiceId4k: 1,
        mediaType: 'tv',
        requests: [
          {
            id: 10,
            type: 'tv',
            status: SeerrRequestStatus.APPROVED,
            createdAt: '2026-03-14T00:00:00.000Z',
            updatedAt: '2026-03-14T00:00:00.000Z',
            requestedBy: {} as never,
            modifiedBy: {} as never,
            is4k: false,
            serverId: 1,
            profileId: 1,
            rootFolder: '/',
            media: {} as never,
            seasons: [
              {
                id: 1,
                name: 'Season 1',
                seasonNumber: 1,
                status: SeerrRequestStatus.APPROVED,
              },
              {
                id: 2,
                name: 'Season 2',
                seasonNumber: 2,
                status: SeerrRequestStatus.APPROVED,
              },
            ],
          },
        ],
      },
      firstAirDate: new Date('2020-01-01'),
    });

    await expect(service.hasRemainingSeasonRequests(100, 1)).resolves.toBe(
      true,
    );
  });

  it('should return undefined when Seerr is not configured', async () => {
    settings.seerrConfigured.mockReturnValue(false);

    await expect(service.hasRemainingSeasonRequests(100, 1)).resolves.toBe(
      undefined,
    );
  });

  it('should return false when the show has no Seerr mediaInfo', async () => {
    jest.spyOn(service, 'getShow').mockResolvedValue({
      id: 1,
      firstAirDate: new Date('2020-01-01'),
    });

    await expect(service.hasRemainingSeasonRequests(100, 1)).resolves.toBe(
      false,
    );
  });

  it('should return false when the show has mediaInfo but no requests', async () => {
    jest.spyOn(service, 'getShow').mockResolvedValue({
      id: 1,
      mediaInfo: {
        id: 1,
        tmdbId: 100,
        tvdbId: 200,
        status: 1,
        updatedAt: '2026-03-14T00:00:00.000Z',
        mediaAddedAt: '2026-03-14T00:00:00.000Z',
        externalServiceId: 1,
        externalServiceId4k: 1,
        mediaType: 'tv',
        requests: [],
      },
      firstAirDate: new Date('2020-01-01'),
    });

    await expect(service.hasRemainingSeasonRequests(100, 1)).resolves.toBe(
      false,
    );
  });

  it('should return undefined when getShow returns undefined (communication failure)', async () => {
    jest.spyOn(service, 'getShow').mockResolvedValue(undefined);

    await expect(service.hasRemainingSeasonRequests(100, 1)).resolves.toBe(
      undefined,
    );
  });

  const requestWithTmdb = (
    id: number,
    tmdbId: number,
    createdAt = '2026-01-01',
  ): SeerrRequest =>
    ({
      id,
      type: 'movie',
      status: SeerrRequestStatus.APPROVED,
      createdAt,
      updatedAt: '2026-01-01',
      requestedBy: {} as never,
      modifiedBy: {} as never,
      is4k: false,
      serverId: 1,
      profileId: 1,
      rootFolder: '/',
      media: {
        id: tmdbId,
        tmdbId,
        tvdbId: 0,
        status: 5,
        updatedAt: '2026-01-01',
        mediaAddedAt: '2026-01-01',
      },
    }) as unknown as SeerrRequest;

  const page = (results: SeerrRequest[], pageNum: number, pages: number) => ({
    pageInfo: { page: pageNum, pages, pageSize: 100, results: pages * 100 },
    results,
  });

  describe('getRequests', () => {
    it('paginates until page === pages and accumulates all results', async () => {
      const getWithoutCache = jest
        .fn()
        .mockResolvedValueOnce(page([requestWithTmdb(1, 100)], 1, 3))
        .mockResolvedValueOnce(page([requestWithTmdb(2, 200)], 2, 3))
        .mockResolvedValueOnce(page([requestWithTmdb(3, 300)], 3, 3));
      (service as unknown as { api: unknown }).api = { getWithoutCache };

      const result = await service.getRequests();

      expect(getWithoutCache).toHaveBeenCalledTimes(3);
      expect(getWithoutCache).toHaveBeenNthCalledWith(
        1,
        '/request?take=100&skip=0&filter=all',
      );
      expect(getWithoutCache).toHaveBeenNthCalledWith(
        2,
        '/request?take=100&skip=100&filter=all',
      );
      expect(getWithoutCache).toHaveBeenNthCalledWith(
        3,
        '/request?take=100&skip=200&filter=all',
      );
      expect(result).toHaveLength(3);
    });

    it('returns [] (reachable, empty) when Seerr has no requests', async () => {
      const getWithoutCache = jest.fn().mockResolvedValue(page([], 1, 0));
      (service as unknown as { api: unknown }).api = { getWithoutCache };

      await expect(service.getRequests()).resolves.toEqual([]);
      expect(getWithoutCache).toHaveBeenCalledTimes(1);
    });

    it('returns undefined (not []) when the first page fails', async () => {
      const getWithoutCache = jest.fn().mockResolvedValue(undefined);
      (service as unknown as { api: unknown }).api = { getWithoutCache };

      await expect(service.getRequests()).resolves.toBeUndefined();
    });

    it('returns undefined when a truthy response is missing pageInfo', async () => {
      // A genuine empty result still carries pageInfo; a response object without
      // it means the sweep failed and must be treated as transient, not empty.
      const getWithoutCache = jest.fn().mockResolvedValue({ results: [] });
      (service as unknown as { api: unknown }).api = { getWithoutCache };

      await expect(service.getRequests()).resolves.toBeUndefined();
    });

    it('returns undefined when a later page fails mid-sweep', async () => {
      const getWithoutCache = jest
        .fn()
        .mockResolvedValueOnce(page([requestWithTmdb(1, 100)], 1, 3))
        .mockResolvedValueOnce(undefined);
      (service as unknown as { api: unknown }).api = { getWithoutCache };

      await expect(service.getRequests()).resolves.toBeUndefined();
    });
  });

  describe('getRequestsForMedia (run-scoped index)', () => {
    beforeEach(() => {
      cacheManager.getCache(SEERR_REQUESTS_CACHE_ID)?.data.flushAll();
    });

    it('groups the flat request list by media.tmdbId and returns copies', async () => {
      const getWithoutCache = jest
        .fn()
        .mockResolvedValue(
          page(
            [
              requestWithTmdb(1, 100),
              requestWithTmdb(2, 100),
              requestWithTmdb(3, 200),
            ],
            1,
            1,
          ),
        );
      (service as unknown as { api: unknown }).api = { getWithoutCache };

      await expect(service.getRequestsForMedia(100)).resolves.toHaveLength(2);
      await expect(service.getRequestsForMedia(200)).resolves.toHaveLength(1);
      await expect(service.getRequestsForMedia(999)).resolves.toEqual([]);
      // One sweep total - later lookups are served from the cached index.
      expect(getWithoutCache).toHaveBeenCalledTimes(1);

      // Returned values are deep copies: neither reshaping the array nor
      // mutating a request object may corrupt the cached index.
      const copy = await service.getRequestsForMedia(100);
      copy.push(requestWithTmdb(99, 100));
      copy[0].media.tmdbId = -1;
      const fresh = await service.getRequestsForMedia(100);
      expect(fresh).toHaveLength(2);
      expect(fresh[0].media.tmdbId).toBe(100);
    });

    it('returns each title oldest-first regardless of the sweep order', async () => {
      // The /request sweep is newest-first; the index must normalise to
      // createdAt-ascending so the getter's requests[0] is the oldest request.
      const getWithoutCache = jest
        .fn()
        .mockResolvedValue(
          page(
            [
              requestWithTmdb(3, 100, '2026-03-01'),
              requestWithTmdb(1, 100, '2026-01-01'),
              requestWithTmdb(2, 100, '2026-02-01'),
            ],
            1,
            1,
          ),
        );
      (service as unknown as { api: unknown }).api = { getWithoutCache };

      const requests = await service.getRequestsForMedia(100);
      expect(requests?.map((r) => r.createdAt)).toEqual([
        '2026-01-01',
        '2026-02-01',
        '2026-03-01',
      ]);
    });

    it('skips requests whose media.tmdbId is not a number', async () => {
      const noTmdb = requestWithTmdb(2, 100);
      (noTmdb.media as { tmdbId?: number }).tmdbId = undefined;
      const getWithoutCache = jest
        .fn()
        .mockResolvedValue(page([requestWithTmdb(1, 100), noTmdb], 1, 1));
      (service as unknown as { api: unknown }).api = { getWithoutCache };

      await expect(service.getRequestsForMedia(100)).resolves.toHaveLength(1);
    });

    it('builds the index once for a concurrent first batch (in-flight dedup)', async () => {
      let resolveSweep: (v: unknown) => void;
      const getWithoutCache = jest.fn().mockImplementation(
        () =>
          new Promise((res) => {
            resolveSweep = res;
          }),
      );
      (service as unknown as { api: unknown }).api = { getWithoutCache };

      const batch = Promise.all([
        service.getRequestsForMedia(100),
        service.getRequestsForMedia(200),
        service.getRequestsForMedia(300),
        service.getRequestsForMedia(400),
      ]);
      resolveSweep(page([requestWithTmdb(1, 100)], 1, 1));
      const [r100, r200] = await batch;

      // Eight concurrent items would otherwise trigger eight sweeps.
      expect(getWithoutCache).toHaveBeenCalledTimes(1);
      expect(r100).toHaveLength(1);
      expect(r200).toEqual([]);
    });

    it('returns undefined on a failed sweep and retries on the next call', async () => {
      const getWithoutCache = jest.fn().mockResolvedValueOnce(undefined);
      (service as unknown as { api: unknown }).api = { getWithoutCache };

      await expect(service.getRequestsForMedia(100)).resolves.toBeUndefined();

      // The failed sweep is not cached, so a later batch retries and recovers.
      getWithoutCache.mockResolvedValueOnce(
        page([requestWithTmdb(1, 100)], 1, 1),
      );
      await expect(service.getRequestsForMedia(100)).resolves.toHaveLength(1);
      expect(getWithoutCache).toHaveBeenCalledTimes(2);
    });
  });
});
