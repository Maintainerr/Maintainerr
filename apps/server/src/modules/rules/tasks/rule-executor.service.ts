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
import {
  CollectionMediaManualMembershipSource,
  hasCollectionMediaManualMembership,
} from '../../collections/entities/collection_media.entities';
import { CollectionMediaChange } from '../../collections/interfaces/collection-media.interface';
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

interface MediaServerSyncContext {
  collection?: Collection;
  skipManualChildImport?: boolean;
  skipManualChildImportReason?: 'newly-linked-automatic-collection';
  sharedManualCollection?: boolean;
}

interface CollectionMembershipSyncChanges {
  addedMediaServerIds: Set<string>;
  removedMediaServerIds: Set<string>;
}

export type RuleExecutionFailureReason = 'media-server-unreachable';

export type RuleExecutionResult =
  | { status: 'success' }
  | {
      status: 'failed';
      failedPayload: RuleHandlerFailedDto;
      reason?: RuleExecutionFailureReason;
    }
  | { status: 'aborted' }
  | { status: 'skipped'; reason: 'not-found' | 'inactive' };

class RuleExecutionFailure extends Error {
  constructor(
    public readonly payload: RuleHandlerFailedDto,
    public readonly reason?: RuleExecutionFailureReason,
    message?: string,
  ) {
    super(message ?? 'Rule execution failed');
    this.name = RuleExecutionFailure.name;
  }
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

  private buildRuleHandlerFailedDto(
    rulegroup?: Partial<Pick<RuleGroup, 'id' | 'name' | 'collectionId'>> & {
      collection?: { title?: string } | null;
    },
    collectionName?: string,
  ): RuleHandlerFailedDto {
    return new RuleHandlerFailedDto(
      collectionName ??
        rulegroup?.collection?.title ??
        rulegroup?.name ??
        (rulegroup?.collectionId
          ? `Unknown (collectionId: ${rulegroup.collectionId})`
          : undefined),
      rulegroup?.id
        ? {
            type: 'rulegroup',
            value: rulegroup.id,
          }
        : undefined,
    );
  }

