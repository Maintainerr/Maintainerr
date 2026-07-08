import { Mocked } from '@suites/doubles.jest';
import {
  createRadarrMovie,
  createRadarrMovieFile,
} from '../../../../../test/utils/data';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { RadarrImportListExclusion } from '../interfaces/radarr.interface';
import { RadarrApi } from './radarr.helper';

describe('RadarrApi', () => {
  let api: RadarrApi;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(() => {
    logger = {
      setContext: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
    } as unknown as Mocked<MaintainerrLogger>;

    api = new RadarrApi(
      { url: 'http://localhost:7878', apiKey: 'test' },
      logger as any,
    );
  });

  describe('updateMovie import list exclusions', () => {
    const movie = createRadarrMovie({
      id: 5,
      monitored: true,
      tmdbId: 123,
      title: 'Movie Title',
      year: 2024,
    });

    const exclusionFor = (m: typeof movie): RadarrImportListExclusion => ({
      tmdbId: m.tmdbId,
      movieTitle: m.title,
      movieYear: m.year,
    });

    let postSpy: jest.SpyInstance;

    beforeEach(() => {
      jest
        .spyOn(api, 'getWithoutCache')
        .mockImplementation(async (endpoint) => {
          if (endpoint === `movie/${movie.id}`) return movie;
          return undefined;
        });
      jest.spyOn(api as any, 'runPut').mockResolvedValue(true);
      postSpy = jest.spyOn(api, 'post');
    });

    const unmonitorWithExclusion = () =>
      api.updateMovie(movie.id, {
        monitored: false,
        addImportExclusion: true,
      });

    it('adds the exclusion via the de-duping bulk endpoint', async () => {
      postSpy.mockResolvedValue([exclusionFor(movie)]);

      await expect(unmonitorWithExclusion()).resolves.toBe(true);
      expect(postSpy).toHaveBeenCalledWith(
        '/exclusions/bulk',
        [exclusionFor(movie)],
        undefined,
        { rethrow: true },
      );
    });

    // Radarr validates the exclusion POST and returns HTTP 400 with the
    // uniqueness message when the movie is already excluded; the goal ("movie is
    // excluded") is already met, so a re-run must not fail the whole collection
    // action (#3084).
    it('treats the "already added" 400 as success', async () => {
      postSpy.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 400,
          data: [
            {
              propertyName: 'TmdbId',
              errorMessage: 'This exclusion has already been added.',
            },
          ],
        },
      });

      await expect(unmonitorWithExclusion()).resolves.toBe(true);
    });

    // A 400 from a different validation rule (e.g. an invalid year) is a real
    // failure - it must not be silently reported as "already excluded".
    it('returns false on a non-duplicate validation 400', async () => {
      postSpy.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 400,
          data: [
            {
              propertyName: 'MovieYear',
              errorMessage: 'Must be greater than or equal to 0',
            },
          ],
        },
      });

      await expect(unmonitorWithExclusion()).resolves.toBe(false);
    });

    it('returns false when the exclusion request fails for another reason', async () => {
      postSpy.mockRejectedValue({
        isAxiosError: true,
        response: { status: 500 },
      });

      await expect(unmonitorWithExclusion()).resolves.toBe(false);
    });
  });

  describe('cache coherency', () => {
    it('getMovieByTmdbId reads uncached so post-mutation state is never stale', async () => {
      const movie = createRadarrMovie({ id: 5, tmdbId: 123 });
      const getSpy = jest
        .spyOn(api, 'get')
        .mockResolvedValue(undefined as never);
      const getWithoutCacheSpy = jest
        .spyOn(api, 'getWithoutCache')
        .mockResolvedValue([movie]);

      await api.getMovieByTmdbId(123);

      expect(getWithoutCacheSpy).toHaveBeenCalledWith('/movie?tmdbId=123', {
        timeout: 20000,
      });
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('updateMovie reads the movie uncached before its read-modify-write', async () => {
      const movie = createRadarrMovie({ id: 5, tmdbId: 123, monitored: true });
      const getSpy = jest
        .spyOn(api, 'get')
        .mockResolvedValue(undefined as never);
      jest.spyOn(api, 'getWithoutCache').mockResolvedValue(movie);
      const runPutSpy = jest
        .spyOn(api as any, 'runPut')
        .mockResolvedValue(true);

      await expect(api.updateMovie(5, { monitored: false })).resolves.toBe(
        true,
      );

      expect(getSpy).not.toHaveBeenCalled();
      expect(runPutSpy).toHaveBeenCalledWith(
        'movie/5',
        JSON.stringify({ ...movie, monitored: false }),
      );
    });
  });

  describe('updateMovie slow-PUT race condition (#3228)', () => {
    const movie = createRadarrMovie({ id: 5, monitored: true });

    it('deletes the movie files when PUT timed out but Radarr confirms the update (timeout race)', async () => {
      const getWithoutCacheSpy = jest
        .spyOn(api, 'getWithoutCache')
        .mockResolvedValueOnce(movie)
        .mockResolvedValueOnce({ ...movie, monitored: false })
        .mockResolvedValueOnce([createRadarrMovieFile({ id: 900 })]);
      jest.spyOn(api as any, 'runPut').mockResolvedValue(false);
      const runDeleteSpy = jest
        .spyOn(api as any, 'runDelete')
        .mockResolvedValue(true);

      await expect(
        api.updateMovie(5, { monitored: false, deleteFiles: true }),
      ).resolves.toBe(true);

      // Same slow-instance headroom as getMovieByTmdbId (#3181).
      expect(getWithoutCacheSpy).toHaveBeenNthCalledWith(2, 'movie/5', {
        timeout: 20000,
      });
      expect(runDeleteSpy).toHaveBeenCalledWith('moviefile/900');
    });

    it('fails closed and warns when PUT failed and Radarr still shows the movie monitored', async () => {
      jest
        .spyOn(api, 'getWithoutCache')
        .mockResolvedValueOnce(movie)
        .mockResolvedValueOnce({ ...movie, monitored: true });
      jest.spyOn(api as any, 'runPut').mockResolvedValue(false);
      const runDeleteSpy = jest
        .spyOn(api as any, 'runDelete')
        .mockResolvedValue(true);

      await expect(
        api.updateMovie(5, { monitored: false, deleteFiles: true }),
      ).resolves.toBe(false);

      expect(runDeleteSpy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Could not confirm movie 5 was updated; leaving its files in place.',
      );
    });

    it('fails closed when the verification lookup fails', async () => {
      jest
        .spyOn(api, 'getWithoutCache')
        .mockResolvedValueOnce(movie)
        .mockResolvedValueOnce(undefined);
      jest.spyOn(api as any, 'runPut').mockResolvedValue(false);
      const runDeleteSpy = jest
        .spyOn(api as any, 'runDelete')
        .mockResolvedValue(true);

      await expect(
        api.updateMovie(5, { monitored: false, deleteFiles: true }),
      ).resolves.toBe(false);

      expect(runDeleteSpy).not.toHaveBeenCalled();
    });

    it('fails closed when a quality profile change is not reflected', async () => {
      jest
        .spyOn(api, 'getWithoutCache')
        .mockResolvedValueOnce({ ...movie, qualityProfileId: 4 })
        .mockResolvedValueOnce({ ...movie, qualityProfileId: 4 });
      jest.spyOn(api as any, 'runPut').mockResolvedValue(false);

      await expect(api.updateMovie(5, { qualityProfileId: 9 })).resolves.toBe(
        false,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Could not confirm movie 5 was updated.',
      );
    });

    it('performs no verification read when the PUT succeeds', async () => {
      const getWithoutCacheSpy = jest
        .spyOn(api, 'getWithoutCache')
        .mockResolvedValue(movie);
      jest.spyOn(api as any, 'runPut').mockResolvedValue(true);

      await expect(api.updateMovie(5, { monitored: false })).resolves.toBe(
        true,
      );

      expect(getWithoutCacheSpy).toHaveBeenCalledTimes(1);
    });

    it('fails closed when the movie file listing fails instead of reporting success', async () => {
      jest
        .spyOn(api, 'getWithoutCache')
        .mockResolvedValueOnce(movie)
        .mockResolvedValueOnce(undefined);
      jest.spyOn(api as any, 'runPut').mockResolvedValue(true);
      const runDeleteSpy = jest
        .spyOn(api as any, 'runDelete')
        .mockResolvedValue(true);

      await expect(
        api.updateMovie(5, { monitored: false, deleteFiles: true }),
      ).resolves.toBe(false);

      expect(runDeleteSpy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        "Could not list movie 5's files; leaving them in place.",
      );
    });
  });

  // Same null/undefined contract as Sonarr (#3125): `undefined` = the lookup
  // itself failed (fail closed), `null` = Radarr confirmed the movie isn't
  // tracked. getWithoutCache swallows HTTP errors to `undefined` without
  // throwing, so the failure must be detected from that value.
  describe('getMovieByTmdbId null/undefined contract (#3125)', () => {
    it('returns undefined when the lookup fails transiently (getWithoutCache → undefined)', async () => {
      jest.spyOn(api as any, 'getWithoutCache').mockResolvedValue(undefined);

      await expect(api.getMovieByTmdbId(123)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Error retrieving movie by TMDb ID 123',
      );
    });

    it('returns null when Radarr confirms the movie is not tracked (empty array)', async () => {
      jest.spyOn(api as any, 'getWithoutCache').mockResolvedValue([]);

      await expect(api.getMovieByTmdbId(123)).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Could not find Movie with TMDb id 123 in Radarr',
      );
    });

    it('returns the movie when Radarr has it', async () => {
      const movie = createRadarrMovie({ id: 5, tmdbId: 123 });
      jest.spyOn(api as any, 'getWithoutCache').mockResolvedValue([movie]);

      await expect(api.getMovieByTmdbId(123)).resolves.toEqual(
        expect.objectContaining({ id: 5 }),
      );
    });
  });

  describe('getDownloadIdsForMovie', () => {
    it('requests the movie history endpoint', async () => {
      const getWithoutCache = jest
        .spyOn(api as any, 'getWithoutCache')
        .mockResolvedValue([]);

      await api.getDownloadIdsForMovie(5);

      expect(getWithoutCache).toHaveBeenCalledWith('/history/movie?movieId=5');
    });

    it('returns deduped, lowercased hashes from grab/import events only', async () => {
      jest.spyOn(api as any, 'getWithoutCache').mockResolvedValue([
        { id: 1, eventType: 'grabbed', downloadId: 'ABCDEF' },
        {
          id: 2,
          eventType: 'downloadFolderImported',
          downloadId: '  abcdef  ',
        },
        {
          id: 3,
          eventType: 'grabbed',
          data: { torrentInfoHash: 'HASH-Z' },
        },
        // a torrent that only ever failed for this movie must not be removed
        { id: 4, eventType: 'downloadFailed', downloadId: 'failed' },
        { id: 5, eventType: 'movieFileDeleted', downloadId: 'deleted' },
      ]);

      const result = await api.getDownloadIdsForMovie(5);

      expect(result).toEqual(['abcdef', 'hash-z']);
    });

    it('returns [] when the history fetch throws', async () => {
      jest
        .spyOn(api as any, 'getWithoutCache')
        .mockRejectedValue(new Error('boom'));

      await expect(api.getDownloadIdsForMovie(5)).resolves.toEqual([]);
    });
  });

  describe('setMovieTags', () => {
    it('adds a tag to a batch of movies via the movie editor', async () => {
      const runPut = jest.spyOn(api as any, 'runPut').mockResolvedValue(true);

      await expect(api.setMovieTags([1, 2], 5, 'add')).resolves.toBe(true);

      expect(runPut).toHaveBeenCalledWith(
        'movie/editor',
        JSON.stringify({ movieIds: [1, 2], tags: [5], applyTags: 'add' }),
      );
    });

    it('removes a tag via the movie editor', async () => {
      const runPut = jest.spyOn(api as any, 'runPut').mockResolvedValue(true);

      await api.setMovieTags([3], 5, 'remove');

      expect(runPut).toHaveBeenCalledWith(
        'movie/editor',
        JSON.stringify({ movieIds: [3], tags: [5], applyTags: 'remove' }),
      );
    });

    it('no-ops on an empty id list (no request)', async () => {
      const runPut = jest.spyOn(api as any, 'runPut');

      await expect(api.setMovieTags([], 5, 'add')).resolves.toBe(true);
      expect(runPut).not.toHaveBeenCalled();
    });
  });
});
