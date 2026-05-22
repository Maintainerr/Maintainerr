import { MaintainerrLogger } from '../../../logging/logs.service';
import { SettingsDataService } from '../../../settings/settings-data.service';
import { MediaServerSetupGuard } from './media-server-setup.guard';

describe('MediaServerSetupGuard', () => {
  const settingsDataService = {
    testSetup: jest.fn(),
  } as unknown as jest.Mocked<SettingsDataService>;

  const logger = {
    setContext: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<MaintainerrLogger>;

  let guard: MediaServerSetupGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new MediaServerSetupGuard(settingsDataService, logger);
  });

  it('returns false and logs when media server setup test throws', async () => {
    settingsDataService.testSetup.mockRejectedValue(
      new Error('connection failed'),
    );

    await expect(guard.canActivate()).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'Media server setup check failed',
    );
    expect(logger.debug).toHaveBeenCalledWith(expect.any(Error));
  });
});
