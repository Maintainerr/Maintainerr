import { Mocked } from '@suites/doubles.jest';
import { TestBed } from '@suites/unit';
import {
  createCollection,
  createCollectionMedia,
  createRadarrMovie,
} from '../../../test/utils/data';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { RadarrApi } from '../api/servarr-api/helpers/radarr.helper';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { TmdbIdService } from '../api/tmdb-api/tmdb-id.service';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { RadarrActionHandler } from './radarr-action-handler';

describe('RadarrActionHandler', () => {
  let radarrActionHandler: RadarrActionHandler;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mediaServer: Mocked<IMediaServerService>;
  let servarrService: Mocked<ServarrService>;
  let tmdbIdService: Mocked<TmdbIdService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(RadarrActionHandler).compile();

    radarrActionHandler = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    servarrService = unitRef.get(ServarrService);
    tmdbIdService = unitRef.get(TmdbIdService);
    logger = unitRef.get(MaintainerrLogger);

    // Setup mock for MediaServerFactory
    mediaServer = {
      getMetadata: jest.fn(),
      deleteFromDisk: jest.fn(),
      getLibraries: jest.fn(),
    } as unknown as Mocked<IMediaServerService>;
    mediaServerFactory.getService.mockResolvedValue(mediaServer);
  });

  it('should do nothing when tmdbid failed lookup', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      radarrSettingsId: 1,
      type: 'movie',
    });
    const collectionMedia = createCollectionMedia(collection, {
      tmdbId: undefined,
    });

    tmdbIdService.getTmdbIdFromMediaServerId.mockResolvedValue(undefined);

    const mockedRadarrApi = mockRadarrApi();

    await radarrActionHandler.handleAction(collection, collectionMedia);

    expect(tmdbIdService.getTmdbIdFromMediaServerId).toHaveBeenCalled();
    validateNoRadarrActionsTaken(mockedRadarrApi);
  });

  it('should do nothing when movie cannot be found and action is UNMONITOR', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR,
      radarrSettingsId: 1,
      type: 'movie',
    });
    const collectionMedia = createCollectionMedia(collection, {
      tmdbId: 1,
    });

    const mockedRadarrApi = mockRadarrApi();
    jest
      .spyOn(mockedRadarrApi, 'getMovieByTmdbId')
      .mockResolvedValue(undefined);

    await radarrActionHandler.handleAction(collection, collectionMedia);

    expect(mockedRadarrApi.getMovieByTmdbId).toHaveBeenCalled();
    expect(mediaServer.deleteFromDisk).not.toHaveBeenCalled();
    validateNoRadarrActionsTaken(mockedRadarrApi);
  });

  it.each([
    { action: ServarrAction.DELETE, title: 'DELETE' },
    {
      action: ServarrAction.UNMONITOR_DELETE_EXISTING,
      title: 'UNMONITOR_DELETE_EXISTING',
    },
  ])(
    'should delete movie when action is $title',
    async ({ action }: { action: ServarrAction }) => {
      const collection = createCollection({
        arrAction: action,
        radarrSettingsId: 1,
        type: 'movie',
      });
      const collectionMedia = createCollectionMedia(collection, {
        tmdbId: 1,
      });

      const mockedRadarrApi = mockRadarrApi();
      jest
        .spyOn(mockedRadarrApi, 'getMovieByTmdbId')
        .mockResolvedValue(createRadarrMovie({ id: 5 }));

      await radarrActionHandler.handleAction(collection, collectionMedia);

      expect(mockedRadarrApi.deleteMovie).toHaveBeenCalledWith(
        5,
        true,
        collection.listExclusions,
      );
      expect(mockedRadarrApi.updateMovie).not.toHaveBeenCalled();
    },
  );

  it.each([{ listExclusions: true }, { listExclusions: false }])(
    'should unmonitor movie when action is UNMONITOR',
    async ({ listExclusions }) => {
      const collection = createCollection({
        arrAction: ServarrAction.UNMONITOR,
        radarrSettingsId: 1,
        type: 'movie',
        listExclusions,
      });
      const collectionMedia = createCollectionMedia(collection, {
        tmdbId: 1,
      });

      const mockedRadarrApi = mockRadarrApi();
      jest
        .spyOn(mockedRadarrApi, 'getMovieByTmdbId')
        .mockResolvedValue(createRadarrMovie({ id: 5 }));

      await radarrActionHandler.handleAction(collection, collectionMedia);

      expect(mockedRadarrApi.updateMovie).toHaveBeenCalledWith(5, {
        monitored: false,
        addImportExclusion: listExclusions,
      });
      expect(mockedRadarrApi.deleteMovie).not.toHaveBeenCalled();
    },
  );

  it.each([{ listExclusions: true }, { listExclusions: false }])(
    'should unmonitor and delete movie when action is UNMONITOR_DELETE_ALL',
    async ({ listExclusions }) => {
      const collection = createCollection({
        arrAction: ServarrAction.UNMONITOR_DELETE_ALL,
        radarrSettingsId: 1,
        type: 'movie',
        listExclusions,
      });
      const collectionMedia = createCollectionMedia(collection, {
        tmdbId: 1,
      });

      const mockedRadarrApi = mockRadarrApi();
      jest
        .spyOn(mockedRadarrApi, 'getMovieByTmdbId')
        .mockResolvedValue(createRadarrMovie({ id: 5 }));

      await radarrActionHandler.handleAction(collection, collectionMedia);

      expect(mockedRadarrApi.updateMovie).toHaveBeenCalledWith(5, {
        deleteFiles: true,
        monitored: false,
        addImportExclusion: listExclusions,
      });
      expect(mockedRadarrApi.deleteMovie).not.toHaveBeenCalled();
    },
  );

  const validateNoRadarrActionsTaken = (radarrApi: RadarrApi) => {
    expect(radarrApi.updateMovie).not.toHaveBeenCalled();
    expect(radarrApi.deleteMovie).not.toHaveBeenCalled();
  };

  const mockRadarrApi = () => {
    const mockedRadarrApi = new RadarrApi(
      { url: 'http://localhost:7878', apiKey: 'test' },
      logger as any,
    );
    jest.spyOn(mockedRadarrApi, 'deleteMovie').mockImplementation(jest.fn());
    jest.spyOn(mockedRadarrApi, 'updateMovie').mockImplementation(jest.fn());

    servarrService.getRadarrApiClient.mockResolvedValue(mockedRadarrApi);

    return mockedRadarrApi;
  };
});
