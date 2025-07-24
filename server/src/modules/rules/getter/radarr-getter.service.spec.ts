import { Mocked, TestBed } from '@suites/unit';
import {
  createCollectionMedia,
  createPlexLibraryItem,
  createRadarrMovie,
  createRadarrMovieFile,
  createRadarrQuality,
  createRulesDto,
} from '../../../../test/utils/data';
import { EPlexDataType } from '../../api/plex-api/enums/plex-data-type-enum';
import { PlexLibraryItem } from '../../api/plex-api/interfaces/library.interfaces';
import { RadarrApi } from '../../api/servarr-api/helpers/radarr.helper';
import { RadarrMovie } from '../../api/servarr-api/interfaces/radarr.interface';
import { ServarrService } from '../../api/servarr-api/servarr.service';
import { TmdbIdService } from '../../api/tmdb-api/tmdb-id.service';
import { CollectionMedia } from '../../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../../logging/logs.service';
import { RadarrGetterService } from './radarr-getter.service';

describe('RadarrGetterService', () => {
  let radarrGetterService: RadarrGetterService;
  let servarrService: Mocked<ServarrService>;
  let tmdbIdService: Mocked<TmdbIdService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(RadarrGetterService).compile();

    radarrGetterService = unit;
    servarrService = unitRef.get(ServarrService);
    tmdbIdService = unitRef.get(TmdbIdService);
    logger = unitRef.get(MaintainerrLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('fileQualityCutoffMet', () => {
    let collectionMedia: CollectionMedia;
    let plexLibraryItem: PlexLibraryItem;

    beforeEach(() => {
      collectionMedia = createCollectionMedia(EPlexDataType.MOVIES);
      collectionMedia.collection.radarrSettingsId = 1;
      plexLibraryItem = createPlexLibraryItem('movie');
      tmdbIdService.getTmdbIdFromPlexRatingKey.mockResolvedValue({
        type: 'movie',
        id: 1,
      });
    });

    it('should return true when the cut off is met', async () => {
      const movie = createRadarrMovie({
        movieFile: createRadarrMovieFile({
          qualityCutoffNotMet: false,
        }),
      });
      mockRadarrApi(movie);

      const response = await radarrGetterService.get(
        20,
        plexLibraryItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EPlexDataType.MOVIES,
        }),
      );

      expect(response).toBe(true);
    });

    it('should return false when the cut off is not met', async () => {
      const movie = createRadarrMovie({
        movieFile: createRadarrMovieFile({
          qualityCutoffNotMet: true,
        }),
      });
      mockRadarrApi(movie);

      const response = await radarrGetterService.get(
        20,
        plexLibraryItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EPlexDataType.MOVIES,
        }),
      );

      expect(response).toBe(false);
    });

    it('should return false when no movie file exists', async () => {
      const movie = createRadarrMovie({
        movieFile: undefined,
      });
      mockRadarrApi(movie);

      const response = await radarrGetterService.get(
        20,
        plexLibraryItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EPlexDataType.MOVIES,
        }),
      );

      expect(response).toBe(false);
    });
  });

  describe('fileQualityName', () => {
    let collectionMedia: CollectionMedia;
    let plexLibraryItem: PlexLibraryItem;

    beforeEach(() => {
      collectionMedia = createCollectionMedia(EPlexDataType.MOVIES);
      collectionMedia.collection.radarrSettingsId = 1;
      plexLibraryItem = createPlexLibraryItem('movie');
      tmdbIdService.getTmdbIdFromPlexRatingKey.mockResolvedValue({
        type: 'movie',
        id: 1,
      });
    });

    it('should return quality name', async () => {
      const movie = createRadarrMovie({
        movieFile: createRadarrMovieFile({
          quality: {
            quality: createRadarrQuality({
              name: 'WEBDL-1080p',
            }),
          },
        }),
      });
      mockRadarrApi(movie);

      const response = await radarrGetterService.get(
        21,
        plexLibraryItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EPlexDataType.MOVIES,
        }),
      );

      expect(response).toBe('WEBDL-1080p');
    });

    it('should return null when no episode file exists', async () => {
      const movie = createRadarrMovie({
        movieFile: undefined,
      });
      mockRadarrApi(movie);

      const response = await radarrGetterService.get(
        21,
        plexLibraryItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EPlexDataType.MOVIES,
        }),
      );

      expect(response).toBe(null);
    });
  });

  describe('fileAudioLanguages', () => {
    let collectionMedia: CollectionMedia;
    let plexLibraryItem: PlexLibraryItem;

    beforeEach(() => {
      collectionMedia = createCollectionMedia(EPlexDataType.MOVIES);
      collectionMedia.collection.radarrSettingsId = 1;
      plexLibraryItem = createPlexLibraryItem('movie');
      tmdbIdService.getTmdbIdFromPlexRatingKey.mockResolvedValue({
        type: 'movie',
        id: 1,
      });
    });

    it('should return audio languages', async () => {
      const movie = createRadarrMovie({
        movieFile: createRadarrMovieFile({
          mediaInfo: {
            ...createRadarrMovieFile().mediaInfo,
            audioLanguages: 'eng',
          },
        }),
      });
      mockRadarrApi(movie);

      const response = await radarrGetterService.get(
        22,
        plexLibraryItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EPlexDataType.MOVIES,
        }),
      );

      expect(response).toBe('eng');
    });

    it('should return null when no movie file exists', async () => {
      const movie = createRadarrMovie({
        movieFile: undefined,
      });
      mockRadarrApi(movie);

      const response = await radarrGetterService.get(
        22,
        plexLibraryItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EPlexDataType.MOVIES,
        }),
      );

      expect(response).toBe(null);
    });

    it('should return null when no media info exists', async () => {
      const movie = createRadarrMovie({
        movieFile: createRadarrMovieFile({
          mediaInfo: undefined,
        }),
      });
      mockRadarrApi(movie);

      const response = await radarrGetterService.get(
        22,
        plexLibraryItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EPlexDataType.MOVIES,
        }),
      );

      expect(response).toBe(null);
    });
  });

  const mockRadarrApi = (movie?: RadarrMovie) => {
    const mockedRadarrApi = new RadarrApi({} as any, logger as any);
    const mockedServarrService = new ServarrService({} as any, logger as any);
    jest
      .spyOn(mockedServarrService, 'getRadarrApiClient')
      .mockResolvedValue(mockedRadarrApi);

    if (movie) {
      jest.spyOn(mockedRadarrApi, 'getMovieByTmdbId').mockResolvedValue(movie);
    } else {
      jest
        .spyOn(mockedRadarrApi, 'getMovieByTmdbId')
        .mockImplementation(jest.fn());
    }

    servarrService.getRadarrApiClient.mockResolvedValue(mockedRadarrApi);

    return mockedRadarrApi;
  };
});
