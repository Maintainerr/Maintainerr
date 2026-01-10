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
import { JellyseerrApiService } from '../api/jellyseerr-api/jellyseerr-api.service';
import { OverseerrApiService } from '../api/overseerr-api/overseerr-api.service';
import { CollectionMediaHandledDto } from '../events/events.dto';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsService } from '../settings/settings.service';
import { ExecutionLockService } from '../tasks/execution-lock.service';
import { TaskBase } from '../tasks/task.base';
import { TasksService } from '../tasks/tasks.service';
import { CollectionHandler } from './collection-handler';
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
    private readonly overseerrApi: OverseerrApiService,
    private readonly jellyseerrApi: JellyseerrApiService,
    protected readonly taskService: TasksService,
    private readonly settings: SettingsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly collectionHandler: CollectionHandler,
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

    try {
      // Start actual task
      const appStatus = await this.settings.testConnections();

      if (!appStatus) {
        this.infoLogger(
          'Not all applications are reachable.. Skipping collection handling',
        );
        this.eventEmitter.emit(
          MaintainerrEvent.CollectionHandler_Finished,
          new CollectionHandlerFinishedEventDto('Finished collection handling'),
        );

        this.eventEmitter.emit(MaintainerrEvent.CollectionHandler_Failed);
        return;
      }

      this.logger.log('Started handling of all collections');
      let handledCollectionMedia = 0;

      // loop over all active collections
      const collections = await this.collectionRepo.find({
        where: { isActive: true },
      });

      const collectionsToHandle = collections.filter((collection) => {
        if (collection.arrAction === ServarrAction.DO_NOTHING) {
          this.infoLogger(
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

        collectionHandleMediaGroup.push({
          collection,
          mediaToHandle,
        });
      }

      const progressedEvent = new CollectionHandlerProgressedEventDto();
      const emitProgressedEvent = () => {
        progressedEvent.time = new Date();
        this.eventEmitter.emit(
          MaintainerrEvent.CollectionHandler_Progressed,
          progressedEvent,
        );
      };
      progressedEvent.totalCollections = collectionsToHandle.length;
      progressedEvent.totalMediaToHandle = collectionHandleMediaGroup.reduce(
        (acc, curr) => acc + curr.mediaToHandle.length,
        0,
      );
      emitProgressedEvent();

      for (const collectionGroup of collectionHandleMediaGroup) {
        const collection = collectionGroup.collection;
        const collectionMedia = collectionGroup.mediaToHandle;

        progressedEvent.processingCollection = {
          name: collection.title,
          processedMedias: 0,
          totalMedias: collectionMedia.length,
        };
        emitProgressedEvent();

        this.infoLogger(`Handling collection '${collection.title}'`);
        const handledMediaForNotification = [];

        for (const media of collectionMedia) {
          await this.collectionHandler.handleMedia(collection, media);
          handledCollectionMedia++;
          progressedEvent.processingCollection.processedMedias++;
          progressedEvent.processedMedias++;
          handledMediaForNotification.push({ plexId: media.plexId });
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

        progressedEvent.processedCollections++;
        emitProgressedEvent();

        this.infoLogger(`Handling collection '${collection.title}' finished`);
      }

      if (handledCollectionMedia > 0) {
        const promises = [];
        if (this.settings.overseerrConfigured()) {
          promises.push(
            delay(7000, async () => {
              try {
                await this.overseerrApi.api.post(
                  '/settings/jobs/availability-sync/run',
                );

                this.infoLogger(
                  `All collections handled. Triggered Overseerr's availability-sync because media was altered`,
                );
              } catch (err) {
                this.logger.error(
                  `Failed to trigger Overseerr's availability-sync`,
                  err,
                );
              }
            }),
          );
        }

        if (this.settings.jellyseerrConfigured()) {
          promises.push(
            delay(7000, async () => {
              try {
                await this.jellyseerrApi.api.post(
                  '/settings/jobs/availability-sync/run',
                );

                this.infoLogger(
                  `All collections handled. Triggered Jellyseerr's availability-sync because media was altered`,
                );
              } catch (err) {
                this.logger.error(
                  `Failed to trigger Jellyseerr's availability-sync`,
                  err,
                );
              }
            }),
          );
        }

        await Promise.all(promises);
      } else {
        this.infoLogger(`All collections handled. No data was altered`);
      }
    } finally {
      release();

      this.eventEmitter.emit(
        MaintainerrEvent.CollectionHandler_Finished,
        new CollectionHandlerFinishedEventDto('Finished collection handling'),
      );
    }
  }

  private infoLogger(message: string) {
    this.logger.log(message);
  }
}
