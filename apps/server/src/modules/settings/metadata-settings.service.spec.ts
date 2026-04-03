import { MediaServerType } from '@maintainerr/contracts';
import { TestBed, type Mocked } from '@suites/unit';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { Cache } from '../api/lib/cache';
import { MEDIA_SERVER_BATCH_SIZE } from '../api/media-server/media-server.constants';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { TmdbApiService } from '../api/tmdb-api/tmdb.service';
import { TvdbApiService } from '../api/tvdb-api/tvdb.service';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataProvider } from './metadata-provider';
import { MetadataSettingsService } from './metadata-settings.service';

type QueryBuilderResult = {
  select: jest.MockedFunction<
    (selection: string, alias: string) => QueryBuilderResult
  >;
  where: jest.MockedFunction<(condition: string) => QueryBuilderResult>;
  andWhere: jest.MockedFunction<(condition: string) => QueryBuilderResult>;
  getRawMany: jest.MockedFunction<
    () => Promise<Array<{ mediaServerId: string }>>
  >;
};

describe('MetadataSettingsService', () => {
  let service: MetadataSettingsService;
  let collectionMediaRepo: Mocked<Repository<CollectionMedia>>;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let tmdbApi: Mocked<TmdbApiService>;
  let tvdbApi: Mocked<TvdbApiService>;
  let logger: Mocked<MaintainerrLogger>;

  const createQueryBuilder = (
    rows: Array<{ mediaServerId: string }>,
  ): QueryBuilderResult => {
    const queryBuilder = {
      select: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    } as QueryBuilderResult;

    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);

    return queryBuilder;
  };

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      MetadataSettingsService,
    ).compile();

    service = unit;
    collectionMediaRepo = unitRef.get('CollectionMediaRepository');
    mediaServerFactory = unitRef.get(MediaServerFactory);
    tmdbApi = unitRef.get(TmdbApiService);
    tvdbApi = unitRef.get(TvdbApiService);
    unitRef.get('SettingsRepository');
    unitRef.get(EventEmitter2);
    logger = unitRef.get(MaintainerrLogger);
  });

  it('prevents overlapping metadata refresh runs', async () => {
    const flush = jest.spyOn(Cache.prototype, 'flush').mockImplementation();
    const refreshMediaServerItems = jest
      .spyOn(service as any, 'refreshMediaServerItems')
      .mockImplementation(() => new Promise<void>(() => undefined));

    tmdbApi.testConnection.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Success',
    });

    const firstResponse = await service.refreshMetadataCache(
      MetadataProvider.TMDB,
    );
    const secondResponse = await service.refreshMetadataCache(
      MetadataProvider.TVDB,
    );

    expect(firstResponse).toEqual({
      status: 'OK',
      code: 1,
      message: 'TMDB metadata refresh started',
    });
    expect(secondResponse).toEqual({
      status: 'OK',
      code: 1,
      message: 'TMDB metadata refresh is already in progress',
    });
    expect(refreshMediaServerItems).toHaveBeenCalledWith(
      MetadataProvider.TMDB,
      {
        retryFailedItemsWithMetadataLookup: true,
      },
    );
    expect(tvdbApi.testConnection).not.toHaveBeenCalled();
    expect(flush).toHaveBeenCalledTimes(1);

    refreshMediaServerItems.mockRestore();
    flush.mockRestore();
  });

  it('refreshes media-server items in configured batches', async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      mediaServerId: String(index + 1),
    }));
    const queryBuilder = createQueryBuilder(rows);
    let inFlightCount = 0;
    let maxInFlightCount = 0;

    const refreshItemMetadata = jest.fn(async () => {
      inFlightCount += 1;
      maxInFlightCount = Math.max(maxInFlightCount, inFlightCount);

      await new Promise<void>((resolve) => {
        setImmediate(() => {
          inFlightCount -= 1;
          resolve();
        });
      });
    });

    collectionMediaRepo.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );
    mediaServerFactory.getService.mockResolvedValue({
      isSetup: jest.fn().mockReturnValue(true),
      getServerType: jest.fn().mockReturnValue(MediaServerType.PLEX),
      refreshItemMetadata,
    } as never);

    await (service as any).refreshMediaServerItems(MetadataProvider.TMDB);

    expect(refreshItemMetadata).toHaveBeenCalledTimes(25);
    expect(maxInFlightCount).toBeLessThanOrEqual(
      MEDIA_SERVER_BATCH_SIZE.METADATA_REFRESH,
    );
  });

  it('skips unrecognized Jellyfin refresh ids before queuing metadata refreshes', async () => {
    const validJellyfinId = 'a852a27afe324084ae66db579ee3ee18';
    const queryBuilder = createQueryBuilder([
      { mediaServerId: validJellyfinId },
      { mediaServerId: '123' },
      { mediaServerId: '   ' },
      { mediaServerId: '00000000-0000-0000-0000-000000000000' },
      { mediaServerId: '00000000000000000000000000000000' },
    ]);
    const refreshItemMetadata = jest.fn().mockResolvedValue(undefined);

    collectionMediaRepo.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );
    mediaServerFactory.getService.mockResolvedValue({
      isSetup: jest.fn().mockReturnValue(true),
      getServerType: jest.fn().mockReturnValue(MediaServerType.JELLYFIN),
      refreshItemMetadata,
    } as never);

    await (service as any).refreshMediaServerItems(MetadataProvider.TMDB);

    expect(refreshItemMetadata).toHaveBeenCalledTimes(1);
    expect(refreshItemMetadata).toHaveBeenCalledWith(validJellyfinId);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not recognized for jellyfin'),
    );
  });

  it('skips likely Jellyfin ids before queuing Plex metadata refreshes', async () => {
    const queryBuilder = createQueryBuilder([
      { mediaServerId: '12345' },
      { mediaServerId: 'a852a27afe324084ae66db579ee3ee18' },
      { mediaServerId: 'e9b2dcaa-529c-426e-9433-5e9981f27f2e' },
    ]);
    const refreshItemMetadata = jest.fn().mockResolvedValue(undefined);

    collectionMediaRepo.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );
    mediaServerFactory.getService.mockResolvedValue({
      isSetup: jest.fn().mockReturnValue(true),
      getServerType: jest.fn().mockReturnValue(MediaServerType.PLEX),
      refreshItemMetadata,
    } as never);

    await (service as any).refreshMediaServerItems(MetadataProvider.TMDB);

    expect(refreshItemMetadata).toHaveBeenCalledTimes(1);
    expect(refreshItemMetadata).toHaveBeenCalledWith('12345');
  });

  it('does not verify failed items when retry lookup mode is explicitly disabled', async () => {
    const queryBuilder = createQueryBuilder([{ mediaServerId: '12345' }]);
    const refreshItemMetadata = jest
      .fn()
      .mockRejectedValue(new Error('refresh failed'));
    const getMetadata = jest.fn().mockResolvedValue({ id: '12345' });

    collectionMediaRepo.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );
    mediaServerFactory.getService.mockResolvedValue({
      isSetup: jest.fn().mockReturnValue(true),
      getServerType: jest.fn().mockReturnValue(MediaServerType.PLEX),
      refreshItemMetadata,
      getMetadata,
    } as never);

    await (service as any).refreshMediaServerItems(MetadataProvider.TMDB, {
      retryFailedItemsWithMetadataLookup: false,
    });

    expect(refreshItemMetadata).toHaveBeenCalledTimes(1);
    expect(getMetadata).not.toHaveBeenCalled();
  });

  it('verifies and retries failed items for manual metadata refreshes', async () => {
    const queryBuilder = createQueryBuilder([{ mediaServerId: '12345' }]);
    const refreshItemMetadata = jest
      .fn()
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce(undefined);
    const getMetadata = jest.fn().mockResolvedValue({ id: '12345' });

    collectionMediaRepo.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );
    mediaServerFactory.getService.mockResolvedValue({
      isSetup: jest.fn().mockReturnValue(true),
      getServerType: jest.fn().mockReturnValue(MediaServerType.PLEX),
      refreshItemMetadata,
      getMetadata,
    } as never);

    await (service as any).refreshMediaServerItems(MetadataProvider.TMDB, {
      retryFailedItemsWithMetadataLookup: true,
    });

    expect(refreshItemMetadata).toHaveBeenCalledTimes(2);
    expect(getMetadata).toHaveBeenCalledWith('12345');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Retrying plex metadata refresh for item 12345'),
    );
  });

  it('retries with the corrected id when lookup returns a different id', async () => {
    const queryBuilder = createQueryBuilder([{ mediaServerId: 'stale-id' }]);
    const refreshItemMetadata = jest
      .fn()
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce(undefined);
    const getMetadata = jest.fn().mockResolvedValue({ id: 'correct-id' });

    collectionMediaRepo.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );
    mediaServerFactory.getService.mockResolvedValue({
      isSetup: jest.fn().mockReturnValue(true),
      getServerType: jest.fn().mockReturnValue(MediaServerType.JELLYFIN),
      refreshItemMetadata,
      getMetadata,
    } as never);

    await (service as any).refreshMediaServerItems(MetadataProvider.TMDB, {
      retryFailedItemsWithMetadataLookup: true,
    });

    expect(refreshItemMetadata).toHaveBeenNthCalledWith(1, 'stale-id');
    expect(refreshItemMetadata).toHaveBeenNthCalledWith(2, 'correct-id');
    expect(getMetadata).toHaveBeenCalledWith('stale-id');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'verified item id correct-id after failure on stale-id',
      ),
    );
  });

  it('does not retry when item lookup throws after a failed manual refresh', async () => {
    const mediaServerId = 'a852a27afe324084ae66db579ee3ee18';
    const queryBuilder = createQueryBuilder([{ mediaServerId }]);
    const refreshItemMetadata = jest
      .fn()
      .mockRejectedValue(new Error('refresh failed'));
    const getMetadata = jest.fn().mockRejectedValue(new Error('lookup failed'));

    collectionMediaRepo.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );
    mediaServerFactory.getService.mockResolvedValue({
      isSetup: jest.fn().mockReturnValue(true),
      getServerType: jest.fn().mockReturnValue(MediaServerType.JELLYFIN),
      refreshItemMetadata,
      getMetadata,
    } as never);

    await (service as any).refreshMediaServerItems(MetadataProvider.TMDB, {
      retryFailedItemsWithMetadataLookup: true,
    });

    expect(refreshItemMetadata).toHaveBeenCalledTimes(1);
    expect(getMetadata).toHaveBeenCalledWith(mediaServerId);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `Failed to verify jellyfin item ${mediaServerId}`,
      ),
    );
  });

  it('does not retry when lookup returns a blank id after a failed manual refresh', async () => {
    const mediaServerId = 'e9b2dcaa-529c-426e-9433-5e9981f27f2e';
    const queryBuilder = createQueryBuilder([{ mediaServerId }]);
    const refreshItemMetadata = jest
      .fn()
      .mockRejectedValue(new Error('refresh failed'));
    const getMetadata = jest.fn().mockResolvedValue({ id: '   ' });

    collectionMediaRepo.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );
    mediaServerFactory.getService.mockResolvedValue({
      isSetup: jest.fn().mockReturnValue(true),
      getServerType: jest.fn().mockReturnValue(MediaServerType.JELLYFIN),
      refreshItemMetadata,
      getMetadata,
    } as never);

    await (service as any).refreshMediaServerItems(MetadataProvider.TMDB, {
      retryFailedItemsWithMetadataLookup: true,
    });

    expect(refreshItemMetadata).toHaveBeenCalledTimes(1);
    expect(getMetadata).toHaveBeenCalledWith(mediaServerId);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('did not return a usable id'),
    );
  });

  it('logs and surfaces the final failure when the retry also rejects', async () => {
    const queryBuilder = createQueryBuilder([{ mediaServerId: '12345' }]);
    const refreshItemMetadata = jest
      .fn()
      .mockRejectedValueOnce(new Error('initial refresh failed'))
      .mockRejectedValueOnce(new Error('retry refresh failed'));
    const getMetadata = jest.fn().mockResolvedValue({ id: '12345' });

    collectionMediaRepo.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );
    mediaServerFactory.getService.mockResolvedValue({
      isSetup: jest.fn().mockReturnValue(true),
      getServerType: jest.fn().mockReturnValue(MediaServerType.PLEX),
      refreshItemMetadata,
      getMetadata,
    } as never);

    await (service as any).refreshMediaServerItems(MetadataProvider.TMDB, {
      retryFailedItemsWithMetadataLookup: true,
    });

    expect(refreshItemMetadata).toHaveBeenCalledTimes(2);
    expect(getMetadata).toHaveBeenCalledWith('12345');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Retried plex metadata refresh failed for item 12345',
      ),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      '1 item(s) could not be refreshed',
    );
  });
});
