import { Injectable } from '@nestjs/common';
import { MaintainerrLogger } from '../logging/logs.service';
import { TaskBase } from '../tasks/task.base';
import { TasksService } from '../tasks/tasks.service';
import { OverlayProcessorService } from './overlay-processor.service';
import { OverlaySettingsService } from './overlay-settings.service';

@Injectable()
export class OverlayTaskService extends TaskBase {
  constructor(
    protected readonly taskService: TasksService,
    protected readonly logger: MaintainerrLogger,
    private readonly processor: OverlayProcessorService,
    private readonly settingsService: OverlaySettingsService,
  ) {
    super(taskService, logger);
    this.logger.setContext(OverlayTaskService.name);
    this.name = 'Overlay Handler';
    // Default to a rarely-firing cron — will be set in onBootstrapHook
    this.cronSchedule = '0 0 0 1 1 *'; // Once a year, Jan 1st
  }

  protected override onBootstrapHook(): void {
    void this.settingsService
      .getSettings()
      .then((settings) => {
        if (settings.cronSchedule && settings.enabled) {
          this.logger.log(
            `Overlay handler cron configured: ${settings.cronSchedule}`,
          );
          return this.updateJob(settings.cronSchedule);
        }
      })
      .catch((err) => {
        this.logger.debug(err);
      });
  }

  protected async executeTask(abortSignal: AbortSignal): Promise<void> {
    const settings = await this.settingsService.getSettings();
    if (!settings.enabled) {
      this.logger.debug('Overlay feature is disabled, skipping scheduled run');
      return;
    }

    abortSignal.throwIfAborted();
    await this.processor.processAllCollections();
  }

  /**
   * When overlay settings are updated, update the cron schedule.
   */
  async updateCronSchedule(
    cronSchedule: string | null,
    enabled: boolean,
  ): Promise<void> {
    if (cronSchedule && enabled) {
      await this.updateJob(cronSchedule);
      this.logger.log(`Overlay cron updated to: ${cronSchedule}`);
    } else {
      // Set to never-fire cron to effectively disable
      await this.updateJob('0 0 0 1 1 *');
      this.logger.log('Overlay cron disabled');
    }
  }
}
