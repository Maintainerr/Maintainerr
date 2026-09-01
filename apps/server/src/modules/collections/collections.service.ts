import {
  BasicResponseDto,
  type BulkMediaItemResult,
  type BulkMediaResponse,
  CollectionLogMeta,
  CollectionMediaSortField,
  compareMediaItemsBySort,
  type CompareMediaItemsOptions,
  ECollectionLogType,
  getCollectionDeleteDate,
  isMediaType,
  MaintainerrEvent,
  MediaCollection,
  MediaItem,
  MediaItemType,
  MediaItemWithParent,
  mediaLibraryStatusSortFields,
  MediaLibrarySortField,
  MediaServerFeature,
  MediaServerType,
  MediaSortOrder,
  parseCollectionSortKey,
} from '@maintainerr/contracts';
import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { chunk } from 'lodash';
import { Brackets, DataSource, In, LessThan, Not, Repository } from 'typeorm';
import { CollectionLog } from '../../modules/collections/entities/collection_log.entities';
import { getErrorMessage } from '../../utils/connection-error';
import { readItemPresence } from '../api/media-server/item-presence.util';
import {
  ENRICHMENT_ID_CHUNK,
  MediaItemEnrichmentService,
} from '../api/media-server/media-item-enrichment.service';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import {
  CollectionMediaAddedDto,
  CollectionMediaRemovedDto,
} from '../events/events.dto';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';
import { OverlayProcessorService } from '../overlays/overlay-processor.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { SettingsDataService } from '../settings/settings-data.service';
import { CollectionPosterService } from './collection-poster.service';
import { Collection } from './entities/collection.entities';
import {
  CollectionMedia,
  CollectionMediaManualMembershipSource,
  CollectionMediaWithMetadata,
  hasCollectionMediaManualMembership,
  hasCollectionMediaRuleMembership,
} from './entities/collection_media.entities';
import {
  CollectionMediaRuleRemoval,
  type CollectionMediaPendingDirection,
} from './entities/collection_media_rule_removal.entities';
import { unconfirmedIds } from '../api/media-server/mutation-outcome.util';
import {
  AlterableMediaContext,
  CollectionMediaChange,
} from './interfaces/collection-media.interface';
import { ICollection } from './interfaces/collection.interface';

interface addCollectionDbResponse {
  id: number;
  mediaServerId?: string;
  isActive: boolean;
  visibleOnRecommended: boolean;
  visibleOnHome: boolean;
  deleteAfterDays: number;
  manualCollection: boolean;
}

interface CollectionMediaCountRow {
  collectionId: string;
  mediaCount: string;
}

interface CollectionPreviewMediaRow {
  id: number;
  collectionId: number;
  mediaServerId: string;
  tmdbId?: number;
  tvdbId?: number;
  addDate: Date;
  image_path?: string;
  isManual?: boolean;
  includedByRule?: boolean | null;
  manualMembershipSource?: CollectionMediaManualMembershipSource | null;
  rowNumber: number;
}

type CollectionMediaRemovalScope = 'all' | 'rule' | 'manual';

// Each item resolves its own hierarchy against the media server, so this stays
// modest to avoid over-driving it on a large selection.
const BULK_COLLECTION_ACTION_CONCURRENCY = 5;

// One bound parameter per id, so a collection with very many markers would
// otherwise trip SQLite's 32766-variable cap (#3431).
const RULE_REMOVAL_MARKER_CHUNK = 500;

interface SharedManualCollectionReconciliationOptions {
  addedMediaServerIds?: Set<string>;
  removedMediaServerIds?: Set<string>;
  serverChildren?: MediaItem[];
}

/**
 * The `addDate` cutoff at which a collection item is due for handling: the
 * worker acts once `addDate <= now - deleteAfterDays`. Fixed-ms rather than
 * calendar arithmetic so every caller agrees with that predicate exactly,
 * including across a DST boundary. An unset window resolves to `now` - no
 * window means everything is immediately due.
 */
export const getCollectionDangerDate = (
  deleteAfterDays: number | null | undefined,
): Date => new Date(Date.now() - +(deleteAfterDays ?? 0) * 86400000);

export interface PostponeCollectionMediaResult {
  collectionId: number;
  mediaServerId: string;
  addDate: Date;
  deleteAfterDays: number | null;
  deletionDate: Date | null;
}

/**
 * Adds report which ids the media server refused, so a caller acting on a
 * user's behalf can say so instead of reporting a silent success.
 */
export interface CollectionAddResult {
  collection?: Collection;
  serverRejectedIds: string[];
  /** Ids whose add was never answered, so it may or may not have been applied.
   * Reported apart from a refusal because the two are not the same news for a
   * user, and only a refusal is grounds for healing the collection. */
  serverUnconfirmedIds?: string[];
  /** Ids the server accepted but whose membership row failed to persist; the
   * server add was rolled back, so nothing of the add survived. */
  unpersistedIds?: string[];
}

