import { createSonarrSeries } from '../../../../../test/utils/data';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { SonarrApi } from './sonarr.helper';

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

describe('SonarrApi', () => {
  let sonarrApi: SonarrApi;
  let logger: MaintainerrLogger;

  beforeEach(() => {
    logger = createLoggerMock();
    sonarrApi = new SonarrApi(
      { url: 'http://localhost:8989', apiKey: 'test' },
      logger,
    );
  });

  describe('getSeriesByTmdbId', () => {
    it('returns the matching series when Sonarr returns an unfiltered list', async () => {
      const unrelatedSeries = createSonarrSeries({ id: 10, tmdbId: 100 });
      const matchingSeries = createSonarrSeries({ id: 20, tmdbId: 200 });

      jest
        .spyOn(sonarrApi, 'get')
        .mockResolvedValue([unrelatedSeries, matchingSeries]);

      await expect(sonarrApi.getSeriesByTmdbId(200)).resolves.toBe(
        matchingSeries,
      );
    });

    it('returns undefined when no returned series matches the requested TMDB id', async () => {
      const unrelatedSeries = createSonarrSeries({ id: 10, tmdbId: 100 });

      jest.spyOn(sonarrApi, 'get').mockResolvedValue([unrelatedSeries]);

      await expect(sonarrApi.getSeriesByTmdbId(200)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Could not retrieve show by tmdb ID 200',
      );
    });
  });
});
