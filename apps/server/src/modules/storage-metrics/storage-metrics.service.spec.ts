import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Mocked, TestBed } from '@suites/unit';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { StorageMetricsService } from './storage-metrics.service';

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
  });
});
