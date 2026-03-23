import { Mocked } from '@suites/doubles.jest';
import { TestBed } from '@suites/unit';
import {
  createCollection,
  createCollectionMedia,
  createRadarrMovie,
} from '../../../test/utils/data';
import { mockBuildServarrLookupCandidates } from '../../../test/utils/metadata-mock';
import {
  mockRadarrApi,
  validateNoRadarrActionsTaken,
} from '../../../test/utils/servarr-mock';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';
import { RadarrActionHandler } from './radarr-action-handler';
describe('RadarrActionHandler', () => {
  let radarrActionHandler: RadarrActionHandler;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mediaServer: Mocked<IMediaServerService>;
  let servarrService: Mocked<ServarrService>;
  let metadataService: Mocked<MetadataService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(RadarrActionHandler).compile();

    radarrActionHandler = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    servarrService = unitRef.get(ServarrService);
    metadataService = unitRef.get(MetadataService);
    logger = unitRef.get(MaintainerrLogger);
    mockBuildServarrLookupCandidates(metadataService);

    // Setup mock for MediaServerFactory
    mediaServer = {
      getMetadata: jest.fn(),
      deleteFromDisk: jest.fn(),
      getLibraries: jest.fn(),
    } as unknown as Mocked<IMediaServerService>;
    mediaServerFactory.getService.mockResolvedValue(mediaServer);
  });

  it('should do nothing when tmdbId failed lookup', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      radarrSettingsId: 1,
      type: 'movie',
    });
    const collectionMedia = createCollectionMedia(collection, {
      tmdbId: undefined,
    });

    metadataService.resolveIds.mockResolvedValue(undefined);

    const mockedRadarrApi = mockRadarrApi(servarrService, logger);

    await radarrActionHandler.handleAction(collection, collectionMedia);

    expect(metadataService.resolveIds).toHaveBeenCalledWith(
      collectionMedia.mediaServerId,
    );
    validateNoRadarrActionsTaken(mockedRadarrApi);
  });

  it('uses tvdb lookup when tmdb is unavailable but tvdb exists', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      radarrSettingsId: 1,
      type: 'movie',
    });
    const collectionMedia = createCollectionMedia(collection, {
      tmdbId: undefined,
      tvdbId: 2,
    });

    metadataService.resolveIds.mockResolvedValue(undefined);

    const mockedRadarrApi = mockRadarrApi(servarrService, logger);
    jest
      .spyOn(mockedRadarrApi, 'getMovieByTvdbId')
      .mockResolvedValue(createRadarrMovie({ id: 5 }));

    await radarrActionHandler.handleAction(collection, collectionMedia);

    expect(mockedRadarrApi.getMovieByTvdbId).toHaveBeenCalledWith(2);
    expect(mockedRadarrApi.deleteMovie).toHaveBeenCalledWith(
      5,
      true,
      collection.listExclusions,
    );
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

    const mockedRadarrApi = mockRadarrApi(servarrService, logger);
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

      const mockedRadarrApi = mockRadarrApi(servarrService, logger);
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

      const mockedRadarrApi = mockRadarrApi(servarrService, logger);
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

      const mockedRadarrApi = mockRadarrApi(servarrService, logger);
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
});
