import { MediaItem } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import {
  createArrDiskspaceResource,
  createCollectionMedia,
  createMediaItem,
  createRadarrMovie,
  createRadarrMovieFile,
  createRadarrQuality,
  createRuleDto,
  createRulesDto,
} from '../../../../test/utils/data';
import { RadarrApi } from '../../api/servarr-api/helpers/radarr.helper';
import { RadarrMovie } from '../../api/servarr-api/interfaces/radarr.interface';
import { ServarrService } from '../../api/servarr-api/servarr.service';
import { CollectionMedia } from '../../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../../logging/logs.service';
import { MetadataService } from '../../metadata/metadata.service';
import { RadarrGetterService } from './radarr-getter.service';

describe('RadarrGetterService', () => {
  let radarrGetterService: RadarrGetterService;
  let servarrService: Mocked<ServarrService>;
  let metadataService: Mocked<MetadataService>;
  let tmdbIdService: {
    getTmdbIdFromMediaServerId: jest.Mock;
  };
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(RadarrGetterService).compile();

    radarrGetterService = unit;
    servarrService = unitRef.get(ServarrService);
    metadataService = unitRef.get(MetadataService);
    logger = unitRef.get(MaintainerrLogger);

    tmdbIdService = {
      getTmdbIdFromMediaServerId: jest.fn(),
    };

    metadataService.resolveIdsFromMediaItem.mockImplementation(async () => {
      const tmdb = await tmdbIdService.getTmdbIdFromMediaServerId();

      if (!tmdb) {
        return undefined;
      }

      return { tmdb: tmdb.id, type: tmdb.type } as any;
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('movie file properties', () => {
    let collectionMedia: CollectionMedia;
    let mediaItem: MediaItem;

    beforeEach(() => {
      collectionMedia = createCollectionMedia('movie');
      collectionMedia.collection.radarrSettingsId = 1;
      mediaItem = createMediaItem({ type: 'movie' });
      tmdbIdService.getTmdbIdFromMediaServerId.mockResolvedValue({
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
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
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
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
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
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
        }),
      );

      expect(response).toBe(false);
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
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
        }),
      );

      expect(response).toBe('WEBDL-1080p');
    });

    it('should return null when no movie file exists (quality)', async () => {
      const movie = createRadarrMovie({
        movieFile: undefined,
      });
      mockRadarrApi(movie);

      const response = await radarrGetterService.get(
        21,
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
        }),
      );

      expect(response).toBe(null);
    });

    it('should return audio languages', async () => {
      const movie = createRadarrMovie({
        movieFile: createRadarrMovieFile({
          mediaInfo: { audioLanguages: 'eng' } as any,
        }),
      });
      mockRadarrApi(movie);

      const response = await radarrGetterService.get(
        22,
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
        }),
      );

      expect(response).toBe('eng');
    });

    it('should return null when no movie file exists (audio)', async () => {
      const movie = createRadarrMovie({
        movieFile: undefined,
      });
      mockRadarrApi(movie);

      const response = await radarrGetterService.get(
        22,
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
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
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
        }),
      );

      expect(response).toBe(null);
    });
  });

  describe('diskspace properties', () => {
    let collectionMedia: CollectionMedia;
    let mediaItem: MediaItem;
    let mockedRadarrApi: RadarrApi;

    beforeEach(() => {
      collectionMedia = createCollectionMedia('movie');
      collectionMedia.collection.radarrSettingsId = 1;
      mediaItem = createMediaItem({ type: 'movie' });
      mockedRadarrApi = mockRadarrApi();
    });

    it('should use merged diskspace data for targeted remaining space rules', async () => {
      const getDiskspaceWithRootFoldersSpy = jest
        .spyOn(mockedRadarrApi, 'getDiskspaceWithRootFolders')
        .mockResolvedValue([
          createArrDiskspaceResource({
            path: '/movies',
            freeSpace: 10 * 1073741824,
          }),
          createArrDiskspaceResource({
            path: '/downloads',
            freeSpace: 5 * 1073741824,
          }),
        ]);
      const getDiskspaceSpy = jest.spyOn(mockedRadarrApi, 'getDiskspace');

      const response = await radarrGetterService.get(
        23,
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
        }),
        createRuleDto({ arrDiskPath: '/movies/' }),
      );

      expect(response).toBe(10);
      expect(getDiskspaceWithRootFoldersSpy).toHaveBeenCalled();
      expect(getDiskspaceSpy).not.toHaveBeenCalled();
    });

    it('should use raw diskspace data for total space rules', async () => {
      const getDiskspaceSpy = jest
        .spyOn(mockedRadarrApi, 'getDiskspace')
        .mockResolvedValue([
          createArrDiskspaceResource({
            path: '/movies',
            totalSpace: 30 * 1073741824,
          }),
        ]);
      const getDiskspaceWithRootFoldersSpy = jest.spyOn(
        mockedRadarrApi,
        'getDiskspaceWithRootFolders',
      );

      const response = await radarrGetterService.get(
        24,
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
        }),
        createRuleDto({ arrDiskPath: '/movies' }),
      );

      expect(response).toBe(30);
      expect(getDiskspaceSpy).toHaveBeenCalled();
      expect(getDiskspaceWithRootFoldersSpy).not.toHaveBeenCalled();
    });
  });

  const mockRadarrApi = (movie?: RadarrMovie) => {
    const mockedRadarrApi = new RadarrApi(
      { url: 'http://localhost:7878', apiKey: 'test' },
      logger as any,
    );
    const mockedServarrService = new ServarrService({} as any, logger as any);
    jest
      .spyOn(mockedServarrService, 'getRadarrApiClient')
      .mockResolvedValue(mockedRadarrApi);

    if (movie) {
      jest.spyOn(mockedRadarrApi, 'getMovieByTvdbId').mockResolvedValue(movie);
      jest.spyOn(mockedRadarrApi, 'getMovieByTmdbId').mockResolvedValue(movie);
    } else {
      jest
        .spyOn(mockedRadarrApi, 'getMovieByTvdbId')
        .mockImplementation(jest.fn());
      jest
        .spyOn(mockedRadarrApi, 'getMovieByTmdbId')
        .mockImplementation(jest.fn());
    }

    servarrService.getRadarrApiClient.mockResolvedValue(mockedRadarrApi);

    return mockedRadarrApi;
  };
});
