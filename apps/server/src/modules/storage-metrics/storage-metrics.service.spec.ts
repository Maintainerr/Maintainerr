import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Mocked, TestBed } from '@suites/unit';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { MaintainerrLogger } from '../logging/logs.service';
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
    it('prefers root folder mounts and avoids double-counting the same filesystem', () => {
      const mounts = [
        {
          instanceId: 1,
          instanceType: 'radarr',
          instanceName: 'Radarr',
          path: '/',
          label: '',
          freeSpace: 50,
          totalSpace: 100,
          hasAccurateTotalSpace: true,
        },
        {
          instanceId: 1,
          instanceType: 'radarr',
          instanceName: 'Radarr',
          path: '/movies',
          label: '',
          freeSpace: 180,
          totalSpace: 200,
          hasAccurateTotalSpace: true,
        },
        {
          instanceId: 1,
          instanceType: 'radarr',
          instanceName: 'Radarr',
          path: '/downloads',
          label: '',
          freeSpace: 180,
          totalSpace: 200,
          hasAccurateTotalSpace: true,
        },
        {
          instanceId: 1,
          instanceType: 'sonarr',
          instanceName: 'Sonarr',
          path: '/tv',
          label: '',
          freeSpace: 180,
          totalSpace: 200,
          hasAccurateTotalSpace: true,
        },
      ];

      const totals = (service as any).computeTotals(
        mounts,
        new Map([
          ['radarr||1', new Set(['/movies'])],
          ['sonarr||1', new Set(['/tv'])],
        ]),
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

    it('uses instance type when mapping root folders for overlapping instance ids', () => {
      const mounts = [
        {
          instanceId: 1,
          instanceType: 'radarr',
          instanceName: 'Radarr',
          path: '/movies',
          label: '',
          freeSpace: 180,
          totalSpace: 200,
          hasAccurateTotalSpace: true,
        },
        {
          instanceId: 1,
          instanceType: 'sonarr',
          instanceName: 'Sonarr',
          path: '/tv',
          label: '',
          freeSpace: 80,
          totalSpace: 100,
          hasAccurateTotalSpace: true,
        },
      ];

      const totals = (service as any).computeTotals(
        mounts,
        new Map([
          ['radarr||1', new Set(['/movies'])],
          ['sonarr||1', new Set(['/tv'])],
        ]),
      );

      expect(totals).toEqual({
        freeSpace: 260,
        totalSpace: 300,
        usedSpace: 40,
        mountCount: 2,
        accurateMountCount: 2,
        accurateTotalSpace: true,
      });
    });
  });
});
