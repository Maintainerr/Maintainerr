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
import { DownloadClientApiService } from '../api/download-client-api/download-client-api.service';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';
import { SettingsDataService } from '../settings/settings-data.service';
import { SonarrActionHandler } from './sonarr-action-handler';

describe('SonarrActionHandler', () => {
  let sonarrActionHandler: SonarrActionHandler;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mediaServer: Mocked<IMediaServerService>;
  let servarrService: Mocked<ServarrService>;
  let seerrApi: Mocked<SeerrApiService>;
  let metadataService: Mocked<MetadataService>;
  let settings: Mocked<SettingsDataService>;
  let downloadClient: Mocked<DownloadClientApiService>;
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
    settings = unitRef.get(SettingsDataService);
    downloadClient = unitRef.get(DownloadClientApiService);
    logger = unitRef.get(MaintainerrLogger);

    mediaIdFinder = {
      findTvdbId: jest.fn(),
    };

    metadataService.resolveLookupCandidatesForService.mockImplementation(
      async (_mediaServerId, _service, fallbackIds) => {
        const tvdbId = await mediaIdFinder.findTvdbId();
        const resolvedTvdbId =
          tvdbId ??
          (typeof fallbackIds?.tvdb === 'number'
            ? fallbackIds.tvdb
            : undefined);

        return resolvedTvdbId
          ? [{ providerKey: 'tvdb', id: resolvedTvdbId }]
          : [];
      },
    );

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

  // Per-season Sonarr statistics; defaults to an empty (never-downloaded)
  // season, override episodeFileCount for seasons that hold files.
  const emptySeasonStats = (overrides: { episodeFileCount?: number } = {}) => ({
    episodeFileCount: 0,
    episodeCount: 0,
    totalEpisodeCount: 0,
    sizeOnDisk: 0,
    percentOfEpisodes: 0,
    ...overrides,
  });

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

    const result = await sonarrActionHandler.handleAction(
      collection,
      collectionMedia,
    );

    expect(result).toBe(true);
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

  // Regression guard for #2897 and the rule-evaluation ArrLookupCache: the
  // empty-show cleanup must resolve the series from the (uncached) Sonarr
  // client on every run, never from a memo that could hold a pre-deletion
  // snapshot. The rule-evaluation memo is intentionally never threaded into
  // this path — if a future refactor did so, the second run below would re-use
  // the stale "still has files" series and wrongly skip the deletion.
  it('resolves the series fresh from the client each run, never via a memo', async () => {
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
    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    const baseSeries = {
      id: 42,
      status: 'continuing' as const,
      seasons: [
        { seasonNumber: 0, monitored: false },
        { seasonNumber: 1, monitored: false },
      ],
    };
    const seriesWithFiles = createSonarrSeries({
      ...baseSeries,
      statistics: {
        seasonCount: 1,
        episodeFileCount: 8,
        episodeCount: 10,
        totalEpisodeCount: 10,
        sizeOnDisk: 1000,
        percentOfEpisodes: 80,
      },
    });
    const emptySeries = createSonarrSeries({
      ...baseSeries,
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
    const getSeries = jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId');
    jest
      .spyOn(mockedSonarrApi, 'unmonitorSeasons')
      .mockResolvedValue(emptySeries);

    // First run: Sonarr still reports files, so the show is not empty.
    getSeries.mockResolvedValue(seriesWithFiles);
    await sonarrActionHandler.handleAction(collection, collectionMedia);
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();

    // Second run: the files are now gone. The handler must observe the new
    // client value (a fresh read, not a cached one) and delete the empty show.
    getSeries.mockResolvedValue(emptySeries);
    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(getSeries).toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).toHaveBeenCalledWith(
      emptySeries.id,
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

  it('should not delete empty show when Seerr state is unknown', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE_SHOW_IF_EMPTY,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);
    seerrApi.hasRemainingSeasonRequests.mockResolvedValue(undefined);

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

  it('should not delete show when episode files still remain after season cleanup', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE_SHOW_IF_EMPTY,
      sonarrSettingsId: 1,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const series = createSonarrSeries({
      id: 42,
      status: 'ended',
      seasons: [
        { seasonNumber: 0, monitored: false },
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: true },
      ],
      statistics: {
        seasonCount: 2,
        episodeFileCount: 5,
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

  // Regression for issues #2757 / #2891. Sonarr carries every TVDB season on
  // the series, including ones the user never downloaded; those stay
  // monitored forever. The no-Seerr fallback must not require every season to
  // be unmonitored — an ended show with zero episode files is deletable even
  // when later (never-downloaded) seasons are still monitored.
  it('should delete ended show with no episode files when Seerr is not configured even if later seasons remain monitored', async () => {
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
        { seasonNumber: 0, monitored: true },
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: false },
        { seasonNumber: 3, monitored: false },
        { seasonNumber: 4, monitored: false },
        { seasonNumber: 5, monitored: true },
        { seasonNumber: 6, monitored: true },
      ],
      statistics: {
        seasonCount: 6,
        episodeFileCount: 0,
        episodeCount: 100,
        totalEpisodeCount: 100,
        sizeOnDisk: 0,
        percentOfEpisodes: 0,
      },
    });

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mockedSonarrApi.deleteShow).toHaveBeenCalledWith(
      series.id,
      true,
      collection.listExclusions,
    );
  });

  it.each([
    ServarrAction.DELETE_SHOW_IF_EMPTY,
    ServarrAction.UNMONITOR_SHOW_IF_EMPTY,
  ])(
    'should return false for %s when season cleanup fails',
    async (arrAction) => {
      const collection = createCollection({
        arrAction,
        sonarrSettingsId: 1,
        type: 'season',
      });
      const collectionMedia = createCollectionMediaWithMetadata(collection, {
        tmdbId: 1,
      });

      mockMediaServerMetadata(collectionMedia.mediaData);

      const series = createSonarrSeries({
        id: 42,
      });

      const mockedSonarrApi = mockSonarrApi(servarrService, logger);
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue(series);
      jest
        .spyOn(mockedSonarrApi, 'unmonitorSeasons')
        .mockResolvedValue(undefined);

      mediaIdFinder.findTvdbId.mockResolvedValue(1);

      await expect(
        sonarrActionHandler.handleAction(collection, collectionMedia),
      ).resolves.toBe(false);

      expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
      expect(mockedSonarrApi.updateSeries).not.toHaveBeenCalled();
    },
  );

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

    const result = await sonarrActionHandler.handleAction(
      collection,
      collectionMedia,
    );

    expect(result).toBe(true);
    expect(mockedSonarrApi.updateSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        id: series.id,
        monitored: false,
      }),
    );
  });

  // Regression for issues #2757 / #2891 on the unmonitor-show path. Sonarr
  // carries every TVDB season on the series; seasons the user never
  // downloaded stay monitored with zero files. They must not count as
  // "monitored content" or a finished show could never be unmonitored.
  it('should unmonitor ended show even if never-downloaded seasons remain monitored', async () => {
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
        // specials + never-downloaded later seasons: monitored, zero files
        { seasonNumber: 0, monitored: true, statistics: emptySeasonStats() },
        // processed seasons: unmonitored, files kept by the UNMONITOR action
        {
          seasonNumber: 1,
          monitored: false,
          statistics: emptySeasonStats({ episodeFileCount: 20 }),
        },
        {
          seasonNumber: 2,
          monitored: false,
          statistics: emptySeasonStats({ episodeFileCount: 22 }),
        },
        { seasonNumber: 3, monitored: true, statistics: emptySeasonStats() },
        { seasonNumber: 4, monitored: true, statistics: emptySeasonStats() },
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

  // A season that is still monitored AND holds files means the user is not
  // done with the show — it must not be unmonitored.
  it('should not unmonitor show when a monitored season still has files', async () => {
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
        { seasonNumber: 0, monitored: false, statistics: emptySeasonStats() },
        {
          seasonNumber: 1,
          monitored: false,
          statistics: emptySeasonStats({ episodeFileCount: 20 }),
        },
        {
          seasonNumber: 2,
          monitored: true,
          statistics: emptySeasonStats({ episodeFileCount: 22 }),
        },
      ],
    });

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mockedSonarrApi.updateSeries).not.toHaveBeenCalled();
  });

  // season.statistics is optional in Sonarr's response. A monitored season
  // with no statistics has an unknown file count — it must be treated as
  // still having content, never assumed empty.
  it('should not unmonitor show when a monitored season has no statistics', async () => {
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
        { seasonNumber: 0, monitored: false, statistics: emptySeasonStats() },
        {
          seasonNumber: 1,
          monitored: false,
          statistics: emptySeasonStats({ episodeFileCount: 20 }),
        },
        // monitored, statistics omitted -> file count unknown
        { seasonNumber: 2, monitored: true },
      ],
    });

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mockedSonarrApi.updateSeries).not.toHaveBeenCalled();
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

  it('should not delete from disk when show cannot be found and action is CHANGE_QUALITY_PROFILE', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.CHANGE_QUALITY_PROFILE,
      sonarrSettingsId: 1,
      sonarrQualityProfileId: 3,
      type: 'show',
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

    const result = await sonarrActionHandler.handleAction(
      collection,
      collectionMedia,
    );

    expect(result).toBe(false);
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
    jest.spyOn(mockedSonarrApi, 'updateSeries').mockResolvedValue(true);

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
    jest.spyOn(mockedSonarrApi, 'updateSeries').mockResolvedValue(true);

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

  it('should change quality profile and trigger search when action is CHANGE_QUALITY_PROFILE for SHOWS', async () => {
    const targetProfileId = 3;
    const collection = createCollection({
      arrAction: ServarrAction.CHANGE_QUALITY_PROFILE,
      sonarrSettingsId: 1,
      sonarrQualityProfileId: targetProfileId,
      type: 'show',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    const existingSeries = createSonarrSeries({ id: 5, qualityProfileId: 1 });
    jest
      .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
      .mockResolvedValue(existingSeries);
    jest.spyOn(mockedSonarrApi, 'searchSeries').mockResolvedValue();

    mediaIdFinder.findTvdbId.mockResolvedValue(123);

    const result = await sonarrActionHandler.handleAction(
      collection,
      collectionMedia,
    );

    expect(result).toBe(true);
    expect(mockedSonarrApi.updateSeries).toHaveBeenCalledWith({
      ...existingSeries,
      qualityProfileId: targetProfileId,
    });
    expect(mockedSonarrApi.searchSeries).toHaveBeenCalledWith(5);
  });

  it('should skip update and search when show already has the target quality profile', async () => {
    const targetProfileId = 3;
    const collection = createCollection({
      arrAction: ServarrAction.CHANGE_QUALITY_PROFILE,
      sonarrSettingsId: 1,
      sonarrQualityProfileId: targetProfileId,
      type: 'show',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest
      .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
      .mockResolvedValue(
        createSonarrSeries({ id: 5, qualityProfileId: targetProfileId }),
      );
    jest.spyOn(mockedSonarrApi, 'searchSeries').mockResolvedValue();

    mediaIdFinder.findTvdbId.mockResolvedValue(123);

    const result = await sonarrActionHandler.handleAction(
      collection,
      collectionMedia,
    );

    expect(result).toBe(true);
    expect(mockedSonarrApi.updateSeries).not.toHaveBeenCalled();
    expect(mockedSonarrApi.searchSeries).not.toHaveBeenCalled();
  });

  it('should log warning when quality profile action used on SEASONS type', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.CHANGE_QUALITY_PROFILE,
      sonarrSettingsId: 1,
      sonarrQualityProfileId: 3,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest
      .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
      .mockResolvedValue(createSonarrSeries({ id: 5 }));

    mediaIdFinder.findTvdbId.mockResolvedValue(123);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'CHANGE_QUALITY_PROFILE is not supported for type',
      ),
    );
    expect(mockedSonarrApi.updateSeries).not.toHaveBeenCalled();
  });

  it('should log warning when quality profile action used on EPISODES type', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.CHANGE_QUALITY_PROFILE,
      sonarrSettingsId: 1,
      sonarrQualityProfileId: 3,
      type: 'episode',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest
      .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
      .mockResolvedValue(createSonarrSeries({ id: 5 }));

    mediaIdFinder.findTvdbId.mockResolvedValue(123);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'CHANGE_QUALITY_PROFILE is not supported for type',
      ),
    );
    expect(mockedSonarrApi.updateSeries).not.toHaveBeenCalled();
  });

  it('should log warning when quality profile ID not configured for SHOWS', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.CHANGE_QUALITY_PROFILE,
      sonarrSettingsId: 1,
      sonarrQualityProfileId: undefined,
      type: 'show',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection, {
      tmdbId: 1,
    });

    mockMediaServerMetadata(collectionMedia.mediaData);

    const mockedSonarrApi = mockSonarrApi(servarrService, logger);
    jest
      .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
      .mockResolvedValue(createSonarrSeries({ id: 5 }));

    mediaIdFinder.findTvdbId.mockResolvedValue(123);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No target quality profile configured'),
    );
    expect(mockedSonarrApi.updateSeries).not.toHaveBeenCalled();
  });

  describe('download client cleanup', () => {
    beforeEach(() => {
      settings.downloadClientConfigured.mockReturnValue(true);
    });

    const setupSeries = () => {
      const series = createSonarrSeries();
      const mockedSonarrApi = mockSonarrApi(servarrService, logger);
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue(series);
      jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);
      mediaIdFinder.findTvdbId.mockResolvedValue(1);
      return { series, mockedSonarrApi };
    };

    it('removes the series downloads after a whole-show delete', async () => {
      const collection = createCollection({
        arrAction: ServarrAction.DELETE,
        sonarrSettingsId: 1,
        type: 'show',
      });
      const collectionMedia = createCollectionMediaWithMetadata(collection, {
        tmdbId: 1,
      });
      mockMediaServerMetadata(collectionMedia.mediaData);

      const { series, mockedSonarrApi } = setupSeries();
      jest
        .spyOn(mockedSonarrApi, 'getDownloadIdsForSeries')
        .mockResolvedValue(['hash-1']);

      await sonarrActionHandler.handleAction(collection, collectionMedia);

      expect(mockedSonarrApi.getDownloadIdsForSeries).toHaveBeenCalledWith(
        series.id,
      );
      expect(mockedSonarrApi.getSeriesDownloadHistory).not.toHaveBeenCalled();
      expect(downloadClient.removeDownloads).toHaveBeenCalledWith(['hash-1']);
    });

    it('does nothing when no download client is configured', async () => {
      settings.downloadClientConfigured.mockReturnValue(false);

      const collection = createCollection({
        arrAction: ServarrAction.DELETE,
        sonarrSettingsId: 1,
        type: 'season',
      });
      const collectionMedia = createCollectionMediaWithMetadata(collection, {
        tmdbId: 1,
        mediaData: { index: 2 },
      });
      mockMediaServerMetadata(collectionMedia.mediaData);
      const { mockedSonarrApi } = setupSeries();

      await sonarrActionHandler.handleAction(collection, collectionMedia);

      // No coverage work is done; the removeDownloads([]) call is a no-op.
      expect(mockedSonarrApi.getEpisodes).not.toHaveBeenCalled();
      expect(mockedSonarrApi.getSeriesDownloadHistory).not.toHaveBeenCalled();
      expect(downloadClient.removeDownloads).toHaveBeenCalledWith([]);
    });

    it.each([
      ServarrAction.UNMONITOR_DELETE_ALL,
      ServarrAction.UNMONITOR_DELETE_EXISTING,
    ])(
      'removes the series downloads after a whole-show %s',
      async (arrAction) => {
        const collection = createCollection({
          arrAction,
          sonarrSettingsId: 1,
          type: 'show',
        });
        const collectionMedia = createCollectionMediaWithMetadata(collection, {
          tmdbId: 1,
        });
        mockMediaServerMetadata(collectionMedia.mediaData);

        const { series, mockedSonarrApi } = setupSeries();
        jest
          .spyOn(mockedSonarrApi, 'getDownloadIdsForSeries')
          .mockResolvedValue(['hash-1']);

        await sonarrActionHandler.handleAction(collection, collectionMedia);

        expect(mockedSonarrApi.getDownloadIdsForSeries).toHaveBeenCalledWith(
          series.id,
        );
        expect(mockedSonarrApi.getSeriesDownloadHistory).not.toHaveBeenCalled();
        expect(downloadClient.removeDownloads).toHaveBeenCalledWith(['hash-1']);
      },
    );

    describe('season delete coverage', () => {
      const runSeasonDelete = async (
        seasonNumber: number,
        episodeIds: number[],
        history: { hash: string; episodeId?: number }[],
        arrAction = ServarrAction.DELETE,
      ) => {
        const collection = createCollection({
          arrAction,
          sonarrSettingsId: 1,
          type: 'season',
        });
        const collectionMedia = createCollectionMediaWithMetadata(collection, {
          tmdbId: 1,
          mediaData: { index: seasonNumber },
        });
        mockMediaServerMetadata(collectionMedia.mediaData);
        const { series, mockedSonarrApi } = setupSeries();
        jest
          .spyOn(mockedSonarrApi, 'getEpisodes')
          .mockResolvedValue(episodeIds.map((id) => ({ id })) as never);
        jest
          .spyOn(mockedSonarrApi, 'getSeriesDownloadHistory')
          .mockResolvedValue(history);

        await sonarrActionHandler.handleAction(collection, collectionMedia);
        return { series, mockedSonarrApi };
      };

      it('removes a per-season torrent fully inside the deleted season', async () => {
        const { series, mockedSonarrApi } = await runSeasonDelete(
          2,
          [21, 22],
          [
            { hash: 'hash-a', episodeId: 21 },
            { hash: 'hash-a', episodeId: 22 },
          ],
        );

        expect(mockedSonarrApi.getEpisodes).toHaveBeenCalledWith(series.id, 2);
        // The season fed to coverage must be the one actually deleted.
        expect(mockedSonarrApi.unmonitorSeasons).toHaveBeenCalledWith(
          series.id,
          2,
          true,
        );
        expect(downloadClient.removeDownloads).toHaveBeenCalledWith(['hash-a']);
      });

      it('keeps a multi-season pack that also backs another season', async () => {
        await runSeasonDelete(
          2,
          [21],
          [
            { hash: 'hash-pack', episodeId: 21 },
            { hash: 'hash-pack', episodeId: 11 },
          ],
        );

        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([]);
      });

      it('removes only the covered torrents in a mixed set', async () => {
        await runSeasonDelete(
          2,
          [21, 22],
          [
            { hash: 'hash-a', episodeId: 21 },
            { hash: 'hash-pack', episodeId: 22 },
            { hash: 'hash-pack', episodeId: 31 },
          ],
        );

        expect(downloadClient.removeDownloads).toHaveBeenCalledWith(['hash-a']);
      });

      it('keeps a torrent that has a history row with an unknown episode id', async () => {
        await runSeasonDelete(
          2,
          [21],
          [
            { hash: 'hash-a', episodeId: 21 },
            { hash: 'hash-a', episodeId: undefined },
          ],
        );

        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([]);
      });

      it('skips cleanup when the history fetch yields nothing', async () => {
        await runSeasonDelete(2, [21], []);

        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([]);
      });

      it('removes every covered torrent and keeps the out-of-season one', async () => {
        await runSeasonDelete(
          2,
          [21, 22],
          [
            { hash: 'hash-a', episodeId: 21 },
            { hash: 'hash-b', episodeId: 22 },
            { hash: 'hash-other', episodeId: 31 },
          ],
        );

        expect(downloadClient.removeDownloads).toHaveBeenCalledTimes(1);
        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([
          'hash-a',
          'hash-b',
        ]);
      });

      it('keeps all torrents (fails closed) when the episode lookup throws', async () => {
        const collection = createCollection({
          arrAction: ServarrAction.DELETE,
          sonarrSettingsId: 1,
          type: 'season',
        });
        const collectionMedia = createCollectionMediaWithMetadata(collection, {
          tmdbId: 1,
          mediaData: { index: 2 },
        });
        mockMediaServerMetadata(collectionMedia.mediaData);
        const { mockedSonarrApi } = setupSeries();
        jest
          .spyOn(mockedSonarrApi, 'getEpisodes')
          .mockRejectedValue(new Error('boom'));
        jest
          .spyOn(mockedSonarrApi, 'getSeriesDownloadHistory')
          .mockResolvedValue([{ hash: 'hash-a', episodeId: 21 }]);

        await sonarrActionHandler.handleAction(collection, collectionMedia);

        // Coverage could not be proven, so nothing is removed — but the delete
        // itself still runs (cleanup is best-effort).
        expect(mockedSonarrApi.unmonitorSeasons).toHaveBeenCalled();
        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([]);
      });

      it('does not remove torrents when the season delete fails', async () => {
        const collection = createCollection({
          arrAction: ServarrAction.DELETE,
          sonarrSettingsId: 1,
          type: 'season',
        });
        const collectionMedia = createCollectionMediaWithMetadata(collection, {
          tmdbId: 1,
          mediaData: { index: 2 },
        });
        mockMediaServerMetadata(collectionMedia.mediaData);
        const { mockedSonarrApi } = setupSeries();
        jest
          .spyOn(mockedSonarrApi, 'unmonitorSeasons')
          .mockResolvedValue(undefined);
        jest
          .spyOn(mockedSonarrApi, 'getEpisodes')
          .mockResolvedValue([{ id: 21 }] as never);
        jest
          .spyOn(mockedSonarrApi, 'getSeriesDownloadHistory')
          .mockResolvedValue([{ hash: 'hash-a', episodeId: 21 }]);

        const result = await sonarrActionHandler.handleAction(
          collection,
          collectionMedia,
        );

        expect(result).toBe(false);
        expect(downloadClient.removeDownloads).not.toHaveBeenCalled();
      });

      it('cleans covered torrents on an UNMONITOR_DELETE_EXISTING season delete', async () => {
        await runSeasonDelete(
          3,
          [31],
          [{ hash: 'hash-c', episodeId: 31 }],
          ServarrAction.UNMONITOR_DELETE_EXISTING,
        );

        expect(downloadClient.removeDownloads).toHaveBeenCalledWith(['hash-c']);
      });

      it('cleans covered torrents on a DELETE_SHOW_IF_EMPTY season delete', async () => {
        await runSeasonDelete(
          2,
          [21],
          [{ hash: 'hash-a', episodeId: 21 }],
          ServarrAction.DELETE_SHOW_IF_EMPTY,
        );

        expect(downloadClient.removeDownloads).toHaveBeenCalledWith(['hash-a']);
      });
    });

    describe('episode delete coverage', () => {
      const runEpisodeDelete = async (
        seasonNumber: number,
        episodeNumber: number,
        episodeIds: number[],
        history: { hash: string; episodeId?: number }[],
      ) => {
        const collection = createCollection({
          arrAction: ServarrAction.DELETE,
          sonarrSettingsId: 1,
          type: 'episode',
        });
        const collectionMedia = createCollectionMediaWithMetadata(collection, {
          tmdbId: 1,
          mediaData: { parentIndex: seasonNumber, index: episodeNumber },
        });
        mockMediaServerMetadata(collectionMedia.mediaData);
        const { series, mockedSonarrApi } = setupSeries();
        jest
          .spyOn(mockedSonarrApi, 'getEpisodes')
          .mockResolvedValue(episodeIds.map((id) => ({ id })) as never);
        jest
          .spyOn(mockedSonarrApi, 'getSeriesDownloadHistory')
          .mockResolvedValue(history);

        await sonarrActionHandler.handleAction(collection, collectionMedia);
        return { series, mockedSonarrApi };
      };

      it('removes a single-episode torrent', async () => {
        const { series, mockedSonarrApi } = await runEpisodeDelete(
          1,
          3,
          [33],
          [{ hash: 'hash-e3', episodeId: 33 }],
        );

        expect(mockedSonarrApi.getEpisodes).toHaveBeenCalledWith(
          series.id,
          1,
          [3],
        );
        // The episode(s) fed to coverage must be the one(s) actually deleted.
        expect(mockedSonarrApi.UnmonitorDeleteEpisodes).toHaveBeenCalledWith(
          series.id,
          1,
          [3],
          true,
          undefined,
        );
        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([
          'hash-e3',
        ]);
      });

      it('removes a torrent backing exactly the deleted multi-episode set', async () => {
        await runEpisodeDelete(
          1,
          3,
          [33, 34],
          [
            { hash: 'hash-d', episodeId: 33 },
            { hash: 'hash-d', episodeId: 34 },
          ],
        );

        expect(downloadClient.removeDownloads).toHaveBeenCalledWith(['hash-d']);
      });

      it('keeps that torrent when only one of its episodes is deleted', async () => {
        await runEpisodeDelete(
          1,
          3,
          [33],
          [
            { hash: 'hash-d', episodeId: 33 },
            { hash: 'hash-d', episodeId: 34 },
          ],
        );

        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([]);
      });

      it('keeps all torrents (fails closed) when the episode lookup throws', async () => {
        const collection = createCollection({
          arrAction: ServarrAction.DELETE,
          sonarrSettingsId: 1,
          type: 'episode',
        });
        const collectionMedia = createCollectionMediaWithMetadata(collection, {
          tmdbId: 1,
          mediaData: { parentIndex: 1, index: 3 },
        });
        mockMediaServerMetadata(collectionMedia.mediaData);
        const { mockedSonarrApi } = setupSeries();
        jest
          .spyOn(mockedSonarrApi, 'getEpisodes')
          .mockRejectedValue(new Error('boom'));
        jest
          .spyOn(mockedSonarrApi, 'getSeriesDownloadHistory')
          .mockResolvedValue([{ hash: 'hash-e3', episodeId: 33 }]);

        await sonarrActionHandler.handleAction(collection, collectionMedia);

        expect(mockedSonarrApi.UnmonitorDeleteEpisodes).toHaveBeenCalled();
        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([]);
      });

      it('does not remove torrents when the episode delete fails', async () => {
        const collection = createCollection({
          arrAction: ServarrAction.DELETE,
          sonarrSettingsId: 1,
          type: 'episode',
        });
        const collectionMedia = createCollectionMediaWithMetadata(collection, {
          tmdbId: 1,
          mediaData: { parentIndex: 1, index: 3 },
        });
        mockMediaServerMetadata(collectionMedia.mediaData);
        const { mockedSonarrApi } = setupSeries();
        jest
          .spyOn(mockedSonarrApi, 'UnmonitorDeleteEpisodes')
          .mockResolvedValue(false);
        jest
          .spyOn(mockedSonarrApi, 'getEpisodes')
          .mockResolvedValue([{ id: 33 }] as never);
        jest
          .spyOn(mockedSonarrApi, 'getSeriesDownloadHistory')
          .mockResolvedValue([{ hash: 'hash-e3', episodeId: 33 }]);

        const result = await sonarrActionHandler.handleAction(
          collection,
          collectionMedia,
        );

        expect(result).toBe(false);
        expect(downloadClient.removeDownloads).not.toHaveBeenCalled();
      });

      it('keeps a season pack that also backs sibling episodes', async () => {
        await runEpisodeDelete(
          1,
          3,
          [33],
          [
            { hash: 'hash-pack', episodeId: 33 },
            { hash: 'hash-pack', episodeId: 31 },
            { hash: 'hash-pack', episodeId: 32 },
          ],
        );

        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([]);
      });

      it('keeps a complete-series pack on an episode delete', async () => {
        await runEpisodeDelete(
          1,
          3,
          [33],
          [
            { hash: 'hash-series', episodeId: 33 },
            { hash: 'hash-series', episodeId: 201 },
          ],
        );

        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([]);
      });

      it('skips cleanup for an air-date-only episode (no episode number)', async () => {
        const collection = createCollection({
          arrAction: ServarrAction.DELETE,
          sonarrSettingsId: 1,
          type: 'episode',
        });
        const collectionMedia = createCollectionMediaWithMetadata(collection, {
          tmdbId: 1,
          mediaData: {
            parentIndex: 1,
            index: undefined,
            originallyAvailableAt: new Date('2020-01-01'),
          },
        });
        mockMediaServerMetadata(collectionMedia.mediaData);
        const { mockedSonarrApi } = setupSeries();

        await sonarrActionHandler.handleAction(collection, collectionMedia);

        expect(mockedSonarrApi.getEpisodes).not.toHaveBeenCalled();
        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([]);
      });

      it('skips cleanup when the episode cannot be mapped to an id', async () => {
        await runEpisodeDelete(9, 99, [], [{ hash: 'hash-x', episodeId: 1 }]);

        expect(downloadClient.removeDownloads).toHaveBeenCalledWith([]);
      });
    });
  });
});
