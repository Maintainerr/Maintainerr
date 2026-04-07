import { MediaItem, MediaItemType } from '@maintainerr/contracts';
import { Mocked } from '@suites/doubles.jest';
import { TestBed } from '@suites/unit';
import {
  createCollection,
  createCollectionMediaWithMetadata,
  createSonarrSeries,
} from '../../../test/utils/data';
import {
  mockSonarrApi,
  validateNoSonarrActionsTaken,
} from '../../../test/utils/servarr-mock';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';
import { SonarrActionHandler } from './sonarr-action-handler';

describe('SonarrActionHandler', () => {
  let sonarrActionHandler: SonarrActionHandler;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mediaServer: Mocked<IMediaServerService>;
  let servarrService: Mocked<ServarrService>;
  let seerrApi: Mocked<SeerrApiService>;
  let metadataService: Mocked<MetadataService>;
  let mediaIdFinder: {
    findTvdbId: jest.Mock<Promise<number | undefined>, []>;
  };
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(SonarrActionHandler).compile();

    sonarrActionHandler = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    servarrService = unitRef.get(ServarrService);
    seerrApi = unitRef.get(SeerrApiService);
    metadataService = unitRef.get(MetadataService);
    logger = unitRef.get(MaintainerrLogger);

    mediaIdFinder = {
      findTvdbId: jest.fn(),
    };

    metadataService.resolveIds.mockImplementation(async () => {
      const tvdbId = await mediaIdFinder.findTvdbId();

      if (tvdbId === undefined) {
        return undefined;
      }

      return { tmdb: 1, tvdb: tvdbId, type: 'tv' } as any;
    });

    metadataService.buildServarrLookupCandidates.mockImplementation((ids) => {
      const candidates = [] as Array<{
        providerKey: 'tmdb' | 'tvdb';
        id: number;
      }>;

      if (ids.tmdb) {
        candidates.push({ providerKey: 'tmdb', id: ids.tmdb });
      }

      if (ids.tvdb) {
        candidates.push({ providerKey: 'tvdb', id: ids.tvdb });
      }

      return candidates;
    });

    // Setup media server mock
    mediaServer = {
      getMetadata: jest.fn(),
      deleteFromDisk: jest.fn(),
    } as unknown as Mocked<IMediaServerService>;
    mediaServerFactory.getService.mockResolvedValue(mediaServer);
    seerrApi.isConfigured.mockReturnValue(true);
    seerrApi.hasRemainingSeasonRequests.mockResolvedValue(undefined);
  });

  // Helper to setup media server mock for each test
  const mockMediaServerMetadata = (mediaData: MediaItem) => {
    mediaServer.getMetadata.mockResolvedValue(mediaData);
  };

  it.each([
    { type: 'season', title: 'SEASONS' },
    {
      type: 'show',
      title: 'SHOWS',
    },
    {
      type: 'episode',
      title: 'EPISODES',
    },
  ])(
    'should do nothing for $title when Show tmdbid failed lookup',
    async ({ type }: { type: string }) => {
      const collection = createCollection({
        arrAction: ServarrAction.DELETE,
        sonarrSettingsId: 1,
        type: type as MediaItemType,
      });
      const collectionMedia = createCollectionMediaWithMetadata(collection, {
        tmdbId: undefined,
      });

      mockMediaServerMetadata(collectionMedia.mediaData);

      const mockedSonarrApi = mockSonarrApi(servarrService, logger);
      jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId');

      mediaIdFinder.findTvdbId.mockResolvedValue(undefined);

      await sonarrActionHandler.handleAction(collection, collectionMedia);

      expect(mockedSonarrApi.getSeriesByTvdbId).not.toHaveBeenCalled();
      expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
      expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
      validateNoSonarrActionsTaken(mockedSonarrApi);
    },
  );

  it.each([
    { type: 'season', title: 'SEASONS' },
    {
      type: 'show',
      title: 'SHOWS',
    },
    {
      type: 'episode',
      title: 'EPISODES',
    },
  ])(
    'should do nothing for $title if not found in Sonarr and action is UNMONITOR',
    async ({ type }: { type: string }) => {
      const collection = createCollection({
        arrAction: ServarrAction.UNMONITOR,
        sonarrSettingsId: 1,
        type: type as MediaItemType,
      });
      const collectionMedia = createCollectionMediaWithMetadata(collection, {
        tmdbId: 1,
      });

      mockMediaServerMetadata(collectionMedia.mediaData);

      const mockedSonarrApi = mockSonarrApi(servarrService, logger);
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue(undefined);

      mediaIdFinder.findTvdbId.mockResolvedValue(1);

      await sonarrActionHandler.handleAction(collection, collectionMedia);

      expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
      expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
      expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
      validateNoSonarrActionsTaken(mockedSonarrApi);
    },
  );

  it.each([
    {
      type: 'season',
      title: 'SEASONS',
      action: ServarrAction.DELETE,
    },
    {
      type: 'season',
      title: 'SEASONS',
      action: ServarrAction.UNMONITOR_DELETE_ALL,
    },
    {
      type: 'season',
      title: 'SEASONS',
      action: ServarrAction.UNMONITOR_DELETE_EXISTING,
    },
    {
      type: 'show',
      title: 'SHOWS',
      action: ServarrAction.DELETE,
    },
    {
      type: 'show',
      title: 'SHOWS',
      action: ServarrAction.UNMONITOR_DELETE_ALL,
    },
    {
      type: 'show',
      title: 'SHOWS',
      action: ServarrAction.UNMONITOR_DELETE_EXISTING,
    },
    {
      type: 'episode',
      title: 'EPISODES',
      action: ServarrAction.DELETE,
    },
    {
      type: 'episode',
      title: 'EPISODES',
      action: ServarrAction.UNMONITOR_DELETE_ALL,
    },
    {
      type: 'episode',
      title: 'EPISODES',
      action: ServarrAction.UNMONITOR_DELETE_EXISTING,
    },
  ])(
    'should delete $title in Plex if not found in Sonarr and action is $action',
    async ({ type, action }: { type: string; action: ServarrAction }) => {
      const collection = createCollection({
        arrAction: action,
        sonarrSettingsId: 1,
        type: type as MediaItemType,
      });
      const collectionMedia = createCollectionMediaWithMetadata(collection, {
        tmdbId: 1,
      });

      mockMediaServerMetadata(collectionMedia.mediaData);

      const mockedSonarrApi = mockSonarrApi(servarrService, logger);
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue(undefined);

      mediaIdFinder.findTvdbId.mockResolvedValue(1);

      await sonarrActionHandler.handleAction(collection, collectionMedia);

      expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
      expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
      expect(mediaServer.deleteFromDisk).toHaveBeenCalled();
      validateNoSonarrActionsTaken(mockedSonarrApi);
    },
  );

  it('should unmonitor season and delete episodes when type SEASONS and action DELETE', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).toHaveBeenCalledWith(
      series.id,
      collectionMedia.mediaData.index,
      true,
    );
  });

  it('should delete continuing empty show when Seerr has no remaining requested seasons', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE_SHOW_IF_EMPTY,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);
    seerrApi.hasRemainingSeasonRequests.mockResolvedValue(false);

    const series = createSonarrSeries({
      id: 42,
      status: 'continuing',
      seasons: [
        { seasonNumber: 0, monitored: false },
        { seasonNumber: 1, monitored: false },
      ],
      statistics: {
        seasonCount: 1,
        episodeFileCount: 0,
        episodeCount: 10,
        totalEpisodeCount: 10,
        sizeOnDisk: 0,
        percentOfEpisodes: 0,
      },
    });

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(seerrApi.hasRemainingSeasonRequests).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      collectionMedia.mediaData.index,
    );
    expect(mockedSonarrApi.deleteShow).toHaveBeenCalledWith(
      series.id,
      true,
      collection.listExclusions,
    );
  });

  it('should not delete ended empty show when Seerr still has another requested season', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE_SHOW_IF_EMPTY,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);
    seerrApi.hasRemainingSeasonRequests.mockResolvedValue(true);

    const series = createSonarrSeries({
      id: 42,
      status: 'ended',
      seasons: [
        { seasonNumber: 0, monitored: false },
        { seasonNumber: 1, monitored: false },
      ],
      statistics: {
        seasonCount: 1,
        episodeFileCount: 0,
        episodeCount: 10,
        totalEpisodeCount: 10,
        sizeOnDisk: 0,
        percentOfEpisodes: 0,
      },
    });

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(seerrApi.hasRemainingSeasonRequests).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      collectionMedia.mediaData.index,
    );
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
  });

  it('should delete ended empty show when Seerr is not configured and no monitored seasons remain', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE_SHOW_IF_EMPTY,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);
    seerrApi.isConfigured.mockReturnValue(false);

    const series = createSonarrSeries({
      id: 42,
      status: 'ended',
      seasons: [
        { seasonNumber: 0, monitored: false },
        { seasonNumber: 1, monitored: false },
      ],
      statistics: {
        seasonCount: 1,
        episodeFileCount: 0,
        episodeCount: 10,
        totalEpisodeCount: 10,
        sizeOnDisk: 0,
        percentOfEpisodes: 0,
      },
    });

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(seerrApi.hasRemainingSeasonRequests).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).toHaveBeenCalledWith(
      series.id,
      true,
      collection.listExclusions,
    );
  });

  it('should unmonitor ended show when no monitored seasons remain after season cleanup', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_SHOW_IF_EMPTY,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries({
      id: 42,
      monitored: true,
      status: 'ended',
      seasons: [
        { seasonNumber: 0, monitored: false },
        { seasonNumber: 1, monitored: false },
      ],
    });

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mockedSonarrApi.updateSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        id: series.id,
        monitored: false,
      }),
    );
  });

  it('should unmonitor and delete episode when type EPISODES and action DELETE', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      sonarrSettingsId: 1,
      type: 'episode',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).toHaveBeenCalledWith(
      series.id,
      collectionMedia.mediaData.parentIndex,
      [collectionMedia.mediaData.index],
      true,
    );
  });

  it('should delete show when type SHOWS and action DELETE', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      sonarrSettingsId: 1,
      type: 'show',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).toHaveBeenCalledWith(
      series.id,
      true,
      collection.listExclusions,
    );
  });

  it('should unmonitor season and episodes when type SEASONS and action UNMONITOR', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).toHaveBeenCalledWith(
      series.id,
      collectionMedia.mediaData.index,
      false,
    );
  });

  it('should unmonitor episode when type EPISODES and action UNMONITOR', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR,
      sonarrSettingsId: 1,
      type: 'episode',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).toHaveBeenCalledWith(
      series.id,
      collectionMedia.mediaData.parentIndex,
      [collectionMedia.mediaData.index],
      false,
    );
  });

  it('should unmonitor show, seasons and episodes when type SHOWS and action UNMONITOR', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR,
      sonarrSettingsId: 1,
      type: 'show',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'updateSeries').mockResolvedValue();

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).toHaveBeenCalledWith(
      series.id,
      'all',
      false,
    );
    expect(mockedSonarrApi.updateSeries).toHaveBeenCalledWith({
      ...series,
      monitored: false,
    });
  });

  it('should do nothing for season when type SEASONS and action UNMONITOR_DELETE_ALL', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_DELETE_ALL,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    validateNoSonarrActionsTaken(mockedSonarrApi);
  });

  it('should do nothing for episode type EPISODES and action UNMONITOR_DELETE_ALL', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_DELETE_ALL,
      sonarrSettingsId: 1,
      type: 'episode',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    validateNoSonarrActionsTaken(mockedSonarrApi);
  });

  it('should unmonitor show, seasons and episodes and delete all files when type SHOWS and action UNMONITOR_DELETE_ALL', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_DELETE_ALL,
      sonarrSettingsId: 1,
      type: 'show',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'updateSeries').mockResolvedValue();

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).toHaveBeenCalledWith(
      series.id,
      'all',
      true,
    );
    expect(mockedSonarrApi.updateSeries).toHaveBeenCalledWith({
      ...series,
      monitored: false,
    });
  });

  it('should ummonitor and delete existing episodes, leaving season monitored, when type SEASONS and action UNMONITOR_DELETE_EXISTING', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_DELETE_EXISTING,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).toHaveBeenCalledWith(
      series.id,
      collectionMedia.mediaData.index,
      true,
      true,
    );
  });

  it('should do nothing for episode when type EPISODES and action UNMONITOR_DELETE_EXISTING', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_DELETE_EXISTING,
      sonarrSettingsId: 1,
      type: 'episode',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    validateNoSonarrActionsTaken(mockedSonarrApi);
  });

  it('should unmonitor show, unmonitor and delete existing episodes and leave season monitored, when type SHOWS and action UNMONITOR_DELETE_EXISTING', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_DELETE_EXISTING,
      sonarrSettingsId: 1,
      type: 'show',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'updateSeries').mockResolvedValue();

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).toHaveBeenCalledWith(
      series.id,
      'existing',
      true,
    );
    expect(mockedSonarrApi.updateSeries).toHaveBeenCalledWith({
      ...series,
      monitored: false,
    });
  });
});
