import { Mocked } from '@suites/doubles.jest';
import { TestBed } from '@suites/unit';
import {
  createCollection,
  createCollectionMedia,
  createRadarrMovie,
} from '../../../test/utils/data';
import { EPlexDataType } from '../api/plex-api/enums/plex-data-type-enum';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { RadarrApi } from '../api/servarr-api/helpers/radarr.helper';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { TmdbIdService } from '../api/tmdb-api/tmdb-id.service';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { RadarrActionHandler } from './radarr-action-handler';

describe('RadarrActionHandler', () => {
  let radarrActionHandler: RadarrActionHandler;
  let plexApi: Mocked<PlexApiService>;
  let servarrService: Mocked<ServarrService>;
  let tmdbIdService: Mocked<TmdbIdService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(RadarrActionHandler).compile();

    radarrActionHandler = unit;
    plexApi = unitRef.get(PlexApiService);
    servarrService = unitRef.get(ServarrService);
    tmdbIdService = unitRef.get(TmdbIdService);
    logger = unitRef.get(MaintainerrLogger);
  });

  it('should do nothing when tmdbid failed lookup', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      radarrSettingsId: 1,
      type: EPlexDataType.MOVIES,
    });
    const collectionMedia = createCollectionMedia(collection, {
      tmdbId: undefined,
    });

    tmdbIdService.getTmdbIdFromPlexRatingKey.mockResolvedValue(undefined);

    const mockedRadarrApi = mockRadarrApi();

    await radarrActionHandler.handleAction(collection, collectionMedia);

    expect(tmdbIdService.getTmdbIdFromPlexRatingKey).toHaveBeenCalled();
    validateNoRadarrActionsTaken(mockedRadarrApi);
  });

  it('should do nothing when movie cannot be found and action is UNMONITOR', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR,
      radarrSettingsId: 1,
      type: EPlexDataType.MOVIES,
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
    expect(plexApi.deleteMediaFromDisk).not.toHaveBeenCalled();
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
        type: EPlexDataType.MOVIES,
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
      expect(mockedRadarrApi.unmonitorMovie).not.toHaveBeenCalled();
    },
  );

  it('should unmonitor movie when action is UNMONITOR', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR,
      radarrSettingsId: 1,
      type: EPlexDataType.MOVIES,
    });
    const collectionMedia = createCollectionMedia(collection, {
      tmdbId: 1,
    });

    const mockedRadarrApi = mockRadarrApi();
    jest
      .spyOn(mockedRadarrApi, 'getMovieByTmdbId')
      .mockResolvedValue(createRadarrMovie({ id: 5 }));

    await radarrActionHandler.handleAction(collection, collectionMedia);

    expect(mockedRadarrApi.unmonitorMovie).toHaveBeenCalledWith(5, false);
    expect(mockedRadarrApi.deleteMovie).not.toHaveBeenCalled();
  });

  it('should unmonitor and delete movie when action is UNMONITOR_DELETE_ALL', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.UNMONITOR_DELETE_ALL,
      radarrSettingsId: 1,
      type: EPlexDataType.MOVIES,
    });
    const collectionMedia = createCollectionMedia(collection, {
      tmdbId: 1,
    });

    const mockedRadarrApi = mockRadarrApi();
    jest
      .spyOn(mockedRadarrApi, 'getMovieByTmdbId')
      .mockResolvedValue(createRadarrMovie({ id: 5 }));

    await radarrActionHandler.handleAction(collection, collectionMedia);

    expect(mockedRadarrApi.unmonitorMovie).toHaveBeenCalledWith(5, true);
    expect(mockedRadarrApi.deleteMovie).not.toHaveBeenCalled();
  });

  const validateNoRadarrActionsTaken = (radarrApi: RadarrApi) => {
    expect(radarrApi.unmonitorMovie).not.toHaveBeenCalled();
    expect(radarrApi.deleteMovie).not.toHaveBeenCalled();
  };

  const mockRadarrApi = () => {
    const mockedRadarrApi = new RadarrApi({} as any, logger as any);
    jest.spyOn(mockedRadarrApi, 'deleteMovie').mockImplementation(jest.fn());
    jest.spyOn(mockedRadarrApi, 'unmonitorMovie').mockImplementation(jest.fn());

    servarrService.getRadarrApiClient.mockResolvedValue(mockedRadarrApi);

    return mockedRadarrApi;
  };
});
