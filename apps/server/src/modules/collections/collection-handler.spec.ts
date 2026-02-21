import { Mocked, TestBed } from '@suites/unit';
import {
  createCollection,
  createCollectionMedia,
  createCollectionMediaWithMetadata,
  createMediaLibraries,
} from '../../../test/utils/data';
import { RadarrActionHandler } from '../actions/radarr-action-handler';
import { SonarrActionHandler } from '../actions/sonarr-action-handler';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { MediaItem } from '@maintainerr/contracts';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { SettingsService } from '../settings/settings.service';
import { CollectionHandler } from './collection-handler';
import { CollectionsService } from './collections.service';
import { ServarrAction } from './interfaces/collection.interface';

describe('CollectionHandler', () => {
  let collectionHandler: CollectionHandler;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mediaServer: Mocked<IMediaServerService>;
  let collectionsService: Mocked<CollectionsService>;
  let radarrActionHandler: Mocked<RadarrActionHandler>;
  let sonarrActionHandler: Mocked<SonarrActionHandler>;
  let seerrApi: Mocked<SeerrApiService>;
  let settings: Mocked<SettingsService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(CollectionHandler).compile();

    collectionHandler = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    collectionsService = unitRef.get(CollectionsService);
    radarrActionHandler = unitRef.get(RadarrActionHandler);
    sonarrActionHandler = unitRef.get(SonarrActionHandler);
    seerrApi = unitRef.get(SeerrApiService);
    settings = unitRef.get(SettingsService);

    // Setup media server mock
    mediaServer = {
      getMetadata: jest.fn(),
      deleteFromDisk: jest.fn(),
      getLibraries: jest.fn(),
    } as unknown as Mocked<IMediaServerService>;
    mediaServerFactory.getService.mockResolvedValue(mediaServer);
  });

  // Helper to setup media server mock for each test
  const mockMediaServerMetadata = (mediaData: MediaItem) => {
    mediaServer.getMetadata.mockResolvedValue(mediaData);
  };

  it('should do nothing if action is DO_NOTHING', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DO_NOTHING,
      type: 'movie',
    });
    const collectionMedia = createCollectionMedia(collection);

    mediaServer.getLibraries.mockResolvedValue(
      createMediaLibraries({
        id: collection.libraryId.toString(),
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(collectionsService.removeFromCollection).not.toHaveBeenCalled();
  });

  it('should delete from disk', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'show',
    });
    const collectionMedia = createCollectionMedia(collection);

    mediaServer.getLibraries.mockResolvedValue(
      createMediaLibraries({
        id: collection.libraryId.toString(),
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(collectionsService.removeFromCollection).toHaveBeenCalledTimes(1);
    expect(mediaServer.deleteFromDisk).toHaveBeenCalled();
  });

  it('should call Radarr action handler', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      radarrSettingsId: 1,
      type: 'movie',
    });
    const collectionMedia = createCollectionMedia(collection);

    mediaServer.getLibraries.mockResolvedValue(
      createMediaLibraries({
        id: collection.libraryId.toString(),
        type: 'movie',
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(collectionsService.removeFromCollection).toHaveBeenCalledTimes(1);
    expect(radarrActionHandler.handleAction).toHaveBeenCalled();
  });

  it('should call Sonarr action handler', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      sonarrSettingsId: 1,
      type: 'show',
    });
    const collectionMedia = createCollectionMedia(collection);

    mediaServer.getLibraries.mockResolvedValue(
      createMediaLibraries({
        id: collection.libraryId.toString(),
        type: 'show',
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(collectionsService.removeFromCollection).toHaveBeenCalledTimes(1);
    expect(sonarrActionHandler.handleAction).toHaveBeenCalled();
  });

  it('should call removeSeasonRequest for seasons', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      forceSeerr: true,
      type: 'season',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection);

    settings.seerrConfigured.mockReturnValue(true);

    mediaServer.getLibraries.mockResolvedValue(
      createMediaLibraries({
        id: collection.libraryId.toString(),
        type: 'show',
      }),
    );
    mockMediaServerMetadata(collectionMedia.mediaData);

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(seerrApi.removeSeasonRequest).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      collectionMedia.mediaData.index,
    );
    expect(seerrApi.removeSeasonRequest).toHaveBeenCalledTimes(1);
  });

  it('should call removeSeasonRequest for episodes', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      forceSeerr: true,
      type: 'episode',
    });
    const collectionMedia = createCollectionMediaWithMetadata(collection);

    settings.seerrConfigured.mockReturnValue(true);

    mediaServer.getLibraries.mockResolvedValue(
      createMediaLibraries({
        id: collection.libraryId.toString(),
        type: 'show',
      }),
    );
    mockMediaServerMetadata(collectionMedia.mediaData);

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(seerrApi.removeSeasonRequest).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      collectionMedia.mediaData.parentIndex,
    );
    expect(seerrApi.removeSeasonRequest).toHaveBeenCalledTimes(1);
  });

  it('should call removeMediaByTmdbId for movies', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      forceSeerr: true,
      type: 'movie',
    });
    const collectionMedia = createCollectionMedia(collection);

    settings.seerrConfigured.mockReturnValue(true);

    mediaServer.getLibraries.mockResolvedValue(
      createMediaLibraries({
        id: collection.libraryId.toString(),
        type: 'movie',
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(seerrApi.removeMediaByTmdbId).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      'movie',
    );
    expect(seerrApi.removeMediaByTmdbId).toHaveBeenCalledTimes(1);
  });

  it('should call removeMediaByTmdbId for shows', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      forceSeerr: true,
      type: 'show',
    });
    const collectionMedia = createCollectionMedia(collection);

    settings.seerrConfigured.mockReturnValue(true);

    mediaServer.getLibraries.mockResolvedValue(
      createMediaLibraries({
        id: collection.libraryId.toString(),
        type: 'show',
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(seerrApi.removeMediaByTmdbId).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      'tv',
    );
    expect(seerrApi.removeMediaByTmdbId).toHaveBeenCalledTimes(1);
  });

  it('should not call SeerrApiService if forceSeerr is false', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      forceSeerr: false,
      type: 'movie',
    });
    const collectionMedia = createCollectionMedia(collection);

    mediaServer.getLibraries.mockResolvedValue(
      createMediaLibraries({
        id: collection.libraryId.toString(),
        type: 'movie',
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(seerrApi.removeMediaByTmdbId).not.toHaveBeenCalled();
    expect(seerrApi.removeSeasonRequest).not.toHaveBeenCalled();
  });

  it('should not call SeerrApiService if Seerr is not configured', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      forceSeerr: false,
      type: 'movie',
    });
    const collectionMedia = createCollectionMedia(collection);

    settings.seerrConfigured.mockReturnValue(false);

    mediaServer.getLibraries.mockResolvedValue(
      createMediaLibraries({
        id: collection.libraryId.toString(),
        type: 'movie',
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(seerrApi.removeMediaByTmdbId).not.toHaveBeenCalled();
    expect(seerrApi.removeSeasonRequest).not.toHaveBeenCalled();
  });
});
