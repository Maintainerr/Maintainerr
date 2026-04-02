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

  const createQueryBuilder = (
    rows: Array<{ mediaServerId: string }>,
  ): QueryBuilderResult => {
    const queryBuilder = {
      select: jest.fn(),
      where: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    } as QueryBuilderResult;

    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);

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
    unitRef.get(MaintainerrLogger);
  });

  it('prevents overlapping metadata refresh runs', async () => {
    const flush = jest.spyOn(Cache.prototype, 'flush').mockImplementation();
    const queryBuilder = {
      select: jest.fn(),
      where: jest.fn(),
      getRawMany: jest.fn(
        () => new Promise<Array<{ mediaServerId: string }>>(() => undefined),
      ),
    } as QueryBuilderResult;

    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);

    tmdbApi.testConnection.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Success',
    });
    collectionMediaRepo.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );
    mediaServerFactory.getService.mockResolvedValue({
      isSetup: jest.fn().mockReturnValue(true),
      refreshItemMetadata: jest.fn(),
    } as never);

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
    expect(tvdbApi.testConnection).not.toHaveBeenCalled();
    expect(flush).toHaveBeenCalledTimes(1);

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
      refreshItemMetadata,
    } as never);

    await (service as any).refreshMediaServerItems(MetadataProvider.TMDB);

    expect(refreshItemMetadata).toHaveBeenCalledTimes(25);
    expect(maxInFlightCount).toBeLessThanOrEqual(
      MEDIA_SERVER_BATCH_SIZE.METADATA_REFRESH,
    );
  });
});
