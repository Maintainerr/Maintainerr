import { Mocked } from '@suites/doubles.jest';
import { createRadarrMovie } from '../../../../../test/utils/data';
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

    // Radarr validates the exclusion POST and returns HTTP 400 when the movie is
    // already excluded; the goal ("movie is excluded") is already met, so a
    // re-run must not fail the whole collection action (#3084).
    it('treats an already-excluded 400 as success', async () => {
      postSpy.mockRejectedValue({
        isAxiosError: true,
        response: { status: 400 },
      });

      await expect(unmonitorWithExclusion()).resolves.toBe(true);
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

      expect(getWithoutCacheSpy).toHaveBeenCalledWith('/movie?tmdbId=123');
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
});
