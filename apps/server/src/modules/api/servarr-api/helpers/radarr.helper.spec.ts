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

    // The bulk endpoint de-dupes server-side, so re-adding an existing
    // exclusion is a no-op rather than the HTTP 400 the singular endpoint
    // returns.
    it('adds the exclusion via the de-duping bulk endpoint', async () => {
      postSpy.mockResolvedValue([exclusionFor(movie)]);

      await expect(unmonitorWithExclusion()).resolves.toBe(true);
      expect(postSpy).toHaveBeenCalledWith('/exclusions/bulk', [
        exclusionFor(movie),
      ]);
    });

    // Radarr's bulk endpoint documents 200 with no response schema, so a
    // successful add can have an empty body (''); only undefined (a failed
    // request) is a failure.
    it('treats a successful empty-body response as success', async () => {
      postSpy.mockResolvedValue('');

      await expect(unmonitorWithExclusion()).resolves.toBe(true);
    });

    it('returns false when the bulk exclusion request fails', async () => {
      postSpy.mockResolvedValue(undefined);

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
});
