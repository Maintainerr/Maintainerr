import { SettingsService } from '../../../settings/settings.service';
import { MediaServerSetupGuard } from './media-server-setup.guard';

describe('MediaServerSetupGuard', () => {
  const settingsService = {
    testSetup: jest.fn(),
  } as unknown as jest.Mocked<SettingsService>;

  let guard: MediaServerSetupGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new MediaServerSetupGuard(settingsService);
  });

  it('returns false and logs when media server setup test throws', async () => {
    settingsService.testSetup.mockRejectedValue(new Error('connection failed'));

    const logger = (guard as unknown as { logger: { error: jest.Mock } })
      .logger;
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {
      return undefined;
    });

    await expect(guard.canActivate()).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      'Media server setup check failed',
      expect.any(Error),
    );
  });
});
