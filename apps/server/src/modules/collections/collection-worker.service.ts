import {
  CollectionHandlerFinishedEventDto,
  CollectionHandlerProgressedEventDto,
  CollectionHandlerStartedEventDto,
  MaintainerrEvent,
  MediaItem,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { delay } from '../../utils/delay';
import type { IMediaServerService } from '../api/media-server/media-server.interface';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import {
  CollectionHandlerFailedDto,
  CollectionMediaHandledDto,
  NotificationMediaItem,
} from '../events/events.dto';
import { MaintainerrLogger } from '../logging/logs.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import {
  buildExclusionCascadeSets,
  isMediaItemExcluded,
} from '../rules/helpers/exclusion-cascade.helper';
import { SettingsDataService } from '../settings/settings-data.service';
import {
  ExecutionLockService,
  RULES_COLLECTIONS_EXECUTION_LOCK_KEY,
} from '../tasks/execution-lock.service';
import { TaskBase } from '../tasks/task.base';
import { TasksService } from '../tasks/tasks.service';
import { CollectionHandler, HandleMediaResult } from './collection-handler';
import {
  CollectionsService,
  getCollectionDangerDate,
} from './collections.service';
import { Collection } from './entities/collection.entities';
import {
  CollectionMedia,
  hasCollectionMediaManualMembership,
} from './entities/collection_media.entities';
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
    @InjectRepository(Exclusion)
    private readonly exclusionRepo: Repository<Exclusion>,
    @InjectRepository(RuleGroup)
    private readonly ruleGroupRepo: Repository<RuleGroup>,
    private readonly seerrApi: SeerrApiService,
    protected readonly taskService: TasksService,
    private readonly settings: SettingsDataService,
    private readonly eventEmitter: EventEmitter2,
    private readonly collectionHandler: CollectionHandler,
    private readonly collectionsService: CollectionsService,
    private readonly mediaServerFactory: MediaServerFactory,
    protected readonly logger: MaintainerrLogger,
    private readonly executionLock: ExecutionLockService,
  ) {
    logger.setContext(CollectionWorkerService.name);
    super(taskService, logger);
  }

  protected onBootstrapHook(): void {
    this.cronSchedule = this.settings.collection_handler_job_cron;
  }

  /** Every global exclusion, plus the ones scoped to a collection's own group. */
  private async readExclusionsPerCollection(): Promise<
    (collectionId: number) => Exclusion[]
  > {
    const [exclusions, ruleGroups] = await Promise.all([
      this.exclusionRepo.find(),
      this.ruleGroupRepo.find(),
    ]);

    const ruleGroupIdByCollectionId = new Map(
      ruleGroups.map((ruleGroup) => [ruleGroup.collectionId, ruleGroup.id]),
    );

    return (collectionId) => {
      const ruleGroupId = ruleGroupIdByCollectionId.get(collectionId);
      return exclusions.filter(
        (exclusion) =>
          exclusion.ruleGroupId == null ||
          exclusion.ruleGroupId === ruleGroupId,
      );
    };
  }

  /** The cascade a rule run applies, so a show or legacy row reaches its own
   * descendants (#2858). The hierarchy costs a request, so it is only read when
   * an exclusion can reach past its own id. */
  private async dropExcludedMedia(
    mediaServer: IMediaServerService,
    exclusions: Exclusion[],
    dueMedia: CollectionMedia[],
  ): Promise<CollectionMedia[]> {
    if (exclusions.length === 0 || dueMedia.length === 0) {
      return dueMedia;
    }

    const cascade = buildExclusionCascadeSets(exclusions);
    const cascades =
      cascade.excludedShowIds.size > 0 ||
      cascade.excludedSeasonIds.size > 0 ||
      cascade.legacyParentIds.size > 0;

    if (!cascades) {
      return dueMedia.filter(
        (media) => !isMediaItemExcluded(cascade, { id: media.mediaServerId }),
      );
    }

    const hierarchyById = new Map<string, MediaItem>();
    try {
      for (const item of await mediaServer.getMetadataBatch(
        dueMedia.map((media) => media.mediaServerId),
      )) {
        hierarchyById.set(item.id, item);
      }
    } catch (error) {
      this.logger.debug(error);
    }

    return dueMedia.filter((media) => {
      const item = hierarchyById.get(media.mediaServerId);

      // A batch read omits what it could not resolve, so no hierarchy means
      // unread, not unrelated. This is the only path that deletes.
      if (!item) return false;

      return !isMediaItemExcluded(cascade, item);
    });
  }

  protected async executeTask() {
    this.eventEmitter.emit(
      MaintainerrEvent.CollectionHandler_Started,
      new CollectionHandlerStartedEventDto(
        'Started handling of all collections',
      ),
    );

    // Acquire shared lock to avoid overlap with rule execution
    const release = await this.executionLock.acquire(
      RULES_COLLECTIONS_EXECUTION_LOCK_KEY,
    );
    let failed = false;

    try {
      // Verify the only hard dependency for collection handling: the media
      // server. Ancillary services (Radarr/Sonarr/Seerr/Tautulli) are
      // exercised at the call site by the handler, so a transient blip in
      // an unrelated backend must not abort the whole run. Plex auto
      // re-discovery is handled inside verifyConnection().
      let mediaServer: IMediaServerService;
      try {
        mediaServer = await this.mediaServerFactory.verifyConnection();
      } catch (error) {
        failed = true;
        this.logger.log(
          'Media server unreachable. Skipping collection handling.',
        );
        this.logger.debug(error);
        this.eventEmitter.emit(MaintainerrEvent.CollectionHandler_Failed);
        return;
      }

      // Currently-playing media is deferred to the next run so we don't act on
      // it - chiefly delete it - out from under an active viewer. Best-effort:
      // fetched once at the start of the run (media that starts playing mid-run
      // isn't protected until next time), and an empty set (nothing playing or
      // a failed lookup) simply means "handle as usual".
      const playingItemIds = await mediaServer.getActiveSessions();

      this.logger.log('Started handling of all collections');
      let handledCollectionMedia = 0;
      let removedMissingMedia = 0;
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

      // Nothing else protects an excluded member: membership is reconciled only
      // by a rule run, and never for a manually added one.
      const exclusionsFor = await this.readExclusionsPerCollection();

      for (const collection of collectionsToHandle) {
        const dangerDate = getCollectionDangerDate(collection.deleteAfterDays);

        const dueMedia = (
          await this.collectionMediaRepo.find({
            where: {
              collectionId: collection.id,
              addDate: LessThanOrEqual(dangerDate),
            },
          })
        ).filter(
          (media) =>
            !media.ruleEvaluationFailed ||
            hasCollectionMediaManualMembership(media),
        );

        const eligibleMedia = await this.dropExcludedMedia(
          mediaServer,
          exclusionsFor(collection.id),
          dueMedia,
        );

        // Defer any eligible media that is currently being streamed; it stays
        // eligible and is picked up on the next run.
        const mediaToHandle =
          playingItemIds.size > 0
            ? eligibleMedia.filter(
                (media) => !playingItemIds.has(media.mediaServerId),
              )
            : eligibleMedia;

        const deferredPlaying = eligibleMedia.length - mediaToHandle.length;
        if (deferredPlaying > 0) {
          this.logger.log(
            `Deferring ${deferredPlaying} currently-playing media item(s) in collection '${collection.title}' to the next run`,
          );
        }

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
        const handledMediaForNotification: NotificationMediaItem[] = [];
        const failedMediaForNotification: { mediaServerId: string }[] = [];

        for (const media of collectionMedia) {
          // Snapshot the metadata before handling: a delete-style action removes
          // the item from the media server, so the handled notification's own
          // title lookup would come back empty and fall back to a generic
          // "no longer exists" message (#3249). Best-effort - an unresolved
          // snapshot just defers to that lookup, preserving prior behaviour.
          let mediaData: MediaItem | undefined;
          try {
            mediaData = await mediaServer.getMetadata(media.mediaServerId);
          } catch (error) {
            this.logger.debug(error);
          }

          let result: HandleMediaResult = 'failed';
          let handlingError: unknown;

          try {
            result = await this.collectionHandler.handleMedia(
              collection,
              media,
            );
          } catch (error) {
            handlingError = error;
          }

          if (result === 'handled') {
            handledCollectionMedia++;
            handledMediaForNotification.push({
              mediaServerId: media.mediaServerId,
              metadata: mediaData,
            });
          } else if (result === 'removed-missing') {
            // The item was already gone from the media server and has been
            // pruned from the collection(s). It wasn't a failure and nothing
            // on disk was altered, so it stays out of both notification lists
            // and doesn't trigger availability sync - the handler already
            // logged the cleanup.
            removedMissingMedia++;
          } else {
            collectionHandlingFailed = true;
            failedMediaForNotification.push({
              mediaServerId: media.mediaServerId,
            });

            // Warn so a failed action stays visible without DEBUG; the
            // per-collection failure notification below is the user-facing
            // signal. A thrown error carries its message; a soft `'failed'` was
            // already logged at debug in the API layer.
            const reason =
              handlingError instanceof Error
                ? handlingError.message
                : 'the configured action could not be completed';
            this.logger.warn(
              `Failed to handle media with id ${media.mediaServerId} in collection '${collection.title}': ${reason}`,
            );
            if (handlingError) {
              this.logger.debug(handlingError);
            }
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

        // Emit per failing collection so the notification can name which
        // collection failed.
        if (failedMediaForNotification.length > 0) {
          this.eventEmitter.emit(
            MaintainerrEvent.CollectionHandler_Failed,
            new CollectionHandlerFailedDto(
              failedMediaForNotification,
              collection.title,
              undefined,
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

      if (removedMissingMedia > 0) {
        this.logger.log(
          `Removed ${removedMissingMedia} item(s) from collections because they no longer exist on the media server`,
        );
      }

      if (handledCollectionMedia > 0) {
        if (this.settings.seerrConfigured()) {
          await delay(7000, async () => {
            try {
              // rethrow, or post() answers undefined and this catch never runs.
              await this.seerrApi.api.post(
                '/settings/jobs/availability-sync/run',
                undefined,
                undefined,
                { rethrow: true },
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
      // Run-level failure with no single collection in context; the per
      // collection failures above emit their own, more specific events.
      this.eventEmitter.emit(MaintainerrEvent.CollectionHandler_Failed);
    } finally {
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
