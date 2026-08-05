import { Mocked, TestBed } from '@suites/unit';
import { MaintainerrLoggerFactory } from '../../logging/logs.service';
import { SettingsDataService } from '../../settings/settings-data.service';
import { TautulliApiService } from './tautulli-api.service';

describe('TautulliApiService.init lifecycle', () => {
  let service: TautulliApiService;
  let settings: Mocked<SettingsDataService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(TautulliApiService).compile();
    service = unit;
    settings = unitRef.get(
      SettingsDataService,
    ) as unknown as Mocked<SettingsDataService>;
    unitRef.get(MaintainerrLoggerFactory).createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as never);
  });

  // Without the reset the app kept querying an integration the user had
  // deleted, until the next restart.
  it('drops the client when the settings are removed', () => {
    settings.tautulli_url = 'http://tautulli.local';
    settings.tautulli_api_key = 'key';
    service.init();
    expect(service.api).toBeDefined();

    settings.tautulli_url = null;
    settings.tautulli_api_key = null;
    service.init();

    expect(service.api).toBeUndefined();
  });
});
