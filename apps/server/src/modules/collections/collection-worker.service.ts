import {
  CollectionHandlerFinishedEventDto,
  CollectionHandlerProgressedEventDto,
  CollectionHandlerStartedEventDto,
  MaintainerrEvent,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { delay } from '../../utils/delay';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { CollectionMediaHandledDto } from '../events/events.dto';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsService } from '../settings/settings.service';
import { ExecutionLockService } from '../tasks/execution-lock.service';
import { TaskBase } from '../tasks/task.base';
import { TasksService } from '../tasks/tasks.service';
import { CollectionHandler } from './collection-handler';
import { CollectionsService } from './collections.service';
import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';
import { ServarrAction } from './interfaces/collection.interface';

@Injectable()
export class CollectionWorkerService extends TaskBase {
  protected name = 'Collection Handler';
  protected cronSchedule = ''; // overriden in onBootstrapHook

  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(CollectionMedia)
    private readonly collectionMediaRepo: Repository<CollectionMedia>,
    private readonly seerrApi: SeerrApiService,
    protected readonly taskService: TasksService,
    private readonly settings: SettingsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly collectionHandler: CollectionHandler,
    private readonly collectionsService: CollectionsService,
    protected readonly logger: MaintainerrLogger,
    private readonly executionLock: ExecutionLockService,
  ) {
    logger.setContext(CollectionWorkerService.name);
    super(taskService, logger);
  }

  protected onBootstrapHook(): void {
    this.cronSchedule = this.settings.collection_handler_job_cron;
  }

  protected async executeTask() {
    this.eventEmitter.emit(
      MaintainerrEvent.CollectionHandler_Started,
      new CollectionHandlerStartedEventDto(
        'Started handling of all collections',
      ),
    );

    // Acquire shared lock to avoid overlap with rule execution
    const release = await this.executionLock.acquire('rules-collections-lock');
    let failed = false;

    try {
      // Start actual task
      const appStatus = await this.settings.testConnections();

      if (!appStatus) {
        failed = true;
        this.logger.log(
          'Not all applications are reachable.. Skipping collection handling',
        );
        return;
      }

      this.logger.log('Started handling of all collections');
      let handledCollectionMedia = 0;
      let collectionHandlingFailed = false;
      let doNothingCollectionCount = 0;
      let noDueMediaCollectionCount = 0;

      // loop over all active collections
      const collections = await this.collectionRepo.find({
        where: { isActive: true },
      });

      const collectionsToHandle = collections.filter((collection) => {
        if (collection.arrAction === ServarrAction.DO_NOTHING) {
          doNothingCollectionCount++;
          this.logger.log(
            `Skipping collection '${collection.title}' as its action is 'Do Nothing'`,
          );
          return false;
        }

        return true;
      });

      const collectionHandleMediaGroup: {
        collection: Collection;
        mediaToHandle: CollectionMedia[];
      }[] = [];

      for (const collection of collectionsToHandle) {
        const dangerDate = new Date(
          new Date().getTime() - +collection.deleteAfterDays * 86400000,
        );

        const mediaToHandle = await this.collectionMediaRepo.find({
          where: {
            collectionId: collection.id,
            addDate: LessThanOrEqual(dangerDate),
          },
        });

        if (mediaToHandle.length === 0) {
          noDueMediaCollectionCount++;
          this.logger.debug(
            `Skipping collection '${collection.title}' because no media is due for handling`,
          );
          continue;
        }

        collectionHandleMediaGroup.push({
          collection,
          mediaToHandle,
        });
      }

      this.logger.log(
        `Collection handler summary: ${collections.length} total (isActive), ${doNothingCollectionCount} skipped (Do Nothing), ${noDueMediaCollectionCount} skipped (no due media), ${collectionHandleMediaGroup.length} queued for handling`,
      );

      const totalMediaToHandle = collectionHandleMediaGroup.reduce(
        (acc, curr) => acc + curr.mediaToHandle.length,
        0,
      );

      const progressedEvent =
        totalMediaToHandle > 0
          ? new CollectionHandlerProgressedEventDto()
          : null;

      const emitProgressedEvent = () => {
        if (!progressedEvent) return;
        progressedEvent.time = new Date();
        this.eventEmitter.emit(
          MaintainerrEvent.CollectionHandler_Progressed,
          progressedEvent,
        );
      };

      if (progressedEvent) {
        progressedEvent.totalCollections = collectionHandleMediaGroup.length;
        progressedEvent.totalMediaToHandle = totalMediaToHandle;
        emitProgressedEvent();
      }

      for (const collectionGroup of collectionHandleMediaGroup) {
        const collection = collectionGroup.collection;
        const collectionMedia = collectionGroup.mediaToHandle;

        if (progressedEvent) {
          progressedEvent.processingCollection = {
            name: collection.title,
            processedMedias: 0,
            totalMedias: collectionMedia.length,
          };
          emitProgressedEvent();
        }

        this.logger.log(`Handling collection '${collection.title}'`);
        const handledMediaForNotification = [];

        for (const media of collectionMedia) {
          let mediaHandled = false;

          try {
            mediaHandled = await this.collectionHandler.handleMedia(
              collection,
              media,
            );
          } catch (error) {
            collectionHandlingFailed = true;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';

            this.logger.warn(
              `Failed to handle media with id ${media.mediaServerId} in collection '${collection.title}': ${errorMessage}`,
            );
            this.logger.debug(error);
          }

          if (!mediaHandled) {
            collectionHandlingFailed = true;
          } else {
            handledCollectionMedia++;
            handledMediaForNotification.push({
              mediaServerId: media.mediaServerId,
            });
          }

          if (progressedEvent) {
            progressedEvent.processingCollection!.processedMedias++;
            progressedEvent.processedMedias++;
          }
          emitProgressedEvent();
        }

        // handle notification
        if (handledMediaForNotification.length > 0) {
          this.eventEmitter.emit(
            MaintainerrEvent.CollectionMedia_Handled,
            new CollectionMediaHandledDto(
              handledMediaForNotification,
              collection.title,
              { type: 'collection', value: collection.id },
            ),
          );
        }

        if (progressedEvent) {
          progressedEvent.processedCollections++;
        }
        emitProgressedEvent();

        this.logger.log(`Handling collection '${collection.title}' finished`);
      }

      if (collectionHandlingFailed) {
        failed = true;
      }

      if (handledCollectionMedia > 0) {
        if (this.settings.seerrConfigured()) {
          await delay(7000, async () => {
            try {
              await this.seerrApi.api.post(
                '/settings/jobs/availability-sync/run',
              );

              this.logger.log(
                `All collections handled. Triggered Seerr's availability-sync because media was altered`,
              );
            } catch (error) {
              this.logger.error(`Failed to trigger Seerr's availability-sync`);
              this.logger.debug(error);
            }
          });
        }
      } else {
        this.logger.log(`All collections handled. No data was altered`);
      }

      // Update cached total size for all collections
      this.logger.log('Updating collection size cache...');
      const allCollections = await this.collectionRepo.find();
      for (const collection of allCollections) {
        try {
          await this.collectionsService.updateCollectionTotalSize(
            collection.id,
          );
        } catch (error) {
          this.logger.debug(
            `Failed to update size for collection '${collection.title}'`,
          );
          this.logger.debug(error);
        }
      }
      this.logger.log('Collection size cache updated');
    } catch (error) {
      failed = true;
      this.logger.error('Collection handling failed');
      this.logger.debug(error);
    } finally {
      if (failed) {
        this.eventEmitter.emit(MaintainerrEvent.CollectionHandler_Failed);
      }

      release();

      this.eventEmitter.emit(
        MaintainerrEvent.CollectionHandler_Finished,
        new CollectionHandlerFinishedEventDto(
          failed
            ? 'Finished collection handling with errors'
            : 'Finished collection handling',
        ),
      );
    }
  }
}
