import { Mocked } from '@suites/doubles.jest';
import {
  createRadarrMovie,
  createRadarrMovieFile,
} from '../../../../../test/utils/data';
import { MaintainerrLogger } from '../../../logging/logs.service';
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

  it('returns false when adding an import exclusion fails', async () => {
    const movie = createRadarrMovie({
      id: 5,
      monitored: true,
      tmdbId: 123,
      title: 'Movie Title',
      year: 2024,
    });

    jest.spyOn(api, 'getWithoutCache').mockImplementation(async (endpoint) => {
      if (endpoint === 'movie/5') {
        return movie;
      }

      if (endpoint === 'moviefile?movieId=5') {
        return [createRadarrMovieFile()];
      }

      return undefined;
    });

    jest.spyOn(api as any, 'runPut').mockResolvedValue(true);
    jest.spyOn(api as any, 'runDelete').mockResolvedValue(true);
    jest.spyOn(api, 'post').mockResolvedValue(undefined);

    await expect(
      api.updateMovie(5, {
        monitored: false,
        addImportExclusion: true,
      }),
    ).resolves.toBe(false);

    expect(api.post).toHaveBeenCalledWith('/exclusions', {
      tmdbId: movie.tmdbId,
      movieTitle: movie.title,
      movieYear: movie.year,
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
