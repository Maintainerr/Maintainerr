import { Injectable } from '@nestjs/common';
import { CollectionsService } from '../collections/collections.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { TaskBase } from '../tasks/task.base';
import { TasksService } from '../tasks/tasks.service';
import { NotificationType } from './notifications-interfaces';
import { NotificationService } from './notifications.service';

// This job sends notifications for the  "About to Be Removed" notificaton type. The job loops through all configured notification providers and sends one notification per provider.
// Each notification includes all media items from all active child collections that are scheduled for removal within the specified number of days.

// Each media item will only be notified once per notification provider, on the specified day. If this job runs multiple times a day, multiple notifications for the same media items would be sent out.
@Injectable()
export class NotificationTimerService extends TaskBase {
  protected name = 'Notification Timer';
  protected cronSchedule = '0 14 * * *';
  protected type = NotificationType.MEDIA_ABOUT_TO_BE_HANDLED;

  constructor(
    protected readonly taskService: TasksService,
    protected readonly logger: MaintainerrLogger,
    protected readonly collectionService: CollectionsService,
    private readonly notificationService: NotificationService,
  ) {
    logger.setContext(NotificationTimerService.name);
    super(taskService, logger);
  }

  protected onBootstrapHook(): void {}

  public async execute() {
    // helper submethod
    const getDayStart = (date: Date) => new Date(date.setHours(0, 0, 0, 0));

    // check if another instance of this task is already running
    if (await this.isRunning()) {
      this.logger.log(
        `Another instance of the ${this.name} task is currently running. Skipping this execution`,
      );
      return;
    }

    await super.execute();

    const activeAgents = this.notificationService.getActiveAgents();
    const allNotificationConfigurations =
      await this.notificationService.getNotificationConfigurations(true);

    await Promise.allSettled(
      activeAgents.map(async (agent) => {
        const notification = allNotificationConfigurations.find(
          (n) =>
            n.id === agent.getNotification().id &&
            n.enabled &&
            n.rulegroups?.length > 0,
        );

        if (notification) {
          const itemsToNotify = (
            await Promise.all(
              notification.rulegroups.map(async (group) => {
                const notifyDate = new Date(
                  new Date().getTime() -
                    group.collection.deleteAfterDays * 86400000 +
                    notification.aboutScale * 86400000,
                );

                const collectionMedia =
                  await this.collectionService.getCollectionMedia(
                    group.collection?.id,
                  );

                return (
                  collectionMedia?.filter((media) => {
                    const mediaDate = new Date(media.addDate);
                    return (
                      getDayStart(mediaDate).getTime() ===
                      getDayStart(notifyDate).getTime()
                    );
                  }) || []
                );
              }),
            )
          ).flat();

          const transformedItems = itemsToNotify.map((i) => ({
            plexId: i.plexId,
          }));

          // send the notification if required
          if (transformedItems.length > 0) {
            await this.notificationService.handleNotification(
              this.type,
              transformedItems,
              undefined,
              notification.aboutScale,
              agent,
            );
          }
        }
      }),
    );

    await this.finish();
  }
}
