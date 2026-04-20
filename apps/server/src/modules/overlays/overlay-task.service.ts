import { MaintainerrEvent } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CollectionsService } from '../collections/collections.service';
import {
  CollectionMediaAddedDto,
  CollectionMediaRemovedDto,
} from '../events/events.dto';
import { MaintainerrLogger } from '../logging/logs.service';
import { TaskBase } from '../tasks/task.base';
import { TasksService } from '../tasks/tasks.service';
import { OverlayProcessorService } from './overlay-processor.service';
import { OverlaySettingsService } from './overlay-settings.service';
import { OverlayStateService } from './overlay-state.service';

@Injectable()
export class OverlayTaskService extends TaskBase {
  constructor(
    protected readonly taskService: TasksService,
    protected readonly logger: MaintainerrLogger,
    private readonly processor: OverlayProcessorService,
    private readonly settingsService: OverlaySettingsService,
    private readonly collectionsService: CollectionsService,
    private readonly stateService: OverlayStateService,
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

  /**
   * Handle CollectionMedia_Added event — apply overlays immediately
   * when applyOnAdd is enabled.
   */
  @OnEvent(MaintainerrEvent.CollectionMedia_Added)
  async handleCollectionMediaAdded(
    payload: CollectionMediaAddedDto,
  ): Promise<void> {
    try {
      const settings = await this.settingsService.getSettings();
      if (!settings.enabled || !settings.applyOnAdd) {
        this.logger.debug(
          `Overlay on-add skipped: enabled=${settings.enabled}, applyOnAdd=${settings.applyOnAdd}`,
        );
        return;
      }

      this.logger.log(
        `CollectionMedia_Added event received (${payload.mediaItems.length} items for "${payload.collectionName}")`,
      );

      const collections =
        await this.collectionsService.getCollectionsWithOverlayEnabled();

      for (const collection of collections) {
        // Check if any of the added items belong to this collection
        const collectionMediaIds = new Set(
          collection.collectionMedia.map((cm) => cm.mediaServerId),
        );
        const hasAddedItems = payload.mediaItems.some((item) =>
          collectionMediaIds.has(item.mediaServerId),
        );

        if (hasAddedItems) {
          this.logger.log(
            `Processing overlays for "${collection.title}" (media added event)`,
          );
          await this.processor.processCollection(collection);
        }
      }
    } catch (err) {
      this.logger.warn('Error handling CollectionMedia_Added for overlays');
      this.logger.debug(err);
    }
  }

  /**
   * Handle CollectionMedia_Removed event — revert overlays immediately
   * for items removed from overlay-enabled collections.
   */
  @OnEvent(MaintainerrEvent.CollectionMedia_Removed)
  async handleCollectionMediaRemoved(
    payload: CollectionMediaRemovedDto,
  ): Promise<void> {
    try {
      const settings = await this.settingsService.getSettings();
      if (!settings.enabled) {
        return;
      }

      const collections =
        await this.collectionsService.getCollectionsWithOverlayEnabled();
      const collectionId = payload.collectionId;
      const toRevert: { mediaServerId: string }[] = [];

      for (const item of payload.mediaItems) {
        const stillTracked = collections.some((c) =>
          c.collectionMedia.some(
            (cm) => cm.mediaServerId === item.mediaServerId,
          ),
        );
        if (stillTracked) {
          await this.stateService.removeState(collectionId, item.mediaServerId);
          this.logger.debug(
            `Item ${item.mediaServerId} still in another overlay collection, cleared stale state without reverting`,
          );
          continue;
        }
        toRevert.push(item);
      }

      if (toRevert.length > 0) {
        this.logger.log(
          `Reverting ${toRevert.length} overlay(s) removed from "${payload.collectionName}"`,
        );
        await this.processor.revertMultipleItems(
          collectionId,
          toRevert,
          payload.collectionName,
        );
      }
    } catch (err) {
      this.logger.warn('Error handling CollectionMedia_Removed for overlays');
      this.logger.debug(err);
    }
  }
}
