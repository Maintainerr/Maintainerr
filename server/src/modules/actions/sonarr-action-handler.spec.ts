import { Mocked } from '@suites/doubles.jest';
import { TestBed } from '@suites/unit';
import {
  createCollection,
  createCollectionMediaWithPlexData,
  createSonarrSeries,
} from '../../../test/utils/data';
import { EPlexDataType } from '../api/plex-api/enums/plex-data-type-enum';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { SonarrApi } from '../api/servarr-api/helpers/sonarr.helper';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { MediaIdFinder } from './media-id-finder';
import { SonarrActionHandler } from './sonarr-action-handler';

describe('SonarrActionHandler', () => {
  let sonarrActionHandler: SonarrActionHandler;
  let plexApi: Mocked<PlexApiService>;
  let servarrService: Mocked<ServarrService>;
  let mediaIdFinder: Mocked<MediaIdFinder>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(SonarrActionHandler).compile();

    sonarrActionHandler = unit;
    plexApi = unitRef.get(PlexApiService);
    servarrService = unitRef.get(ServarrService);
    mediaIdFinder = unitRef.get(MediaIdFinder);
    logger = unitRef.get(MaintainerrLogger);
  });

  it.each([
    { type: EPlexDataType.SEASONS, title: 'SEASONS' },
    {
      type: EPlexDataType.SHOWS,
      title: 'SHOWS',
    },
    {
      type: EPlexDataType.EPISODES,
      title: 'EPISODES',
    },
  ])(
    'should do nothing for $title when Show tmdbid failed lookup',
    async ({ type }: { type: EPlexDataType }) => {
      const collection = createCollection({
        arrAction: ServarrAction.DELETE,
        sonarrSettingsId: 1,
        type,
      });
      const collectionMedia = createCollectionMediaWithPlexData(collection, {
        tmdbId: 1,
      });

      (plexApi.getMetadata as jest.Mock).mockResolvedValue(
        collectionMedia.plexData,
      );

      const mockedSonarrApi = mockSonarrApi();
      jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId');

      mediaIdFinder.findTvdbId.mockResolvedValue(undefined);

      await sonarrActionHandler.handleAction(collection, collectionMedia);

      expect(mockedSonarrApi.getSeriesByTvdbId).not.toHaveBeenCalled();
      expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
      expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
      validateNoSonarrActionsTaken(mockedSonarrApi);
    },
  );

  it.each([
    { type: EPlexDataType.SEASONS, title: 'SEASONS' },
    {
      type: EPlexDataType.SHOWS,
      title: 'SHOWS',
    },
    {
      type: EPlexDataType.EPISODES,
      title: 'EPISODES',
    },
  ])(
    'should do nothing for $title if not found in Sonarr and action is UNMONITOR',
    async ({ type }: { type: EPlexDataType }) => {
      const collection = createCollection({
        arrAction: ServarrAction.UNMONITOR,
        sonarrSettingsId: 1,
        type,
      });
      const collectionMedia = createCollectionMediaWithPlexData(collection, {
        tmdbId: 1,
      });

      (plexApi.getMetadata as jest.Mock).mockResolvedValue(
        collectionMedia.plexData,
      );

      const mockedSonarrApi = mockSonarrApi();
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue(undefined);

      mediaIdFinder.findTvdbId.mockResolvedValue(1);

      await sonarrActionHandler.handleAction(collection, collectionMedia);

      expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
      expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
      expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
      validateNoSonarrActionsTaken(mockedSonarrApi);
    },
  );

  it.each([
    {
      type: EPlexDataType.SEASONS,
      title: 'SEASONS',
      action: ServarrAction.DELETE,
    },
    {
      type: EPlexDataType.SEASONS,
      title: 'SEASONS',
      action: ServarrAction.UNMONITOR_DELETE_ALL,
    },
    {
      type: EPlexDataType.SEASONS,
      title: 'SEASONS',
      action: ServarrAction.UNMONITOR_DELETE_EXISTING,
    },
    {
      type: EPlexDataType.SHOWS,
      title: 'SHOWS',
      action: ServarrAction.DELETE,
    },
    {
      type: EPlexDataType.SHOWS,
      title: 'SHOWS',
      action: ServarrAction.UNMONITOR_DELETE_ALL,
    },
    {
      type: EPlexDataType.SHOWS,
      title: 'SHOWS',
      action: ServarrAction.UNMONITOR_DELETE_EXISTING,
    },
    {
      type: EPlexDataType.EPISODES,
      title: 'EPISODES',
      action: ServarrAction.DELETE,
    },
    {
      type: EPlexDataType.EPISODES,
      title: 'EPISODES',
      action: ServarrAction.UNMONITOR_DELETE_ALL,
    },
    {
      type: EPlexDataType.EPISODES,
      title: 'EPISODES',
      action: ServarrAction.UNMONITOR_DELETE_EXISTING,
    },
  ])(
    'should delete $title in Plex if not found in Sonarr and action is $action',
    async ({
      type,
      action,
    }: {
      type: EPlexDataType;
      action: ServarrAction;
    }) => {
      const collection = createCollection({
        arrAction: action,
        sonarrSettingsId: 1,
        type,
      });
      const collectionMedia = createCollectionMediaWithPlexData(collection, {
        tmdbId: 1,
      });

      (plexApi.getMetadata as jest.Mock).mockResolvedValue(
        collectionMedia.plexData,
      );

      const mockedSonarrApi = mockSonarrApi();
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue(undefined);

      mediaIdFinder.findTvdbId.mockResolvedValue(1);

      await sonarrActionHandler.handleAction(collection, collectionMedia);

      expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
      expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
      expect(plexApi.deleteMediaFromDisk).toHaveBeenCalled();
      validateNoSonarrActionsTaken(mockedSonarrApi);
    },
  );

  it('should unmonitor season and delete episodes when type SEASONS and action DELETE', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      sonarrSettingsId: 1,
      type: EPlexDataType.SEASONS,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).toHaveBeenCalledWith(
      series.id,
      collectionMedia.plexData.index,
      true,
    );
  });

  it('should unmonitor and delete episode when type EPISODES and action DELETE', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      sonarrSettingsId: 1,
      type: EPlexDataType.EPISODES,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).toHaveBeenCalledWith(
      series.id,
      collectionMedia.plexData.parentIndex,
      [collectionMedia.plexData.index],
      true,
    );
  });

  it('should delete show when type SHOWS and action DELETE', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      sonarrSettingsId: 1,
      type: EPlexDataType.SHOWS,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
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
      type: EPlexDataType.SEASONS,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).toHaveBeenCalledWith(
      series.id,
      collectionMedia.plexData.index,
      false,
    );
  });

  it('should unmonitor episode when type EPISODES and action UNMONITOR', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR,
      sonarrSettingsId: 1,
      type: EPlexDataType.EPISODES,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).toHaveBeenCalledWith(
      series.id,
      collectionMedia.plexData.parentIndex,
      [collectionMedia.plexData.index],
      false,
    );
  });

  it('should unmonitor show, seasons and episodes when type SHOWS and action UNMONITOR', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR,
      sonarrSettingsId: 1,
      type: EPlexDataType.SHOWS,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'updateSeries').mockResolvedValue();

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
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
      type: EPlexDataType.SEASONS,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
    validateNoSonarrActionsTaken(mockedSonarrApi);
  });

  it('should do nothing for episode type EPISODES and action UNMONITOR_DELETE_ALL', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_DELETE_ALL,
      sonarrSettingsId: 1,
      type: EPlexDataType.EPISODES,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
    validateNoSonarrActionsTaken(mockedSonarrApi);
  });

  it('should unmonitor show, seasons and episodes and delete all files when type SHOWS and action UNMONITOR_DELETE_ALL', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_DELETE_ALL,
      sonarrSettingsId: 1,
      type: EPlexDataType.SHOWS,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'updateSeries').mockResolvedValue();

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
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
      type: EPlexDataType.SEASONS,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
    expect(mockedSonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(mockedSonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(mockedSonarrApi.delete).not.toHaveBeenCalled();
    expect(mockedSonarrApi.unmonitorSeasons).toHaveBeenCalledWith(
      series.id,
      collectionMedia.plexData.index,
      true,
      true,
    );
  });

  it('should do nothing for episode when type EPISODES and action UNMONITOR_DELETE_EXISTING', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_DELETE_EXISTING,
      sonarrSettingsId: 1,
      type: EPlexDataType.EPISODES,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
    validateNoSonarrActionsTaken(mockedSonarrApi);
  });

  it('should unmonitor show, unmonitor and delete existing episodes and leave season monitored, when type SHOWS and action UNMONITOR_DELETE_EXISTING', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_DELETE_EXISTING,
      sonarrSettingsId: 1,
      type: EPlexDataType.SHOWS,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection, {
      tmdbId: 1,
    });

    (plexApi.getMetadata as jest.Mock).mockResolvedValue(
      collectionMedia.plexData,
    );

    const series = createSonarrSeries();

    const mockedSonarrApi = mockSonarrApi();
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'unmonitorSeasons').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'updateSeries').mockResolvedValue();

    mediaIdFinder.findTvdbId.mockResolvedValue(1);

    await sonarrActionHandler.handleAction(collection, collectionMedia);

    expect(mediaIdFinder.findTvdbId).toHaveBeenCalled();
    expect(mockedSonarrApi.getSeriesByTvdbId).toHaveBeenCalled();
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
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

  const validateNoSonarrActionsTaken = (sonarrApi: SonarrApi) => {
    expect(sonarrApi.unmonitorSeasons).not.toHaveBeenCalled();
    expect(sonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
    expect(sonarrApi.deleteShow).not.toHaveBeenCalled();
    expect(sonarrApi.delete).not.toHaveBeenCalled();
  };

  const mockSonarrApi = () => {
    const mockedSonarrApi = new SonarrApi(
      {
        apiKey: '1234',
        url: 'http://localhost:8989',
      },
      logger as any,
    );
    jest
      .spyOn(mockedSonarrApi, 'unmonitorSeasons')
      .mockImplementation(jest.fn());
    jest
      .spyOn(mockedSonarrApi, 'UnmonitorDeleteEpisodes')
      .mockImplementation(jest.fn());
    jest.spyOn(mockedSonarrApi, 'deleteShow').mockImplementation(jest.fn());
    jest.spyOn(mockedSonarrApi, 'delete').mockImplementation(jest.fn());
    servarrService.getSonarrApiClient.mockResolvedValue(mockedSonarrApi);

    return mockedSonarrApi;
  };
});
