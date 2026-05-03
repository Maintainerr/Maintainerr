import { StorageDiskspaceEntry } from '@maintainerr/contracts';
import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Mocked, TestBed } from '@suites/unit';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import {
  FREE_SPACE_BUCKET_BYTES,
  LIBRARY_SIZES_CACHE_TTL_MS,
} from './storage-metrics.constants';
import { StorageMetricsService } from './storage-metrics.service';

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

describe('StorageMetricsService', () => {
  let service: StorageMetricsService;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mediaServer: Mocked<IMediaServerService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      StorageMetricsService,
    ).compile();

    service = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    logger = unitRef.get(MaintainerrLogger);
    mediaServer = {
      isSetup: jest.fn().mockReturnValue(true),
      getLibrariesStorage: jest.fn().mockResolvedValue(new Map()),
      computeLibraryStorageSizes: jest.fn().mockResolvedValue(new Map()),
    } as unknown as Mocked<IMediaServerService>;

    mediaServerFactory.getService.mockResolvedValue(mediaServer);
  });

  describe('computeMediaServerLibrarySizes', () => {
    it('throws ServiceUnavailableException when no media server is configured', async () => {
      mediaServerFactory.getService.mockRejectedValue(
        new Error('No media server type configured'),
      );

      await expect(service.computeMediaServerLibrarySizes()).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.computeMediaServerLibrarySizes()).rejects.toThrow(
        'Configure a media server before computing library sizes.',
      );
    });

    it('does not cache failed computations', async () => {
      mediaServer.computeLibraryStorageSizes
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(new Map([['library-1', 123]]));

      await expect(service.computeMediaServerLibrarySizes()).rejects.toThrow(
        InternalServerErrorException,
      );

      await expect(service.computeMediaServerLibrarySizes()).resolves.toEqual(
        expect.objectContaining({
          sizeBytesByLibrary: { 'library-1': 123 },
        }),
      );
      expect(mediaServer.computeLibraryStorageSizes).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to compute media server library sizes',
      );
    });

    it('caches successful computations', async () => {
      mediaServer.computeLibraryStorageSizes.mockResolvedValue(
        new Map([['library-1', 456]]),
      );

      const first = await service.computeMediaServerLibrarySizes();
      const second = await service.computeMediaServerLibrarySizes();

      expect(mediaServer.computeLibraryStorageSizes).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('stores cache expiry using the shared cache TTL', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1234);
      mediaServer.computeLibraryStorageSizes.mockResolvedValue(
        new Map([['library-1', 456]]),
      );

      await service.computeMediaServerLibrarySizes();

      expect((service as any).librarySizesCache).toEqual(
        expect.objectContaining({
          expiresAt: 1234 + LIBRARY_SIZES_CACHE_TTL_MS,
        }),
      );

      nowSpy.mockRestore();
    });

    it('reuses the in-flight computation for concurrent requests', async () => {
      const serviceDeferred = createDeferred<IMediaServerService>();
      mediaServerFactory.getService.mockImplementation(
        async () => await serviceDeferred.promise,
      );
      mediaServer.computeLibraryStorageSizes.mockResolvedValue(
        new Map([['library-1', 789]]),
      );

      const first = service.computeMediaServerLibrarySizes();
      const second = service.computeMediaServerLibrarySizes();

      expect(mediaServerFactory.getService).toHaveBeenCalledTimes(1);

      serviceDeferred.resolve(mediaServer);

      await expect(first).resolves.toEqual(
        expect.objectContaining({
          sizeBytesByLibrary: { 'library-1': 789 },
        }),
      );
      await expect(second).resolves.toEqual(
        expect.objectContaining({
          sizeBytesByLibrary: { 'library-1': 789 },
        }),
      );

      expect(mediaServerFactory.getService).toHaveBeenCalledTimes(1);
      expect(mediaServer.computeLibraryStorageSizes).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildCollectionSummary', () => {
    type FakeCollection = {
      id: number;
      isActive: boolean;
      deleteAfterDays: number | null;
      type: 'movie' | 'show';
    };
    type FakeMediaRow = {
      collectionId: number;
      mediaServerId: string;
      sizeBytes: number;
    };

    const setup = (collections: FakeCollection[], rows: FakeMediaRow[]) => {
      (service as any).collectionRepo = {
        find: jest.fn().mockResolvedValue(collections),
      };

      (service as any).collectionMediaRepo = {
        createQueryBuilder: jest.fn().mockImplementation(() => {
          const ctx: { ids?: number[] } = {};
          let mode: 'group' | 'distinct' = 'group';
          const builder: any = {};
          builder.select = jest.fn().mockImplementation((expr: string) => {
            if (expr.startsWith('DISTINCT')) mode = 'distinct';
            return builder;
          });
          builder.addSelect = jest.fn().mockReturnValue(builder);
          builder.innerJoin = jest.fn().mockReturnValue(builder);
          builder.where = jest
            .fn()
            .mockImplementation((_: string, params: { ids: number[] }) => {
              ctx.ids = params.ids;
              return builder;
            });
          builder.andWhere = jest.fn().mockReturnValue(builder);
          builder.groupBy = jest.fn().mockReturnValue(builder);
          builder.addGroupBy = jest.fn().mockReturnValue(builder);
          builder.getRawMany = jest.fn().mockImplementation(async () => {
            const eligible = rows.filter(
              (r) => ctx.ids?.includes(r.collectionId) && r.sizeBytes != null,
            );
            if (mode === 'distinct') {
              const seen = new Set<number>();
              const out: { collectionId: number }[] = [];
              for (const r of eligible) {
                if (!seen.has(r.collectionId)) {
                  seen.add(r.collectionId);
                  out.push({ collectionId: r.collectionId });
                }
              }
              return out;
            }
            const groups = new Map<
              string,
              { mediaServerId: string; type: string; sizeBytes: number }
            >();
            for (const r of eligible) {
              const c = collections.find((cc) => cc.id === r.collectionId);
              if (!c) continue;
              const key = `${r.mediaServerId}|${c.type}`;
              const prev = groups.get(key);
              if (!prev || r.sizeBytes > prev.sizeBytes) {
                groups.set(key, {
                  mediaServerId: r.mediaServerId,
                  type: c.type,
                  sizeBytes: r.sizeBytes,
                });
              }
            }
            return Array.from(groups.values());
          });
          return builder;
        }),
      };
    };

    it('counts an item once even when it appears in multiple delete-rule collections', async () => {
      setup(
        [
          { id: 1, isActive: true, deleteAfterDays: 30, type: 'movie' },
          { id: 2, isActive: true, deleteAfterDays: 60, type: 'movie' },
        ],
        [
          { collectionId: 1, mediaServerId: 'm-shared', sizeBytes: 100 },
          { collectionId: 2, mediaServerId: 'm-shared', sizeBytes: 100 },
          { collectionId: 1, mediaServerId: 'm-only-1', sizeBytes: 50 },
        ],
      );

      const summary = await (service as any).buildCollectionSummary();

      expect(summary.activeSizeBytes).toBe(150);
      expect(summary.movieSizeBytes).toBe(150);
      expect(summary.activeCount).toBe(2);
      expect(summary.activeSizedCount).toBe(2);
    });

    it('excludes collections without a delete rule', async () => {
      setup(
        [
          { id: 1, isActive: true, deleteAfterDays: 30, type: 'movie' },
          { id: 2, isActive: true, deleteAfterDays: null, type: 'movie' },
          { id: 3, isActive: true, deleteAfterDays: 0, type: 'movie' },
        ],
        [
          { collectionId: 1, mediaServerId: 'a', sizeBytes: 100 },
          { collectionId: 2, mediaServerId: 'b', sizeBytes: 200 },
          { collectionId: 3, mediaServerId: 'c', sizeBytes: 400 },
        ],
      );

      const summary = await (service as any).buildCollectionSummary();

      expect(summary.activeSizeBytes).toBe(100);
      expect(summary.activeCount).toBe(3);
      expect(summary.activeSizedCount).toBe(1);
    });

    it('excludes inactive collections even when they have a delete rule', async () => {
      setup(
        [
          { id: 1, isActive: false, deleteAfterDays: 30, type: 'movie' },
          { id: 2, isActive: true, deleteAfterDays: 30, type: 'show' },
        ],
        [
          { collectionId: 1, mediaServerId: 'a', sizeBytes: 999 },
          { collectionId: 2, mediaServerId: 'b', sizeBytes: 100 },
        ],
      );

      const summary = await (service as any).buildCollectionSummary();

      expect(summary.activeSizeBytes).toBe(100);
      expect(summary.showSizeBytes).toBe(100);
      expect(summary.movieSizeBytes).toBe(0);
      expect(summary.inactiveCount).toBe(1);
      expect(summary.activeCount).toBe(1);
    });

    it('returns zeros when no collection is eligible', async () => {
      setup(
        [{ id: 1, isActive: true, deleteAfterDays: null, type: 'movie' }],
        [{ collectionId: 1, mediaServerId: 'a', sizeBytes: 100 }],
      );

      const summary = await (service as any).buildCollectionSummary();

      expect(summary.activeSizeBytes).toBe(0);
      expect(summary.activeSizedCount).toBe(0);
      expect(summary.totalCollectionCount).toBe(1);
      expect(summary.reclaimableUsingFallback).toBe(false);
    });

    it('falls back to cached collection totals when per-item sizes are missing', async () => {
      setup(
        [
          {
            id: 1,
            isActive: true,
            deleteAfterDays: 30,
            type: 'movie',
            totalSizeBytes: 300,
          } as any,
          {
            id: 2,
            isActive: true,
            deleteAfterDays: 30,
            type: 'show',
            totalSizeBytes: 700,
          } as any,
        ],
        [],
      );

      const summary = await (service as any).buildCollectionSummary();

      expect(summary.reclaimableUsingFallback).toBe(true);
      expect(summary.activeSizeBytes).toBe(1000);
      expect(summary.movieSizeBytes).toBe(300);
      expect(summary.showSizeBytes).toBe(700);
      expect(summary.activeSizedCount).toBe(2);
    });
  });

  describe('buildCleanupTotals', () => {
    it('keeps movie, show, season, and episode totals separate and tallies reclaimed bytes', async () => {
      const getRawMany = jest.fn().mockResolvedValue([
        { type: 'movie', handled: '3', bytes: '300' },
        { type: 'show', handled: '4', bytes: 400 },
        { type: 'season', handled: 5, bytes: '500' },
        { type: 'episode', handled: '6', bytes: 600 },
      ]);
      // Self-chaining proxy: any query-builder method (select, addSelect,
      // groupBy, where, orderBy, …) returns the same builder, so the test
      // does not break when buildCleanupTotals adds more chained calls.
      const queryBuilder: any = new Proxy(
        { getRawMany },
        {
          get(target, prop) {
            if (prop in target) return target[prop as keyof typeof target];
            return jest.fn().mockReturnValue(queryBuilder);
          },
        },
      );

      (service as any).collectionRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      };

      await expect((service as any).buildCleanupTotals()).resolves.toEqual({
        itemsHandled: 18,
        moviesHandled: 3,
        showsHandled: 4,
        seasonsHandled: 5,
        episodesHandled: 6,
        bytesHandled: 1800,
        movieBytesHandled: 300,
        showBytesHandled: 400,
        seasonBytesHandled: 500,
        episodeBytesHandled: 600,
      });
    });
  });

  describe('computeTotals', () => {
    type MountInput = Partial<StorageDiskspaceEntry> & {
      instanceType: 'radarr' | 'sonarr';
      instanceId: number;
      path: string;
      totalSpace: number;
      freeSpace: number;
    };

    const mount = (m: MountInput): StorageDiskspaceEntry => ({
      instanceName: `${m.instanceType}-${m.instanceId}`,
      label: '',
      hasAccurateTotalSpace: true,
      ...m,
    });

    const compute = (
      mounts: StorageDiskspaceEntry[],
      rootFolders: Record<string, string[]> = {},
      hosts: Record<string, string> = {},
    ) =>
      (service as any).computeTotals(
        mounts,
        new Map(Object.entries(rootFolders).map(([k, v]) => [k, new Set(v)])),
        new Map(Object.entries(hosts)),
      );

    it('counts only root-folder-backed mounts and merges shared filesystems on the same host', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/',
            freeSpace: 50,
            totalSpace: 100,
          }),
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/movies',
            freeSpace: 180,
            totalSpace: 200,
          }),
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/downloads',
            freeSpace: 180,
            totalSpace: 200,
          }),
          mount({
            instanceType: 'sonarr',
            instanceId: 1,
            path: '/tv',
            freeSpace: 180,
            totalSpace: 200,
          }),
        ],
        { 'radarr||1': ['/movies'], 'sonarr||1': ['/tv'] },
        { 'radarr||1': 'arr.local', 'sonarr||1': 'arr.local' },
      );

      expect(totals).toEqual({
        freeSpace: 180,
        totalSpace: 200,
        usedSpace: 20,
        mountCount: 1,
        accurateMountCount: 1,
        accurateTotalSpace: true,
      });
    });

    it('keys root folders by instance type so overlapping ids do not collide', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/movies',
            freeSpace: 180,
            totalSpace: 200,
          }),
          mount({
            instanceType: 'sonarr',
            instanceId: 1,
            path: '/tv',
            freeSpace: 80,
            totalSpace: 100,
          }),
        ],
        { 'radarr||1': ['/movies'], 'sonarr||1': ['/tv'] },
        { 'radarr||1': 'radarr.local', 'sonarr||1': 'sonarr.local' },
      );

      expect(totals.totalSpace).toBe(300);
      expect(totals.mountCount).toBe(2);
    });

    it('does not merge identical capacities across different hosts', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/movies',
            freeSpace: 180,
            totalSpace: 200,
          }),
          mount({
            instanceType: 'sonarr',
            instanceId: 1,
            path: '/tv',
            freeSpace: 180,
            totalSpace: 200,
          }),
        ],
        { 'radarr||1': ['/movies'], 'sonarr||1': ['/tv'] },
        { 'radarr||1': 'radarr-a.local', 'sonarr||1': 'sonarr-b.local' },
      );

      expect(totals.totalSpace).toBe(400);
      expect(totals.mountCount).toBe(2);
    });

    it('merges shared filesystems even when freeSpace drifts between back-to-back queries', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/movies',
            freeSpace: 30 * FREE_SPACE_BUCKET_BYTES,
            totalSpace: 200,
          }),
          mount({
            instanceType: 'sonarr',
            instanceId: 1,
            path: '/tv',
            freeSpace: 30 * FREE_SPACE_BUCKET_BYTES + 512,
            totalSpace: 200,
          }),
        ],
        { 'radarr||1': ['/movies'], 'sonarr||1': ['/tv'] },
        { 'radarr||1': 'arr.local', 'sonarr||1': 'arr.local' },
      );

      expect(totals.mountCount).toBe(1);
      expect(totals.totalSpace).toBe(200);
    });

    it('keeps distinct same-capacity filesystems separate when usage differs materially', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/movies',
            freeSpace: 30 * FREE_SPACE_BUCKET_BYTES,
            totalSpace: 200,
          }),
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/archive',
            freeSpace: 28 * FREE_SPACE_BUCKET_BYTES,
            totalSpace: 200,
          }),
        ],
        { 'radarr||1': ['/movies', '/archive'] },
        { 'radarr||1': 'arr.local' },
      );

      expect(totals.mountCount).toBe(2);
      expect(totals.totalSpace).toBe(400);
    });

    it('falls back to path-based dedupe for mounts without accurate totals', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'sonarr',
            instanceId: 1,
            path: '/tv',
            freeSpace: 180,
            totalSpace: 0,
            hasAccurateTotalSpace: false,
          }),
          mount({
            instanceType: 'sonarr',
            instanceId: 1,
            path: '/tv/',
            freeSpace: 180,
            totalSpace: 0,
            hasAccurateTotalSpace: false,
          }),
        ],
        { 'sonarr||1': ['/tv'] },
        { 'sonarr||1': 'arr.local' },
      );

      expect(totals.mountCount).toBe(1);
      expect(totals.accurateMountCount).toBe(0);
      expect(totals.accurateTotalSpace).toBe(false);
      expect(totals.freeSpace).toBe(180);
    });

    it('aggregates freeSpace from /rootfolder-supplemented mounts even without accurate totals', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'sonarr',
            instanceId: 1,
            path: '/tv',
            freeSpace: 500,
            totalSpace: 0,
            hasAccurateTotalSpace: false,
          }),
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/movies',
            freeSpace: 300,
            totalSpace: 0,
            hasAccurateTotalSpace: false,
          }),
        ],
        { 'sonarr||1': ['/tv'], 'radarr||1': ['/movies'] },
        { 'sonarr||1': 'sonarr.local', 'radarr||1': 'radarr.local' },
      );

      expect(totals.freeSpace).toBe(800);
      expect(totals.totalSpace).toBe(0);
      expect(totals.accurateMountCount).toBe(0);
      expect(totals.mountCount).toBe(2);
      expect(totals.accurateTotalSpace).toBe(false);
    });

    it('credits an accurate ancestor /diskspace mount for a deeper root folder', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'sonarr',
            instanceId: 1,
            path: '/',
            freeSpace: 300,
            totalSpace: 500,
          }),
          mount({
            instanceType: 'sonarr',
            instanceId: 1,
            path: '/tv',
            freeSpace: 280,
            totalSpace: 0,
            hasAccurateTotalSpace: false,
          }),
        ],
        { 'sonarr||1': ['/tv'] },
        { 'sonarr||1': 'arr.local' },
      );

      expect(totals.totalSpace).toBe(500);
      expect(totals.freeSpace).toBe(300);
      expect(totals.accurateMountCount).toBe(1);
      expect(totals.mountCount).toBe(1);
    });

    it('prefers the longest-prefix accurate ancestor when multiple are candidates', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/',
            freeSpace: 100,
            totalSpace: 200,
          }),
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/data',
            freeSpace: 900,
            totalSpace: 1000,
          }),
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/data/movies',
            freeSpace: 850,
            totalSpace: 0,
            hasAccurateTotalSpace: false,
          }),
        ],
        { 'radarr||1': ['/data/movies'] },
        { 'radarr||1': 'arr.local' },
      );

      expect(totals.totalSpace).toBe(1000);
      expect(totals.freeSpace).toBe(900);
      expect(totals.mountCount).toBe(1);
    });

    it('counts a shared accurate ancestor once across multiple root folders', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/data',
            freeSpace: 900,
            totalSpace: 1000,
          }),
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/data/movies',
            freeSpace: 850,
            totalSpace: 0,
            hasAccurateTotalSpace: false,
          }),
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/data/shows',
            freeSpace: 850,
            totalSpace: 0,
            hasAccurateTotalSpace: false,
          }),
        ],
        { 'radarr||1': ['/data/movies', '/data/shows'] },
        { 'radarr||1': 'arr.local' },
      );

      expect(totals.totalSpace).toBe(1000);
      expect(totals.mountCount).toBe(1);
    });

    it('falls back to the synthesized root-folder mount when no ancestor exists', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'sonarr',
            instanceId: 1,
            path: '/tv',
            freeSpace: 400,
            totalSpace: 0,
            hasAccurateTotalSpace: false,
          }),
        ],
        { 'sonarr||1': ['/tv'] },
        { 'sonarr||1': 'arr.local' },
      );

      expect(totals.freeSpace).toBe(400);
      expect(totals.totalSpace).toBe(0);
      expect(totals.mountCount).toBe(1);
    });

    it('counts every mount when no root folders are reported for the instance', () => {
      const totals = compute(
        [
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/movies',
            freeSpace: 180,
            totalSpace: 200,
          }),
          mount({
            instanceType: 'radarr',
            instanceId: 1,
            path: '/extras',
            freeSpace: 80,
            totalSpace: 100,
          }),
        ],
        {},
        { 'radarr||1': 'arr.local' },
      );

      expect(totals.mountCount).toBe(2);
      expect(totals.totalSpace).toBe(300);
    });
  });
});
