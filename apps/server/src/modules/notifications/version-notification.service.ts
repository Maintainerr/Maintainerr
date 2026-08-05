import { Injectable } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { MaintainerrLogger } from '../logging/logs.service';
import { TaskBase } from '../tasks/task.base';
import { TasksService } from '../tasks/tasks.service';
import {
  RELEASE_VERSION_TAGS,
  VersionService,
} from '../version/version.service';
import { NotificationType } from './notifications-interfaces';
import { NotificationService } from './notifications.service';

// Streams that publish a version worth announcing. `development` moves with
// every merged commit, so polling it would produce a message per commit; its
// users still get the sidebar indicator.
const ANNOUNCED_VERSION_TAGS = new Set([...RELEASE_VERSION_TAGS, 'main']);

@Injectable()
export class VersionNotificationService extends TaskBase {
  protected name = 'Version Notification';
  protected cronSchedule = CronExpression.EVERY_12_HOURS;

  // Last version announced, so a release pending for weeks isn't repeated
  // twice a day. Deliberately not persisted: re-announcing once after a
  // restart is a smaller price than a table to remember it.
  private announcedVersion: string | undefined;

  constructor(
    protected readonly taskService: TasksService,
    protected readonly logger: MaintainerrLogger,
    private readonly versionService: VersionService,
    private readonly notificationService: NotificationService,
  ) {
    logger.setContext(VersionNotificationService.name);
    super(taskService, logger);
  }

  protected async executeTask(): Promise<void> {
    try {
      if (!ANNOUNCED_VERSION_TAGS.has(this.versionService.getVersionTag())) {
        return;
      }

      // Nobody subscribes, so don't spend a GitHub call on it.
      if (
        !this.notificationService.hasSubscribers(
          NotificationType.UPDATE_AVAILABLE,
        )
      ) {
        return;
      }

      const currentVersion = this.versionService.getCurrentVersion();
      const update = await this.versionService.getAvailableUpdate();

      if (!update || update.version === this.announcedVersion) return;

      // Branch builds are labelled with a short SHA while the update check
      // compares full ones, so two different commits can share a label. Saying
      // "X is available, you're running X" is worse than saying nothing.
      if (update.version === currentVersion) return;

      this.logger.log(
        `Maintainerr ${update.version} is available, running ${currentVersion}`,
      );

      // Only remember it once an agent took it, so a release nobody was told
      // about (webhook down, SMTP timeout) is retried on the next run.
      const delivered =
        await this.notificationService.handleUpdateAvailableNotification(
          currentVersion,
          update.version,
          update.releaseUrl,
        );

      if (delivered) {
        this.announcedVersion = update.version;
      }
    } catch (error) {
      this.logger.warn('Failed to check for a Maintainerr update');
      this.logger.debug(error);
    }
  }
}
