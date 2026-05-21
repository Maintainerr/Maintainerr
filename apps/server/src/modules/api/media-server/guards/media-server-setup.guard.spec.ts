import { MaintainerrLogger } from '../../../logging/logs.service';
import { SettingsOperationsService } from '../../../settings/settings-operations.service';
import { MediaServerSetupGuard } from './media-server-setup.guard';

describe('MediaServerSetupGuard', () => {
  const settingsOperationsService = {
    testSetup: jest.fn(),
  } as unknown as jest.Mocked<SettingsOperationsService>;

  const logger = {
    setContext: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<MaintainerrLogger>;

  let guard: MediaServerSetupGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new MediaServerSetupGuard(settingsOperationsService, logger);
  });

  it('returns false and logs when media server setup test throws', async () => {
    settingsOperationsService.testSetup.mockRejectedValue(
      new Error('connection failed'),
    );

    await expect(guard.canActivate()).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'Media server setup check failed',
    );
    expect(logger.debug).toHaveBeenCalledWith(expect.any(Error));
  });
});
