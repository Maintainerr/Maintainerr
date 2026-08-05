import { createMockLogger } from '../../../test/utils/data';
import { VersionNotificationService } from './version-notification.service';

describe('VersionNotificationService', () => {
  const createService = (
    overrides: {
      currentVersion?: string;
      availableVersion?: string;
      hasSubscribers?: boolean;
      delivered?: boolean;
      versionTag?: string;
      releaseUrl?: string;
    } = {},
  ) => {
    const versionService = {
      getVersionTag: jest
        .fn()
        .mockReturnValue(overrides.versionTag ?? 'latest'),
      getCurrentVersion: jest
        .fn()
        .mockReturnValue(overrides.currentVersion ?? '3.18.0'),
      getAvailableUpdate: jest.fn().mockResolvedValue(
        overrides.availableVersion
          ? {
              version: overrides.availableVersion,
              releaseUrl: overrides.releaseUrl,
            }
          : undefined,
      ),
    };

    const notificationService = {
      hasSubscribers: jest
        .fn()
        .mockReturnValue(overrides.hasSubscribers ?? true),
      handleUpdateAvailableNotification: jest
        .fn()
        .mockResolvedValue(overrides.delivered ?? true),
    };

    const service = new VersionNotificationService(
      {} as never,
      createMockLogger(),
      versionService as never,
      notificationService as never,
    );

    return { service, versionService, notificationService };
  };

  const run = (service: VersionNotificationService) =>
    (service as any).executeTask() as Promise<void>;

  it('announces a newer release once', async () => {
    const { service, notificationService } = createService({
      currentVersion: '3.18.0',
      availableVersion: '3.19.0',
    });

    await run(service);
    await run(service);

    expect(
      notificationService.handleUpdateAvailableNotification,
    ).toHaveBeenCalledTimes(1);
    expect(
      notificationService.handleUpdateAvailableNotification,
    ).toHaveBeenCalledWith('3.18.0', '3.19.0', undefined);
  });

  it('stays quiet while the build is up to date', async () => {
    const { service, notificationService } = createService({
      currentVersion: '3.18.0',
    });

    await run(service);

    expect(
      notificationService.handleUpdateAvailableNotification,
    ).not.toHaveBeenCalled();
  });

  it('retries a release no agent accepted', async () => {
    const { service, notificationService } = createService({
      availableVersion: '3.19.0',
      delivered: false,
    });

    await run(service);
    await run(service);

    // Every agent failed, so the release is still unannounced.
    expect(
      notificationService.handleUpdateAvailableNotification,
    ).toHaveBeenCalledTimes(2);
  });

  it('spends no GitHub call while nobody subscribes', async () => {
    const { service, versionService } = createService({
      availableVersion: '3.19.0',
      hasSubscribers: false,
    });

    await run(service);

    expect(versionService.getAvailableUpdate).not.toHaveBeenCalled();
  });

  it('does not poll for updates on the development stream', async () => {
    // It moves with every merged commit; one message per commit is spam.
    const { service, versionService, notificationService } = createService({
      currentVersion: 'development-bd8a1e0',
      availableVersion: 'development-fffffff',
      versionTag: 'development',
    });

    await run(service);

    expect(versionService.getAvailableUpdate).not.toHaveBeenCalled();
    expect(notificationService.hasSubscribers).not.toHaveBeenCalled();
  });

  it('still announces builds on the pre-release main stream', async () => {
    const { service, notificationService } = createService({
      currentVersion: 'main-7f747fa',
      availableVersion: 'main-1234567',
      versionTag: 'main',
    });

    await run(service);

    expect(
      notificationService.handleUpdateAvailableNotification,
    ).toHaveBeenCalledWith('main-7f747fa', 'main-1234567', undefined);
  });

  it('says nothing when the available build carries the running label', async () => {
    // Two commits can share a 7-char SHA prefix while the check compares the
    // full ones.
    const { service, notificationService } = createService({
      currentVersion: 'main-7f747fa',
      availableVersion: 'main-7f747fa',
      versionTag: 'main',
    });

    await run(service);

    expect(
      notificationService.handleUpdateAvailableNotification,
    ).not.toHaveBeenCalled();
  });

  it('passes the release page through to the notification', async () => {
    const { service, notificationService } = createService({
      availableVersion: '3.19.0',
      releaseUrl:
        'https://github.com/Maintainerr/Maintainerr/releases/tag/v3.19.0',
    });

    await run(service);

    expect(
      notificationService.handleUpdateAvailableNotification,
    ).toHaveBeenCalledWith(
      '3.18.0',
      '3.19.0',
      'https://github.com/Maintainerr/Maintainerr/releases/tag/v3.19.0',
    );
  });

  it('swallows a failing check so the scheduler keeps running', async () => {
    const { service, versionService } = createService();
    versionService.getAvailableUpdate.mockRejectedValue(
      new Error('GitHub unreachable'),
    );

    await expect(run(service)).resolves.toBeUndefined();
  });
});