  public async executeForRuleGroups(
    ruleGroupId: number,
    abortSignal: AbortSignal,
  ): Promise<RuleExecutionResult> {
    const ruleGroup = await this.rulesService.getRuleGroup(ruleGroupId);

    if (!ruleGroup) {
      this.logger.warn(
        `Rule group ${ruleGroupId} not found. Skipping rule execution.`,
      );
      return { status: 'skipped', reason: 'not-found' };
    }

    if (!ruleGroup.isActive) {
      this.logger.log(
        `Rule group '${ruleGroup.name}' is not active. Skipping rule execution.`,
      );
      return { status: 'skipped', reason: 'inactive' };
    }

    let failedPayload: RuleHandlerFailedDto | undefined;
    let result: RuleExecutionResult = { status: 'success' };

    try {
      abortSignal.throwIfAborted();

      this.eventEmitter.emit(
        MaintainerrEvent.RuleHandler_Started,
        new RuleHandlerStartedEventDto(
          `Started execution of rule '${ruleGroup.name}'`,
        ),
      );

      this.logger.log(`Starting execution of rule '${ruleGroup.name}'`);

      // Validate that libraryId is set - required after migrating between media servers
      if (!ruleGroup.libraryId || ruleGroup.libraryId === '') {
        this.logger.error(
          `Rule group '${ruleGroup.name}' has no library assigned. ` +
            `Please edit the rule group and select a library before running.`,
        );
        throw new RuleExecutionFailure(
          this.buildRuleHandlerFailedDto(ruleGroup, ruleGroup.name),
        );
      }

      // Verify the only hard dependency for rule execution: the media server.
      // Ancillary services (Radarr/Sonarr/Seerr/Tautulli) are exercised at the
      // call site by the rules that actually use them, so a transient blip in
      // an unrelated backend must not abort the whole rule run. Plex auto
      // re-discovery is handled inside verifyConnection().
      try {
        await this.mediaServerFactory.verifyConnection();
      } catch (error) {
        this.logger.warn(
          `Media server unreachable. Skipping execution of rule '${ruleGroup.name}'.`,
        );
        this.logger.debug(error);
        throw new RuleExecutionFailure(
          this.buildRuleHandlerFailedDto(ruleGroup),
          'media-server-unreachable',
        );
      }

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

      let collectionSyncChanges: CollectionMembershipSyncChanges = {
        addedMediaServerIds: new Set<string>(),
        removedMediaServerIds: new Set<string>(),
      };

      if (ruleGroup.useRules) {
        this.logger.log(`Executing rules for '${ruleGroup.name}'`);
        this.startTime = new Date();

        // reset media server cache if group uses a rule that requires it (collection rules for example)
        await this.rulesService.resetCacheIfGroupUsesRuleThatRequiresIt(
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
          abortSignal.throwIfAborted();
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

        abortSignal.throwIfAborted();
        collectionSyncChanges = await this.handleCollection(
          await this.rulesService.getRuleGroupById(ruleGroup.id), // refetch to get latest changes
          abortSignal,
        );

        this.logger.log(`Execution of rules for '${ruleGroup.name}' done.`);
      }

      abortSignal.throwIfAborted();
      await this.syncManualMediaServerToCollectionDB(
        await this.rulesService.getRuleGroupById(ruleGroup.id), // refetch to get latest changes
        collectionSyncChanges,
      );
    } catch (error) {
      const executionBeingAborted =
        error instanceof DOMException && error.name === 'AbortError';

      if (!executionBeingAborted) {
        if (error instanceof RuleExecutionFailure) {
          failedPayload = error.payload;
          result = {
            status: 'failed',
            failedPayload: error.payload,
            ...(error.reason ? { reason: error.reason } : undefined),
          };
        } else {
          this.logger.error('Error running rules executor.');
          this.logger.debug(error);
          failedPayload = this.buildRuleHandlerFailedDto(ruleGroup);
          result = { status: 'failed', failedPayload };
        }
      } else {
        this.logger.log(`Execution of rule '${ruleGroup.name}' was aborted.`);
        result = { status: 'aborted' };
      }
    } finally {
      this.progressManager.reset();

      if (failedPayload) {
        this.eventEmitter.emit(
          MaintainerrEvent.RuleHandler_Failed,
          failedPayload,
        );
      }

      this.eventEmitter.emit(
        MaintainerrEvent.RuleHandler_Finished,
        new RuleHandlerFinishedEventDto(
          failedPayload
            ? `Finished execution of rule '${ruleGroup.name}' with errors.`
            : `Finished execution of rule '${ruleGroup.name}'`,
        ),
      );
    }

    return result;
  }

  private async syncManualMediaServerToCollectionDB(
    rulegroup: RuleGroup,
    collectionSyncChanges: CollectionMembershipSyncChanges,
  ) {
    if (rulegroup && rulegroup.collectionId) {
      const syncContext = await this.getCollectionForMediaServerSync(rulegroup);
      const collection = syncContext.collection;

      if (collection) {
        if (syncContext.sharedManualCollection) {
          const children = await this.getCollectionChildrenForSync(collection);

          if (children === undefined) {
            return;
          }

          await this.collectionService.reconcileSharedManualCollectionState(
            collection,
            {
              addedMediaServerIds: collectionSyncChanges.addedMediaServerIds,
              removedMediaServerIds:
                collectionSyncChanges.removedMediaServerIds,
              serverChildren: children,
            },
          );

          this.logger.log(
            `Synced collection '${collection.manualCollectionName}' with media server`,
          );
          return;
        }

        const collectionMedia = await this.collectionService.getCollectionMedia(
          rulegroup.collectionId,
        );

        const children = await this.getCollectionChildrenForSync(collection);

        if (children === undefined) {
          return;
        }

        // Handle manually added
        if (syncContext.skipManualChildImport) {
          this.logger.debug(
            `Skipping manual child import for newly linked automatic collection '${collection.title}' to avoid marking existing collection contents as manual.`,
          );
        } else if (children && children.length > 0) {
          // When two automatic rule groups share a title they end up linked
          // to the same media server collection. Items rule-owned by a
          // sibling collection must not be imported here as manual — that
          // would subject them to this rule's deleteAfterDays. If we cannot
          // determine sibling ownership (DB error), refuse to import: a
          // silent fallback to "no siblings" would re-introduce the
          // contamination this guard exists to prevent.
          let siblingRuleOwnedIds: Set<string> | undefined;
          try {
            siblingRuleOwnedIds =
              await this.collectionService.getSiblingRuleOwnedMediaServerIds(
                collection,
              );
          } catch (error) {
            this.logger.warn(
              `Could not determine sibling rule ownership for '${collection.title}'. Skipping manual child import to avoid cross-rule contamination.`,
            );
            this.logger.debug(error);
          }

          if (siblingRuleOwnedIds !== undefined) {
            // Fetch exclusions to avoid re-adding excluded items as manual
            const exclusions = await this.rulesService.getExclusions(
              rulegroup.id,
            );
            const collectionMediaIds = new Set(
              collectionMedia
                .map((item) => item?.mediaServerId)
                .filter((mediaServerId): mediaServerId is string =>
                  Boolean(mediaServerId),
                ),
            );
            const excludedMediaServerIds = new Set<string>(
              exclusions.map((e) => e.mediaServerId),
            );
            const excludedParentIds = new Set<string>(
              exclusions.filter((e) => e.parent).map((e) => String(e.parent)),
            );
            const missingManualChildren: CollectionMediaChange[] = [];

            for (const child of children) {
              if (child && child.id) {
                const childId = child.id.toString();

                // Skip items that were just added/removed by rule execution.
                // The media server API may still return stale children after removal.
                if (
                  collectionSyncChanges.addedMediaServerIds.has(childId) ||
                  collectionSyncChanges.removedMediaServerIds.has(childId)
                ) {
                  continue;
                }

                // Skip items that are excluded
                if (
                  excludedMediaServerIds.has(childId) ||
                  (child.parentId &&
                    excludedParentIds.has(child.parentId.toString())) ||
                  (child.grandparentId &&
                    excludedParentIds.has(child.grandparentId.toString()))
                ) {
                  continue;
                }

                if (siblingRuleOwnedIds.has(childId)) {
                  continue;
                }

                if (!collectionMediaIds.has(childId)) {
                  collectionMediaIds.add(childId);
                  missingManualChildren.push({
                    mediaServerId: childId,
                    reason: {
                      type: 'media_added_manually',
                    },
                  });
                }
              }
            }

            if (missingManualChildren.length > 0) {
              await this.collectionService.syncMediaServerChildrenToCollection(
                collection,
                missingManualChildren,
                CollectionMediaManualMembershipSource.LOCAL,
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
            if (!mediaItem?.mediaServerId) {
              continue;
            }

            if (
              collectionSyncChanges.addedMediaServerIds.has(
                mediaItem.mediaServerId,
              ) ||
              collectionSyncChanges.removedMediaServerIds.has(
                mediaItem.mediaServerId,
              )
            ) {
              continue;
            }

            if (
              !children ||
              !children.find((e) => mediaItem.mediaServerId === e.id.toString())
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
                ] satisfies CollectionMediaChange[],
                'manual',
              );
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

  private async getCollectionForMediaServerSync(
    rulegroup: RuleGroup,
  ): Promise<MediaServerSyncContext> {
    const collection = await this.collectionService.getCollection(
      rulegroup.collectionId,
    );

    if (!collection) {
      return {};
    }

    if (collection.manualCollection) {
      const relinkedCollection =
        await this.collectionService.relinkManualCollection(collection);

      if (!relinkedCollection.mediaServerId) {
        return {};
      }

      const isSharedMediaServerCollection =
        await this.collectionService.isMediaServerCollectionShared(
          relinkedCollection,
        );

      return isSharedMediaServerCollection
        ? {
            collection: relinkedCollection,
            sharedManualCollection: true,
          }
        : { collection: relinkedCollection };
    }

    const wasLinkedBeforeSync = Boolean(collection.mediaServerId);

    const linkedCollection =
      await this.collectionService.checkAutomaticMediaServerLink(collection);

    if (!linkedCollection.mediaServerId) {
      this.logger.debug(
        `Skipping media server sync for '${linkedCollection.title}' — no media server collection exists because no items currently match the rule.`,
      );
      return {};
    }

    return {
      collection: linkedCollection,
      skipManualChildImport: !wasLinkedBeforeSync,
      skipManualChildImportReason: !wasLinkedBeforeSync
        ? 'newly-linked-automatic-collection'
        : undefined,
    };
  }

  private async getCollectionChildrenForSync(
    collection: Collection,
  ): Promise<MediaItem[] | undefined> {
    try {
      const mediaServer = await this.getMediaServer();
      return await mediaServer.getCollectionChildren(collection.mediaServerId);
    } catch (error) {
      this.logger.warn(
        `Skipping media server child sync for collection '${collection.title}' because the linked media server collection could not be enumerated.`,
      );
      this.logger.debug(error);

      if (!collection.manualCollection) {
        const linkedCollection =
          await this.collectionService.checkAutomaticMediaServerLink(
            collection,
          );

        if (!linkedCollection.mediaServerId) {
          this.logger.warn(
            `Cleared stale media server link for collection '${linkedCollection.title}' after child sync failed.`,
          );
        }
      }

      return undefined;
    }
  }

  private async handleCollection(
    rulegroup: RuleGroup,
    abortSignal?: AbortSignal,
  ): Promise<CollectionMembershipSyncChanges> {
    try {
      let collection = await this.collectionService.getCollection(
        rulegroup?.collectionId,
      );

      const exclusions = await this.rulesService.getExclusions(rulegroup?.id);

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
          if (hasCollectionMediaManualMembership(mediaItem)) {
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

        const dataToAdd: CollectionMediaChange[] = this.prepareDataAmendment(
          mediaToAdd.map((el) => {
            return {
              mediaServerId: el,
              reason: {
                type: 'media_added_by_rule',
                data: statsByMediaServerId.get(el),
              },
            } satisfies CollectionMediaChange;
          }),
        );

        const mediaToRemove: string[] = [];
        for (const mediaServerId of currentMediaServerIds) {
          if (!desiredMediaServerIds.has(mediaServerId)) {
            mediaToRemove.push(mediaServerId);
          }
        }

        const dataToRemove: CollectionMediaChange[] = this.prepareDataAmendment(
          mediaToRemove.map((el) => {
            return {
              mediaServerId: el,
              reason: {
                type: 'media_removed_by_rule',
                data: statsByMediaServerId.get(el),
              },
            } satisfies CollectionMediaChange;
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
        }

        if (dataToAdd.length > 0) {
          this.logger.log(
            `Adding ${dataToAdd.length} media items to '${
              collection.manualCollection
                ? collection.manualCollectionName
                : collection.title
            }'.`,
          );
        }

        collection =
          await this.collectionService.relinkManualCollection(collection);

        abortSignal?.throwIfAborted();
        if (dataToAdd.length > 0) {
          collection =
            collMediaData.length > 0
              ? await this.collectionService.addToCollectionWithResolvedLink(
                  collection,
                  dataToAdd,
                )
              : await this.collectionService.addToCollection(
                  collection.id,
                  dataToAdd,
                );
        }

        abortSignal?.throwIfAborted();
        if (collection && dataToRemove.length > 0) {
          collection =
            collMediaData.length > 0
              ? await this.collectionService.removeFromCollectionWithResolvedLink(
                  collection,
                  dataToRemove,
                  'rule',
                )
              : await this.collectionService.removeFromCollection(
                  collection.id,
                  dataToRemove,
                  'rule',
                );
        }

        if (!collection) {
          throw new Error(
            `Collection update failed for rule group ${rulegroup?.id} (collectionId: ${rulegroup?.collectionId})`,
          );
        }

        // Determine which items were actually added/removed by comparing DB state
        const updatedMediaServerIds = new Set(
          (
            (await this.collectionService.getCollectionMedia(collection?.id)) ??
            []
          ).map((e) => e.mediaServerId),
        );

        const addedToCollection = dataToAdd.filter(
          (m) =>
            updatedMediaServerIds.has(m.mediaServerId) &&
            !currentMediaServerIds.has(m.mediaServerId),
        );
        const removedFromCollection = dataToRemove.filter(
          (m) =>
            !updatedMediaServerIds.has(m.mediaServerId) &&
            currentMediaServerIds.has(m.mediaServerId),
        );

        if (removedFromCollection.length > 0) {
          this.eventEmitter.emit(
            MaintainerrEvent.CollectionMedia_Removed,
            new CollectionMediaRemovedDto(
              removedFromCollection,
              collection.title,
              {
                type: 'rulegroup',
                value: rulegroup.id,
              },
              collection.id,
              collection.deleteAfterDays,
            ),
          );
        }

        if (addedToCollection.length > 0) {
          this.eventEmitter.emit(
            MaintainerrEvent.CollectionMedia_Added,
            new CollectionMediaAddedDto(
              addedToCollection,
              collection.title,
              { type: 'rulegroup', value: rulegroup.id },
              collection.id,
              collection.deleteAfterDays,
            ),
          );
        }

        // add the run duration to the collection
        await this.AddCollectionRunDuration(collection);

        return {
          addedMediaServerIds: new Set(
            addedToCollection.map((item) => item.mediaServerId),
          ),
          removedMediaServerIds: new Set(
            removedFromCollection.map((item) => item.mediaServerId),
          ),
        };
      } else {
        this.logger.log(
          `collection not found with id ${rulegroup?.collectionId}`,
        );

        throw new RuleExecutionFailure(
          this.buildRuleHandlerFailedDto(rulegroup),
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      if (error instanceof RuleExecutionFailure) {
        throw error;
      }

      this.logger.warn('Exception occurred while handling rule');
      this.logger.debug(error);

      throw new RuleExecutionFailure(this.buildRuleHandlerFailedDto(rulegroup));
    }
  }

  private async getAllActiveRuleGroups(): Promise<RulesDto[]> {
    return await this.rulesService.getRuleGroups(true);
  }

  private prepareDataAmendment(
    arr: CollectionMediaChange[],
  ): CollectionMediaChange[] {
    const uniqueArr: CollectionMediaChange[] = [];
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
