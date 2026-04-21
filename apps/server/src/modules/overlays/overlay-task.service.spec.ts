import { createMockLogger } from '../../../test/utils/data';
import { OverlayTaskService } from './overlay-task.service';

describe('OverlayTaskService', () => {
  const buildTaskService = (
    overrides: {
      processor?: Partial<Record<string, jest.Mock>>;
      settings?: { enabled: boolean; cronSchedule?: string | null };
    } = {},
  ) => {
    const processor = {
      revertMultipleItems: jest.fn().mockResolvedValue(undefined),
      processAllCollections: jest.fn().mockResolvedValue(undefined),
      processCollection: jest.fn(),
      ...(overrides.processor ?? {}),
    };
    const settingsService = {
      getSettings: jest
        .fn()
        .mockResolvedValue(
          overrides.settings ?? { enabled: true, cronSchedule: '0 0 * * *' },
        ),
    };
    const taskService = {
      createJob: jest.fn(),
      updateJob: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(false),
      setRunning: jest.fn(),
      clearRunning: jest.fn(),
    };

    const service = new OverlayTaskService(
      taskService as any,
      createMockLogger(),
      processor as any,
      settingsService as any,
    );

    return { service, processor, taskService };
  };

  it('runs the scheduled overlay processor when overlays are enabled', async () => {
    const { service, processor } = buildTaskService();

    await (service as any).executeTask(new AbortController().signal);

    expect(processor.processAllCollections).toHaveBeenCalledTimes(1);
  });

  it('skips the scheduled overlay processor when overlays are disabled', async () => {
    const { service, processor } = buildTaskService({
      settings: { enabled: false, cronSchedule: '0 0 * * *' },
    });

    await (service as any).executeTask(new AbortController().signal);

    expect(processor.processAllCollections).not.toHaveBeenCalled();
  });

  it('updates the cron schedule when overlays are enabled', async () => {
    const { service, taskService } = buildTaskService();

    await service.updateCronSchedule('0 12 * * *', true);

    expect(taskService.updateJob).toHaveBeenCalledWith(
      'Overlay Handler',
      '0 12 * * *',
    );
  });

  it('disables the cron schedule when overlays are disabled', async () => {
    const { service, taskService } = buildTaskService();

    await service.updateCronSchedule(null, false);

    expect(taskService.updateJob).toHaveBeenCalledWith(
      'Overlay Handler',
      '0 0 0 1 1 *',
    );
  });

  it('configures the cron schedule from settings on bootstrap', async () => {
    const { service, taskService } = buildTaskService({
      settings: { enabled: true, cronSchedule: '0 6 * * *' },
    });

    await (service as any).onBootstrapHook();

    await Promise.resolve();

    expect(taskService.updateJob).toHaveBeenCalledWith(
      'Overlay Handler',
      '0 6 * * *',
    );
  });

  it('does not configure a cron schedule on bootstrap when overlays are disabled', async () => {
    const { service, taskService } = buildTaskService({
      settings: { enabled: false, cronSchedule: '0 6 * * *' },
    });

    await (service as any).onBootstrapHook();

    await Promise.resolve();

    expect(taskService.updateJob).not.toHaveBeenCalled();
  });
});
