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
import { ArrLookupCache } from '../helpers/arr-lookup-cache';
import { RadarrGetterService } from './radarr-getter.service';

// Let the memo's eviction callback (chained on the resolved promise) run.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe('RadarrGetterService', () => {
  let radarrGetterService: RadarrGetterService;
  let servarrService: Mocked<ServarrService>;
  let metadataService: Mocked<MetadataService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(RadarrGetterService).compile();

    radarrGetterService = unit;
    servarrService = unitRef.get(ServarrService);
    metadataService = unitRef.get(MetadataService);
    logger = unitRef.get(MaintainerrLogger);

    metadataService.resolveLookupCandidatesFromMediaItemForService.mockResolvedValue(
      [{ providerKey: 'tmdb', id: 1 }],
    );
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

  // A transient Radarr outage must fail closed: the getter returns undefined so
  // the comparator skips the item and preserves collection membership, rather
  // than returning null (definitive absence) and dropping the item from the
  // collection for that run. (#3125)
  describe('transient lookup failure (#3125)', () => {
    let collectionMedia: CollectionMedia;
    let mediaItem: MediaItem;

    beforeEach(() => {
      collectionMedia = createCollectionMedia('movie');
      collectionMedia.collection.radarrSettingsId = 1;
      mediaItem = createMediaItem({ type: 'movie' });
    });

    // id 0 = 'addDate'
    const callAddDate = () =>
      radarrGetterService.get(
        0,
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
        }),
      );

    it('returns undefined (fail closed) when the movie lookup fails transiently', async () => {
      const mockedRadarrApi = mockRadarrApi();
      jest
        .spyOn(mockedRadarrApi, 'getMovieByTmdbId')
        .mockResolvedValue(undefined);

      await expect(callAddDate()).resolves.toBeUndefined();
    });

    it('returns null when Radarr confirms the movie is not tracked', async () => {
      const mockedRadarrApi = mockRadarrApi();
      jest.spyOn(mockedRadarrApi, 'getMovieByTmdbId').mockResolvedValue(null);

      await expect(callAddDate()).resolves.toBeNull();
    });
  });

  // Scope handles mirroring Sonarr's seriesTitle/seriesId (#3220).
  describe('movieTitle / movieId', () => {
    let collectionMedia: CollectionMedia;
    let mediaItem: MediaItem;

    beforeEach(() => {
      collectionMedia = createCollectionMedia('movie');
      collectionMedia.collection.radarrSettingsId = 1;
      mediaItem = createMediaItem({ type: 'movie' });
    });

    const call = (propertyId: number) =>
      radarrGetterService.get(
        propertyId,
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
        }),
      );

    it('returns the Radarr movie title', async () => {
      mockRadarrApi(createRadarrMovie({ title: 'Sample Feature' }));

      await expect(call(25)).resolves.toBe('Sample Feature');
    });

    it('returns the Radarr movie id', async () => {
      mockRadarrApi(createRadarrMovie({ id: 4711 }));

      await expect(call(26)).resolves.toBe(4711);
    });

    it('returns undefined (fail closed) when the movie lookup fails transiently', async () => {
      const mockedRadarrApi = mockRadarrApi();
      jest
        .spyOn(mockedRadarrApi, 'getMovieByTmdbId')
        .mockResolvedValue(undefined);

      await expect(call(26)).resolves.toBeUndefined();
    });

    it('returns null when Radarr confirms the movie is not tracked', async () => {
      const mockedRadarrApi = mockRadarrApi();
      jest.spyOn(mockedRadarrApi, 'getMovieByTmdbId').mockResolvedValue(null);

      await expect(call(26)).resolves.toBeNull();
    });
  });

  // The candidate resolution that precedes the arr lookup ran once per rule
  // condition; the run-scoped ArrLookupCache now memoizes it so it runs once per
  // item (#3285). Mirrors the arr identity lookup's run-scoped dedup (#2897).
  describe('candidate resolution memoization (#3285)', () => {
    let collectionMedia: CollectionMedia;
    let mediaItem: MediaItem;

    beforeEach(() => {
      collectionMedia = createCollectionMedia('movie');
      collectionMedia.collection.radarrSettingsId = 1;
      mediaItem = createMediaItem({ type: 'movie' });
      mockRadarrApi(createRadarrMovie());
    });

    // id 25 = movieTitle - a plain lookup that goes through candidate resolution.
    const call = (arrLookupCache?: ArrLookupCache) =>
      radarrGetterService.get(
        25,
        mediaItem,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'movie',
        }),
        undefined,
        arrLookupCache,
      );

    it('resolves candidates once per item across conditions sharing a run cache', async () => {
      const cache = new ArrLookupCache();

      await call(cache);
      await call(cache); // second condition, same item + same run cache

      expect(
        metadataService.resolveLookupCandidatesFromMediaItemForService,
      ).toHaveBeenCalledTimes(1);
    });

    it('re-resolves per call when no run cache is provided (unchanged behaviour)', async () => {
      await call();
      await call();

      expect(
        metadataService.resolveLookupCandidatesFromMediaItemForService,
      ).toHaveBeenCalledTimes(2);
    });

    it('evicts an empty resolution so a later condition retries (transient safety, #3125)', async () => {
      metadataService.resolveLookupCandidatesFromMediaItemForService
        .mockResolvedValueOnce([]) // transient: nothing resolved
        .mockResolvedValue([{ providerKey: 'tmdb', id: 1 }]);
      const cache = new ArrLookupCache();

      await call(cache); // empty -> evicted from the memo
      await flushMicrotasks();
      await call(cache); // retries instead of serving the stale empty result

      expect(
        metadataService.resolveLookupCandidatesFromMediaItemForService,
      ).toHaveBeenCalledTimes(2);
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
