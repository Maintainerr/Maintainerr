import {
  IComparisonStatistics,
  MaintainerrEvent,
  MediaItem,
  MediaItemType,
  MediaServerType,
  RuleHandlerFinishedEventDto,
  RuleHandlerStartedEventDto,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import cacheManager from '../../api/lib/cache';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { IMediaServerService } from '../../api/media-server/media-server.interface';
import { CollectionsService } from '../../collections/collections.service';
import { Collection } from '../../collections/entities/collection.entities';
import { AddRemoveCollectionMedia } from '../../collections/interfaces/collection-media.interface';
import {
  CollectionMediaAddedDto,
  CollectionMediaRemovedDto,
  RuleHandlerFailedDto,
} from '../../events/events.dto';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import { RuleConstants } from '../constants/rules.constants';
import { RulesDto } from '../dtos/rules.dto';
import { RuleGroup } from '../entities/rule-group.entities';
import { RuleComparatorServiceFactory } from '../helpers/rule.comparator.service';
import { RulesService } from '../rules.service';
import { RuleExecutorProgressService } from './rule-executor-progress.service';

/**
 * Paginated media data for rule processing.
 * Uses server-agnostic MediaItem[] for compatibility with both Plex and Jellyfin.
 */
interface MediaDataPage {
  page: number;
  finished: boolean;
  data: MediaItem[];
}

@Injectable()
export class RuleExecutorService {
  ruleConstants: RuleConstants;
  userId: string;
  mediaData: MediaDataPage;
  mediaDataType: MediaItemType | undefined;
  workerData: MediaItem[];
  resultData: MediaItem[];
  statisticsData: IComparisonStatistics[];
  Data: MediaItem[];
  startTime: Date;

  constructor(
    private readonly rulesService: RulesService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly collectionService: CollectionsService,
    private readonly settings: SettingsService,
    private readonly comparatorFactory: RuleComparatorServiceFactory,
    private readonly eventEmitter: EventEmitter2,
    private readonly progressManager: RuleExecutorProgressService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(RuleExecutorService.name);
    this.ruleConstants = new RuleConstants();
    this.mediaData = { page: 1, finished: false, data: [] };
  }

  private async getMediaServer(): Promise<IMediaServerService> {
    return this.mediaServerFactory.getService();
  }

  public async executeForRuleGroups(
    ruleGroupId: number,
    abortSignal: AbortSignal,
  ) {
    const ruleGroup = await this.rulesService.getRuleGroup(ruleGroupId);

    if (!ruleGroup) {
      this.logger.warn(
        `Rule group ${ruleGroupId} not found. Skipping rule execution.`,
      );
      return;
    }

    if (!ruleGroup.isActive) {
      this.logger.log(
        `Rule group '${ruleGroup.name}' is not active. Skipping rule execution.`,
      );
      return;
    }

    this.eventEmitter.emit(
      MaintainerrEvent.RuleHandler_Started,
      new RuleHandlerStartedEventDto(
        `Started execution of rule '${ruleGroup.name}'`,
      ),
    );

    try {
      this.logger.log(`Starting execution of rule '${ruleGroup.name}'`);

      // Validate that libraryId is set - required after migrating between media servers
      if (!ruleGroup.libraryId || ruleGroup.libraryId === '') {
        this.logger.error(
          `Rule group '${ruleGroup.name}' has no library assigned. ` +
            `Please edit the rule group and select a library before running.`,
        );
        this.eventEmitter.emit(MaintainerrEvent.RuleHandler_Failed);
        return;
      }

      const appStatus = await this.settings.testConnections();

      if (appStatus) {
        // reset API caches, make sure latest data is used
        cacheManager.flushAll();

        const comparator = this.comparatorFactory.create();
        const mediaServer = await this.getMediaServer();

        const mediaItemCount = await mediaServer.getLibraryContentCount(
          ruleGroup.libraryId.toString(),
          ruleGroup.dataType ? ruleGroup.dataType : undefined,
        );

        const totalEvaluations = mediaItemCount * ruleGroup.rules.length;

        this.progressManager.initialize({
          name: ruleGroup.name,
          totalEvaluations: totalEvaluations,
        });

        if (ruleGroup.useRules) {
          this.logger.log(`Executing rules for '${ruleGroup.name}'`);
          this.startTime = new Date();

          // reset Plex cache if group uses a rule that requires it (collection rules for example)
          await this.rulesService.resetPlexCacheIfgroupUsesRuleThatRequiresIt(
            ruleGroup,
          );

          // prepare
          this.workerData = [];
          this.resultData = [];
          this.statisticsData = [];
          this.mediaData = { page: 0, finished: false, data: [] };

          this.mediaDataType = ruleGroup.dataType || undefined;

          // Run rules data chunks of 50
          while (!this.mediaData.finished) {
            await this.getMediaData(ruleGroup.libraryId);

            const ruleResult = await comparator.executeRulesWithData(
              ruleGroup,
              this.mediaData.data,
              () => {
                this.progressManager.incrementProcessed(
                  this.mediaData.data.length,
                );
              },
              abortSignal,
            );

            if (ruleResult) {
              this.statisticsData.push(...ruleResult.stats);
              this.resultData.push(...ruleResult.data);
            }
          }

          await this.handleCollection(
            await this.rulesService.getRuleGroupById(ruleGroup.id), // refetch to get latest changes
          );

          this.logger.log(`Execution of rules for '${ruleGroup.name}' done.`);
        }

        await this.syncManualPlexMediaToCollectionDB(
          await this.rulesService.getRuleGroupById(ruleGroup.id), // refetch to get latest changes
        );
      } else {
        this.logger.warn(
          'Not all applications are reachable.. Skipped rule execution.',
        );

        this.eventEmitter.emit(MaintainerrEvent.RuleHandler_Failed);
      }
    } catch (err) {
      const executionBeingAborted =
        err instanceof DOMException && err.name === 'AbortError';

      if (!executionBeingAborted) {
        this.logger.error('Error running rules executor.', err);
        this.eventEmitter.emit(MaintainerrEvent.RuleHandler_Failed);
      } else {
        this.logger.log(`Execution of rule '${ruleGroup.name}' was aborted.`);
      }
    }

    this.progressManager.reset();
    this.eventEmitter.emit(
      MaintainerrEvent.RuleHandler_Finished,
      new RuleHandlerFinishedEventDto(
        `Finished execution of rule '${ruleGroup.name}'`,
      ),
    );
  }

  private async syncManualPlexMediaToCollectionDB(rulegroup: RuleGroup) {
    if (rulegroup && rulegroup.collectionId) {
      let collection = await this.collectionService.getCollection(
        rulegroup.collectionId,
      );

      collection =
        await this.collectionService.relinkManualCollection(collection);

      if (collection && collection.mediaServerId) {
        const collectionMedia = await this.collectionService.getCollectionMedia(
          rulegroup.collectionId,
        );

        const mediaServer = await this.getMediaServer();
        const children = await mediaServer.getCollectionChildren(
          collection.mediaServerId,
        );

        // Handle manually added
        if (children && children.length > 0) {
          for (const child of children) {
            if (child && child.id)
              if (
                !collectionMedia.find((e) => {
                  return e.mediaServerId === child.id.toString();
                })
              ) {
                await this.collectionService.addToCollection(
                  collection.id,
                  [
                    {
                      mediaServerId: child.id.toString(),
                      reason: {
                        type: 'media_added_manually',
                      },
                    },
                  ],
                  true,
                );
              }
          }
        }

        // Handle manually removed items from collections
        // Jellyfin workaround: Skip removal check when children array is empty.
        // Unlike Plex, Jellyfin's collection API can return empty children during
        // brief sync delays after collection modifications, causing false positives
        // where valid items would be incorrectly flagged as "manually removed".
        // This workaround can be removed if Jellyfin improves collection sync consistency.
        const isJellyfin =
          this.settings.media_server_type === MediaServerType.JELLYFIN;
        const shouldCheckRemovals = isJellyfin
          ? children && children.length > 0
          : true;

        if (
          collectionMedia &&
          collectionMedia.length > 0 &&
          shouldCheckRemovals
        ) {
          for (const mediaItem of collectionMedia) {
            if (mediaItem && mediaItem.mediaServerId) {
              if (
                !children ||
                !children.find(
                  (e) => mediaItem.mediaServerId === e.id.toString(),
                )
              ) {
                await this.collectionService.removeFromCollection(
                  collection.id,
                  [
                    {
                      mediaServerId: mediaItem.mediaServerId,
                      reason: {
                        type: 'media_removed_manually',
                      },
                    },
                  ] satisfies AddRemoveCollectionMedia[],
                );
              }
            }
          }
        }

        this.logger.log(
          `Synced collection '${
            collection.manualCollection
              ? collection.manualCollectionName
              : collection.title
          }' with media server`,
        );
      }
    }
  }

  private async handleCollection(rulegroup: RuleGroup) {
    try {
      let collection = await this.collectionService.getCollection(
        rulegroup?.collectionId,
      );

      const exclusions = await this.rulesService.getExclusions(rulegroup.id);

      // Build sets of excluded IDs - both direct mediaServerId and parent IDs
      const excludedMediaServerIds = new Set<string>(
        exclusions.map((e) => e.mediaServerId),
      );
      const excludedParentIds = new Set<string>(
        exclusions.filter((e) => e.parent).map((e) => String(e.parent)),
      );

      const statsByMediaServerId = new Map<string, IComparisonStatistics>();
      for (const stat of this.statisticsData ?? []) {
        const mediaServerId = stat.mediaServerId;
        if (!statsByMediaServerId.has(mediaServerId)) {
          statsByMediaServerId.set(mediaServerId, stat);
        }
      }

      // filter exclusions out of results & get correct media item ID
      // Check both direct exclusion and parent exclusion (e.g., show excluded -> all seasons excluded)
      const desiredMediaServerIds = new Set<string>();

      for (const item of this.resultData ?? []) {
        const mediaServerId = item.id;
        const isDirectlyExcluded = excludedMediaServerIds.has(mediaServerId);
        const isParentExcluded =
          item.parentId && excludedParentIds.has(item.parentId);
        const isGrandparentExcluded =
          item.grandparentId && excludedParentIds.has(item.grandparentId);

        if (
          !isDirectlyExcluded &&
          !isParentExcluded &&
          !isGrandparentExcluded
        ) {
          desiredMediaServerIds.add(mediaServerId);
        }
      }

      if (collection) {
        const collMediaData = await this.collectionService.getCollectionMedia(
          collection.id,
        );

        // check media server collection link - ensure Plex collection exists if we have media
        if (collMediaData.length > 0) {
          if (collection.mediaServerId) {
            // If we have a mediaServerId, verify it still exists
            collection =
              await this.collectionService.checkAutomaticMediaServerLink(
                collection,
              );
          }
          // if collection doesn't exist in media server but should.. resync current data
          if (!collection.mediaServerId) {
            collection = await this.collectionService.addToCollection(
              collection.id,
              collMediaData.map((m) => ({
                mediaServerId: m.mediaServerId,
              })),
              collection.manualCollection,
            );
            if (collection) {
              collection =
                await this.collectionService.saveCollection(collection);
            }
          }
        }

        // Ensure manually added media always remains included
        for (const mediaItem of collMediaData) {
          if (mediaItem?.isManual === true) {
            desiredMediaServerIds.add(mediaItem.mediaServerId);
          }
        }

        const currentMediaServerIds = new Set<string>(
          collMediaData.map((e) => {
            return e.mediaServerId;
          }),
        );

        const mediaToAdd: string[] = [];
        for (const mediaServerId of desiredMediaServerIds) {
          if (!currentMediaServerIds.has(mediaServerId)) {
            mediaToAdd.push(mediaServerId);
          }
        }

        const dataToAdd: AddRemoveCollectionMedia[] = this.prepareDataAmendment(
          mediaToAdd.map((el) => {
            return {
              mediaServerId: el,
              reason: {
                type: 'media_added_by_rule',
                data: statsByMediaServerId.get(el),
              },
            } satisfies AddRemoveCollectionMedia;
          }),
        );

        const mediaToRemove: string[] = [];
        for (const mediaServerId of currentMediaServerIds) {
          if (!desiredMediaServerIds.has(mediaServerId)) {
            mediaToRemove.push(mediaServerId);
          }
        }

        const dataToRemove: AddRemoveCollectionMedia[] =
          this.prepareDataAmendment(
            mediaToRemove.map((el) => {
              return {
                mediaServerId: el,
                reason: {
                  type: 'media_removed_by_rule',
                  data: statsByMediaServerId.get(el),
                },
              } satisfies AddRemoveCollectionMedia;
            }),
          );

        if (dataToRemove.length > 0) {
          this.logger.log(
            `Removing ${dataToRemove.length} media items from '${
              collection.manualCollection
                ? collection.manualCollectionName
                : collection.title
            }'.`,
          );

          this.eventEmitter.emit(
            MaintainerrEvent.CollectionMedia_Removed,
            new CollectionMediaRemovedDto(
              dataToRemove,
              collection.title,
              {
                type: 'rulegroup',
                value: rulegroup.id,
              },
              collection.deleteAfterDays,
            ),
          );
        }

        if (dataToAdd.length > 0) {
          this.logger.log(
            `Adding ${dataToAdd.length} media items to '${
              collection.manualCollection
                ? collection.manualCollectionName
                : collection.title
            }'.`,
          );

          this.eventEmitter.emit(
            MaintainerrEvent.CollectionMedia_Added,
            new CollectionMediaAddedDto(
              dataToAdd,
              collection.title,
              { type: 'rulegroup', value: rulegroup.id },
              collection.deleteAfterDays,
            ),
          );
        }

        collection =
          await this.collectionService.relinkManualCollection(collection);

        collection = await this.collectionService.addToCollection(
          collection.id,
          dataToAdd,
        );

        collection = await this.collectionService.removeFromCollection(
          collection.id,
          dataToRemove,
        );

        // add the run duration to the collection
        await this.AddCollectionRunDuration(collection);

        return collection;
      } else {
        this.logger.log(
          `collection not found with id ${rulegroup.collectionId}`,
        );

        this.eventEmitter.emit(
          MaintainerrEvent.RuleHandler_Failed,
          new RuleHandlerFailedDto(collection.title, {
            type: 'rulegroup',
            value: rulegroup.id,
          }),
        );
      }
    } catch (err) {
      this.logger.warn(
        `Execption occurred whild handling rule: ${err.message}`,
      );

      this.eventEmitter.emit(
        MaintainerrEvent.RuleHandler_Failed,
        new RuleHandlerFailedDto(rulegroup.collection?.title, {
          type: 'rulegroup',
          value: rulegroup.id,
        }),
      );
    }
  }

  private async getAllActiveRuleGroups(): Promise<RulesDto[]> {
    return await this.rulesService.getRuleGroups(true);
  }

  private prepareDataAmendment(
    arr: AddRemoveCollectionMedia[],
  ): AddRemoveCollectionMedia[] {
    const uniqueArr: AddRemoveCollectionMedia[] = [];
    arr.filter(
      (item) =>
        !uniqueArr.find((el) => el.mediaServerId === item.mediaServerId) &&
        uniqueArr.push(item),
    );
    return uniqueArr;
  }

  private async AddCollectionRunDuration(collection: Collection) {
    // add the run duration to the collection
    collection.lastDurationInSeconds = Math.floor(
      (new Date().getTime() - this.startTime.getTime()) / 1000,
    );

    await this.collectionService.saveCollection(collection);
  }

  private async getMediaData(libraryId: string): Promise<void> {
    const size = 50;
    const mediaServer = await this.getMediaServer();
    const response = await mediaServer.getLibraryContents(libraryId, {
      offset: +this.mediaData.page * size,
      limit: size,
      type: this.mediaDataType,
    });

    if (response) {
      this.mediaData.data = response.items ? response.items : [];

      if ((+this.mediaData.page + 1) * size >= response.totalSize) {
        this.mediaData.finished = true;
      }
    } else {
      this.mediaData.finished = true;
    }
    this.mediaData.page++;
  }
}
