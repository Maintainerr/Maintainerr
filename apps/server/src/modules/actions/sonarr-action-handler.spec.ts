import {
  MediaItem,
  MediaItemType,
  ServarrAction,
} from '@maintainerr/contracts';
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
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';
import { SonarrActionHandler } from './sonarr-action-handler';

describe('SonarrActionHandler', () => {
  let sonarrActionHandler: SonarrActionHandler;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mediaServer: Mocked<IMediaServerService>;
  let servarrService: Mocked<ServarrService>;
  let metadataService: Mocked<MetadataService>;
  let logger: Mocked<MaintainerrLogger>;
  let seerrApi: Mocked<SeerrApiService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(SonarrActionHandler).compile();

    sonarrActionHandler = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    servarrService = unitRef.get(ServarrService);
    metadataService = unitRef.get(MetadataService);
    logger = unitRef.get(MaintainerrLogger);
    seerrApi = unitRef.get(SeerrApiService);

    // Setup media server mock
    mediaServer = {
      getMetadata: jest.fn(),
      deleteFromDisk: jest.fn(),
    } as unknown as Mocked<IMediaServerService>;
    mediaServerFactory.getService.mockResolvedValue(mediaServer);
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
    'should do nothing for $title when Show tvdbId failed lookup',
    async ({ type }: { type: string }) => {
      const collection = createCollection({
        arrAction: ServarrAction.DELETE,
        sonarrSettingsId: 1,
        type: type as MediaItemType,
      });
      const collectionMedia = createCollectionMediaWithMetadata(collection, {
        tmdbId: 1,
        tvdbId: undefined,
      });

      mockMediaServerMetadata(collectionMedia.mediaData);

      const mockedSonarrApi = mockSonarrApi(servarrService, logger);
      jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId');

      metadataService.resolveIds.mockResolvedValue(undefined);

      await sonarrActionHandler.handleAction(collection, collectionMedia);

      expect(mockedSonarrApi.getSeriesByTvdbId).not.toHaveBeenCalled();
      expect(metadataService.resolveIds).toHaveBeenCalled();
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

      metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

      await sonarrActionHandler.handleAction(collection, collectionMedia);

      expect(metadataService.resolveIds).toHaveBeenCalled();
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

      metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

      await sonarrActionHandler.handleAction(collection, collectionMedia);

      expect(metadataService.resolveIds).toHaveBeenCalled();
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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

  it('should delete continuing empty show when Seerr has no remaining requests after season removal', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE_SHOW_IF_EMPTY,
      forceSeerr: true,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 100,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);
    seerrApi.hasRemainingSeasonRequests.mockResolvedValue(false);

    const series = createSonarrSeries({
      id: 42,
      status: 'continuing',
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

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

  it('should delete ended empty show without consulting Seerr requests', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE_SHOW_IF_EMPTY,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 100,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries({
      id: 42,
      status: 'ended',
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(seerrApi.hasRemainingSeasonRequests).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).toHaveBeenCalledWith(
      series.id,
      true,
      collection.listExclusions,
    );
  });

  it('should not delete continuing empty show when Seerr still has requests for other seasons', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE_SHOW_IF_EMPTY,
      forceSeerr: true,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 100,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);
    seerrApi.hasRemainingSeasonRequests.mockResolvedValue(true);

    const series = createSonarrSeries({
      id: 42,
      status: 'continuing',
      statistics: {
        seasonCount: 2,
        episodeFileCount: 0,
        episodeCount: 20,
        totalEpisodeCount: 20,
        sizeOnDisk: 0,
        percentOfEpisodes: 0,
      },
    });

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(seerrApi.hasRemainingSeasonRequests).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      collectionMedia.mediaData.index,
    );
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
  });

  it('should not delete continuing empty show when Seerr state is unknown', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE_SHOW_IF_EMPTY,
      forceSeerr: true,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 100,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);
    seerrApi.hasRemainingSeasonRequests.mockResolvedValue(undefined);

    const series = createSonarrSeries({
      id: 42,
      status: 'continuing',
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(seerrApi.hasRemainingSeasonRequests).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      collectionMedia.mediaData.index,
    );
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
  });

  it('should not delete upcoming empty show even when Seerr has no remaining requests', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE_SHOW_IF_EMPTY,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 100,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);
    seerrApi.hasRemainingSeasonRequests.mockResolvedValue(false);

    const series = createSonarrSeries({
      id: 42,
      status: 'upcoming',
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(seerrApi.hasRemainingSeasonRequests).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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
      undefined,
    );
  });

  it('should fall back to episode air date when episode index is undefined', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      sonarrSettingsId: 1,
      type: 'episode',
    });
    const airDate = new Date('2026-01-05T00:00:00.000Z');
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
      mediaData: {
        index: undefined,
        parentIndex: 2026,
        originallyAvailableAt: airDate,
      },
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).toHaveBeenCalledWith(
      series.id,
      collectionMedia.mediaData.parentIndex,
      [],
      true,
      airDate,
    );
  });

  it('should skip episode action when no season, episode number, or air date is available', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      sonarrSettingsId: 1,
      type: 'episode',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
      mediaData: {
        index: undefined,
        parentIndex: undefined,
        originallyAvailableAt: undefined,
      },
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      `[Sonarr] Couldn't identify episode '${collectionMedia.mediaData.title}' for show '${series.title}'. No delete action was taken.`,
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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
      undefined,
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
    jest.spyOn(mockedSonarrApi, 'updateSeries').mockResolvedValue(true);

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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
    jest.spyOn(mockedSonarrApi, 'updateSeries').mockResolvedValue(true);

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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
    jest.spyOn(mockedSonarrApi, 'updateSeries').mockResolvedValue(true);

    metadataService.resolveIds.mockResolvedValue({ tvdb: 1, type: 'tv' });

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalled();
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
