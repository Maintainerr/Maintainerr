import { createRadarrMovie } from '../../../../../test/utils/data';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { RadarrMovie } from '../interfaces/radarr.interface';
import { RadarrApi } from './radarr.helper';

function createLoggerMock(): MaintainerrLogger {
  return {
    setContext: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
  } as unknown as MaintainerrLogger;
}

describe('RadarrApi', () => {
  let radarrApi: RadarrApi;
  let logger: MaintainerrLogger;

  beforeEach(() => {
    logger = createLoggerMock();
    radarrApi = new RadarrApi(
      { url: 'http://localhost:7878', apiKey: 'test' },
      logger,
    );
  });

  describe('getMovieByTvdbId', () => {
    it('returns the exact TVDB match when the response exposes tvdbId', async () => {
      const unrelatedMovie = createRadarrMovie({ id: 10, tmdbId: 100 });
      const matchingMovie = {
        ...createRadarrMovie({ id: 20, tmdbId: 200 }),
        tvdbId: 300,
      } as RadarrMovie & { tvdbId: number };

      jest
        .spyOn(radarrApi, 'get')
        .mockResolvedValue([unrelatedMovie, matchingMovie]);

      await expect(radarrApi.getMovieByTvdbId(300)).resolves.toBe(
        matchingMovie,
      );
    });

    it('returns the single response when Radarr returns one movie without a tvdbId field', async () => {
      const movie = createRadarrMovie({ id: 20, tmdbId: 200 });

      jest.spyOn(radarrApi, 'get').mockResolvedValue([movie]);

      await expect(radarrApi.getMovieByTvdbId(300)).resolves.toBe(movie);
      expect(logger.debug).toHaveBeenCalledWith(
        'Falling back to a single unverified Radarr movie result for TVDB id 300. Radarr did not expose a matching tvdbId in the response.',
      );
    });

    it('returns undefined when multiple movies are returned without an exact TVDB match', async () => {
      const firstMovie = createRadarrMovie({ id: 10, tmdbId: 100 });
      const secondMovie = createRadarrMovie({ id: 20, tmdbId: 200 });

      jest.spyOn(radarrApi, 'get').mockResolvedValue([firstMovie, secondMovie]);

      await expect(radarrApi.getMovieByTvdbId(300)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Could not uniquely find movie with TVDB id 300 in Radarr',
      );
    });
  });
});
