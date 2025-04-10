import {
  CollectionHandlerFinishedEventDto,
  CollectionHandlerProgressedEventDto,
  CollectionHandlerStartedEventDto,
  MaintainerrEvent,
} from '@maintainerr/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { delay } from '../../utils/delay';
import { JellyseerrApiService } from '../api/jellyseerr-api/jellyseerr-api.service';
import { OverseerrApiService } from '../api/overseerr-api/overseerr-api.service';
import { SettingsService } from '../settings/settings.service';
import { TaskBase } from '../tasks/task.base';
import { TasksService } from '../tasks/tasks.service';
import { CollectionHandler } from './collection-handler';
import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';
import { ServarrAction } from './interfaces/collection.interface';

@Injectable()
export class CollectionWorkerService extends TaskBase {
  protected logger = new Logger(CollectionWorkerService.name);

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
  ) {
    super(taskService);
  }

  protected onBootstrapHook(): void {
    this.cronSchedule = this.settings.collection_handler_job_cron;
  }

  public async execute() {
    // check if another instance of this task is already running
    if (await this.isRunning()) {
      this.logger.log(
        `Another instance of the ${this.name} task is currently running. Skipping this execution`,
      );
      return;
    }

    this.eventEmitter.emit(
      MaintainerrEvent.CollectionHandler_Started,
      new CollectionHandlerStartedEventDto(
        'Started handling of all collections',
      ),
    );

    await super.execute();

    // wait 5 seconds to make sure we're not executing together with the rule handler
    await delay(5000);

    // if we are, then wait..
    await this.taskService.waitUntilTaskIsFinished('Rule Handler', this.name);

    // Start actual task
    const appStatus = await this.settings.testConnections();

    if (!appStatus) {
      this.infoLogger(
        'Not all applications are reachable.. Skipping collection handling',
      );
      await this.finish();
      this.eventEmitter.emit(
        MaintainerrEvent.CollectionHandler_Finished,
        new CollectionHandlerFinishedEventDto('Finished collection handling'),
      );
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

      for (const media of collectionMedia) {
        await this.collectionHandler.handleMedia(collection, media);
        handledCollectionMedia++;
        progressedEvent.processingCollection.processedMedias++;
        progressedEvent.processedMedias++;
        emitProgressedEvent();
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
                `Failed to trigger Overseerr's availability-sync: ${err}`,
              );
              this.logger.debug(err);
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
                `Failed to trigger Jellyseerr's availability-sync: ${err}`,
              );
              this.logger.debug(err);
            }
          }),
        );
      }

      await Promise.all(promises);
    } else {
      this.infoLogger(`All collections handled. No data was altered`);
    }

    await this.finish();

    this.eventEmitter.emit(
      MaintainerrEvent.CollectionHandler_Finished,
      new CollectionHandlerFinishedEventDto('Finished collection handling'),
    );
  }

  private infoLogger(message: string) {
    this.logger.log(message);
  }
}
