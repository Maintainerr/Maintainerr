import { Mocked, TestBed } from '@suites/unit';
import {
  createCollection,
  createCollectionMedia,
  createCollectionMediaWithPlexData,
  createPlexLibraries,
} from '../../../test/utils/data';
import { RadarrActionHandler } from '../actions/radarr-action-handler';
import { SonarrActionHandler } from '../actions/sonarr-action-handler';
import { OverseerrApiService } from '../api/overseerr-api/overseerr-api.service';
import { EPlexDataType } from '../api/plex-api/enums/plex-data-type-enum';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { SettingsService } from '../settings/settings.service';
import { CollectionHandler } from './collection-handler';
import { CollectionsService } from './collections.service';
import { ServarrAction } from './interfaces/collection.interface';

describe('CollectionHandler', () => {
  let collectionHandler: CollectionHandler;
  let plexApi: Mocked<PlexApiService>;
  let collectionsService: Mocked<CollectionsService>;
  let radarrActionHandler: Mocked<RadarrActionHandler>;
  let sonarrActionHandler: Mocked<SonarrActionHandler>;
  let overseerrApi: Mocked<OverseerrApiService>;
  let settings: Mocked<SettingsService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(CollectionHandler).compile();

    collectionHandler = unit;
    plexApi = unitRef.get(PlexApiService);
    collectionsService = unitRef.get(CollectionsService);
    radarrActionHandler = unitRef.get(RadarrActionHandler);
    sonarrActionHandler = unitRef.get(SonarrActionHandler);
    overseerrApi = unitRef.get(OverseerrApiService);
    settings = unitRef.get(SettingsService);
  });

  it('should do nothing if action is DO_NOTHING', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DO_NOTHING,
      type: EPlexDataType.MOVIES,
    });
    const collectionMedia = createCollectionMedia(collection);

    plexApi.getLibraries.mockResolvedValue(
      createPlexLibraries({
        key: collection.libraryId.toString(),
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(collectionsService.removeFromCollection).not.toHaveBeenCalled();
  });

  it('should delete from disk', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: EPlexDataType.SHOWS,
    });
    const collectionMedia = createCollectionMedia(collection);

    plexApi.getLibraries.mockResolvedValue(
      createPlexLibraries({
        key: collection.libraryId.toString(),
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(collectionsService.removeFromCollection).toHaveBeenCalledTimes(1);
    expect(plexApi.deleteMediaFromDisk).toHaveBeenCalled();
  });

  it('should call Radarr action handler', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      radarrSettingsId: 1,
      type: EPlexDataType.MOVIES,
    });
    const collectionMedia = createCollectionMedia(collection);

    plexApi.getLibraries.mockResolvedValue(
      createPlexLibraries({
        key: collection.libraryId.toString(),
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
      type: EPlexDataType.SHOWS,
    });
    const collectionMedia = createCollectionMedia(collection);

    plexApi.getLibraries.mockResolvedValue(
      createPlexLibraries({
        key: collection.libraryId.toString(),
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
      forceOverseerr: true,
      type: EPlexDataType.SEASONS,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection);

    settings.overseerrConfigured.mockReturnValue(true);

    plexApi.getLibraries.mockResolvedValue(
      createPlexLibraries({
        key: collection.libraryId.toString(),
        type: 'show',
      }),
    );
    plexApi.getMetadata.mockResolvedValue(collectionMedia.plexData);

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(overseerrApi.removeSeasonRequest).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      collectionMedia.plexData.index,
    );
    expect(overseerrApi.removeSeasonRequest).toHaveBeenCalledTimes(1);
  });

  it('should call removeSeasonRequest for episodes', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      forceOverseerr: true,
      type: EPlexDataType.EPISODES,
    });
    const collectionMedia = createCollectionMediaWithPlexData(collection);

    settings.overseerrConfigured.mockReturnValue(true);

    plexApi.getLibraries.mockResolvedValue(
      createPlexLibraries({
        key: collection.libraryId.toString(),
        type: 'show',
      }),
    );
    plexApi.getMetadata.mockResolvedValue(collectionMedia.plexData);

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(overseerrApi.removeSeasonRequest).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      collectionMedia.plexData.parentIndex,
    );
    expect(overseerrApi.removeSeasonRequest).toHaveBeenCalledTimes(1);
  });

  it('should call removeMediaByTmdbId for movies', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      forceOverseerr: true,
      type: EPlexDataType.MOVIES,
    });
    const collectionMedia = createCollectionMedia(collection);

    settings.overseerrConfigured.mockReturnValue(true);

    plexApi.getLibraries.mockResolvedValue(
      createPlexLibraries({
        key: collection.libraryId.toString(),
        type: 'movie',
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(overseerrApi.removeMediaByTmdbId).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      'movie',
    );
    expect(overseerrApi.removeMediaByTmdbId).toHaveBeenCalledTimes(1);
  });

  it('should call removeMediaByTmdbId for shows', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      forceOverseerr: true,
      type: EPlexDataType.SHOWS,
    });
    const collectionMedia = createCollectionMedia(collection);

    settings.overseerrConfigured.mockReturnValue(true);

    plexApi.getLibraries.mockResolvedValue(
      createPlexLibraries({
        key: collection.libraryId.toString(),
        type: 'show',
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(overseerrApi.removeMediaByTmdbId).toHaveBeenCalledWith(
      collectionMedia.tmdbId,
      'tv',
    );
    expect(overseerrApi.removeMediaByTmdbId).toHaveBeenCalledTimes(1);
  });

  it('should not call OverseerrApiService if forceOverseerr is false', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      forceOverseerr: false,
      type: EPlexDataType.MOVIES,
    });
    const collectionMedia = createCollectionMedia(collection);

    plexApi.getLibraries.mockResolvedValue(
      createPlexLibraries({
        key: collection.libraryId.toString(),
        type: 'movie',
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(overseerrApi.removeMediaByTmdbId).not.toHaveBeenCalled();
    expect(overseerrApi.removeSeasonRequest).not.toHaveBeenCalled();
  });

  it('should not call OverseerrApiService if Overseerr is not configured', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      forceOverseerr: false,
      type: EPlexDataType.MOVIES,
    });
    const collectionMedia = createCollectionMedia(collection);

    settings.overseerrConfigured.mockReturnValue(false);

    plexApi.getLibraries.mockResolvedValue(
      createPlexLibraries({
        key: collection.libraryId.toString(),
        type: 'movie',
      }),
    );

    await collectionHandler.handleMedia(collection, collectionMedia);

    expect(overseerrApi.removeMediaByTmdbId).not.toHaveBeenCalled();
    expect(overseerrApi.removeSeasonRequest).not.toHaveBeenCalled();
  });
});
