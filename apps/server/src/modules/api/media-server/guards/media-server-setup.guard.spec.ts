import { MaintainerrLogger } from '../../../logging/logs.service';
import { SettingsService } from '../../../settings/settings.service';
import { MediaServerSetupGuard } from './media-server-setup.guard';

describe('MediaServerSetupGuard', () => {
  const settingsService = {
    testSetup: jest.fn(),
  } as unknown as jest.Mocked<SettingsService>;

  const logger = {
    setContext: jest.fn(),
    error: jest.fn(),
  } as unknown as jest.Mocked<MaintainerrLogger>;

  let guard: MediaServerSetupGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new MediaServerSetupGuard(settingsService, logger);
  });

  it('returns false and logs when media server setup test throws', async () => {
    settingsService.testSetup.mockRejectedValue(new Error('connection failed'));

    await expect(guard.canActivate()).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'Media server setup check failed',
      expect.any(Error),
    );
  });
});
