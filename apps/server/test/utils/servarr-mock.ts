import { Mocked } from '@suites/doubles.jest';
import { RadarrApi } from '../../src/modules/api/servarr-api/helpers/radarr.helper';
import { SonarrApi } from '../../src/modules/api/servarr-api/helpers/sonarr.helper';
import { ServarrService } from '../../src/modules/api/servarr-api/servarr.service';
import { MaintainerrLogger } from '../../src/modules/logging/logs.service';

/**
 * Create a mocked RadarrApi instance and wire it to the given ServarrService mock.
 * All action methods (deleteMovie, updateMovie) are pre-spied as noop.
 */
export const mockRadarrApi = (
  servarrService: Mocked<ServarrService>,
  logger: Mocked<MaintainerrLogger>,
): RadarrApi => {
  const api = new RadarrApi(
    { url: 'http://localhost:7878', apiKey: 'test' },
    logger as any,
  );

  jest.spyOn(api, 'deleteMovie').mockImplementation(jest.fn());
  jest.spyOn(api, 'updateMovie').mockImplementation(jest.fn());

  servarrService.getRadarrApiClient.mockResolvedValue(api);

  return api;
};

/**
 * Create a mocked SonarrApi instance and wire it to the given ServarrService mock.
 * All action methods are pre-spied as noop.
 */
export const mockSonarrApi = (
  servarrService: Mocked<ServarrService>,
  logger: Mocked<MaintainerrLogger>,
): SonarrApi => {
  const api = new SonarrApi(
    { url: 'http://localhost:8989', apiKey: 'test' },
    logger as any,
  );

  jest.spyOn(api, 'unmonitorSeasons').mockImplementation(jest.fn());
  jest.spyOn(api, 'UnmonitorDeleteEpisodes').mockImplementation(jest.fn());
  jest.spyOn(api, 'deleteShow').mockImplementation(jest.fn());
  jest.spyOn(api, 'delete').mockImplementation(jest.fn());
  jest.spyOn(api, 'updateSeries').mockImplementation(jest.fn());

  servarrService.getSonarrApiClient.mockResolvedValue(api);

  return api;
};

/**
 * Assert that no Radarr mutation methods were invoked.
 */
export const validateNoRadarrActionsTaken = (radarrApi: RadarrApi) => {
  expect(radarrApi.updateMovie).not.toHaveBeenCalled();
  expect(radarrApi.deleteMovie).not.toHaveBeenCalled();
};

/**
 * Assert that no Sonarr mutation methods were invoked.
 */
export const validateNoSonarrActionsTaken = (sonarrApi: SonarrApi) => {
  expect(sonarrApi.unmonitorSeasons).not.toHaveBeenCalled();
  expect(sonarrApi.UnmonitorDeleteEpisodes).not.toHaveBeenCalled();
  expect(sonarrApi.deleteShow).not.toHaveBeenCalled();
  expect(sonarrApi.delete).not.toHaveBeenCalled();
};
