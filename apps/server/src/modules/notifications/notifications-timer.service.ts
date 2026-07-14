import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { CollectionsService } from '../collections/collections.service';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { NotificationMediaItem } from '../events/events.dto';
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
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly seerrApi: SeerrApiService,
  ) {
    logger.setContext(NotificationTimerService.name);
    super(taskService, logger);
  }

  protected onBootstrapHook(): void {}

  protected async executeTask() {
    // helper submethod
    const getDayStart = (date: Date) => new Date(date.setHours(0, 0, 0, 0));

    const activeAgents = this.notificationService.getActiveAgents();
    const allNotificationConfigurations =
      await this.notificationService.getNotificationConfigurations(true);

    // Agents run concurrently and can share a rule group, so memoise the
    // in-flight promise to keep each item at one media-server + Seerr lookup.
    const enriched = new Map<string, Promise<NotificationMediaItem>>();
    const enrich = (media: CollectionMedia): Promise<NotificationMediaItem> => {
      const pending =
        enriched.get(media.mediaServerId) ??
        this.toNotificationMediaItem(media);
      enriched.set(media.mediaServerId, pending);
      return pending;
    };

    await Promise.allSettled(
      activeAgents.map(async (agent) => {
        const notification = allNotificationConfigurations.find(
          (n) => n.id === agent.getNotification().id,
        );

        if (!notification?.enabled || !notification.rulegroups?.length) {
          return;
        }

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

        // send the notification if required
        if (itemsToNotify.length > 0) {
          await this.notificationService.handleNotification(
            this.type,
            await Promise.all(itemsToNotify.map(enrich)),
            undefined,
            notification.aboutScale,
            agent,
          );
        }
      }),
    );
  }

  /**
   * Title snapshot + requesters, both best-effort: a warning that can't name
   * the item or the requester still beats no warning.
   */
  private async toNotificationMediaItem(
    media: CollectionMedia,
  ): Promise<NotificationMediaItem> {
    let metadata: MediaItem | undefined;
    try {
      const mediaServer = await this.mediaServerFactory.getService();
      metadata = await mediaServer.getMetadata(media.mediaServerId);
    } catch (error) {
      this.logger.debug(error);
    }

    const requestedBy = await this.resolveRequesters(media, metadata);

    return {
      mediaServerId: media.mediaServerId,
      metadata,
      ...(requestedBy.length > 0 ? { requestedBy } : {}),
    };
  }

  private async resolveRequesters(
    media: CollectionMedia,
    metadata: MediaItem | undefined,
  ): Promise<string[]> {
    if (!media.tmdbId) {
      return [];
    }

    // Switch on `type`, not parentId presence: Emby/Jellyfin set a movie's
    // parentId to its library folder, which would misread it as a season.
    const season =
      metadata?.type === 'season'
        ? metadata.index
        : metadata?.type === 'episode'
          ? metadata.parentIndex
          : undefined;

    return this.seerrApi.getRequestedByUsernames(media.tmdbId, season);
  }
}