export interface ContextActionResult extends CollectionAddResult {
  /** Ids the context resolved to. Zero means it cannot apply to this collection. */
  resolvedCount: number;
}

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(CollectionMedia)
    private readonly CollectionMediaRepo: Repository<CollectionMedia>,
    @InjectRepository(CollectionMediaRuleRemoval)
    private readonly CollectionMediaRuleRemovalRepo: Repository<CollectionMediaRuleRemoval>,
    @InjectRepository(CollectionLog)
    private readonly CollectionLogRepo: Repository<CollectionLog>,
    @InjectRepository(RuleGroup)
    private readonly ruleGroupRepo: Repository<RuleGroup>,
    @InjectRepository(Exclusion)
    private readonly exclusionRepo: Repository<Exclusion>,
    private readonly connection: DataSource,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly mediaItemEnrichmentService: MediaItemEnrichmentService,
    private readonly settingsDataService: SettingsDataService,
    private readonly metadataService: MetadataService,
    private readonly eventEmitter: EventEmitter2,
    private readonly collectionPosterService: CollectionPosterService,
    private readonly overlayProcessor: OverlayProcessorService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(CollectionsService.name);
  }

  /**
   * Get the appropriate media server service based on current settings
   */
  private async getMediaServer(): Promise<IMediaServerService> {
    return this.mediaServerFactory.getService();
  }

  /**
   * Get the currently configured media server type
   */
  private async getMediaServerType(): Promise<MediaServerType | null> {
    return this.mediaServerFactory.getConfiguredServerType();
  }

  async getCollection(id?: number, title?: string) {
    try {
      if (title) {
        return await this.collectionRepo.findOne({ where: { title: title } });
      }
      if (id != null) {
        return await this.collectionRepo.findOne({ where: { id: id } });
      }
      return undefined;
    } catch (error) {
      this.logger.warn('An error occurred while performing collection actions');
      this.logger.debug(error);
      return undefined;
    }
  }

  async getCollectionRecord(id: number) {
    return await this.collectionRepo.findOne({ where: { id } });
  }

  async getCollectionMedia(id: number) {
    try {
      return await this.CollectionMediaRepo.find({
        where: { collectionId: id },
      });
    } catch (error) {
      this.logger.warn('An error occurred while performing collection actions');
      this.logger.debug(error);
      return undefined;
    }
  }

  async getCollectionMediaRecord(collectionId: number, mediaServerId: string) {
    return await this.CollectionMediaRepo.findOne({
      where: {
        collectionId,
        mediaServerId,
      },
    });
  }

  /**
   * Postpone the deletion timer for one collection-media item by moving its
   * `addDate` - the worker deletes once `addDate + deleteAfterDays` has passed,
   * so no schema or worker change is needed. `days` pushes the deadline out;
   * omitting it restarts the full window. For external automation (Home
   * Assistant, Ombi, Seerr) - Maintainerr never contacts the requester itself.
   *
   * Writes the timer only. The caller logs the change afterwards via
   * `logPostponedCollectionMedia`, so resolving the item's title cannot hold
   * the shared execution lock while a slow media server answers.
   */
  async postponeCollectionMedia(
    collectionId: number,
    mediaServerId: string,
    days?: number,
  ): Promise<PostponeCollectionMediaResult | undefined> {
    const collection = await this.getCollectionRecord(collectionId);
    if (!collection) {
      return undefined;
    }

    const media = await this.getCollectionMediaRecord(
      collectionId,
      mediaServerId,
    );
    if (!media) {
      return undefined;
    }

    // Add whole calendar days (DST-safe, unlike ms arithmetic) and store at
    // date granularity to match insertCollectionMediaMembership - every other
    // addDate is a midnight value, so "days left" stays stable regardless of
    // the time of day this call arrives.
    const newAddDate = days != null ? new Date(media.addDate) : new Date();
    if (days != null) {
      // Shift from the worker's own cutoff when the item's deadline has
      // already passed: shifting an overdue addDate can land the deadline in
      // the past again, so the next run deletes the item anyway - a postpone
      // that keeps nothing.
      const dangerDate = getCollectionDangerDate(collection.deleteAfterDays);
      if (newAddDate < dangerDate) {
        newAddDate.setTime(dangerDate.getTime());
      }
      newAddDate.setDate(newAddDate.getDate() + days);
    }
    newAddDate.setHours(0, 0, 0, 0);

    await this.CollectionMediaRepo.update(media.id, { addDate: newAddDate });

    // Surface the resulting deadline (addDate + deleteAfterDays) so the caller
    // can confirm it. Null when the collection has no deletion window.
    const deletionDate = getCollectionDeleteDate(
      newAddDate,
      collection.deleteAfterDays,
    );

    return {
      collectionId,
      mediaServerId,
      addDate: newAddDate,
      deleteAfterDays: collection.deleteAfterDays ?? null,
      deletionDate,
    };
  }

  /**
   * Best-effort collection-log entry for a postpone that already happened.
   * Nothing here may throw: the timer is written, and failing the caller now
   * would invite a retry that postpones the item a second time.
   */
  async logPostponedCollectionMedia(
    collectionId: number,
    mediaServerId: string,
    days?: number,
  ): Promise<void> {
    try {
      const collection = await this.getCollectionRecord(collectionId);
      if (!collection) {
        return;
      }

      // Prefer the item's title; fall back to its id if the media server
      // can't resolve it (transient error / already gone).
      let mediaLabel = mediaServerId;
      try {
        const mediaData = await (
          await this.getMediaServer()
        ).getMetadata(mediaServerId);
        if (mediaData) {
          mediaLabel = this.describeMediaForLog(mediaData);
        }
      } catch (error) {
        this.logger.debug(error);
      }

      await this.addLogRecord(
        collection,
        days != null
          ? `Postponed deletion of "${mediaLabel}" by ${days} day(s)`
          : `Reset deletion timer for "${mediaLabel}"`,
        ECollectionLogType.MEDIA,
      );
    } catch (error) {
      this.logger.warn('Failed to log a postponed collection media item');
      this.logger.debug(error);
    }
  }

  async setCollectionMediaRuleEvaluationFailed(
    collectionId: number,
    mediaServerIds: string[],
    ruleEvaluationFailed: boolean,
  ): Promise<void> {
    if (mediaServerIds.length === 0) {
      return;
    }

    try {
      await this.CollectionMediaRepo.update(
        {
          collectionId,
          mediaServerId: In(mediaServerIds),
        },
        { ruleEvaluationFailed },
      );
    } catch (error) {
      // Best-effort persistence: a failed flag write must not abort the
      // surrounding rule run. Worst case the worker re-evaluates next pass.
      this.logger.warn(
        'Failed to update collection media rule evaluation state',
      );
      this.logger.debug(error);
    }
  }

  public async getCollectionsByMediaServerId(
    mediaServerId: string,
  ): Promise<Collection[]> {
    return this.collectionRepo.find({
      where: { mediaServerId },
      order: { id: 'ASC' },
    });
  }

  public async isMediaServerCollectionShared(
    collection: Pick<Collection, 'id' | 'mediaServerId' | 'manualCollection'>,
  ): Promise<boolean> {
    if (!collection.mediaServerId) {
      return false;
    }

    try {
      // Only siblings of the same kind (manual vs automatic) count as
      // shared. A manual collection that happens to point at the same
      // media server collection as an automatic rule group is not a
      // sibling for the cross-rule contamination guards we apply here.
      const linkedCollectionCount = await this.collectionRepo.count({
        where: {
          mediaServerId: collection.mediaServerId,
          manualCollection: collection.manualCollection,
          ...(collection.id !== undefined ? { id: Not(collection.id) } : {}),
        },
      });

      return linkedCollectionCount > 0;
    } catch (error) {
      this.logger.warn(
        'Failed to determine whether a media server collection is shared',
      );
      this.logger.debug(error);
      return false;
    }
  }

  /**
   * Returns the set of media server IDs that are rule-owned by another
   * automatic collection sharing this collection's media server collection.
   *
   * Throws on repository failure. Callers must treat a thrown error as
   * "ownership unknown" - silently defaulting to an empty set would
   * re-introduce the cross-rule contamination this method exists to prevent
   * (sibling-owned children would be imported as `manual` into the wrong
   * rule's collection_media).
   */
  public async getSiblingRuleOwnedMediaServerIds(
    collection: Pick<Collection, 'id' | 'mediaServerId'>,
  ): Promise<Set<string>> {
    if (!collection.mediaServerId) {
      return new Set();
    }

    return new Set(
      (await this.getSiblingMedia(collection))
        .filter((entry) => hasCollectionMediaRuleMembership(entry))
        .map((entry) => entry.mediaServerId),
    );
  }

  /**
   * Every member of a sibling collection, whatever its membership type. #3298
   * scoped the self-heal's protection to rule-owned ids, leaving a sibling's
   * manual-only members exposed to removal.
   */
  public async getSiblingMemberMediaServerIds(
    collection: Pick<Collection, 'id' | 'mediaServerId'>,
  ): Promise<Set<string>> {
    return new Set(
      (await this.getSiblingMedia(collection)).map(
        (entry) => entry.mediaServerId,
      ),
    );
  }

  private async getSiblingMedia(
    collection: Pick<Collection, 'id' | 'mediaServerId'>,
  ): Promise<CollectionMedia[]> {
    if (!collection.mediaServerId) {
      return [];
    }

    const siblings = await this.collectionRepo.find({
      where: {
        mediaServerId: collection.mediaServerId,
        manualCollection: false,
        ...(collection.id !== undefined ? { id: Not(collection.id) } : {}),
      },
    });

    if (siblings.length === 0) {
      return [];
    }

    return this.CollectionMediaRepo.find({
      where: { collectionId: In(siblings.map((sibling) => sibling.id)) },
    });
  }

  /**
   * Record that a rule removed these items from an automatic collection. The
   * collection_media row is deleted on removal, so this marker is the persistent
   * source of truth that lets a later run tell a rule-removal orphan (which the
   * media server may still list) from a genuine manual addition. Idempotent.
   */
  public async markRuleRemoved(
    collectionId: number,
    mediaServerIds: string[],
    direction: CollectionMediaPendingDirection = 'remove',
  ): Promise<void> {
    if (mediaServerIds.length === 0) {
      return;
    }

    // Upsert, not orIgnore: the row is unique on (collectionId, mediaServerId),
    // and orIgnore leaves a conflicting row's direction untouched. An item that
    // a rule removed and later matched again would keep direction 'remove', so
    // an add that timed out would be reconciled as a lingering orphan and taken
    // back off the server - undoing a write that had in fact committed.
    await this.CollectionMediaRuleRemovalRepo.createQueryBuilder()
      .insert()
      .into(CollectionMediaRuleRemoval)
      .values(
        mediaServerIds.map((mediaServerId) => ({
          collectionId,
          mediaServerId,
          direction,
        })),
      )
      .orUpdate(['direction'], ['collectionId', 'mediaServerId'])
      .execute();
  }

  /**
   * Drop the rule-removed marker for an item that is (re-)added to the
   * collection - by rule or manually - so it is never treated as an orphan.
   */
  /**
   * Drop markers whose removal succeeded. Markers exist to retry a FAILED
   * removal; carrying a succeeded one means a hand re-add is removed again
   * instead of adopted (#3344). Chunked so a collection with very many resolved
   * markers can never exceed SQLite's bound-parameter limit.
   */
  private async clearRuleRemovedMarkers(
    collectionId: number,
    mediaServerIds: string[],
  ): Promise<void> {
    for (const ids of chunk(mediaServerIds, RULE_REMOVAL_MARKER_CHUNK)) {
      await this.CollectionMediaRuleRemovalRepo.createQueryBuilder()
        .delete()
        .where('collectionId = :collectionId', { collectionId })
        .andWhere('mediaServerId IN (:...ids)', { ids })
        .execute();
    }
  }

  /**
   * The ids this collection changed but could not confirm, by direction: removals
   * the media server may still hold, and adds it may have applied unannounced.
   */
  private async getRuleRemovedMarkers(
    collectionId: number,
  ): Promise<Map<string, CollectionMediaPendingDirection>> {
    return new Map(
      (
        await this.CollectionMediaRuleRemovalRepo.createQueryBuilder('marker')
          .select('marker.mediaServerId', 'mediaServerId')
          .addSelect('marker.direction', 'direction')
          .where('marker.collectionId = :collectionId', { collectionId })
          .getRawMany<{
            mediaServerId: string;
            direction: CollectionMediaPendingDirection;
          }>()
      ).map((marker) => [marker.mediaServerId, marker.direction ?? 'remove']),
    );
  }

  public async clearRuleRemovedMarker(
    collectionId: number,
    mediaServerId: string,
  ): Promise<void> {
    await this.CollectionMediaRuleRemovalRepo.createQueryBuilder()
      .delete()
      .where(
        'collectionId = :collectionId AND mediaServerId = :mediaServerId',
        {
          collectionId,
          mediaServerId,
        },
      )
      .execute();
  }

  /**
   * Reconciles an automatic collection's rule-removed markers against the media
   * server's current children, and returns the ids that are confirmed orphans
   * this run (so the executor skips re-adopting them as manual members):
   *  - marked and still on the server (and not sibling-owned/a member): a
   *    removal that did not propagate. Remove it from the server (self-heal) but
   *    keep the marker so a failed removal is retried next run.
   *  - marked and legitimately present via a sibling rule group or as a current
   *    member: resolved, so the marker is cleared and the item is left in place.
   *  - marked and no longer on the server: resolved (cleared) only when the
   *    child read is trustworthy. An empty/ambiguous read (e.g. Jellyfin/Emby
   *    returning [] transiently) leaves the marker for a later run.
   */
  public async reconcileRuleRemovedOrphans(
    collection: Pick<
      Collection,
      'id' | 'title' | 'mediaServerId' | 'manualCollection'
    >,
    serverChildren: MediaItem[],
    siblingRuleOwnedIds: Set<string>,
    childrenReadTrustworthy: boolean,
  ): Promise<Set<string>> {
    const orphanIds = new Set<string>();
    if (collection.manualCollection || !collection.mediaServerId) {
      return orphanIds;
    }

    const markers = await this.getRuleRemovedMarkers(collection.id);
    if (markers.size === 0) {
      return orphanIds;
    }

    const serverChildIds = new Set(
      serverChildren
        .map((child) => child?.id?.toString())
        .filter((id): id is string => Boolean(id)),
    );

    // Items that are members again (re-added by rule or manually) are not
    // orphans; guard against a stale marker whose clear-on-add didn't land so a
    // legitimate member is never self-heal-removed.
    const currentMemberIds = new Set(
      (
        await this.CollectionMediaRepo.find({
          where: { collectionId: collection.id },
          select: { mediaServerId: true },
        })
      ).map((row) => row.mediaServerId),
    );

    const siblingMemberIds =
      await this.getSiblingMemberMediaServerIds(collection);

    const lingering: string[] = [];
    const resolved: string[] = [];
    const heldUnconfirmedAdds: string[] = [];
    for (const [markerId, direction] of markers) {
      const present = serverChildIds.has(markerId);
      const memberOrSibling =
        currentMemberIds.has(markerId) ||
        siblingRuleOwnedIds.has(markerId) ||
        siblingMemberIds.has(markerId);

      if (memberOrSibling) {
        // A member or a sibling's item: clear the stale marker either way.
        resolved.push(markerId);
        continue;
      }

      if (direction === 'add') {
        // An add we could not confirm. Present means it did land, so it is ours
        // and must not be adopted as a hand-added member - but it must not be
        // self-heal-removed either, or a rule that still wants it would have it
        // taken straight back out. Hold the marker until a membership row is
        // written (which clears it) or the child is confirmed gone.
        if (present) {
          orphanIds.add(markerId);
          heldUnconfirmedAdds.push(markerId);
        } else if (childrenReadTrustworthy) {
          resolved.push(markerId);
        }
        continue;
      }

      if (present) {
        // Present, ours, and not a current member: a lingering orphan the
        // server never dropped - self-heal it.
        lingering.push(markerId);
        orphanIds.add(markerId);
      } else if (childrenReadTrustworthy) {
        // Genuinely gone under a trustworthy read - clear the marker.
        resolved.push(markerId);
      }
      // else: absent under an ambiguous (untrustworthy) read - keep the marker
      // and retry next run rather than clear it on a possibly-stale [] read.
    }

    if (heldUnconfirmedAdds.length > 0) {
      // Deliberately left in place rather than removed: the item is on the
      // server because a rule asked for it, and taking it back out would fight
      // a rule that still wants it. It is held out of adoption until a rule
      // re-adds it (which clears the marker) or it is removed by hand.
      this.logger.log(
        `Holding ${heldUnconfirmedAdds.length} item(s) in the media server collection for '${collection.title}' that a rule added but the server never confirmed: ${heldUnconfirmedAdds.join(', ')}. They are not manual additions and will not be handled.`,
      );
    }

    // orphanIds is the critical output the caller uses to skip re-adoption.
    // The self-heal removal and marker cleanup below are best-effort side
    // effects; a failure in either must not drop orphanIds (which would let a
    // just-removed orphan be re-adopted as a manual member) - they simply
    // retry next run.
    try {
      if (lingering.length > 0) {
        const mediaServer = await this.getMediaServer();
        const failed = unconfirmedIds(
          await mediaServer.removeBatchFromCollection(
            collection.mediaServerId,
            lingering,
          ),
        );
        const removed = lingering.filter((id) => !failed.has(id));
        if (removed.length > 0) {
          this.logger.log(
            `Removed ${removed.length} orphaned item(s) from the media server collection for '${collection.title}' that a rule removed but the server had retained.`,
          );
          // Markers exist to retry a FAILED removal; carrying a succeeded
          // one means a hand re-add is removed again instead of adopted.
          resolved.push(...removed);
        }
        if (failed.size > 0) {
          this.logger.warn(
            `Couldn't remove ${failed.size} orphaned item(s) from the media server collection for '${collection.title}'; will retry next run.`,
          );
        }
      }

      await this.clearRuleRemovedMarkers(collection.id, resolved);
    } catch (error) {
      this.logger.warn(
        `Best-effort orphan self-heal/cleanup failed for '${collection.title}'; will retry next run.`,
      );
      this.logger.debug(error);
    }

    return orphanIds;
  }

  private async resyncRuleOwnedItemsToMediaServerCollection(
    collection: Pick<Collection, 'id' | 'mediaServerId' | 'title'>,
    serverChildIds: Set<string>,
  ): Promise<{ attempted: number; rejected: number }> {
    if (!collection.mediaServerId) {
      return { attempted: 0, rejected: 0 };
    }

    try {
      const localMedia = await this.CollectionMediaRepo.find({
        where: { collectionId: collection.id },
      });
      const missingRuleOwnedIds = localMedia
        .filter((entry) => hasCollectionMediaRuleMembership(entry))
        .map((entry) => entry.mediaServerId)
        .filter((mediaServerId) => !serverChildIds.has(mediaServerId));

      if (missingRuleOwnedIds.length === 0) {
        return { attempted: 0, rejected: 0 };
      }

      const mediaServer = await this.getMediaServer();
      this.logger.log(
        `[checkAutomaticMediaServerLink] Resyncing ${missingRuleOwnedIds.length} local rule-owned item(s) into media server collection ${collection.mediaServerId} for "${collection.title}"`,
      );

      const failedItemIds = unconfirmedIds(
        await mediaServer.addBatchToCollection(
          collection.mediaServerId,
          missingRuleOwnedIds,
        ),
      );

      for (const itemId of missingRuleOwnedIds) {
        if (failedItemIds.has(itemId)) {
          this.logger.warn(
            `Failed to resync item ${itemId} into media server collection ${collection.mediaServerId}`,
          );
        }
      }

      return {
        attempted: missingRuleOwnedIds.length,
        rejected: failedItemIds.size,
      };
    } catch (error) {
      this.logger.warn(
        'Failed to resync local rule-owned items into media server collection',
      );
      this.logger.debug(error);
      // An exception is not evidence the server rejected the adds, so
      // report nothing attempted - callers must not heal on this.
      return { attempted: 0, rejected: 0 };
    }
  }

  /**
   * Collections healed once already (per process). A second total
   * rejection without an accepted add in between means recreation didn't
   * fix the cause - stop churning delete/recreate and leave the loud log.
   */
  private readonly healedCollectionIds = new Set<number>();

  /**
   * Last-resort heal for an automatic collection whose media server record
   * is empty yet rejects every add (e.g. a stale or corrupt Plex collection
   * record): delete it so the regular add flow recreates it fresh on the
   * next pass. Deletion is gated on a successful live read confirming the
   * collection is still empty, so a transient outage never triggers it.
   * Plex-only: an empty Plex collection rejects every add, so it must be
   * recreated. Jellyfin/Emby accept adds into an empty BoxSet, so those are
   * repopulated in place by checkAutomaticMediaServerLink instead of deleted.
   */
  private async deleteEmptyCollectionRejectingAdds(
    collection: Pick<
      Collection,
      'id' | 'title' | 'manualCollection' | 'mediaServerId'
    >,
  ): Promise<boolean> {
    if (
      collection.manualCollection ||
      !collection.mediaServerId ||
      this.settingsDataService.media_server_type !== MediaServerType.PLEX
    ) {
      return false;
    }

    if (this.healedCollectionIds.has(collection.id)) {
      this.logger.error(
        `Media server collection for "${collection.title}" still rejects every add after being recreated - leaving it in place. Check the Plex response body logged above for the rejection reason.`,
      );
      return false;
    }

    try {
      const mediaServer = await this.getMediaServer();
      const serverColl = await mediaServer.getCollection(
        collection.mediaServerId,
      );
      if (!serverColl || serverColl.childCount !== 0) {
        return false;
      }

      this.logger.warn(
        `Media server collection ${collection.mediaServerId} for "${collection.title}" is empty and rejected every add - deleting it so it can be recreated`,
      );
      await mediaServer.deleteCollection(serverColl.id);
      this.healedCollectionIds.add(collection.id);
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to delete unpopulatable media server collection ${collection.mediaServerId} for "${collection.title}"`,
      );
      this.logger.debug(error);
      return false;
    }
  }

  public async reconcileSharedManualCollectionState(
    collection: Collection,
    options: SharedManualCollectionReconciliationOptions = {},
  ): Promise<void> {
    if (!collection.manualCollection || !collection.mediaServerId) {
      return;
    }

    const linkedCollections = (
      await this.getCollectionsByMediaServerId(collection.mediaServerId)
    ).filter((linkedCollection) => linkedCollection.manualCollection);

    if (linkedCollections.length <= 1) {
      return;
    }

    const mediaServer = await this.getMediaServer();
    let serverChildren = options.serverChildren;

    if (serverChildren === undefined) {
      try {
        serverChildren =
          (await mediaServer.getCollectionChildren(collection.mediaServerId)) ??
          [];
      } catch (error) {
        this.logger.warn(
          `Skipping shared manual collection reconciliation for '${collection.manualCollectionName ?? collection.title}' because the linked media server collection could not be enumerated.`,
        );
        this.logger.debug(error);
        return;
      }
    }

    const removedMediaServerIds = options.removedMediaServerIds ?? new Set();
    const addedMediaServerIds = options.addedMediaServerIds ?? new Set();
    const effectiveServerChildIds = new Set(
      serverChildren
        .map((child) => child?.id?.toString())
        .filter((childId): childId is string => Boolean(childId)),
    );

    for (const removedMediaServerId of removedMediaServerIds) {
      effectiveServerChildIds.delete(removedMediaServerId);
    }

    const linkedCollectionIds = linkedCollections.map(
      (linkedCollection) => linkedCollection.id,
    );

    const [collectionMediaRows, linkedRuleGroups] = await Promise.all([
      this.CollectionMediaRepo.find({
        where: { collectionId: In(linkedCollectionIds) },
        order: { collectionId: 'ASC', id: 'ASC' },
      }),
      this.ruleGroupRepo.find({
        where: { collectionId: In(linkedCollectionIds) },
      }),
    ]);

    const ruleOwnedIds = new Set(
      collectionMediaRows
        .filter((collectionMedia) =>
          hasCollectionMediaRuleMembership(collectionMedia),
        )
        .map((collectionMedia) => collectionMedia.mediaServerId),
    );
    const missingRuleOwnedIds = Array.from(ruleOwnedIds).filter(
      (mediaServerId) =>
        !effectiveServerChildIds.has(mediaServerId) &&
        !addedMediaServerIds.has(mediaServerId),
    );

    if (missingRuleOwnedIds.length > 0) {
      const failedItemIds = unconfirmedIds(
        await mediaServer.addBatchToCollection(
          collection.mediaServerId,
          missingRuleOwnedIds,
        ),
      );

      for (const mediaServerId of missingRuleOwnedIds) {
        if (failedItemIds.has(mediaServerId)) {
          this.logger.warn(
            `Failed to re-sync shared manual collection item ${mediaServerId} to ${collection.mediaServerId}`,
          );
          continue;
        }

        effectiveServerChildIds.add(mediaServerId);
      }
    }
    const sharedManualCandidateIds = new Set(
      Array.from(effectiveServerChildIds).filter(
        (mediaServerId) => !ruleOwnedIds.has(mediaServerId),
      ),
    );
    const childById = new Map(
      serverChildren
        .filter((child): child is MediaItem => Boolean(child?.id))
        .map((child) => [child.id.toString(), child]),
    );
    const collectionMediaByCollectionId = new Map<number, CollectionMedia[]>();

    for (const collectionMedia of collectionMediaRows) {
      const rows =
        collectionMediaByCollectionId.get(collectionMedia.collectionId) ?? [];
      rows.push(collectionMedia);
      collectionMediaByCollectionId.set(collectionMedia.collectionId, rows);
    }

    const ruleGroupByCollectionId = new Map(
      linkedRuleGroups
        .filter((ruleGroup) => ruleGroup.collectionId != null)
        .map((ruleGroup) => [ruleGroup.collectionId, ruleGroup]),
    );
    const exclusionRuleGroupIds = linkedRuleGroups.map(
      (ruleGroup) => ruleGroup.id,
    );
    const exclusions =
      exclusionRuleGroupIds.length > 0
        ? await this.exclusionRepo.find({
            where: { ruleGroupId: In(exclusionRuleGroupIds) },
          })
        : [];
    const exclusionsByRuleGroupId = new Map<number, Exclusion[]>();

    for (const exclusion of exclusions) {
      if (exclusion.ruleGroupId == null) {
        continue;
      }

      const rows = exclusionsByRuleGroupId.get(exclusion.ruleGroupId) ?? [];
      rows.push(exclusion);
      exclusionsByRuleGroupId.set(exclusion.ruleGroupId, rows);
    }

    for (const linkedCollection of linkedCollections) {
      const currentCollectionMedia =
        collectionMediaByCollectionId.get(linkedCollection.id) ?? [];
      const currentCollectionMediaById = new Map(
        currentCollectionMedia.map((collectionMedia) => [
          collectionMedia.mediaServerId,
          collectionMedia,
        ]),
      );
      const linkedRuleGroup = ruleGroupByCollectionId.get(linkedCollection.id);
      const collectionExclusions = linkedRuleGroup
        ? (exclusionsByRuleGroupId.get(linkedRuleGroup.id) ?? [])
        : [];
      const excludedMediaServerIds = new Set(
        collectionExclusions.map((exclusion) => exclusion.mediaServerId),
      );
      const excludedParentIds = new Set(
        collectionExclusions
          .filter((exclusion) => exclusion.parent)
          .map((exclusion) => String(exclusion.parent)),
      );
      const allowedSharedManualIds = new Set<string>();

      for (const mediaServerId of sharedManualCandidateIds) {
        const child = childById.get(mediaServerId);

        if (
          excludedMediaServerIds.has(mediaServerId) ||
          (child?.parentId &&
            excludedParentIds.has(child.parentId.toString())) ||
          (child?.grandparentId &&
            excludedParentIds.has(child.grandparentId.toString()))
        ) {
          continue;
        }

        allowedSharedManualIds.add(mediaServerId);
      }

      for (const mediaServerId of allowedSharedManualIds) {
        const existingCollectionMedia =
          currentCollectionMediaById.get(mediaServerId);

        if (existingCollectionMedia) {
          continue;
        }

        await this.insertCollectionMediaMembership(
          linkedCollection.id,
          mediaServerId,
          {
            includedByRule: false,
            manualMembershipSource:
              CollectionMediaManualMembershipSource.SHARED,
          },
          {
            type: 'media_added_manually',
          },
        );
      }

      for (const existingCollectionMedia of currentCollectionMedia) {
        const manualMembershipSource =
          existingCollectionMedia.manualMembershipSource;

        if (manualMembershipSource == null) {
          continue;
        }

        const mediaServerId = existingCollectionMedia.mediaServerId;
        const isPresentOnServer =
          effectiveServerChildIds.has(mediaServerId) ||
          addedMediaServerIds.has(mediaServerId);
        const isRuleOwnedAnywhere = ruleOwnedIds.has(mediaServerId);

        if (
          manualMembershipSource ===
          CollectionMediaManualMembershipSource.SHARED
        ) {
          if (allowedSharedManualIds.has(mediaServerId)) {
            continue;
          }
        } else if (
          manualMembershipSource === CollectionMediaManualMembershipSource.LOCAL
        ) {
          if (isPresentOnServer) {
            continue;
          }
        } else if (
          manualMembershipSource ===
          CollectionMediaManualMembershipSource.LEGACY
        ) {
          if (
            isPresentOnServer &&
            (!isRuleOwnedAnywhere ||
              hasCollectionMediaRuleMembership(existingCollectionMedia))
          ) {
            continue;
          }
        } else {
          continue;
        }

        const updatedCollectionMedia =
          await this.updateCollectionMediaMembership(existingCollectionMedia, {
            manualMembershipSource: null,
          });

        if (updatedCollectionMedia === undefined) {
          await this.CollectionLogRecordForChild(
            existingCollectionMedia.mediaServerId,
            linkedCollection.id,
            'remove',
            {
              type: 'media_removed_manually',
            },
          );
        }
      }
    }
  }

  public async getCollectionMediaCount(id?: number) {
    if (id !== undefined) {
      return await this.CollectionMediaRepo.count({
        where: { collectionId: id },
      });
    }
    // No id = count ALL media across all collections
    return await this.CollectionMediaRepo.count();
  }

  private async getCollectionMediaMetadata(
    entities: CollectionMedia[],
    mediaServer: IMediaServerService,
  ): Promise<Map<string, MediaItem>> {
    if (entities.length === 0) {
      return new Map<string, MediaItem>();
    }

    const metadataByMediaServerId = new Map<string, MediaItem>();
    const collectionId = entities[0].collectionId;
    const collection = await this.collectionRepo.findOne({
      where: { id: collectionId },
    });

    if (collection?.mediaServerId) {
      try {
        const collectionChildren = await mediaServer.getCollectionChildren(
          collection.mediaServerId,
        );

        collectionChildren.forEach((item) => {
          metadataByMediaServerId.set(item.id, item);
        });
      } catch (error) {
        this.logger.debug(
          `Failed to get children for collection "${collection.title}" (mediaServerId=${collection.mediaServerId}), verifying collection still exists`,
        );

        let stillExists = false;

        try {
          // Only clear the link when the verification lookup explicitly
          // confirms the collection is missing.
          stillExists = Boolean(
            await mediaServer.getCollection(collection.mediaServerId, true),
          );
        } catch (verificationError) {
          this.logger.warn(
            `Failed to verify collection "${collection.title}" after getCollectionChildren error - keeping link`,
          );
          this.logger.debug(error);
          this.logger.debug(verificationError);
          stillExists = true;
        }

        if (!stillExists) {
          this.logger.warn(
            `Collection "${collection.title}" references a media server collection that no longer exists - clearing stale link`,
          );
          collection.mediaServerId = null;
          await this.saveCollection(collection);
        } else {
          this.logger.warn(
            `getCollectionChildren failed for "${collection.title}" but collection still exists on server - keeping link`,
          );
          this.logger.debug(error);
        }
      }
    }

    const missingMediaServerIds = [
      ...new Set(
        entities
          .map((entity) => entity.mediaServerId)
          .filter(
            (mediaServerId) => !metadataByMediaServerId.has(mediaServerId),
          ),
      ),
    ];

    if (missingMediaServerIds.length === 0) {
      return metadataByMediaServerId;
    }

    // One read per batch of ids rather than one per row. Every row lands here
    // when the collection read above failed, which is exactly when the server is
    // least able to answer a request each.
    for (const mediaItem of await mediaServer.getMetadataBatch(
      missingMediaServerIds,
    )) {
      metadataByMediaServerId.set(mediaItem.id, mediaItem);
    }

    const unresolvedIds = missingMediaServerIds.filter(
      (mediaServerId) => !metadataByMediaServerId.has(mediaServerId),
    );

    if (unresolvedIds.length > 0) {
      // An id the server did not answer for is skipped, never deleted: this read
      // cannot tell a missing item from a failed one.
      this.logger.debug(
        `No metadata for ${unresolvedIds.length} of ${entities.length} collection media rows; skipping them without deleting: ${unresolvedIds.slice(0, 10).join(', ')}`,
      );
    }

    return metadataByMediaServerId;
  }

  /**
   * A copy carrying the state no media server knows, for the sorts that compare
   * it. Separate from the map the response is built from, so which fields the
   * response carries never depends on how it was sorted. Only for those sorts,
   * as the library path also gates it.
   */
  private async withMaintainerrStatusForSort(
    sort: CollectionMediaSortField | undefined,
    metadataByMediaServerId: Map<string, MediaItem>,
  ): Promise<Map<string, MediaItem>> {
    if (
      sort === undefined ||
      !(mediaLibraryStatusSortFields as readonly string[]).includes(sort) ||
      metadataByMediaServerId.size === 0
    ) {
      return metadataByMediaServerId;
    }

    const enrichedItems = await this.mediaItemEnrichmentService.enrichItems([
      ...metadataByMediaServerId.values(),
    ]);

    return new Map(enrichedItems.map((item) => [item.id, item]));
  }

  private async hydrateCollectionMediaWithMetadata(
    entities: CollectionMedia[],
    mediaServer: IMediaServerService,
    metadataByMediaServerId: Map<string, MediaItem> = new Map(),
  ): Promise<CollectionMediaWithMetadata[]> {
    if (entities.length === 0) {
      return [];
    }

    const resolvedMetadataByMediaServerId =
      metadataByMediaServerId.size > 0
        ? metadataByMediaServerId
        : await this.getCollectionMediaMetadata(entities, mediaServer);

    const parentMetadataById = new Map<string, MediaItem>();
    const parentIds = [
      ...new Set(
        entities
          .map((entity) =>
            resolvedMetadataByMediaServerId.get(entity.mediaServerId),
          )
          .filter(
            (mediaItem): mediaItem is MediaItem => mediaItem !== undefined,
          )
          .map((mediaItem) => mediaItem.grandparentId ?? mediaItem.parentId)
          .filter((parentId): parentId is string => Boolean(parentId)),
      ),
    ];

    if (parentIds.length > 0) {
      // One read per batch of ids rather than one per parent. Emby and Jellyfin
      // put a movie under its library folder, so a collection stored one folder
      // per film has about as many parents as it has rows.
      for (const parent of await mediaServer.getMetadataBatch(parentIds)) {
        parentMetadataById.set(parent.id, parent);
      }

      const unresolved = parentIds.length - parentMetadataById.size;

      if (unresolved > 0) {
        // Counted, not one line each. A parent that does not resolve only costs
        // the item its parent title and artwork, so the row is still returned.
        this.logger.debug(
          `No metadata for ${unresolved} of ${parentIds.length} collection media parents`,
        );
      }
    }

    return entities
      .map((entity) => {
        const mediaItem = resolvedMetadataByMediaServerId.get(
          entity.mediaServerId,
        );

        if (!mediaItem) {
          return undefined;
        }

        const parentId = mediaItem.grandparentId ?? mediaItem.parentId;
        const parentItem = parentId
          ? parentMetadataById.get(parentId)
          : undefined;

        const mediaData: MediaItemWithParent = parentItem
          ? {
              ...mediaItem,
              parentItem,
              ...(mediaItem.grandparentId &&
              !mediaItem.grandparentTitle &&
              parentItem.title
                ? { grandparentTitle: parentItem.title }
                : {}),
              ...(mediaItem.type === 'season' &&
              !mediaItem.parentTitle &&
              parentItem.title
                ? { parentTitle: parentItem.title }
                : {}),
            }
          : mediaItem;

        return {
          ...entity,
          mediaData,
        };
      })
      .filter(
        (entity): entity is CollectionMediaWithMetadata => entity !== undefined,
      );
  }

  /**
   * Builds the comparator options that route `deleteSoonest` to each row's
   * `collection_media.addDate` (when Maintainerr started the deletion timer)
   * instead of `MediaItem.addedAt` (when the file landed in the underlying
   * media-server library). Sorting must follow the user-visible
   * "Leaving in X days" overlay so what Maintainerr UI shows matches what is
   * pushed to the media server collection.
   *
   * `deleteSoonestReferenceTime` anchors the comparator's day buckets to the
   * same `daysLeft` rollover the overlay shows, so two items with the same
   * countdown tie even when their `addDate`s straddle UTC midnight.
   */
  private buildCollectionMediaCompareOptions(
    rows: ReadonlyArray<{ mediaServerId: string; addDate: Date | string }>,
    deleteAfterDays: number | null | undefined,
  ): CompareMediaItemsOptions {
    const addDateByMediaItemId = new Map<string, Date | string>(
      rows.map((row) => [row.mediaServerId, row.addDate]),
    );
    const options: CompareMediaItemsOptions = {
      deleteSoonestDate: (item) => addDateByMediaItemId.get(item.id),
    };
    if (deleteAfterDays != null) {
      options.deleteSoonestReferenceTime =
        getCollectionDangerDate(deleteAfterDays).getTime();
    }
    return options;
  }

  async applyCollectionSort(collection: Collection): Promise<void> {
    const sortKey = collection.mediaServerSort;
    const parsed = sortKey ? parseCollectionSortKey(sortKey) : undefined;
    if (!parsed) {
      this.logger.warn(
        `Ignoring invalid collection sort '${sortKey}' on collection ${collection.id}`,
      );
      return;
    }
    // The status sorts compare Maintainerr-side state this hydrate never
    // resolves, so every comparison would tie and the pushed order would be
    // arbitrary. The rule group form withholds them; refuse one that arrives
    // anyway.
    if (
      (mediaLibraryStatusSortFields as readonly string[]).includes(parsed.sort)
    ) {
      this.logger.warn(
        `Ignoring collection sort '${sortKey}' on collection ${collection.id}: status sorts cannot be pushed to the media server`,
      );
      return;
    }
    // Nothing to push to for a collection with no link, or one that opted out.
    if (!collection.mediaServerId || collection.keepInMaintainerrOnly) {
      return;
    }

    const mediaServer = await this.getMediaServer();
    if (!mediaServer.supportsFeature(MediaServerFeature.COLLECTION_SORT)) {
      return;
    }

    try {
      // Plex rejects move/prefs on smart collections - skip defensively even
      // though Maintainerr-managed collections are non-smart.
      const serverCollection = await mediaServer.getCollection(
        collection.mediaServerId,
      );
      if (serverCollection?.smart) {
        this.logger.log(
          `Skipping collection sort for ${collection.mediaServerId}: smart collection`,
        );
        return;
      }

      const allMediaRows = await this.CollectionMediaRepo.find({
        where: { collectionId: collection.id },
      });
      const hydratedItems = await this.hydrateCollectionMediaWithMetadata(
        allMediaRows,
        mediaServer,
      );
      const sortable = hydratedItems.filter((item) => item.mediaData);
      if (sortable.length === 0) {
        return;
      }

      const compareOptions = this.buildCollectionMediaCompareOptions(
        sortable,
        collection.deleteAfterDays,
      );

      sortable.sort((a, b) =>
        compareMediaItemsBySort(
          a.mediaData,
          b.mediaData,
          parsed.sort,
          parsed.order,
          compareOptions,
        ),
      );

      await mediaServer.reorderCollectionItems(
        collection.mediaServerId,
        sortable.map((item) => item.mediaServerId),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to apply collection sort '${sortKey}' to media server`,
      );
      this.logger.debug(error);
    }
  }

  private async hydrateExclusionsWithMetadata(
    entities: Exclusion[],
    mediaServer: IMediaServerService,
  ): Promise<Exclusion[]> {
    if (entities.length === 0) {
      return [];
    }

    // One batched read for the rows and one for their deduped parents, not a
    // request per row - the same shape as the collection media hydrate.
    const metadataById = new Map<string, MediaItem>();
    for (const mediaItem of await mediaServer.getMetadataBatch([
      ...new Set(entities.map((el) => el.mediaServerId.toString())),
    ])) {
      metadataById.set(mediaItem.id, mediaItem);
    }

    const parentMetadataById = new Map<string, MediaItem>();
    const parentIds = [
      ...new Set(
        [...metadataById.values()]
          .map((mediaItem) => mediaItem.grandparentId ?? mediaItem.parentId)
          .filter((parentId): parentId is string => Boolean(parentId)),
      ),
    ];
    if (parentIds.length > 0) {
      for (const parent of await mediaServer.getMetadataBatch(parentIds)) {
        parentMetadataById.set(parent.id, parent);
      }
    }

    return entities
      .map((el) => {
        const mediaItem = metadataById.get(el.mediaServerId.toString());

        // A row the server did not answer for stays hidden, as before.
        if (!mediaItem) {
          return undefined;
        }

        const parentId = mediaItem.grandparentId ?? mediaItem.parentId;
        el.mediaData = {
          ...mediaItem,
          parentItem: parentId ? parentMetadataById.get(parentId) : undefined,
        };
        return el;
      })
      .filter((el): el is Exclusion => el !== undefined);
  }

  public async getCollectionMediaWithServerDataAndPaging(
    id: number,
    {
      offset = 0,
      size = 25,
      sort,
      sortOrder,
    }: {
      offset?: number;
      size?: number;
      sort?: CollectionMediaSortField;
      sortOrder?: MediaSortOrder;
    } = {},
  ): Promise<{ totalSize: number; items: CollectionMediaWithMetadata[] }> {
    try {
      const mediaServer = await this.getMediaServer();
      const queryBuilder =
        this.CollectionMediaRepo.createQueryBuilder('collection_media');

      queryBuilder.where('collection_media.collectionId = :id', { id });

      const itemCount = await queryBuilder.getCount();

      if (!sort || sort === 'deleteSoonest') {
        // SQL-paginate by `collection_media.addDate`. `deleteSoonest` is
        // equivalent to `addDate` ordering because `deleteAfterDays` is
        // constant for every item in a collection - so the only sort key
        // that actually matters lives on the `collection_media` row and the
        // database can paginate it directly without hydrating MediaItem
        // metadata for every row in the collection. This keeps page loads
        // fast on collections with hundreds of items.
        //
        // Trade-off: `applyCollectionSort` (the media-server push) still
        // applies the day-bucketed title tiebreaker via `compareMediaItemsBySort`,
        // so the polished alphabetical-within-day order is what users see
        // when browsing the actual Plex/Jellyfin collection. The Maintainerr
        // UI page may show same-day items in a slightly different order
        // (by `addDate, id` instead of by title) - acceptable because the
        // primary sort key is correct and Maintainerr's DB remains the
        // source of truth driving the next push.
        const direction =
          sort === 'deleteSoonest' && sortOrder === 'asc' ? 'ASC' : 'DESC';
        const { entities } = await queryBuilder
          .clone()
          .orderBy('collection_media.addDate', direction)
          .addOrderBy('collection_media.id', direction)
          .skip(offset)
          .take(size)
          .getRawAndEntities();

        return {
          totalSize: itemCount,
          items: await this.hydrateCollectionMediaWithMetadata(
            entities,
            mediaServer,
          ),
        };
      }

      // Explicit sort on a MediaItem-side key (airDate / rating / watchCount /
      // title) - the sort value isn't on `collection_media`, so we have to
      // hydrate the whole collection before paginating. Acceptable because
      // these sorts are rarely used compared to `deleteSoonest` and the
      // default load.
      const { entities } = await queryBuilder
        .clone()
        .orderBy('collection_media.addDate', 'DESC')
        .addOrderBy('collection_media.id', 'DESC')
        .getRawAndEntities();

      this.logger.debug(
        `Collection ${id} sort ${sort} is hydrating ${itemCount} items before pagination`,
      );

      const metadataByMediaServerId = await this.getCollectionMediaMetadata(
        entities,
        mediaServer,
      );

      const sortMetadata = await this.withMaintainerrStatusForSort(
        sort,
        metadataByMediaServerId,
      );

      const sortableEntities = entities.filter((entity) =>
        metadataByMediaServerId.has(entity.mediaServerId),
      );

      const collectionRecord = await this.getCollection(id);
      const compareOptions = this.buildCollectionMediaCompareOptions(
        sortableEntities,
        collectionRecord?.deleteAfterDays,
      );

      const sortedPageEntities = sortableEntities
        .sort((leftItem, rightItem) =>
          compareMediaItemsBySort(
            sortMetadata.get(leftItem.mediaServerId)!,
            sortMetadata.get(rightItem.mediaServerId)!,
            sort,
            sortOrder,
            compareOptions,
          ),
        )
        .slice(offset, offset + size);

      return {
        totalSize: sortableEntities.length,
        items: await this.hydrateCollectionMediaWithMetadata(
          sortedPageEntities,
          mediaServer,
          metadataByMediaServerId,
        ),
      };
    } catch (error) {
      this.logger.warn('An error occurred while performing collection actions');
      this.logger.debug(error);
      return undefined;
    }
  }

  /**
   * Removes collection_media entries whose mediaServerId no longer exists
   * on the media server. Only call after verifying the server is reachable
   * (e.g., after testConnections() in the maintenance task).
   */
  async removeStaleCollectionMedia(): Promise<void> {
    const allMedia = await this.CollectionMediaRepo.find();
    const mediaServer = await this.getMediaServer();
    let removedCount = 0;

    // `missing` is a confirmed absence only, so a transient failure never
    // deletes a still-present item's row.
    const { missing } = await readItemPresence(
      mediaServer,
      allMedia.map((entry) => entry.mediaServerId),
      (error) => this.logger.debug(error),
    );

    for (const entry of allMedia) {
      if (missing.has(entry.mediaServerId)) {
        await this.CollectionMediaRepo.delete(entry.id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.log(
        `Removed ${removedCount} stale collection media entries (items no longer on media server)`,
      );
    }
  }

  public async getCollectionExclusionsWithServerDataAndPaging(
    id: number,
    {
      offset = 0,
      size = 25,
      sort,
      sortOrder,
    }: {
      offset?: number;
      size?: number;
      sort?: MediaLibrarySortField;
      sortOrder?: MediaSortOrder;
    } = {},
  ): Promise<{ totalSize: number; items: Exclusion[] }> {
    try {
      const mediaServer = await this.getMediaServer();
      const rulegroup = await this.ruleGroupRepo.findOne({
        where: {
          collectionId: id,
        },
      });

      if (!rulegroup) {
        return { totalSize: 0, items: [] };
      }

      const groupId = rulegroup.id;

      // Determine which exclusion types to show based on collection dataType
      // Parent type exclusions should be shown (show exclusion appears in season collection)
      const validTypes: string[] = [rulegroup.dataType];
      if (rulegroup.dataType === 'season') {
        validTypes.push('show');
      } else if (rulegroup.dataType === 'episode') {
        validTypes.push('show', 'season');
      }

      const queryBuilder = this.exclusionRepo.createQueryBuilder('exclusion');

      queryBuilder
        .where(
          new Brackets((qb) => {
            qb.where('exclusion.ruleGroupId = :groupId', { groupId }).orWhere(
              'exclusion.ruleGroupId is null',
            );
          }),
        )
        .andWhere('exclusion.type IN (:...validTypes)', { validTypes })
        .orderBy('exclusion.id', 'DESC');

      const itemCount = await queryBuilder.getCount();

      if (!sort) {
        const { entities } = await queryBuilder
          .clone()
          .orderBy('exclusion.id', 'DESC')
          .skip(offset)
          .take(size)
          .getRawAndEntities();

        return {
          totalSize: itemCount,
          items: await this.hydrateExclusionsWithMetadata(
            entities,
            mediaServer,
          ),
        };
      }

      const { entities } = await queryBuilder
        .clone()
        .orderBy('exclusion.id', 'DESC')
        .getRawAndEntities();

      const entitiesWithMediaData = await this.hydrateExclusionsWithMetadata(
        entities,
        mediaServer,
      );

      const sortedItems = entitiesWithMediaData
        .sort((leftItem, rightItem) =>
          compareMediaItemsBySort(
            leftItem.mediaData!,
            rightItem.mediaData!,
            sort,
            sortOrder,
          ),
        )
        .slice(offset, offset + size);

      return {
        totalSize: entitiesWithMediaData.length,
        items: sortedItems ?? [],
      };
    } catch (error) {
      this.logger.warn('An error occurred while performing collection actions');
      this.logger.debug(error);
      return undefined;
    }
  }

  private async getCollectionMediaCounts(collectionIds: number[]) {
    if (collectionIds.length === 0) {
      return new Map<number, number>();
    }

    const rows = await this.CollectionMediaRepo.createQueryBuilder(
      'collection_media',
    )
      .select('collection_media.collectionId', 'collectionId')
      .addSelect('COUNT(collection_media.id)', 'mediaCount')
      .where('collection_media.collectionId IN (:...collectionIds)', {
        collectionIds,
      })
      .groupBy('collection_media.collectionId')
      .getRawMany<CollectionMediaCountRow>();

    return new Map<number, number>(
      rows.map((row) => [Number(row.collectionId), Number(row.mediaCount)]),
    );
  }

  private async resolveCollectionMediaArtwork(
    mediaServerId: string,
    mediaItem?: MediaItem,
  ): Promise<{
    tmdbId?: number;
    tvdbId?: number;
    imagePath?: string;
  }> {
    const resolvedIds = mediaItem
      ? await this.metadataService.resolveIdsFromHierarchyMediaItem(
          mediaItem,
          undefined,
          mediaServerId,
        )
      : await this.metadataService.resolveIds(mediaServerId);
    const details = resolvedIds
      ? await this.metadataService.getDetails(resolvedIds, resolvedIds.type)
      : undefined;

    return {
      tmdbId:
        (resolvedIds?.tmdb as number | undefined) ??
        (details?.externalIds?.tmdb as number | undefined),
      tvdbId:
        (resolvedIds?.tvdb as number | undefined) ??
        (details?.externalIds?.tvdb as number | undefined),
      imagePath: details?.posterUrl,
    };
  }

  private async enrichCollectionPreviewMedia(
    previewMediaByCollection: Map<number, CollectionMedia[]>,
  ): Promise<Map<number, CollectionMedia[]>> {
    const previewMedia = [...previewMediaByCollection.values()].flat();
    const mediaNeedingArtwork = previewMedia.filter(
      (media) =>
        !media.image_path && media.tmdbId == null && media.tvdbId == null,
    );

    if (mediaNeedingArtwork.length === 0) {
      return previewMediaByCollection;
    }

    const mediaServer = await this.getMediaServer();
    const artworkResults = await Promise.allSettled(
      mediaNeedingArtwork.map(async (media) => {
        const mediaItem = await mediaServer.getMetadata(media.mediaServerId);

        if (!mediaItem) {
          return undefined;
        }

        const artwork = await this.resolveCollectionMediaArtwork(
          media.mediaServerId,
          mediaItem,
        );

        return {
          media,
          artwork,
        };
      }),
    );

    artworkResults.forEach((result, index) => {
      if (result.status !== 'fulfilled' || !result.value) {
        const failedMedia = mediaNeedingArtwork[index];
        this.logger.debug(
          `Failed to enrich preview artwork for collection media ${failedMedia?.mediaServerId}`,
        );

        if (result.status === 'rejected') {
          this.logger.debug(result.reason);
        }

        return;
      }

      const { media, artwork } = result.value;
      const collectionId = media.collectionId;
      const previewMedia = previewMediaByCollection.get(collectionId);

      if (previewMedia) {
        const index = previewMedia.indexOf(media);
        if (index !== -1) {
          previewMedia[index] = {
            ...media,
            tmdbId: media.tmdbId ?? artwork.tmdbId,
            tvdbId: media.tvdbId ?? artwork.tvdbId,
            image_path: media.image_path ?? artwork.imagePath,
          } as CollectionMedia;
        }
      }
    });

    return previewMediaByCollection;
  }

  private async getCollectionPreviewMedia(collectionIds: number[]) {
    if (collectionIds.length === 0) {
      return new Map<number, CollectionMedia[]>();
    }

    const previewRows = await this.connection
      .createQueryBuilder()
      .select('*')
      .from(
        (subQuery) =>
          subQuery
            .select([
              'collection_media.id AS id',
              'collection_media.collectionId AS collectionId',
              'collection_media.mediaServerId AS mediaServerId',
              'collection_media.tmdbId AS tmdbId',
              'collection_media.tvdbId AS tvdbId',
              'collection_media.addDate AS addDate',
              'collection_media.image_path AS image_path',
              'collection_media.isManual AS isManual',
              'collection_media.includedByRule AS includedByRule',
              'collection_media.manualMembershipSource AS manualMembershipSource',
              'ROW_NUMBER() OVER (PARTITION BY collection_media.collectionId ORDER BY collection_media.addDate DESC, collection_media.id DESC) AS rowNumber',
            ])
            .from(CollectionMedia, 'collection_media')
            .where('collection_media.collectionId IN (:...collectionIds)', {
              collectionIds,
            }),
        'preview_media',
      )
      .where('preview_media.rowNumber <= :previewLimit', { previewLimit: 2 })
      .orderBy('preview_media.collectionId', 'ASC')
      .addOrderBy('preview_media.rowNumber', 'ASC')
      .getRawMany<CollectionPreviewMediaRow>();

    const previewMediaByCollection = new Map<number, CollectionMedia[]>();

    for (const row of previewRows) {
      const collectionId = Number(row.collectionId);
      const previewMedia = previewMediaByCollection.get(collectionId) ?? [];

      previewMedia.push({
        id: Number(row.id),
        collectionId,
        mediaServerId: row.mediaServerId,
        tmdbId: row.tmdbId ? Number(row.tmdbId) : undefined,
        tvdbId: row.tvdbId ? Number(row.tvdbId) : undefined,
        addDate: row.addDate,
        image_path: row.image_path,
        isManual: hasCollectionMediaManualMembership({
          isManual: Boolean(row.isManual),
          manualMembershipSource: row.manualMembershipSource ?? null,
        }),
        includedByRule:
          row.includedByRule === null || row.includedByRule === undefined
            ? null
            : Boolean(row.includedByRule),
        manualMembershipSource: row.manualMembershipSource ?? null,
      } as CollectionMedia);

      previewMediaByCollection.set(collectionId, previewMedia);
    }

    return this.enrichCollectionPreviewMedia(previewMediaByCollection);
  }

  private async getCollectionMediaByCollection(collectionIds: number[]) {
    if (collectionIds.length === 0) {
      return new Map<number, CollectionMedia[]>();
    }

    const collectionMedia = await this.CollectionMediaRepo.find({
      where: { collectionId: In(collectionIds) },
      order: {
        collectionId: 'ASC',
        addDate: 'DESC',
        id: 'DESC',
      },
    });

    const mediaByCollection = new Map<number, CollectionMedia[]>();

    for (const media of collectionMedia) {
      const mediaItems = mediaByCollection.get(media.collectionId) ?? [];

      mediaItems.push(media);
      mediaByCollection.set(media.collectionId, mediaItems);
    }

    return mediaByCollection;
  }

  private async findCollections(libraryId?: string, typeId?: MediaItemType) {
    // Both filters apply together. A library id used to discard the type
    // filter, so asking for one library's season collections returned every
    // collection it holds.
    const where = {
      ...(libraryId ? { libraryId } : {}),
      ...(typeId ? { type: typeId } : {}),
    };

    return await this.collectionRepo.find(
      Object.keys(where).length > 0 ? { where } : undefined,
    );
  }

  async getCollections(libraryId?: string, typeId?: MediaItemType) {
    try {
      const collections = await this.findCollections(libraryId, typeId);

      const collectionIds = collections.map((collection) => collection.id);

      const [mediaCountsByCollection, previewMediaByCollection] =
        await Promise.all([
          this.getCollectionMediaCounts(collectionIds),
          this.getCollectionPreviewMedia(collectionIds),
        ]);

      return collections.map((collection) => ({
        ...collection,
        media: previewMediaByCollection.get(Number(collection.id)) ?? [],
        mediaCount: mediaCountsByCollection.get(Number(collection.id)) ?? 0,
      }));
    } catch (error) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  async getCollectionsForOverlayData(
    libraryId?: string,
    typeId?: MediaItemType,
  ) {
    try {
      const collections = await this.findCollections(libraryId, typeId);

      const collectionIds = collections.map((collection) => collection.id);
      const mediaByCollection =
        await this.getCollectionMediaByCollection(collectionIds);

      return collections.map((collection) => {
        const media = mediaByCollection.get(Number(collection.id)) ?? [];

        return {
          ...collection,
          media,
          mediaCount: media.length,
        };
      });
    } catch (error) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  async getAllCollections() {
    try {
      return await this.collectionRepo.find();
    } catch (error) {
      this.logger.warn('An error occurred while fetching collections.');
      this.logger.debug(error);
      return [];
    }
  }

  async createCollection(
    collection: ICollection,
    empty = true,
    initialItemId?: string,
  ): Promise<
    | {
        dbCollection: addCollectionDbResponse;
      }
    | undefined
  > {
    try {
      const mediaServer = await this.getMediaServer();
      let mediaCollection: MediaCollection;

      if (
        !empty &&
        (collection.manualCollection == undefined ||
          !collection.manualCollection) &&
        !collection.keepInMaintainerrOnly
      ) {
        // Create collection via media server abstraction
        mediaCollection = await mediaServer.createCollection({
          libraryId: collection.libraryId,
          title: collection.title,
          summary: collection?.description,
          sortTitle: collection?.sortTitle,
          type: collection.type,
          initialItemId,
        });

        // Store the media server ID from the created collection
        collection.mediaServerId = mediaCollection.id;

        // Handle visibility settings (Plex-only feature)
        if (
          mediaServer.supportsFeature(MediaServerFeature.COLLECTION_VISIBILITY)
        ) {
          await mediaServer.updateCollectionVisibility({
            libraryId: collection.libraryId,
            collectionId: mediaCollection.id,
            recommended: collection.visibleOnRecommended,
            ownHome: collection.visibleOnHome,
            sharedHome: collection.visibleOnHome,
          });
        }
      }
      // in case of manual, just fetch the collection media server ID
      if (collection.manualCollection) {
        const foundCollection = await this.findMediaServerCollection(
          collection.manualCollectionName,
          collection.libraryId,
          true,
          collection.type,
        );
        if (foundCollection) {
          // Handle visibility settings (Plex-only feature)
          if (
            mediaServer.supportsFeature(
              MediaServerFeature.COLLECTION_VISIBILITY,
            )
          ) {
            await mediaServer.updateCollectionVisibility({
              libraryId: collection.libraryId,
              collectionId: foundCollection.id,
              recommended: collection.visibleOnRecommended,
              ownHome: collection.visibleOnHome,
              sharedHome: collection.visibleOnHome,
            });
          }

          collection.mediaServerId = foundCollection.id;
        } else {
          // The name is only one of the reasons it can miss: a collection of
          // the wrong media type is left alone too, and says so a line above.
          this.logger.error(
            `Could not link the manual collection '${collection.manualCollectionName}'. Check the name, and that its media type matches the rule.`,
          );
          return undefined;
        }
      }
      // create collection in db
      const collectionDb: addCollectionDbResponse =
        await this.addCollectionToDB(
          collection,
          collection.mediaServerId ? collection.mediaServerId : undefined,
        );

      // Re-push any stored poster after a collection recreate.
      const storedPoster = await this.collectionPosterService.loadStoredPoster(
        collectionDb.id,
      );
      if (storedPoster) {
        await this.collectionPosterService.pushToMediaServer(
          collectionDb.mediaServerId ?? collection.mediaServerId,
          storedPoster.buffer,
          storedPoster.contentType,
        );
      }

      return { dbCollection: collectionDb };
    } catch (error) {
      this.logger.error(
        'An error occurred while creating or fetching a collection',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  async createCollectionWithChildren(
    collection: ICollection,
    media?: CollectionMediaChange[],
  ): Promise<
    | {
        dbCollection: addCollectionDbResponse;
      }
    | undefined
  > {
    try {
      const hasMedia = !!media && media.length > 0;
      // With no items to add, create the DB row only and defer the remote
      // collection to the first add (which seeds it). An empty remote collection
      // is pointless on every server and Emby rejects it outright (#3075).
      const createdCollection = await this.createCollection(
        collection,
        !hasMedia,
        media?.[0]?.mediaServerId,
      );

      if (!createdCollection?.dbCollection) {
        return undefined;
      }

      if (media && media.length > 0) {
        await this.addChildrenToCollection(
          {
            mediaServerId:
              createdCollection.dbCollection?.mediaServerId ||
              createdCollection.dbCollection?.id?.toString(),
            dbId: createdCollection.dbCollection.id,
            manualCollection: Boolean(
              createdCollection.dbCollection?.manualCollection,
            ),
          },
          media,
          false,
          false,
        );
      }

      return createdCollection;
    } catch (error) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  async updateCollection(
    collection: ICollection,
  ): Promise<{ dbCollection?: ICollection } | undefined> {
    try {
      const mediaServer = await this.getMediaServer();
      const dbCollection = await this.collectionRepo.findOne({
        where: { id: +collection.id },
      });

      const sanitizedSortTitle =
        collection?.sortTitle && collection.sortTitle.trim() !== ''
          ? collection.sortTitle
          : null;

      // Verify the media server collection still exists before updating. A
      // collection that could not be verified keeps its link and its metadata
      // untouched - the next save reapplies both.
      const probe = dbCollection?.mediaServerId
        ? await this.probeMediaServerCollection(
            dbCollection,
            mediaServer,
            '[updateCollection]',
          )
        : undefined;

      if (probe && probe.status !== 'unknown') {
        const serverColl =
          probe.status === 'found' ? probe.collection : undefined;

        if (!serverColl) {
          // Collection was deleted from media server - clear the stale link
          this.logger.log(
            `Linked media server collection ${dbCollection.mediaServerId} no longer exists, clearing link`,
          );
          collection.mediaServerId = null;
        } else if (
          // is the type the same & is it an automatic collection, then update
          collection.type === dbCollection.type &&
          !dbCollection.manualCollection &&
          !collection.manualCollection &&
          collection.libraryId === dbCollection.libraryId // Library must match
        ) {
          // This collection is about to be torn down, so metadata and visibility
          // are writes it opted out of. The standalone collection endpoint does
          // not carry the flag, hence the fall back to the stored value.
          const keptInMaintainerrOnly =
            collection.keepInMaintainerrOnly ??
            dbCollection.keepInMaintainerrOnly;

          if (!keptInMaintainerrOnly) {
            // Update collection metadata on media server
            try {
              await mediaServer.updateCollection({
                libraryId: collection.libraryId,
                collectionId: dbCollection.mediaServerId,
                title: collection.title,
                summary: collection?.description,
                sortTitle: sanitizedSortTitle ?? undefined,
              });
            } catch (error) {
              this.logger.warn(
                'Failed to update collection metadata on media server',
              );
              this.logger.debug(error);
            }
            // Handle visibility settings (Plex-only feature)
            if (
              mediaServer.supportsFeature(
                MediaServerFeature.COLLECTION_VISIBILITY,
              )
            ) {
              await mediaServer.updateCollectionVisibility({
                libraryId: dbCollection.libraryId,
                collectionId: dbCollection.mediaServerId,
                recommended: collection.visibleOnRecommended,
                ownHome: collection.visibleOnHome,
                sharedHome: collection.visibleOnHome,
              });
            }
          }
        } else {
          // if the type, manual collection, or library changed - reset the media server collection
          if (
            collection.manualCollection !== dbCollection.manualCollection ||
            collection.type !== dbCollection.type ||
            collection.manualCollectionName !==
              dbCollection.manualCollectionName ||
            collection.libraryId !== dbCollection.libraryId
          ) {
            // A manual collection is left alone entirely; one a sibling rule
            // group shares is left standing with only this collection's items
            // taken out (#2766). The link is dropped either way, so say when
            // something was left behind.
            if (
              !(
                await this.deleteMediaServerCollection(
                  dbCollection,
                  'resetting',
                )
              ).ok
            ) {
              this.logger.warn(
                `Media server collection ${dbCollection.mediaServerId} for '${dbCollection.title}' may need to be removed manually`,
              );
            }
            collection.mediaServerId = null;
          }
        }
      }

      const dbResp: ICollection = await this.saveCollection({
        ...dbCollection,
        ...collection,
        sortTitle: sanitizedSortTitle,
      });

      await this.addLogRecord(
        { id: dbResp.id } as Collection,
        "Successfully updated the collection's settings",
        ECollectionLogType.COLLECTION,
      );

      return { dbCollection: dbResp };
    } catch (error) {
      this.logger.warn('An error occurred while performing collection actions');
      this.logger.debug(error);
      await this.addLogRecord(
        { id: collection.id } as Collection,
        "Failed to update the collection's settings",
        ECollectionLogType.COLLECTION,
      );
      return undefined;
    }
  }

  public async saveCollection(collection: Collection): Promise<Collection> {
    if (collection.id) {
      const oldCollection = await this.collectionRepo.findOne({
        where: { id: collection.id },
      });

      const response = await this.collectionRepo.save(collection);

      this.eventEmitter.emit(MaintainerrEvent.Collection_Updated, {
        collection: response,
        oldCollection: oldCollection,
      });

      return response;
    } else {
      const response = await this.collectionRepo.save(collection);

      this.eventEmitter.emit(MaintainerrEvent.Collection_Created, {
        collection: response,
      });

      return response;
    }
  }

  public async relinkManualCollection(
    collection: Collection,
  ): Promise<Collection> {
    // refetch manual collection, in case it's ID changed
    if (collection.manualCollection) {
      let foundColl: MediaCollection | undefined;
      try {
        foundColl = await this.findMediaServerCollection(
          collection.manualCollectionName,
          collection.libraryId,
          true,
          collection.type,
        );
      } catch (error) {
        // "Could not look" is not "does not exist".
        this.logger.warn(
          `Could not verify manual collection '${collection.manualCollectionName}' - keeping the current link`,
        );
        this.logger.debug(error);
        return collection;
      }

      if (foundColl) {
        collection.mediaServerId = foundColl.id;
        collection = await this.saveCollection(collection);

        await this.addLogRecord(
          { id: collection.id } as Collection,
          'Successfully relinked the manual collection',
          ECollectionLogType.COLLECTION,
        );
      } else {
        this.logger.error(
          `Could not relink the manual collection '${collection.manualCollectionName}'. Check that it still exists and that its media type matches the rule.`,
        );
        await this.addLogRecord(
          { id: collection.id } as Collection,
          'Failed to relink the manual collection',
          ECollectionLogType.COLLECTION,
        );
      }
    }
    return collection;
  }

  /**
   * Existence probe for link decisions. 'missing' is the server confirming the
   * collection is gone, 'unknown' is a failed lookup. Unlinking on 'unknown'
   * orphans the real collection and duplicates it on the next add (#3344).
   */
  private async probeMediaServerCollection(
    collection: Pick<Collection, 'title' | 'mediaServerId'>,
    mediaServer: IMediaServerService,
    context: string,
  ): Promise<
    | { status: 'found'; collection: MediaCollection }
    | { status: 'missing' }
    | { status: 'unknown' }
  > {
    try {
      const serverColl = await mediaServer.getCollection(
        collection.mediaServerId,
        true,
      );
      return serverColl
        ? { status: 'found', collection: serverColl }
        : { status: 'missing' };
    } catch (error) {
      this.logger.warn(
        `${context} Could not verify media server collection ${collection.mediaServerId} for "${collection.title}" - keeping the link`,
      );
      this.logger.debug(error);
      return { status: 'unknown' };
    }
  }

  /**
   * Children for reconciliation decisions: a confirmed list, or undefined
   * when enumeration failed. A failed read is not an empty collection -
   * callers must skip membership changes (resync, delete) on undefined.
   */
  private async getConfirmedCollectionChildren(
    collection: Pick<Collection, 'title'>,
    mediaServer: IMediaServerService,
    mediaServerCollectionId: string,
  ): Promise<MediaItem[] | undefined> {
    try {
      return await mediaServer.getCollectionChildren(mediaServerCollectionId);
    } catch (error) {
      this.logger.warn(
        `[checkAutomaticMediaServerLink] Could not enumerate media server collection ${mediaServerCollectionId} for "${collection.title}" - skipping membership reconciliation this run`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async checkAutomaticMediaServerLink(
    collection: Collection,
  ): Promise<Collection> {
    const mediaServer = await this.getMediaServer();
    // checks and fixes automatic collection link
    if (!collection.manualCollection) {
      // Kept in Maintainerr only: the reconciled state is "no media server
      // collection". Tearing down here rather than at every caller also makes
      // it self-healing - a delete the server refused keeps the link, and the
      // next run reconciles again. Never fall through to the title relink
      // below, which would adopt a same-titled collection and undo the opt-in.
      if (collection.keepInMaintainerrOnly) {
        return await this.stopMediaServerSync(collection);
      }

      let serverColl: MediaCollection | undefined = undefined;
      const originalMediaServerId = collection.mediaServerId; // Track if we already had a link

      this.logger.debug(
        `[checkAutomaticMediaServerLink] Collection "${collection.title}" (DB id: ${collection.id}, mediaServerId: ${collection.mediaServerId})`,
      );

      if (collection.mediaServerId) {
        const probe = await this.probeMediaServerCollection(
          collection,
          mediaServer,
          '[checkAutomaticMediaServerLink]',
        );

        if (probe.status === 'unknown') {
          // Nothing is known about the server collection this run, so neither
          // reconciliation nor unlinking is safe.
          return collection;
        }

        if (probe.status === 'found') {
          serverColl = probe.collection;
        }
        this.logger.debug(
          `[checkAutomaticMediaServerLink] getCollection(${collection.mediaServerId}) returned: ${serverColl ? `id=${serverColl.id}, childCount=${serverColl.childCount}` : 'undefined'}`,
        );
      }

      if (!serverColl) {
        let foundColl: MediaCollection | undefined;
        try {
          foundColl = await this.findMediaServerCollection(
            collection.title,
            collection.libraryId,
            false,
            collection.type,
          );
        } catch (error) {
          // The library could not be enumerated, so we cannot tell whether a
          // collection with this title exists. Clearing the link here would
          // make the next add create a second one beside it (#3344).
          this.logger.warn(
            `[checkAutomaticMediaServerLink] Could not search for "${collection.title}" in library ${collection.libraryId} - leaving the link untouched`,
          );
          this.logger.debug(error);
          return collection;
        }

        // Only log if we expected to find it (had a previous link) or if we actually found one
        if (foundColl || collection.mediaServerId) {
          this.logger.debug(
            `[checkAutomaticMediaServerLink] findMediaServerCollection("${collection.title}") returned: ${foundColl ? `id=${foundColl.id}, childCount=${foundColl.childCount}` : 'undefined'}`,
          );
        }

        if (foundColl) {
          collection.mediaServerId = foundColl.id;
          collection = await this.saveCollection(collection);
          serverColl = foundColl;
        }
      }

      // Reconcile an automatic collection that already exists on the server.
      // ONLY act when we had a mediaServerId on entry; if we just linked/found
      // it (originalMediaServerId was null) the server may not have finished
      // indexing recent additions yet.
      //
      // Plex: an empty Plex collection rejects subsequent adds, so delete the
      // empty/stale record and let the regular add flow recreate it fresh.
      if (
        this.settingsDataService.media_server_type === MediaServerType.PLEX &&
        serverColl &&
        collection.mediaServerId !== null &&
        originalMediaServerId !== null
      ) {
        const isShared = await this.isMediaServerCollectionShared(collection);

        if (isShared) {
          // For shared automatic collections we never delete (a sibling
          // rule group may still depend on the media server collection)
          // and we can't trust metadata childCount as the only signal:
          // if the server holds N children but our local DB has rule-owned
          // items not among them (partial drift, e.g. items stripped by
          // exclude/unexclude flows), the rule executor's local-DB-only
          // delta can't recover them. Fetch actual children and resync.
          const serverChildren = await this.getConfirmedCollectionChildren(
            collection,
            mediaServer,
            serverColl.id,
          );

          if (serverChildren !== undefined) {
            const serverChildIds = new Set(
              serverChildren
                .map((child) => child?.id?.toString())
                .filter((childId): childId is string => Boolean(childId)),
            );
            this.logger.debug(
              `[checkAutomaticMediaServerLink] Shared collection ${serverColl.id} has ${serverChildIds.size} children - checking for local rule-owned drift`,
            );
            const resyncResult =
              await this.resyncRuleOwnedItemsToMediaServerCollection(
                collection,
                serverChildIds,
              );

            if (
              resyncResult.attempted > 0 &&
              resyncResult.rejected < resyncResult.attempted
            ) {
              this.healedCollectionIds.delete(collection.id);
            }

            // An empty shared collection that rejected every resynced item
            // can't be repaired in place - fall back to delete-and-recreate.
            // The sibling rule group loses nothing: the collection has no
            // children, and its link re-establishes via the title relink.
            if (
              serverChildIds.size === 0 &&
              resyncResult.attempted > 0 &&
              resyncResult.rejected >= resyncResult.attempted
            ) {
              const deleted =
                await this.deleteEmptyCollectionRejectingAdds(collection);
              if (deleted) {
                serverColl = undefined;
              }
            }
          }
        } else {
          const metadataChildCount = Number.isFinite(serverColl.childCount)
            ? serverColl.childCount
            : undefined;

          // Only a confirmed count may drive the empty-delete below; when
          // both the metadata count and the children read are inconclusive,
          // keep the collection.
          const actualChildCount =
            metadataChildCount ??
            (
              await this.getConfirmedCollectionChildren(
                collection,
                mediaServer,
                serverColl.id,
              )
            )?.length;

          if (actualChildCount === undefined) {
            this.logger.debug(
              `[checkAutomaticMediaServerLink] Child count for collection ${serverColl.id} is unknown - keeping it`,
            );
          } else if (actualChildCount <= 0) {
            this.logger.debug(
              `[checkAutomaticMediaServerLink] Deleting empty collection ${serverColl.id} (${metadataChildCount !== undefined ? `metadataChildCount=${metadataChildCount}` : `actualChildCount=${actualChildCount}`})`,
            );
            try {
              await mediaServer.deleteCollection(serverColl.id);
              serverColl = undefined;
            } catch (error) {
              // An optimisation (an empty Plex collection rejects adds), not a
              // step the run depends on - letting it escape fails the whole
              // rule group every run when Plex refuses deletes.
              this.logger.warn(
                `[checkAutomaticMediaServerLink] Could not delete empty media server collection ${serverColl.id} for "${collection.title}" - keeping the link`,
              );
              this.logger.debug(error);
            }
          } else {
            this.logger.debug(
              metadataChildCount !== undefined
                ? `[checkAutomaticMediaServerLink] Trusting Plex metadata childCount=${metadataChildCount} for collection ${serverColl.id}, keeping it`
                : `[checkAutomaticMediaServerLink] Collection ${serverColl.id} has ${actualChildCount} children, keeping it`,
            );
          }
        }
      } else if (
        serverColl &&
        collection.mediaServerId !== null &&
        originalMediaServerId !== null
      ) {
        // Jellyfin/Emby: a BoxSet can drain - its items re-imported with new
        // ids, or a one-time add that didn't fully land - and sit on the server
        // under-populated while the DB still lists its rule-owned items. Re-add
        // the missing ones: empty BoxSets accept adds, so this repopulates in
        // place, the BoxSet id (with its overlays/poster) stays stable, and
        // re-adding an item already present is an idempotent no-op. (#3129)
        //
        // Removal is intentionally left to the existing flow, which Maintainerr
        // already drives: when handling empties an automatic collection,
        // removeFromCollection deletes the BoxSet (or just unlinks it when a
        // sibling rule group shares it), and the (!serverColl) clear-link path
        // below recovers a collection whose BoxSet is already gone. This branch
        // only ever re-adds, never deletes.
        //
        // The resync only runs against a confirmed children read: a failed
        // read is not an empty BoxSet, and re-adding everything on every
        // failing run churns the server while masking the outage.
        const serverChildren = await this.getConfirmedCollectionChildren(
          collection,
          mediaServer,
          serverColl.id,
        );

        if (serverChildren !== undefined) {
          const serverChildIds = new Set(
            serverChildren
              .map((child) => child?.id?.toString())
              .filter((childId): childId is string => Boolean(childId)),
          );
          await this.resyncRuleOwnedItemsToMediaServerCollection(
            collection,
            serverChildIds,
          );
        }
      }

      if (!serverColl) {
        // A missing server collection has two very different causes: the
        // library is fine and simply has no matching items yet (auto-create
        // will kick in), or the library the collection targets no longer
        // exists on the server (removed, or recreated with a new id) - in
        // which case nothing will ever be created and the user must re-point
        // the collection. Only claim the library is gone when we positively
        // fetched the library list and it's absent; treat an empty/failed
        // fetch as inconclusive so a transient blip never mislabels it.
        let libraries: Awaited<ReturnType<typeof mediaServer.getLibraries>> =
          [];
        try {
          libraries = (await mediaServer.getLibraries()) ?? [];
        } catch (error) {
          // A throwing fetch is inconclusive too - never let a transient blip
          // mislabel the library as missing; fall through to the neutral
          // "will be recreated" message.
          this.logger.debug(error);
        }
        const libraryMissing =
          !!collection.libraryId &&
          libraries.length > 0 &&
          !libraries.some((library) => library.id === collection.libraryId);

        this.logger.debug(
          libraryMissing
            ? `[checkAutomaticMediaServerLink] Library ${collection.libraryId} for "${collection.title}" no longer exists on the media server - clearing link. Re-point the collection at an existing library.`
            : originalMediaServerId
              ? `[checkAutomaticMediaServerLink] Media server collection for "${collection.title}" no longer exists - clearing link. It will be recreated automatically when items match the rule.`
              : `[checkAutomaticMediaServerLink] No media server collection for "${collection.title}" - collection is empty and will be created automatically when items match the rule.`,
        );
        collection.mediaServerId = null;
        collection = await this.saveCollection(collection);
      }
    }
    return collection;
  }

  /**
   * Why this collection cannot take the item, or undefined when it can. An
   * inconclusive lookup answers undefined: a blip must never block a real add.
   */
  private async explainRejectedAdd(
    mediaServer: IMediaServerService,
    mediaId: string,
    collection: Collection | undefined,
  ): Promise<string | undefined> {
    // itemExists is the only read that separates "gone" from "could not ask":
    // it throws on the second, which is what keeps a blip from blocking an add.
    try {
      if (!(await mediaServer.itemExists(mediaId))) {
        return 'Failed - not found on the media server';
      }
    } catch (error) {
      this.logger.debug(error);
      return undefined;
    }

    // A collection bound to one library refuses a foreign id on its own, but
    // silently drops it from a mixed batch, leaving a row for an add that
    // never happened.
    const libraryId = collection?.libraryId;
    if (
      !libraryId ||
      mediaServer.supportsFeature(MediaServerFeature.CROSS_LIBRARY_COLLECTIONS)
    ) {
      return undefined;
    }

    let item: MediaItem | undefined;
    try {
      item = await mediaServer.getMetadata(mediaId);
    } catch (error) {
      this.logger.debug(error);
      return undefined;
    }

    // An unread library cannot disprove membership, and existence is settled.
    return item?.library?.id && item.library.id !== libraryId
      ? "Failed - not in this collection's library"
      : undefined;
  }

  /**
   * Resolution is bounded-parallel, but the write is a **single** batched call.
   * The write path find-or-creates the media server collection, which is not
   * safe to run concurrently against the same collection: parallel first adds
   * each create their own, leaving duplicates beside the linked one (#3344).
   */
  async bulkMediaCollectionAction(
    mediaIds: string[],
    collectionId: number | undefined,
    action: 'add' | 'remove',
    mediaType: MediaItemType,
    context?: AlterableMediaContext,
  ): Promise<BulkMediaResponse> {
    const uniqueMediaIds = [...new Set(mediaIds)];
    const resultById = new Map<string, BulkMediaItemResult>();
    const mediaServer = await this.getMediaServer();
    const collection =
      collectionId !== undefined
        ? await this.collectionRepo.findOne({ where: { id: collectionId } })
        : undefined;

    if (collectionId !== undefined && !collection) {
      throw new NotFoundException(`Collection ${collectionId} not found`);
    }

    const fail = (mediaId: string, message: string) =>
      resultById.set(mediaId, { mediaId, code: 0, message });

    const resolvedByMediaId = new Map<string, string[]>();
    for (const batch of chunk(
      uniqueMediaIds,
      BULK_COLLECTION_ACTION_CONCURRENCY,
    )) {
      await Promise.all(
        batch.map(async (mediaId) => {
          try {
            if (action === 'add') {
              const rejection = await this.explainRejectedAdd(
                mediaServer,
                mediaId,
                collection,
              );

              if (rejection) {
                fail(mediaId, rejection);
                return;
              }
            }

            const ids = await mediaServer.getAllIdsForContextAction(
              collection?.type,
              context
                ? { type: context.type, id: String(context.id) }
                : { type: mediaType, id: mediaId },
              mediaId,
            );

            if (ids.length === 0) {
              fail(mediaId, 'Failed - nothing this collection can take');
              return;
            }

            resolvedByMediaId.set(mediaId, ids);
          } catch (error) {
            this.logger.warn(
              `Bulk collection ${action} could not resolve media ${mediaId}`,
            );
            this.logger.debug(error);
            fail(mediaId, 'Failed - see server logs');
          }
        }),
      );
    }

    const media = [
      ...new Set([...resolvedByMediaId.values()].flat()),
    ].map<CollectionMediaChange>((mediaServerId) => ({ mediaServerId }));

    if (media.length > 0) {
      const failAllResolved = (message: string) => {
        for (const mediaId of resolvedByMediaId.keys()) {
          fail(mediaId, message);
        }
      };

      try {
        if (action === 'add') {
          const result = await this.addToCollectionInternal(
            collectionId,
            media,
            true,
          );

          if (!result.collection) {
            // The helper swallows its own failures so a rule run survives one
            // bad collection; an interactive caller has to be told.
            failAllResolved('Failed - the collection could not be updated');
          } else {
            const rejected = new Set(result.serverRejectedIds);
            const unconfirmed = new Set(result.serverUnconfirmedIds ?? []);
            const unpersisted = new Set(result.unpersistedIds ?? []);
            for (const [mediaId, ids] of resolvedByMediaId) {
              if (ids.some((id) => rejected.has(id))) {
                fail(mediaId, 'Failed - refused by the media server');
              } else if (ids.some((id) => unconfirmed.has(id))) {
                fail(
                  mediaId,
                  'Failed - the media server did not answer in time, so it is unclear whether this was added',
                );
              } else if (ids.some((id) => unpersisted.has(id))) {
                fail(mediaId, 'Failed - the collection could not be updated');
              }
            }
          }
        } else if (collectionId === undefined) {
          const result = await this.removeFromAllCollections(media);
          if (result.code !== 1) {
            failAllResolved('Failed - the collections could not be updated');
          }
        } else if (!(await this.removeFromCollection(collectionId, media))) {
          failAllResolved('Failed - the collection could not be updated');
        } else {
          // The helper answers the collection even when the media server
          // refused some children, but it only deletes the rows the server
          // confirmed - so a row still present is a removal that did not
          // happen. Chunked because a show selection can resolve to enough
          // episode ids to pass SQLite's parameter cap (#3431).
          const remaining = new Set<string>();
          for (const idBatch of chunk(
            media.map((m) => m.mediaServerId),
            ENRICHMENT_ID_CHUNK,
          )) {
            for (const row of (await this.CollectionMediaRepo.find({
              where: { collectionId, mediaServerId: In(idBatch) },
            })) ?? []) {
              remaining.add(row.mediaServerId);
            }
          }
          // A surviving row only establishes that the removal was not confirmed.
          // It cannot say whether the server refused it or simply never answered
          // - and a media server that answers late may well have applied it - so
          // the message must not assert a refusal.
          for (const [mediaId, ids] of resolvedByMediaId) {
            if (ids.some((id) => remaining.has(id))) {
              fail(
                mediaId,
                'Failed - the media server did not confirm the removal',
              );
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Bulk collection ${action} failed`);
        this.logger.debug(error);
        failAllResolved('Failed - see server logs');
      }
    }

    return {
      results: uniqueMediaIds.map(
        (mediaId): BulkMediaItemResult =>
          resultById.get(mediaId) ?? { mediaId, code: 1 },
      ),
    };
  }

  /**
   * Drives the manual add/remove modal. Reports what the media server refused
   * so the caller can tell the user, rather than answering "done" to an action
   * that changed nothing.
   */
  async MediaCollectionActionWithContext(
    collectionDbId: number | undefined,
    context: AlterableMediaContext,
    media: CollectionMediaChange,
    action: 'add' | 'remove',
  ): Promise<ContextActionResult> {
    const mediaServer = await this.getMediaServer();
    const collection =
      collectionDbId !== -1 && collectionDbId !== undefined
        ? await this.collectionRepo.findOne({
            where: { id: collectionDbId },
          })
        : undefined;

    // Any action naming a collection needs it to exist. Without this a remove
    // resolved its ids as a global action and then removed nothing, and an add
    // had no collection to add to - both reported as done.
    const namesCollection =
      collectionDbId !== undefined && collectionDbId !== -1;
    if ((namesCollection || action === 'add') && !collection) {
      throw new NotFoundException(`Collection ${collectionDbId} not found`);
    }

    // get media - traverse show -> seasons -> episodes if needed
    let ids: string[];
    try {
      ids = await mediaServer.getAllIdsForContextAction(
        collection?.type,
        { type: context.type, id: String(context.id) },
        media.mediaServerId,
      );
    } catch (error) {
      // The hierarchy walk reads the media server, so a failure here means we
      // do not know what to act on - which is not the same as "nothing to do".
      this.logger.debug(error);
      throw new BadGatewayException(
        getErrorMessage(
          error,
          `The media server could not resolve ${media.mediaServerId}`,
        ),
      );
    }

    const handleMedia: CollectionMediaChange[] = ids.map((id) => ({
      mediaServerId: id,
    }));

    // Both helpers swallow their own failures and answer undefined, so one bad
    // collection cannot abort a rule run. A user waiting on the modal has to be
    // told instead of watching it close on nothing.
    const orFail = (collection: Collection | undefined): Collection => {
      if (!collection) {
        throw new BadGatewayException(
          `The collection could not be updated. Check the logs for what failed.`,
        );
      }
      return collection;
    };

    if (action === 'add') {
      const result = await this.addToCollectionInternal(
        collectionDbId,
        handleMedia,
        true,
      );
      return {
        collection: orFail(result.collection),
        // A rolled-back add left nothing behind either, so the caller reports
        // it alongside the refusals.
        serverRejectedIds: [
          ...result.serverRejectedIds,
          ...(result.unpersistedIds ?? []),
        ],
        // Kept apart: the server never answered, so this is not a refusal, and
        // reporting it as success is the false-success #3383 removed.
        serverUnconfirmedIds: result.serverUnconfirmedIds,
        resolvedCount: handleMedia.length,
      };
    }

    if (!collectionDbId) {
      const result = await this.removeFromAllCollections(handleMedia);
      if (result && result.code !== 1) {
        orFail(undefined);
      }
      return { serverRejectedIds: [], resolvedCount: handleMedia.length };
    }

    return {
      collection: orFail(
        await this.removeFromCollection(collectionDbId, handleMedia),
      ),
      serverRejectedIds: [],
      resolvedCount: handleMedia.length,
    };
  }

  async addToCollection(
    collectionDbId: number,
    media: CollectionMediaChange[],
    manual = false,
    manualMembershipSource = CollectionMediaManualMembershipSource.LOCAL,
  ): Promise<Collection> {
    return (
      await this.addToCollectionInternal(
        collectionDbId,
        media,
        manual,
        false,
        false,
        manualMembershipSource,
      )
    ).collection;
  }

  async addToCollectionWithResolvedLink(
    collection: Collection,
    media: CollectionMediaChange[],
    manual = false,
    manualMembershipSource = CollectionMediaManualMembershipSource.LOCAL,
  ): Promise<Collection> {
    if (!collection) return undefined;
    return (
      await this.addToCollectionInternal(
        collection.id,
        media,
        manual,
        true,
        false,
        manualMembershipSource,
      )
    ).collection;
  }

  async syncMediaServerChildrenToCollection(
    collection: Collection,
    media: CollectionMediaChange[],
    manualMembershipSource = CollectionMediaManualMembershipSource.LOCAL,
  ): Promise<Collection> {
    if (!collection) return undefined;
    return (
      await this.addToCollectionInternal(
        collection.id,
        media,
        true,
        true,
        true,
        manualMembershipSource,
      )
    ).collection;
  }

  private async addToCollectionInternal(
    collectionDbId: number,
    media: CollectionMediaChange[],
    manual = false,
    skipAutomaticLinkCheck = false,
    skipMediaServerAdd = false,
    manualMembershipSource = CollectionMediaManualMembershipSource.LOCAL,
  ): Promise<CollectionAddResult> {
    try {
      const mediaServer = await this.getMediaServer();
      let collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });
      const collectionMedia = await this.CollectionMediaRepo.find({
        where: { collectionId: collectionDbId },
      });
      const existingCollectionMediaById = new Map(
        collectionMedia.map((existingCollectionMedia) => [
          existingCollectionMedia.mediaServerId,
          existingCollectionMedia,
        ]),
      );
      const existingMedia = media.filter((collectionMediaItem) =>
        existingCollectionMediaById.has(collectionMediaItem.mediaServerId),
      );

      // filter already existing out
      let newMedia = media.filter(
        (m) =>
          !collectionMedia.find((el) => el.mediaServerId === m.mediaServerId),
      );
      let rejectedByServer: string[] = [];
      let unconfirmedByServer: string[] = [];
      let unpersistedIds: string[] = [];

      if (collection) {
        if (!skipAutomaticLinkCheck) {
          collection = await this.checkAutomaticMediaServerLink(collection);
        }

        // Check if we need to create a new media server collection
        // This happens when: 1) we have new items to add, OR 2) we have existing items but no media server collection
        const needsMediaServerCollection =
          !collection.mediaServerId &&
          (newMedia.length > 0 || collectionMedia.length > 0) &&
          !collection.keepInMaintainerrOnly;

        // Create media server collection if needed
        if (needsMediaServerCollection) {
          let newColl: MediaCollection | undefined = undefined;
          // A search that could not complete must not fall through to create:
          // the collection it failed to see would end up duplicated (#3344).
          // Skip this run and retry on the next one.
          let searchCompleted = true;
          const findExisting = async (
            name: string,
            searchAllLibraries = false,
          ): Promise<MediaCollection | undefined> => {
            try {
              return await this.findMediaServerCollection(
                name,
                collection.libraryId,
                searchAllLibraries,
                collection.type,
              );
            } catch (error) {
              searchCompleted = false;
              this.logger.warn(
                `Could not search library ${collection.libraryId} for "${name}" - not creating a media server collection this run`,
              );
              this.logger.debug(error);
              return undefined;
            }
          };

          if (collection.manualCollection) {
            newColl = await findExisting(collection.manualCollectionName, true);
          } else {
            newColl = await findExisting(collection.title);

            if (!newColl && searchCompleted) {
              newColl = await mediaServer.createCollection({
                libraryId: collection.libraryId,
                title: collection.title,
                summary: collection.description,
                sortTitle: collection.sortTitle,
                type: collection.type,
                // Create with one item so Emby accepts it (it 500s on an empty
                // create, #3075). The full set is synced below.
                initialItemId: (newMedia[0] ?? collectionMedia[0])
                  ?.mediaServerId,
              });
            }
          }
          if (newColl?.id) {
            collection = await this.collectionRepo.save({
              ...collection,
              mediaServerId: newColl.id,
            });
            // Handle visibility settings (Plex-only feature)
            if (
              mediaServer.supportsFeature(
                MediaServerFeature.COLLECTION_VISIBILITY,
              )
            ) {
              await mediaServer.updateCollectionVisibility({
                libraryId: collection.libraryId,
                collectionId: collection.mediaServerId,
                recommended: collection.visibleOnRecommended,
                ownHome: collection.visibleOnHome,
                sharedHome: collection.visibleOnHome,
              });
            }

            // Push stored custom poster: this is the first time the
            // collection has a media-server id, so any deferred upload
            // saved against the db id needs to be applied now.
            const storedPoster =
              await this.collectionPosterService.loadStoredPoster(
                collection.id,
              );
            if (storedPoster) {
              await this.collectionPosterService.pushToMediaServer(
                collection.mediaServerId,
                storedPoster.buffer,
                storedPoster.contentType,
              );
            }

            // Sync existing collection_media rows to the freshly created
            // (empty) media server collection via the batched add path.
            const needsResync = collectionMedia.length > 0;

            // If we had existing collection_media items, sync them to the new media server collection
            if (needsResync) {
              this.logger.log(
                `Syncing ${collectionMedia.length} existing items to newly created media server collection`,
              );
              const failedItemIds = unconfirmedIds(
                await mediaServer.addBatchToCollection(
                  collection.mediaServerId,
                  collectionMedia.map(
                    (existingMedia) => existingMedia.mediaServerId,
                  ),
                ),
              );

              for (const existingMedia of collectionMedia) {
                if (failedItemIds.has(existingMedia.mediaServerId)) {
                  this.logger.warn(
                    `Failed to sync item ${existingMedia.mediaServerId} to collection`,
                  );
                }
              }
            }
          } else {
            if (collection.manualCollection) {
              this.logger.warn(
                searchCompleted
                  ? `Manual Collection '${collection.manualCollectionName}' doesn't exist in media server..`
                  : `Could not verify manual collection '${collection.manualCollectionName}' - deferring the link to the next run`,
              );
            }
          }
        }

        if (existingMedia.length > 0) {
          await this.updateExistingCollectionMediaForAdd(
            collection.id,
            existingMedia,
            existingCollectionMediaById,
            manual,
            manualMembershipSource,
          );
        }

        const isSharedManualCollection =
          collection.manualCollection &&
          collection.mediaServerId &&
          (await this.isMediaServerCollectionShared(collection));

        if (isSharedManualCollection && newMedia.length > 0) {
          // Unknown children just skip the already-on-server shortcut; the
          // regular add flow below handles every item (adds are idempotent).
          let sharedCollectionChildren: MediaItem[] = [];
          try {
            sharedCollectionChildren = await mediaServer.getCollectionChildren(
              collection.mediaServerId,
            );
          } catch (error) {
            this.logger.debug(error);
          }
          const sharedCollectionChildIds = new Set(
            sharedCollectionChildren
              .map((child) => child?.id?.toString())
              .filter((childId): childId is string => Boolean(childId)),
          );
          const existingServerMedia = newMedia.filter((collectionMediaItem) =>
            sharedCollectionChildIds.has(collectionMediaItem.mediaServerId),
          );

          if (existingServerMedia.length > 0) {
            for (const existingServerMediaItem of existingServerMedia) {
              await this.insertCollectionMediaMembership(
                collection.id,
                existingServerMediaItem.mediaServerId,
                {
                  includedByRule: manual ? false : true,
                  manualMembershipSource: manual
                    ? manualMembershipSource
                    : null,
                },
                existingServerMediaItem.reason,
              );
            }
          }

          newMedia = newMedia.filter(
            (collectionMediaItem) =>
              !sharedCollectionChildIds.has(collectionMediaItem.mediaServerId),
          );
        }

        // add new children to collection. Kept in Maintainerr only means there is
        // no media-server collection to add to, but membership must still persist
        // locally - that row is what rules, actions and overlays run on.
        const keepInMaintainerrOnly = Boolean(collection.keepInMaintainerrOnly);
        if (
          newMedia.length > 0 &&
          (collection.mediaServerId || keepInMaintainerrOnly)
        ) {
          const { serverRejectedIds, serverUnconfirmedIds, persistedIds } =
            await this.addChildrenToCollection(
              {
                mediaServerId: collection.mediaServerId ?? '',
                dbId: collection.id,
                manualCollection: Boolean(collection.manualCollection),
              },
              newMedia,
              manual,
              skipMediaServerAdd || keepInMaintainerrOnly,
              manualMembershipSource,
            );
          rejectedByServer = [...serverRejectedIds];
          unconfirmedByServer = [...serverUnconfirmedIds];
          unpersistedIds = newMedia
            .map((m) => m.mediaServerId)
            .filter(
              (id) =>
                !serverRejectedIds.has(id) &&
                !serverUnconfirmedIds.has(id) &&
                !persistedIds.has(id),
            );

          // Only notify for items whose membership was persisted - both
          // server-rejected items and locally-rolled-back items never
          // entered the collection and will be retried (and re-notified)
          // on a later run.
          const addedMedia = newMedia.filter((m) =>
            persistedIds.has(m.mediaServerId),
          );
          if (addedMedia.length > 0) {
            this.eventEmitter.emit(
              MaintainerrEvent.CollectionMedia_Added,
              new CollectionMediaAddedDto(
                addedMedia,
                collection.title,
                { type: 'collection', value: collection.id },
                collection.id,
                collection.deleteAfterDays,
              ),
            );
          }

          if (serverRejectedIds.size < newMedia.length) {
            this.healedCollectionIds.delete(collection.id);
          }

          // Every add REFUSED by the server: if the collection is also empty it
          // is unpopulatable in place - heal by delete so the next pass
          // recreates it fresh. Keyed to refusals the server actually answered:
          // local persistence failures must never delete the collection, and
          // neither must a run whose every write merely went unanswered, which
          // says nothing about whether the collection can hold them.
          if (serverRejectedIds.size >= newMedia.length) {
            const deleted =
              await this.deleteEmptyCollectionRejectingAdds(collection);
            if (deleted) {
              collection.mediaServerId = null;
              collection = await this.saveCollection(collection);
            }
          }
        }

        // Push collection sort to the media server when membership changed
        // in this cycle. The adapter short-circuits if the order already
        // matches, so this is cheap when nothing actually moved.
        if (collection.mediaServerSort && newMedia.length > 0) {
          await this.applyCollectionSort(collection);
        }

        if (isSharedManualCollection) {
          await this.reconcileSharedManualCollectionState(collection, {
            addedMediaServerIds: new Set(
              newMedia.map(
                (collectionMediaItem) => collectionMediaItem.mediaServerId,
              ),
            ),
          });
        }

        // Update cached total size (non-blocking)
        this.updateCollectionTotalSize(collectionDbId).catch(() => {});

        return {
          collection,
          serverRejectedIds: rejectedByServer,
          serverUnconfirmedIds: unconfirmedByServer,
          unpersistedIds,
        };
      } else {
        this.logger.warn("Collection doesn't exist.");
      }
    } catch (error) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      this.logger.debug(error);
    }

    return { collection: undefined, serverRejectedIds: [] };
  }

  async removeFromCollection(
    collectionDbId: number,
    media: CollectionMediaChange[],
    removalScope: CollectionMediaRemovalScope = 'all',
  ): Promise<Collection | undefined> {
    return this.removeFromCollectionInternal(
      collectionDbId,
      media,
      false,
      removalScope,
    );
  }

  async removeFromCollectionWithResolvedLink(
    collection: Collection,
    media: CollectionMediaChange[],
    removalScope: CollectionMediaRemovalScope = 'all',
  ): Promise<Collection | undefined> {
    if (!collection) return undefined;
    return this.removeFromCollectionInternal(
      collection.id,
      media,
      true,
      removalScope,
    );
  }

  /**
   * Drop a media-server item from every managed collection that still lists
   * it, except `excludeCollectionId` (the collection that just handled it).
   *
   * Called after a delete-style action frees the underlying file. The item
   * still resolves on the media server at this point, so removing it from the
   * sibling BoxSets now - while we still have a valid id to remove - keeps the
   * media server from holding unresolved linked-item paths once the library
   * drops the item on its next scan. Those dead links are what Jellyfin
   * re-resolves on every rule run, producing the "Unable to find linked item
   * at path" warning storm and the Jellyfin CPU spike in #3023. Once the item
   * is gone there is no id left to remove, so this is the only window to clean
   * the sibling memberships.
   *
   * Returns the ids of the sibling collections it pruned, so the caller can
   * mark the item recently-handled for each of them - otherwise the rule
   * executor's next pass re-adds it (the id still resolves and conditions like
   * `isWatched` stay true), recreating the membership this just removed.
   */
  async removeMediaFromOtherCollections(
    mediaServerId: string,
    excludeCollectionId: number,
  ): Promise<number[]> {
    const memberships = await this.CollectionMediaRepo.find({
      where: { mediaServerId },
    });

    const otherCollectionIds = [
      ...new Set(
        memberships
          .map((membership) => membership.collectionId)
          .filter((collectionId) => collectionId !== excludeCollectionId),
      ),
    ];

    if (otherCollectionIds.length === 0) {
      return [];
    }

    const siblingCollections = await this.collectionRepo.find({
      where: { id: In(otherCollectionIds) },
    });
    const siblingCollectionById = new Map(
      siblingCollections.map((collection) => [collection.id, collection]),
    );
    const siblingCollectionsByMediaServerId = new Map<string, Collection[]>();

    for (const collectionId of otherCollectionIds) {
      const siblingCollection = siblingCollectionById.get(collectionId);

      if (!siblingCollection) {
        continue;
      }

      const groupKey = siblingCollection.mediaServerId ?? `db:${collectionId}`;
      const group =
        siblingCollectionsByMediaServerId.get(groupKey) ?? ([] as Collection[]);

      group.push(siblingCollection);
      siblingCollectionsByMediaServerId.set(groupKey, group);
    }

    const mediaServer = await this.getMediaServer();
    const prunedCollectionIds: number[] = [];

    for (const siblingCollectionsGroup of siblingCollectionsByMediaServerId.values()) {
      const representativeCollection = siblingCollectionsGroup[0];

      if (representativeCollection.mediaServerId) {
        const failedItemIds = unconfirmedIds(
          await mediaServer.removeBatchFromCollection(
            representativeCollection.mediaServerId,
            [mediaServerId],
          ),
        );

        if (failedItemIds.has(mediaServerId)) {
          this.logger.warn(
            `Couldn't prune media ${mediaServerId} from sibling collection ${representativeCollection.mediaServerId}`,
          );
          continue;
        }
      }

      for (const siblingCollection of siblingCollectionsGroup) {
        await this.removeFromCollectionInternal(
          siblingCollection.id,
          [{ mediaServerId }],
          false,
          'all',
          true,
        );
        prunedCollectionIds.push(siblingCollection.id);
      }
    }

    return prunedCollectionIds;
  }

  private async removeFromCollectionInternal(
    collectionDbId: number,
    media: CollectionMediaChange[],
    skipAutomaticLinkCheck = false,
    removalScope: CollectionMediaRemovalScope = 'all',
    skipMediaServerRemove = false,
  ): Promise<Collection | undefined> {
    try {
      const mediaServer = await this.getMediaServer();
      let collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });

      if (!collection) {
        this.logger.warn(
          `Collection with id ${collectionDbId} not found, skipping removal`,
        );
        return undefined;
      }

      if (!skipAutomaticLinkCheck) {
        collection = await this.checkAutomaticMediaServerLink(collection);
      }

      let collectionMedia = await this.CollectionMediaRepo.find({
        where: {
          collectionId: collectionDbId,
        },
      });

      if (collectionMedia.length > 0) {
        const existingCollectionMediaById = new Map(
          collectionMedia.map((existingCollectionMedia) => [
            existingCollectionMedia.mediaServerId,
            existingCollectionMedia,
          ]),
        );
        const locallyHandledRemovals = new Set(
          await this.updateExistingCollectionMediaForRemoval(
            collection.id,
            media,
            existingCollectionMediaById,
            removalScope,
          ),
        );
        const childrenMedia = media.filter(
          (mediaItem) =>
            !locallyHandledRemovals.has(mediaItem.mediaServerId) &&
            collectionMedia.some(
              (existingMedia) =>
                existingMedia.mediaServerId === mediaItem.mediaServerId,
            ),
        );

        const removedItemIds =
          childrenMedia.length > 0
            ? new Set(
                await this.removeChildrenFromCollection(
                  {
                    mediaServerId: collection.mediaServerId,
                    dbId: collection.id,
                    manualCollection: collection.manualCollection,
                  },
                  childrenMedia,
                  // Deliberately not gated on the opt-in: a retained link means
                  // the teardown has not landed, and skipping the removal leaves
                  // a footprint nothing tracks for the leave to unlink over
                  // (#2766).
                  skipMediaServerRemove,
                ),
              )
            : new Set<string>();

        collectionMedia = collectionMedia.filter(
          (existingMedia) => !removedItemIds.has(existingMedia.mediaServerId),
        );

        if (removedItemIds.size > 0) {
          this.eventEmitter.emit(
            MaintainerrEvent.CollectionMedia_Removed,
            new CollectionMediaRemovedDto(
              childrenMedia.filter((m) => removedItemIds.has(m.mediaServerId)),
              collection.title,
              { type: 'collection', value: collection.id },
              collection.id,
              collection.deleteAfterDays,
            ),
          );
        }

        const isSharedManualCollection =
          collection.manualCollection &&
          collection.mediaServerId &&
          (await this.isMediaServerCollectionShared(collection));

        if (isSharedManualCollection) {
          await this.reconcileSharedManualCollectionState(collection, {
            removedMediaServerIds: removedItemIds,
          });
        }

        collectionMedia = await this.CollectionMediaRepo.find({
          where: {
            collectionId: collectionDbId,
          },
        });
        if (
          collectionMedia.length <= 0 &&
          !collection.manualCollection &&
          collection.mediaServerId &&
          // Kept in Maintainerr only: the removals above never reached the
          // server, so unlinking here would strand them - and their markers -
          // for a sibling to adopt. stopMediaServerSync owns this teardown and
          // runs later in the same rule execution.
          !collection.keepInMaintainerrOnly
        ) {
          // Another rule group with the same title may share this media
          // server collection. Deleting it would also wipe the sibling rule's
          // items, so just unlink locally and let the sibling keep ownership.
          const isShared = await this.isMediaServerCollectionShared(collection);

          if (isShared) {
            collection = await this.collectionRepo.save({
              ...collection,
              mediaServerId: null,
            });
          } else {
            try {
              await mediaServer.deleteCollection(collection.mediaServerId);
              collection = await this.collectionRepo.save({
                ...collection,
                mediaServerId: null,
              });
            } catch (error) {
              this.logger.warn('Failed to delete collection from media server');
              this.logger.debug(error);
            }
          }
        }
      }

      this.updateCollectionTotalSize(collectionDbId).catch(() => {});

      return collection;
    } catch (error) {
      this.logger.warn(
        `An error occurred while removing media from collection with internal id ${collectionDbId}`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  private async updateExistingCollectionMediaForAdd(
    collectionId: number,
    media: CollectionMediaChange[],
    existingCollectionMediaById: Map<string, CollectionMedia>,
    manual: boolean,
    manualMembershipSource: CollectionMediaManualMembershipSource,
  ): Promise<void> {
    for (const mediaItem of media) {
      const existingCollectionMedia = existingCollectionMediaById.get(
        mediaItem.mediaServerId,
      );

      if (!existingCollectionMedia) {
        continue;
      }

      const updatedCollectionMedia = await this.updateCollectionMediaMembership(
        existingCollectionMedia,
        manual
          ? {
              manualMembershipSource,
            }
          : {
              includedByRule: true,
            },
      );

      if (updatedCollectionMedia) {
        existingCollectionMediaById.set(
          updatedCollectionMedia.mediaServerId,
          updatedCollectionMedia,
        );
      }

      await this.CollectionLogRecordForChild(
        mediaItem.mediaServerId,
        collectionId,
        'add',
        mediaItem.reason,
      );
    }
  }

  private async updateExistingCollectionMediaForRemoval(
    collectionId: number,
    media: CollectionMediaChange[],
    existingCollectionMediaById: Map<string, CollectionMedia>,
    removalScope: CollectionMediaRemovalScope,
  ): Promise<string[]> {
    if (removalScope === 'all') {
      return [];
    }

    const locallyHandledRemovals: string[] = [];

    for (const mediaItem of media) {
      const existingCollectionMedia = existingCollectionMediaById.get(
        mediaItem.mediaServerId,
      );

      if (!existingCollectionMedia) {
        continue;
      }

      if (removalScope === 'rule') {
        if (!hasCollectionMediaRuleMembership(existingCollectionMedia)) {
          locallyHandledRemovals.push(mediaItem.mediaServerId);
          continue;
        }

        if (!hasCollectionMediaManualMembership(existingCollectionMedia)) {
          continue;
        }

        const updatedCollectionMedia =
          await this.updateCollectionMediaMembership(existingCollectionMedia, {
            includedByRule: false,
          });

        if (updatedCollectionMedia) {
          existingCollectionMediaById.set(
            updatedCollectionMedia.mediaServerId,
            updatedCollectionMedia,
          );
        } else {
          existingCollectionMediaById.delete(mediaItem.mediaServerId);
        }

        await this.CollectionLogRecordForChild(
          mediaItem.mediaServerId,
          collectionId,
          'remove',
          mediaItem.reason,
        );
        locallyHandledRemovals.push(mediaItem.mediaServerId);
        continue;
      }

      if (!hasCollectionMediaManualMembership(existingCollectionMedia)) {
        locallyHandledRemovals.push(mediaItem.mediaServerId);
        continue;
      }

      if (!hasCollectionMediaRuleMembership(existingCollectionMedia)) {
        continue;
      }

      const updatedCollectionMedia = await this.updateCollectionMediaMembership(
        existingCollectionMedia,
        {
          manualMembershipSource: null,
        },
      );

      if (updatedCollectionMedia) {
        existingCollectionMediaById.set(
          updatedCollectionMedia.mediaServerId,
          updatedCollectionMedia,
        );
      } else {
        existingCollectionMediaById.delete(mediaItem.mediaServerId);
      }

      await this.CollectionLogRecordForChild(
        mediaItem.mediaServerId,
        collectionId,
        'remove',
        mediaItem.reason,
      );
      locallyHandledRemovals.push(mediaItem.mediaServerId);
    }

    return locallyHandledRemovals;
  }

  private async updateCollectionMediaMembership(
    collectionMedia: CollectionMedia,
    membership: {
      includedByRule?: boolean;
      manualMembershipSource?: CollectionMediaManualMembershipSource | null;
    },
  ): Promise<CollectionMedia | undefined> {
    const nextIncludedByRule =
      membership.includedByRule ??
      hasCollectionMediaRuleMembership(collectionMedia);
    const nextManualMembershipSource =
      membership.manualMembershipSource !== undefined
        ? membership.manualMembershipSource
        : collectionMedia.manualMembershipSource;
    const nextRuleEvaluationFailed = false;

    if (!nextIncludedByRule && nextManualMembershipSource == null) {
      await this.CollectionMediaRepo.delete({ id: collectionMedia.id });
      return undefined;
    }

    if (
      (collectionMedia.includedByRule ?? null) === nextIncludedByRule &&
      (collectionMedia.manualMembershipSource ?? null) ===
        (nextManualMembershipSource ?? null) &&
      (collectionMedia.ruleEvaluationFailed ?? false) ===
        nextRuleEvaluationFailed
    ) {
      return collectionMedia;
    }

    return this.CollectionMediaRepo.save(
      this.CollectionMediaRepo.create({
        ...collectionMedia,
        includedByRule: nextIncludedByRule,
        manualMembershipSource: nextManualMembershipSource,
        ruleEvaluationFailed: nextRuleEvaluationFailed,
      }),
    );
  }

  private async insertCollectionMediaMembership(
    collectionId: number,
    mediaServerId: string,
    membership: {
      includedByRule: boolean;
      manualMembershipSource: CollectionMediaManualMembershipSource | null;
    },
    reason?: CollectionLogMeta,
  ): Promise<void> {
    const artwork = await this.resolveCollectionMediaArtwork(mediaServerId);

    await this.CollectionMediaRepo.save(
      this.CollectionMediaRepo.create({
        collectionId,
        mediaServerId,
        addDate: new Date().toDateString(),
        tmdbId: artwork.tmdbId,
        tvdbId: artwork.tvdbId,
        image_path: artwork.imagePath,
        includedByRule: membership.includedByRule,
        manualMembershipSource: membership.manualMembershipSource,
        ruleEvaluationFailed: false,
      }),
    );

    await this.CollectionLogRecordForChild(
      mediaServerId,
      collectionId,
      'add',
      reason,
    );

    // The item is a member again, so it is no longer a rule-removal orphan.
    await this.clearRuleRemovedMarker(collectionId, mediaServerId);
  }

  async removeFromAllCollections(media: CollectionMediaChange[]) {
    try {
      const collections = await this.collectionRepo.find();
      let removedEverywhere = true;
      for (const collection of collections) {
        // The helper reports its own failure by answering nothing rather than
        // throwing, so discarding the result reads a failed removal as done.
        const removed = await this.removeFromCollection(collection.id, media);
        removedEverywhere = removedEverywhere && removed !== undefined;
      }
      return removedEverywhere
        ? { status: 'OK', code: 1, message: 'Success' }
        : { status: 'NOK', code: 0, message: 'Failed' };
    } catch (error) {
      this.logger.warn(
        'An error occurred while removing media from all collections',
      );
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  async deleteCollection(collectionDbId: number): Promise<BasicResponseDto> {
    try {
      let collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });

      if (!collection) {
        this.logger.warn(
          `Collection with id ${collectionDbId} not found in database`,
        );
        return { status: 'OK', code: 1, message: 'Success' };
      }

      collection = await this.checkAutomaticMediaServerLink(collection);

      const teardown = await this.deleteMediaServerCollection(
        collection,
        'deleting',
      );

      if (!teardown.ok) {
        // The media server says why it refused - Plex names its own "allow
        // media deletion" setting - and this is a dead end until the user acts
        // on it, so the reason has to reach them. Leaving the row behind keeps
        // the collection recoverable rather than orphaning what is still there.
        return {
          status: 'NOK',
          code: 0,
          message:
            teardown.reason ?? 'Failed to delete collection from media server',
        };
      }
      // The state rows cascade away with the collection, so the posters have
      // to be restored while they can still be found.
      try {
        await this.overlayProcessor.revertCollection(collection.id);
      } catch (error) {
        this.logger.warn(
          `Failed to revert the overlays of collection "${collection.title}"; deleting it anyway`,
        );
        this.logger.debug(error);
      }

      return await this.RemoveCollectionFromDB(collection);
    } catch (error) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Deleting collection failed' };
    }
  }

  /**
   * Tear down a collection's media-server collection, keeping the local rows.
   * Never blocks on an unreachable server, and reports failure so the caller can
   * keep the link rather than orphaning it (#3344). Manual collections point at
   * a user-created collection, so they are left alone.
   *
   * Returns true when no media-server collection is left behind.
   */
  private async deleteMediaServerCollection(
    collection: Collection,
    context: string,
  ): Promise<{ ok: boolean; reason?: string; shared?: boolean }> {
    if (collection.manualCollection || !collection.mediaServerId) {
      return { ok: true };
    }

    // A sibling rule group with the same title points at this same collection.
    // Deleting it would take theirs with it, so leave it standing and take only
    // our own items out (#2766/#3344). Every teardown goes through here, so no
    // caller can delete a shared collection by reaching past this.
    if (await this.isMediaServerCollectionShared(collection)) {
      return {
        ok: await this.leaveSharedMediaServerCollection(collection),
        shared: true,
      };
    }

    try {
      const mediaServer = await this.getMediaServer();
      await mediaServer.deleteCollection(collection.mediaServerId);
      return { ok: true };
    } catch (error) {
      const reason = getErrorMessage(
        error,
        'Failed to delete collection from media server',
      );
      this.logger.warn(
        `Failed to delete media server collection ${collection.mediaServerId} for '${collection.title}' - ${context} anyway and keeping the link: ${reason}`,
      );
      this.logger.debug(error);
      return { ok: false, reason };
    }
  }

  /**
   * Take this collection's own members out of the media server collection it
   * shares with a sibling rule group, leaving whatever the sibling also holds.
   * A child no sibling holds would read as a foreign addition on their next run
   * and be adopted as a manual member of the wrong rule (#2766), force-kept
   * under that rule's deleteAfterDays.
   *
   * Returns true when nothing of ours is left behind.
   */
  private async leaveSharedMediaServerCollection(
    collection: Collection,
  ): Promise<boolean> {
    try {
      const siblingHeld = await this.getSiblingMemberMediaServerIds(collection);
      const memberIds = (
        await this.CollectionMediaRepo.find({
          where: { collectionId: collection.id },
        })
      ).map((member) => member.mediaServerId);
      // A rule-removed item has no row - only its marker records that the server
      // may still be holding it, and nothing reconciles that marker once we
      // unlink. Take those out too, or the sibling adopts them (#2766/#3298).
      const markerIds = [
        ...(await this.getRuleRemovedMarkers(collection.id)).keys(),
      ];
      const ownIds = [...new Set([...memberIds, ...markerIds])].filter(
        (mediaServerId) => !siblingHeld.has(mediaServerId),
      );

      if (ownIds.length === 0) {
        return true;
      }

      const mediaServer = await this.getMediaServer();
      // The batch reports the ids it could not remove rather than throwing. Any
      // one left behind is a foreign child to the sibling, so this counts as a
      // failure and the link stays until a later run clears it.
      const failed = unconfirmedIds(
        await mediaServer.removeBatchFromCollection(
          collection.mediaServerId,
          ownIds,
        ),
      );

      // A marker whose removal landed is resolved, even when others failed:
      // keeping it would make a later hand re-add look like an orphan and be
      // removed again (#3344). The failed ones stay, to retry with the link.
      await this.clearRuleRemovedMarkers(
        collection.id,
        markerIds.filter((markerId) => !failed.has(markerId)),
      );

      if (failed.size > 0) {
        this.logger.warn(
          `The media server kept ${failed.size} of '${collection.title}'s items in the collection it shares - keeping the link so the next run retries`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn(
        `Could not take '${collection.title}' out of the media server collection it shares - keeping the link so the next run retries`,
      );
      this.logger.debug(error);
      return false;
    }
  }

  /**
   * Release this collection's media server collection before a crucial setting
   * change repurposes it. A sibling rule group may point at the same collection,
   * so that one is left standing with only this collection's items taken out;
   * otherwise the old library's items are cleaned up, which drops a per-library
   * collection outright. Must run before the local rows go, since those are how
   * we know which items are ours. False means something was left behind.
   */
  public async releaseMediaServerCollectionForReset(
    collection: Collection,
  ): Promise<boolean> {
    if (!collection.mediaServerId) {
      return true;
    }

    if (await this.isMediaServerCollectionShared(collection)) {
      return this.leaveSharedMediaServerCollection(collection);
    }

    try {
      const mediaServer = await this.getMediaServer();
      await mediaServer.cleanupCollectionForLibrary(
        collection.mediaServerId,
        collection.libraryId,
        !!collection.manualCollection,
      );
      return true;
    } catch (error) {
      this.logger.debug(error);
      return false;
    }
  }

  /**
   * Turning "keep in Maintainerr only" on removes the collection from the media
   * server while every local row stays: membership, rules, actions, overlays and
   * *arr tags are unaffected. Called from the rule-group save so the teardown is
   * immediate, and from `checkAutomaticMediaServerLink` so it retries: a failed
   * delete keeps the link rather than orphaning it (#3344), and returns the
   * collection unchanged.
   */
  public async stopMediaServerSync(
    collection: Collection,
  ): Promise<Collection> {
    if (!collection.mediaServerId) {
      return collection;
    }

    if ((await this.deleteMediaServerCollection(collection, 'continuing')).ok) {
      this.logger.log(
        `Removed the media server collection for '${collection.title}' - it is now kept in Maintainerr only`,
      );
      return await this.saveCollection({ ...collection, mediaServerId: null });
    }

    return collection;
  }

  public async deactivateCollection(
    collectionDbId: number,
  ): Promise<BasicResponseDto> {
    try {
      const collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });

      const teardown = await this.deleteMediaServerCollection(
        collection,
        'deactivating',
      );

      // Our items are still on a collection a sibling rule group shares. The
      // rows and markers below are the only record of them, and an inactive
      // collection never runs again to retry - wiping them here would hand the
      // sibling those items to adopt as manual members (#2766). An unreachable
      // server still must not block a plain deactivation (#3344), so this only
      // refuses when the shared leave itself failed.
      if (!teardown.ok && teardown.shared) {
        this.logger.warn(
          `Not deactivating '${collection.title}': its items could not be taken out of the media server collection it shares with another rule group`,
        );
        return {
          status: 'NOK',
          code: 0,
          message:
            teardown.reason ??
            'Could not take this collection out of the media server collection it shares with another rule group',
        };
      }

      const mediaServerCollectionRemoved = teardown.ok;

      await this.CollectionMediaRepo.delete({ collectionId: collection.id });
      // Deactivation tears down the media-server collection but keeps the
      // collection row, so the FK cascade won't fire - drop the rule-removal
      // markers here too, mirroring the collection_media wipe above.
      await this.CollectionMediaRuleRemovalRepo.delete({
        collectionId: collection.id,
      });
      await this.saveCollection({
        ...collection,
        isActive: false,
        mediaServerId: mediaServerCollectionRemoved
          ? null
          : collection.mediaServerId,
      });

      await this.addLogRecord(
        { id: collectionDbId } as Collection,
        'Collection deactivated',
        ECollectionLogType.COLLECTION,
      );

      const rulegroup = await this.ruleGroupRepo.findOne({
        where: {
          collectionId: collection.id,
        },
      });
      if (rulegroup) {
        await this.ruleGroupRepo.save({
          ...rulegroup,
          isActive: false,
        });
      }

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      this.logger.debug(error);
      return {
        status: 'NOK',
        code: 0,
        message: 'An error occurred while deactivating the collection',
      };
    }
  }

  public async activateCollection(collectionDbId: number) {
    try {
      const collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });

      await this.saveCollection({
        ...collection,
        isActive: true,
      });

      await this.addLogRecord(
        { id: collectionDbId } as Collection,
        'Collection activated',
        ECollectionLogType.COLLECTION,
      );

      const rulegroup = await this.ruleGroupRepo.findOne({
        where: {
          collectionId: collection.id,
        },
      });
      if (rulegroup) {
        await this.ruleGroupRepo.save({
          ...rulegroup,
          isActive: true,
        });
      }
    } catch (error) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  /**
   * Returns the ids the media server rejected (drives the empty-collection
   * heal) and the ids whose local membership was persisted (drives the
   * added notification). An item missing from both sets was accepted by
   * the server but failed local persistence and got rolled back.
   */
  private async addChildrenToCollection(
    collectionIds: {
      mediaServerId: string;
      dbId: number;
      manualCollection: boolean;
    },
    childrenMedia: CollectionMediaChange[],
    manual = false,
    skipMediaServerAdd = false,
    manualMembershipSource = CollectionMediaManualMembershipSource.LOCAL,
  ): Promise<{
    serverRejectedIds: Set<string>;
    serverUnconfirmedIds: Set<string>;
    persistedIds: Set<string>;
  }> {
    if (childrenMedia.length === 0)
      return {
        serverRejectedIds: new Set(),
        serverUnconfirmedIds: new Set(),
        persistedIds: new Set(),
      };

    const mediaServer = await this.getMediaServer();

    this.logger.log(
      skipMediaServerAdd
        ? `Syncing ${childrenMedia.length} existing media items from media server to collection DB..`
        : `Adding ${childrenMedia.length} media items to collection..`,
    );

    let failedItemIds = new Set<string>();
    let refusedIds = new Set<string>();
    let unconfirmedAddIds: string[] = [];
    const persistedIds = new Set<string>();

    if (!skipMediaServerAdd) {
      const outcome = await mediaServer.addBatchToCollection(
        collectionIds.mediaServerId,
        childrenMedia.map((childMedia) => childMedia.mediaServerId),
      );
      failedItemIds = unconfirmedIds(outcome);
      refusedIds = new Set(outcome.refused);
      unconfirmedAddIds = outcome.unknown;
    }

    // An add nothing answered may well have been applied, leaving a server child
    // no collection_media row accounts for - which the manual child import would
    // then adopt as a hand-added member, force-kept and aged into
    // deleteAfterDays. Record it so the next run reconciles the child instead of
    // adopting it. Manual collections never reconcile markers, and with no link
    // there is nothing to reconcile against, so both are skipped as on the
    // removal side. Best-effort: this must not fail the add.
    //
    // Never for a MANUAL add: adoption is exactly what fulfils that request, so
    // suppressing it would leave the item on the server with no membership and
    // no rule to re-add it - the user's add silently doing nothing, forever.
    // `manual` is the membership argument; collectionIds.manualCollection is the
    // collection's kind, and the two are independent.
    if (
      unconfirmedAddIds.length > 0 &&
      !manual &&
      !collectionIds.manualCollection &&
      collectionIds.mediaServerId
    ) {
      try {
        await this.markRuleRemoved(
          collectionIds.dbId,
          unconfirmedAddIds,
          'add',
        );
      } catch (error) {
        this.logger.warn(
          `Failed to record unconfirmed add markers for collection ${collectionIds.dbId}`,
        );
        this.logger.debug(error);
      }
    }

    for (const childMedia of childrenMedia) {
      if (failedItemIds.has(childMedia.mediaServerId)) {
        this.logger.warn(
          `Couldn't add media ${childMedia.mediaServerId} to collection`,
        );
        continue;
      }

      try {
        await this.insertCollectionMediaMembership(
          collectionIds.dbId,
          childMedia.mediaServerId,
          {
            includedByRule: manual ? false : true,
            manualMembershipSource: manual ? manualMembershipSource : null,
          },
          childMedia.reason,
        );
        persistedIds.add(childMedia.mediaServerId);
      } catch (error) {
        this.logger.warn(
          `Couldn't add media ${childMedia.mediaServerId} to collection`,
        );
        this.logger.debug(error);

        // Only undo an add we actually made. When the item was already on the
        // server (a manual-membership sync, or a collection kept in Maintainerr
        // only) there is nothing to roll back, and removing it would destroy
        // server state over a local write failure - the next run re-syncs it.
        if (skipMediaServerAdd) {
          continue;
        }

        try {
          await mediaServer.removeFromCollection(
            collectionIds.mediaServerId,
            childMedia.mediaServerId,
          );
        } catch (rollbackError) {
          this.logger.warn(
            `Failed to roll back media ${childMedia.mediaServerId} after local add failure`,
          );
          this.logger.debug(rollbackError);
        }
      }
    }

    return {
      serverRejectedIds: refusedIds,
      serverUnconfirmedIds: new Set(unconfirmedAddIds),
      persistedIds,
    };
  }

  /**
   * Human-readable name for a media item in collection log messages: the title,
   * or a "Show - season N - episode M" composite for seasons/episodes.
   */
  private describeMediaForLog(mediaData: MediaItem): string {
    return isMediaType(mediaData.type, 'episode')
      ? `${mediaData.grandparentTitle} - season ${mediaData.parentIndex} - episode ${mediaData.index}`
      : isMediaType(mediaData.type, 'season')
        ? `${mediaData.parentTitle} - season ${mediaData.index}`
        : mediaData.title;
  }

  public async CollectionLogRecordForChild(
    mediaServerId: string,
    collectionId: number,
    type: 'add' | 'remove' | 'handle' | 'exclude' | 'include',
    logMeta?: CollectionLogMeta,
  ) {
    const mediaServer = await this.getMediaServer();
    const mediaData = await mediaServer.getMetadata(mediaServerId);

    if (mediaData) {
      const subject = this.describeMediaForLog(mediaData);
      await this.addLogRecord(
        { id: collectionId } as Collection,
        `${type === 'add' ? 'Added' : type === 'handle' ? 'Successfully handled' : type === 'exclude' ? 'Added a specific exclusion for' : type === 'include' ? 'Removed specific exclusion of' : 'Removed'} "${subject}"`,
        ECollectionLogType.MEDIA,
        logMeta,
      );
    }
  }

  private async removeChildrenFromCollection(
    collectionIds: {
      mediaServerId: string | null;
      dbId: number;
      manualCollection: boolean;
    },
    childrenMedia: CollectionMediaChange[],
    skipMediaServerRemove = false,
  ): Promise<string[]> {
    if (childrenMedia.length === 0) return [];

    this.logger.log(
      `Removing ${childrenMedia.length} media items from collection..`,
    );

    let failedItemIds = new Set<string>();
    if (collectionIds.mediaServerId && !skipMediaServerRemove) {
      const mediaServer = await this.getMediaServer();
      failedItemIds = unconfirmedIds(
        await mediaServer.removeBatchFromCollection(
          collectionIds.mediaServerId,
          childrenMedia.map((childMedia) => childMedia.mediaServerId),
        ),
      );
    }
    const removedItemIds: string[] = [];

    for (const childMedia of childrenMedia) {
      if (failedItemIds.has(childMedia.mediaServerId)) {
        this.logger.warn(
          `Couldn't remove media ${childMedia.mediaServerId} from collection`,
        );
        continue;
      }

      try {
        await this.connection
          .createQueryBuilder()
          .delete()
          .from(CollectionMedia)
          .where([
            {
              collectionId: collectionIds.dbId,
              mediaServerId: childMedia.mediaServerId,
            },
          ])
          .execute();

        await this.CollectionLogRecordForChild(
          childMedia.mediaServerId,
          collectionIds.dbId,
          'remove',
          childMedia.reason,
        );
        removedItemIds.push(childMedia.mediaServerId);
      } catch (error) {
        this.logger.warn(
          `Couldn't remove media ${childMedia.mediaServerId} from collection`,
        );
        this.logger.debug(error);
      }
    }

    // Persist a marker for rule-driven removals from an AUTOMATIC collection so
    // a later run can tell an orphan the media server never dropped from a
    // genuine manual addition. Manual collections never reconcile markers, so
    // writing them there would only accumulate dead rows.
    // Best-effort: a marker write must never fail an already-committed removal.
    // A marker records that the media server may still be holding an item a rule
    // removed. With no collection there to hold one it can never be reconciled,
    // so writing it would just accumulate a dead row per removal. A retained
    // link still counts - that is the failed-teardown case the leave reads.
    const removedIdSet = new Set(removedItemIds);
    const removedByRuleIds =
      collectionIds.manualCollection || !collectionIds.mediaServerId
        ? []
        : childrenMedia
            .filter(
              (childMedia) =>
                childMedia.reason?.type === 'media_removed_by_rule' &&
                removedIdSet.has(childMedia.mediaServerId),
            )
            .map((childMedia) => childMedia.mediaServerId);
    try {
      await this.markRuleRemoved(collectionIds.dbId, removedByRuleIds);
    } catch (error) {
      this.logger.warn(
        `Failed to record rule-removal markers for collection ${collectionIds.dbId}`,
      );
      this.logger.debug(error);
    }

    return removedItemIds;
  }

  private async addCollectionToDB(
    collection: ICollection,
    mediaServerId?: string,
  ): Promise<addCollectionDbResponse> {
    this.logger.log(`Adding collection to the database..`);
    try {
      const mediaServerType = await this.getMediaServerType();
      const insertResult = await this.connection
        .createQueryBuilder()
        .insert()
        .into(Collection)
        .values([
          {
            title: collection.title,
            description: collection.description,
            mediaServerId: mediaServerId,
            mediaServerType: mediaServerType,
            type: collection.type,
            libraryId: collection.libraryId,
            arrAction: collection.arrAction ? collection.arrAction : 0,
            isActive: collection.isActive,
            visibleOnRecommended: collection.visibleOnRecommended,
            visibleOnHome: collection.visibleOnHome,
            deleteAfterDays: collection.deleteAfterDays,
            listExclusions: collection.listExclusions,
            cleanupLeftoverFolders: collection.cleanupLeftoverFolders ?? false,
            forceSeerr: collection.forceSeerr,
            keepLogsForMonths: collection.keepLogsForMonths,
            tautulliWatchedPercentOverride:
              collection.tautulliWatchedPercentOverride ?? null,
            manualCollection:
              collection.manualCollection !== undefined
                ? collection.manualCollection
                : false,
            manualCollectionName:
              collection.manualCollectionName !== undefined
                ? collection.manualCollectionName
                : '',
            sonarrSettingsId: collection.sonarrSettingsId,
            radarrSettingsId: collection.radarrSettingsId,
            sportarrSettingsId: collection.sportarrSettingsId,
            // These were previously persisted only on update (updateCollection
            // spreads the whole ICollection); the create path listed columns
            // explicitly and dropped them, so a profile/tag chosen at create
            // time was silently lost until the first edit.
            radarrQualityProfileId: collection.radarrQualityProfileId ?? null,
            sonarrQualityProfileId: collection.sonarrQualityProfileId ?? null,
            sportarrQualityProfileId:
              collection.sportarrQualityProfileId ?? null,
            tagInArr: collection.tagInArr ?? false,
            keepInMaintainerrOnly: collection.keepInMaintainerrOnly ?? false,
            sortTitle: collection.sortTitle,
            mediaServerSort: collection.mediaServerSort ?? null,
            overlayEnabled: collection.overlayEnabled ?? false,
            overlayTemplateId: collection.overlayTemplateId ?? null,
          },
        ])
        .execute();

      // generatedMaps only returns auto-generated columns (like id), not the full row
      // We need to include mediaServerId since it was passed as a parameter
      const generatedId = insertResult.generatedMaps[0] as { id: number };
      const dbCol: addCollectionDbResponse = {
        id: generatedId.id,
        mediaServerId: mediaServerId,
        isActive: collection.isActive,
        visibleOnRecommended: collection.visibleOnRecommended,
        visibleOnHome: collection.visibleOnHome,
        deleteAfterDays: collection.deleteAfterDays,
        manualCollection: collection.manualCollection ?? false,
      };

      await this.addLogRecord(
        dbCol as Collection,
        'Collection Created',
        ECollectionLogType.COLLECTION,
      );
      return dbCol;
    } catch (error) {
      this.logger.error(
        'Something went wrong creating the collection in the database..',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  private async RemoveCollectionFromDB(
    collection: ICollection,
  ): Promise<BasicResponseDto> {
    this.logger.log(`Removing collection from database..`);
    try {
      await this.collectionRepo.delete(collection.id);

      // Drop any stored poster bytes; the media-server side is left alone -
      // Plex/Jellyfin will recompute a thumb from member items as usual.
      try {
        this.collectionPosterService.removeStoredPoster(collection.id);
      } catch (error) {
        this.logger.warn(
          `Failed to remove stored poster file for deleted collection ${collection.id}; orphaned`,
        );
        this.logger.debug(error);
      }

      this.eventEmitter.emit(MaintainerrEvent.Collection_Deleted, {
        collection,
      });

      this.logger.log(
        `Collection with id ${collection.id} has been removed from the database.`,
      );

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error(
        'Something went wrong deleting the collection from the database..',
      );
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Removing from DB failed' };
    }
  }

  /**
   * Find a collection in the media server by name. Undefined means the search
   * completed and nothing matched.
   *
   * @throws Error when the library could not be enumerated - callers must treat
   * that as "unknown" and neither unlink nor create.
   */
  public async findMediaServerCollection(
    name: string,
    libraryId: string,
    searchAllLibraries = false,
    expectedType?: MediaItemType,
  ): Promise<MediaCollection | undefined> {
    // Cannot search for collections without a valid library ID
    if (!libraryId || libraryId === '') {
      this.logger.debug(
        `[findMediaServerCollection] Skipping search - libraryId is empty`,
      );
      return undefined;
    }

    try {
      const mediaServer = await this.getMediaServer();

      // Primary lookup: the collection's own library.
      const found = await this.matchCollectionInLibrary(
        mediaServer,
        name,
        libraryId,
        expectedType,
      );
      if (found) {
        return found;
      }

      // Fallback for manual collections on servers where a single collection
      // can span libraries (Jellyfin/Emby BoxSets are server-global; Plex
      // collections are bound to one library). A manual collection reused
      // across e.g. a movie rule and a show rule may currently hold items from
      // one library only, so the server reports it under that library alone and
      // the own-library lookup misses. Search the remaining libraries so the
      // shared collection can still be located; once seeded it becomes
      // discoverable under its own library on subsequent runs.
      //
      // getLibraries() already returns only movie/show libraries (never
      // music/photos), so the search stays scoped to relevant types. The
      // movie<->show crossover is intentional and required: a BoxSet is one
      // server-global container that can hold both, and this fallback exists
      // precisely to let a show rule find a BoxSet currently populated with
      // movies only. Do not narrow this to the collection's own type - that
      // would reintroduce the bug. Matching reuses matchCollectionInLibrary so
      // the primary and fallback share one comparison; the name match only
      // bootstraps the first link, after which the stored mediaServerId is used.
      if (
        searchAllLibraries &&
        mediaServer.supportsFeature(
          MediaServerFeature.CROSS_LIBRARY_COLLECTIONS,
        )
      ) {
        const libraries = await mediaServer.getLibraries();
        let anyLibraryUnreadable = false;
        for (const library of libraries) {
          if (library.id === libraryId) {
            continue;
          }
          // Per-library guard: this scan is deliberately exhaustive, so one
          // unreadable library must not stop the others from being searched.
          // Only report "unknown" if nothing matched anywhere.
          try {
            const crossLibraryMatch = await this.matchCollectionInLibrary(
              mediaServer,
              name,
              library.id,
              expectedType,
            );
            if (crossLibraryMatch) {
              return crossLibraryMatch;
            }
          } catch (error) {
            anyLibraryUnreadable = true;
            this.logger.debug(error);
          }
        }

        if (anyLibraryUnreadable) {
          throw new Error(
            `Could not search every library for a collection named "${name}"`,
          );
        }
      }

      return undefined;
    } catch (error) {
      this.logger.warn(
        `Could not search library ${libraryId} for a collection named "${name}"`,
      );
      this.logger.debug(error);
      throw error;
    }
  }

  private async matchCollectionInLibrary(
    mediaServer: IMediaServerService,
    name: string,
    libraryId: string,
    expectedType?: MediaItemType,
  ): Promise<MediaCollection | undefined> {
    // Live read: a stale miss here creates a duplicate.
    const collections = await mediaServer.getCollections(libraryId, false);
    if (!collections) {
      return undefined;
    }
    const target = name.trim();
    const named = collections.filter(
      (coll) => coll.title.trim() === target && !coll.smart,
    );

    // An unknown type on either side matches: a false miss makes the caller
    // create a second collection beside the real one, which is the #3344 class
    // of bug and worse than adopting a mismatched one.
    const match = named.find(
      (coll) =>
        coll.type === undefined ||
        expectedType === undefined ||
        coll.type === expectedType,
    );

    if (!match && named.length > 0) {
      this.logger.warn(
        `A collection named "${target}" exists in library ${libraryId} but holds ${named[0].type} items, not ${expectedType} - leaving it alone.`,
      );
    }

    return match;
  }

  async getCollectionLogsWithPaging(
    id: number,
    { offset = 0, size = 25 }: { offset?: number; size?: number } = {},
    search: string = undefined,
    sort: 'ASC' | 'DESC' = 'DESC',
    filter: ECollectionLogType = undefined,
  ) {
    const queryBuilder =
      this.CollectionLogRepo.createQueryBuilder('collection_log');

    queryBuilder
      .where('collection_log.collectionId = :id', { id })
      .orderBy('id', sort)
      .skip(offset)
      .take(size);

    if (search !== undefined) {
      queryBuilder.andWhere('collection_log.message like :search', {
        search: `%${search}%`,
      });
    }
    if (filter !== undefined) {
      queryBuilder.andWhere('collection_log.type like :filter', {
        filter: `%${filter}%`,
      });
    }

    const itemCount = await queryBuilder.getCount();
    const { entities } = await queryBuilder.getRawAndEntities();

    return {
      totalSize: itemCount,
      items: entities ?? [],
    };
  }

  public async addLogRecord(
    collection: Collection,
    message: string,
    type: ECollectionLogType,
    meta?: CollectionLogMeta,
  ) {
    await this.connection
      .createQueryBuilder()
      .insert()
      .into(CollectionLog)
      .values([
        {
          collection,
          timestamp: new Date(),
          message,
          type,
          meta,
        },
      ])
      .execute();
  }

  public async removeAllCollectionLogs(collectionId: number) {
    await this.CollectionLogRepo.delete({ collection: { id: collectionId } });
  }

  /**
   * Remove old collection logs based on the provided collection ID and months.
   *
   * @param {number} collectionId - The ID of the collection to remove logs from
   * @param {number} months - The number of months to go back for log removal
   */
  async removeOldCollectionLogs(collection: Collection) {
    try {
      // If keepLogsForMonths is 0, no need to remove logs. User explicitly configured it to keep logs forever
      if (collection.keepLogsForMonths !== 0) {
        const currentDate = new Date();
        const configuredMonths = new Date(currentDate);

        // Calculate the target month and year
        let targetMonth = currentDate.getMonth() - collection.keepLogsForMonths;
        let targetYear = currentDate.getFullYear();

        // Adjust for negative months
        while (targetMonth < 0) {
          targetMonth += 12;
          targetYear -= 1;
        }

        // Ensure the day is within bounds for the target month
        const targetDay = Math.min(
          currentDate.getDate(),
          new Date(targetYear, targetMonth + 1, 0).getDate(),
        );

        configuredMonths.setMonth(targetMonth);
        configuredMonths.setFullYear(targetYear);
        configuredMonths.setDate(targetDay);

        // get all logs older than param
        const logs = await this.CollectionLogRepo.find({
          where: {
            collection: { id: collection.id },
            timestamp: LessThan(configuredMonths),
          },
        });

        if (logs.length > 0) {
          // delete all old logs
          await this.CollectionLogRepo.remove(logs);
          this.logger.log(
            `Removed ${logs.length} old collection log ${logs.length === 1 ? 'record' : 'records'} from collection '${collection.title}'`,
          );
          await this.addLogRecord(
            collection,
            `Removed ${logs.length} log ${logs.length === 1 ? 'record' : 'records'} older than ${collection.keepLogsForMonths} months`,
            ECollectionLogType.COLLECTION,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `An error occurred while removing old collection logs for collection '${collection?.title}'`,
      );
      this.logger.debug(error);
    }
  }

  /**
   * Calculate and cache the total file size (in bytes) for a collection.
   * Sums sizeBytes from mediaSources on each media item.
   * For show/season items without direct file sizes, traverses children.
   */
  async updateCollectionTotalSize(collectionId: number): Promise<void> {
    try {
      const collection = await this.collectionRepo.findOne({
        where: { id: collectionId },
      });
      if (!collection) return;

      const mediaServer = await this.getMediaServer();
      const collectionMedia = await this.CollectionMediaRepo.find({
        where: { collectionId },
      });

      if (collectionMedia.length === 0) {
        await this.collectionRepo.update(collectionId, {
          totalSizeBytes: null,
        });
        return;
      }

      let totalBytes = 0;
      let hasAnySize = false;

      // One read for the whole collection; per row it opened a request per
      // item against the media server on every handling run (#3449).
      const metadataById = new Map(
        (
          await mediaServer.getMetadataBatch(
            collectionMedia.map((media) => media.mediaServerId),
          )
        ).map((item) => [item.id, item]),
      );

      for (const media of collectionMedia) {
        const metadata = metadataById.get(media.mediaServerId);

        // Absent means gone or unreadable; either way keep the cached size.
        if (!metadata) continue;

        const itemSize = await this.resolveSizeFromMetadata(
          mediaServer,
          metadata,
        );

        if (itemSize != null && itemSize > 0) {
          totalBytes += itemSize;
          hasAnySize = true;
        }

        // Persist per-item size so cross-collection dedup in storage metrics
        // can count an item once even when it belongs to multiple collections.
        // Only overwrite when we successfully resolved a size; leave the cached
        // value alone on transient metadata failures so a single hiccup does
        // not clobber previously-known data.
        if (itemSize !== null && media.sizeBytes !== itemSize) {
          await this.CollectionMediaRepo.update(media.id, {
            sizeBytes: itemSize,
          });
        }
      }

      // A read that answered for nothing is a failed read, not an empty
      // collection: Emby 500s a whole batch over one unparseable id. Writing
      // null there would erase a known total, so keep the last one until a
      // read succeeds - a permanently bad id keeps poisoning its batch, so
      // that may not be the next run. Same principle as the per-row size above.
      if (metadataById.size === 0) return;

      await this.collectionRepo.update(collectionId, {
        totalSizeBytes: hasAnySize ? totalBytes : null,
      });
    } catch (error) {
      this.logger.debug(
        `Failed to update total size for collection ${collectionId}`,
      );
      this.logger.debug(error);
    }
  }

  /**
   * Resolve the on-disk size of a single media item via the media server,
   * falling back to summing children for shows/seasons. Returns null when
   * the lookup fails or the server reports no usable size.
   */
  async resolveItemSize(
    mediaServer: IMediaServerService,
    mediaServerId: string,
  ): Promise<number | null> {
    let metadata: MediaItem | undefined;

    try {
      metadata = await mediaServer.getMetadata(mediaServerId);
    } catch (error) {
      this.logger.debug(`Failed to get size for media ${mediaServerId}`);
      this.logger.debug(error);
      return null;
    }

    return metadata
      ? this.resolveSizeFromMetadata(mediaServer, metadata)
      : null;
  }

  /**
   * Size of an already-read item: its own files, or its children's for a show
   * or season that carries none. Null when nothing usable resolved, so one
   * bad item cannot fail the collection's total.
   */
  private async resolveSizeFromMetadata(
    mediaServer: IMediaServerService,
    metadata: MediaItem,
  ): Promise<number | null> {
    try {
      const directSize = this.sumMediaSourceSizes(metadata);
      if (directSize > 0) return directSize;
      if (metadata.type === 'show' || metadata.type === 'season') {
        const childSize = await this.getChildrenTotalSize(
          mediaServer,
          metadata,
        );
        if (childSize > 0) return childSize;
      }
      return null;
    } catch (error) {
      this.logger.debug(`Failed to get size for media ${metadata.id}`);
      this.logger.debug(error);
      return null;
    }
  }

  /**
   * Sum sizeBytes across all mediaSources on a MediaItem.
   */
  private sumMediaSourceSizes(item: MediaItem): number {
    if (!item.mediaSources?.length) return 0;
    return item.mediaSources.reduce(
      (sum, source) => sum + (source.sizeBytes || 0),
      0,
    );
  }

  /**
   * Recursively sum file sizes for child items (seasons → episodes).
   */
  private async getChildrenTotalSize(
    mediaServer: IMediaServerService,
    parent: MediaItem,
  ): Promise<number> {
    let total = 0;

    const children = await mediaServer.getChildrenMetadata(parent.id);
    for (const child of children) {
      const childSize = this.sumMediaSourceSizes(child);
      if (childSize > 0) {
        total += childSize;
      } else if (child.type === 'show' || child.type === 'season') {
        total += await this.getChildrenTotalSize(mediaServer, child);
      }
    }

    return total;
  }
}
