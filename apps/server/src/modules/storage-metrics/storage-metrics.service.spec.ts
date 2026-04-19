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
