import {
  getCollectionDeleteDate,
  MaintainerrEvent,
  MediaItem,
  MediaItemType,
  OverlayProcessorRunResult,
  OverlayResult,
  overlayModeForType,
  OverlayTemplate,
  OverlayTemplateMode,
  ServarrAction,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { dataDir as configDataDir } from '../../app/config/dataDir';
import {
  ExecutionLockService,
  OVERLAY_EXECUTION_LOCK_KEY,
} from '../tasks/execution-lock.service';
import { resolveDescendants } from '../api/media-server/context-action.util';
import { readItemPresence } from '../api/media-server/item-presence.util';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import type { IMediaServerService } from '../api/media-server/media-server.interface';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { OverlayAppliedDto, OverlayRevertedDto } from '../events/events.dto';
import { MaintainerrLogger } from '../logging/logs.service';
import {
  OverlayRenderService,
  TemplateRenderContext,
} from './overlay-render.service';
import { OverlaySettingsService } from './overlay-settings.service';
import { OverlayStateService } from './overlay-state.service';
import { OverlayTemplateService } from './overlay-template.service';
import { OverlayProviderFactory } from './providers/overlay-provider.factory';
import { IOverlayProvider } from './providers/overlay-provider.interface';

export type ProcessorStatus = 'idle' | 'running' | 'error';

export type ProcessorRunResult = OverlayProcessorRunResult;

type RevertItemResult = 'restored' | 'failed' | 'no-backup' | 'item-gone';

type OverlayTarget = {
  itemId: string;
  deleteDate: Date;
  mode: OverlayTemplateMode;
};

type CoveredChildren = {
  ids: Set<string>;
  latest: Date;
  showId?: string;
};

@Injectable()
export class OverlayProcessorService {
  public status: ProcessorStatus = 'idle';
  public lastRun: Date | null = null;
  public lastResult: ProcessorRunResult | null = null;

  private readonly dataDir: string;

  private addUniqueMediaItem(
    items: { mediaServerId: string }[],
    mediaServerId: string,
  ): void {
    if (items.some((item) => item.mediaServerId === mediaServerId)) {
      return;
    }

    items.push({ mediaServerId });
  }

  private createEmptyResult(): ProcessorRunResult {
    return {
      processed: 0,
      reverted: 0,
      skipped: 0,
      errors: 0,
    };
  }

  constructor(
    private readonly providerFactory: OverlayProviderFactory,
    private readonly mediaServerFactory: MediaServerFactory,
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(CollectionMedia)
    private readonly collectionMediaRepo: Repository<CollectionMedia>,
    private readonly settingsService: OverlaySettingsService,
    private readonly stateService: OverlayStateService,
    private readonly renderService: OverlayRenderService,
    private readonly templateService: OverlayTemplateService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: MaintainerrLogger,
    private readonly executionLock: ExecutionLockService,
  ) {
    this.logger.setContext(OverlayProcessorService.name);
    this.dataDir = configDataDir;
  }

  // ── Date helpers ──────────────────────────────────────────────────────────

  private getDaysLeft(deleteDate: Date): number {
    const now = new Date();
    const diff = deleteDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  /**
   * A countdown only tells the truth when the collection takes the media on
   * that date. An unmonitor, a quality-profile change or "do nothing" never
   * does, so a collection set to one of those draws nothing at all - not its
   * members, and nothing that would have inherited from them (#3511).
   */
  private deletesOnSchedule(collection: Collection): boolean {
    return (
      collection.deleteAfterDays != null &&
      (collection.arrAction === ServarrAction.DELETE ||
        collection.arrAction === ServarrAction.DELETE_SHOW_IF_EMPTY ||
        collection.arrAction === ServarrAction.UNMONITOR_DELETE_ALL ||
        collection.arrAction === ServarrAction.UNMONITOR_DELETE_EXISTING)
    );
  }

  private getMemberTargets(
    collection: Collection & { collectionMedia: CollectionMedia[] },
  ): OverlayTarget[] {
    const mode = overlayModeForType(collection.type);
    const targets: OverlayTarget[] = [];
    for (const media of collection.collectionMedia) {
      const deleteDate = getCollectionDeleteDate(
        media.addDate,
        collection.deleteAfterDays,
      );
      if (deleteDate) {
        targets.push({ itemId: media.mediaServerId, deleteDate, mode });
      }
    }
    return targets;
  }

  // ── Overlay inheritance ───────────────────────────────────────────────────

  /**
   * Null when the server could not be asked. throwOnError: an empty list reads
   * as "no children", promoting a parent that merely could not be read.
   */
  private async readChildren(
    mediaServer: IMediaServerService,
    parentId: string,
    childType: MediaItemType,
  ): Promise<MediaItem[] | null> {
    try {
      return await mediaServer.getChildrenMetadata(parentId, childType, true);
    } catch (error) {
      this.logger.debug(error);
      return null;
    }
  }

  private cover(
    covered: Map<string, CoveredChildren>,
    parentId: string,
    childId: string,
    deleteDate: Date,
    showId?: string,
  ): void {
    const entry = covered.get(parentId);
    if (!entry) {
      covered.set(parentId, {
        ids: new Set([childId]),
        latest: deleteDate,
        showId,
      });
      return;
    }
    entry.ids.add(childId);
    if (deleteDate > entry.latest) entry.latest = deleteDate;
  }

  /**
   * Every child covered, or the parent stays in the library and must not be
   * drawn on. Specials are no exception: a season 0 that keeps its episode
   * files keeps the show, countdown expired and all (#3511).
   */
  private isFullyCovered(children: MediaItem[], covered: Set<string>): boolean {
    return (
      children.length > 0 && children.every((child) => covered.has(child.id))
    );
  }

  /**
   * What leaves the library with this collection's members, and so inherits
   * their countdown: everything under them, plus a parent left with nothing.
   * These are only drawn on, never added to the collection. The date shown is
   * the last child to go, when the parent empties.
   *
   * `complete` is false when part of the hierarchy could not be read, so the
   * caller can keep what it drew instead of reverting on a transient failure.
   */
  private async collectInheritedTargets(
    collection: Collection & { collectionMedia: CollectionMedia[] },
  ): Promise<{ targets: OverlayTarget[]; complete: boolean }> {
    // Callers only reach this for a collection that deletes on a schedule.
    if (collection.type === 'movie') return { targets: [], complete: true };

    const memberDates = new Map<string, Date>();
    for (const member of this.getMemberTargets(collection)) {
      memberDates.set(member.itemId, member.deleteDate);
    }
    if (memberDates.size === 0) return { targets: [], complete: true };

    let mediaServer: IMediaServerService;
    try {
      mediaServer = await this.mediaServerFactory.getService();
    } catch (error) {
      this.logger.warn(
        `No media server to resolve what leaves with collection "${collection.title}", keeping the overlays already applied`,
      );
      this.logger.debug(error);
      return { targets: [], complete: false };
    }

    const presence = await readItemPresence(
      mediaServer,
      [...memberDates.keys()],
      (error) => this.logger.debug(error),
    );

    // A member that is neither readable nor confirmed gone leaves it unknown.
    let complete =
      presence.found.size + presence.missing.size === memberDates.size;

    const targets = new Map<string, OverlayTarget>();
    const addTarget = (item: MediaItem, deleteDate: Date) => {
      if (memberDates.has(item.id)) return;
      targets.set(item.id, {
        itemId: item.id,
        deleteDate,
        mode: overlayModeForType(item.type),
      });
    };

    // Down: the deletion takes everything under the member with it.
    for (const member of presence.found.values()) {
      const deleteDate = memberDates.get(member.id);
      if (!deleteDate) continue;

      const descendants = await resolveDescendants(
        member,
        async (parentId, childType) => {
          const children = await this.readChildren(
            mediaServer,
            parentId,
            childType,
          );
          if (!children) complete = false;
          return children ?? [];
        },
      );
      for (const descendant of descendants) addTarget(descendant, deleteDate);
    }

    // Up: group the members under the parent that is losing them.
    const seasonsByShow = new Map<string, CoveredChildren>();
    const episodesBySeason = new Map<string, CoveredChildren>();
    const seasonsOfShow = new Map<string, MediaItem[] | null>();
    for (const member of presence.found.values()) {
      const deleteDate = memberDates.get(member.id);
      if (!deleteDate) continue;

      if (member.type === 'season' && member.parentId) {
        this.cover(seasonsByShow, member.parentId, member.id, deleteDate);
      }
      if (member.type === 'episode') {
        let seasonId = member.parentId;
        if (!seasonId && member.grandparentId && member.parentIndex != null) {
          // Plex omits the episode -> season link when the show hides its
          // seasons (Seasons: Hide, #3534). The show and the season number
          // survive, so recover the season from the show's children.
          if (!seasonsOfShow.has(member.grandparentId)) {
            seasonsOfShow.set(
              member.grandparentId,
              await this.readChildren(
                mediaServer,
                member.grandparentId,
                'season',
              ),
            );
          }
          const seasons = seasonsOfShow.get(member.grandparentId);
          if (!seasons) complete = false;
          seasonId = seasons?.find((s) => s.index === member.parentIndex)?.id;
        }
        if (!seasonId) continue;
        this.cover(
          episodesBySeason,
          seasonId,
          member.id,
          deleteDate,
          member.grandparentId,
        );
      }
    }

    for (const [seasonId, covered] of episodesBySeason) {
      const episodes = await this.readChildren(
        mediaServer,
        seasonId,
        'episode',
      );
      if (!episodes) {
        complete = false;
        continue;
      }
      if (!this.isFullyCovered(episodes, covered.ids)) continue;

      addTarget({ id: seasonId, type: 'season' } as MediaItem, covered.latest);
      if (covered.showId) {
        this.cover(seasonsByShow, covered.showId, seasonId, covered.latest);
      }
    }

    for (const [showId, covered] of seasonsByShow) {
      const seasons =
        seasonsOfShow.get(showId) ??
        (await this.readChildren(mediaServer, showId, 'season'));
      if (!seasons) {
        complete = false;
        continue;
      }
      if (!this.isFullyCovered(seasons, covered.ids)) continue;

      addTarget({ id: showId, type: 'show' } as MediaItem, covered.latest);
    }

    return { targets: [...targets.values()], complete };
  }

  // ── Poster backup helpers ─────────────────────────────────────────────────

  private getOriginalsDir(): string {
    return path.join(this.dataDir, 'overlays', 'originals');
  }

  private getOriginalPosterPath(mediaServerId: string): string {
    return path.join(this.getOriginalsDir(), `${mediaServerId}.jpg`);
  }

  private async saveOriginalPoster(
    mediaServerId: string,
    buffer: Buffer,
  ): Promise<string> {
    const filePath = this.getOriginalPosterPath(mediaServerId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  private loadOriginalPoster(mediaServerId: string): Buffer | null {
    const p = this.getOriginalPosterPath(mediaServerId);
    if (fs.existsSync(p)) return fs.readFileSync(p);
    return null;
  }

  private deleteOriginalPoster(mediaServerId: string): void {
    const p = this.getOriginalPosterPath(mediaServerId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  /** Every item whose original poster is still saved on disk. */
  private listBackedUpItemIds(): string[] {
    const dir = this.getOriginalsDir();
    if (!fs.existsSync(dir)) return [];
    const suffix = '.jpg';
    return fs
      .readdirSync(dir)
      .filter((name) => name.length > suffix.length && name.endsWith(suffix))
      .map((name) => name.slice(0, -suffix.length));
  }

  private async getOverlayCollections(): Promise<
    (Collection & { collectionMedia: CollectionMedia[] })[]
  > {
    // Collections that never delete are dropped here rather than skipped later,
    // so the run also reverts whatever they drew before their action changed.
    const collections = (
      (await this.collectionRepo.find({
        where: { overlayEnabled: true, isActive: true },
      })) as (Collection & { collectionMedia: CollectionMedia[] })[]
    ).filter((collection) => this.deletesOnSchedule(collection));

    for (const collection of collections) {
      collection.collectionMedia = await this.collectionMediaRepo.find({
        where: { collectionId: collection.id },
      });
    }
    return collections;
  }

  // ── Revert ────────────────────────────────────────────────────────────────

  /**
   * Revert one item. Reports whether the original poster was restored or the
   * restore failed, so callers can emit events and count retryable failures.
   *
   * Failure handling:
   *  - No backup on disk → nothing we can do; clear state so we stop tracking.
   *  - Item no longer on the media server → nothing left to restore;
   *    clear state and backup so we don't retry forever (Plex closes the
   *    connection mid-upload for deleted items, surfacing as EPIPE; this
   *    short-circuit keeps that off the run summary too).
   *  - Backup on disk, upload fails → keep both backup and state so a later
   *    run can retry cleanly. Destroying the only recovery data on a
   *    transient media-server outage would strand the item overlaid forever.
   *  - Backup on disk, upload succeeds → clear backup and state (revert done).
   */
  private async revertItemInternal(
    collectionId: number | null,
    mediaServerId: string,
    provider: IOverlayProvider,
  ): Promise<RevertItemResult> {
    // Null for a saved poster no state row claims - there is nothing to clear.
    const clearState = () =>
      collectionId == null
        ? Promise.resolve()
        : this.stateService.removeState(collectionId, mediaServerId);

    const originalBuf = this.loadOriginalPoster(mediaServerId);

    if (!originalBuf) {
      this.logger.warn(
        `No saved original poster for ${mediaServerId}, cannot restore`,
      );
      await clearState();
      return 'no-backup';
    }

    // A failed existence check (network blip, 5xx, auth, or a media-server
    // switch in progress) leaves `exists` optimistically true so the upload
    // still runs and any failure follows the existing retry path - we never
    // drop a backup on uncertainty. `getService()` is resolved inside the try
    // so its transient throws are caught here too.
    let exists = true;
    try {
      const mediaServer = await this.mediaServerFactory.getService();
      exists = await mediaServer.itemExists(mediaServerId);
    } catch (error) {
      this.logger.debug(error);
    }

    if (!exists) {
      this.logger.log(
        `Item ${mediaServerId} no longer exists on the media server, dropping overlay state and backup`,
      );
      this.deleteOriginalPoster(mediaServerId);
      await clearState();
      return 'item-gone';
    }

    try {
      await provider.uploadImage(mediaServerId, originalBuf, 'image/jpeg');
    } catch (error) {
      this.logger.warn(
        `Failed to restore original poster for ${mediaServerId}; keeping backup for retry`,
      );
      this.logger.debug(error);
      return 'failed';
    }

    this.logger.log(`Restored original poster for item ${mediaServerId}`);
    this.deleteOriginalPoster(mediaServerId);
    await clearState();
    return 'restored';
  }

  /**
   * A revert restores originals and deletes the backups a run is reading, so
   * the two must not interleave, the same reason a reset takes the lock. It
   * cannot skip like a run does, though: the caller deletes the collection
   * next and the state rows cascade with it, so a revert that never happens
   * leaves an overlay that nothing can take off afterwards - neither a later
   * run nor a reset, since both work from those rows (#3558).
   *
   * So it queues instead, on the same lock the runs take. The ids and the name
   * are read here, before the rows go, and the revert works from those.
   */
  async revertCollection(collectionId: number): Promise<number> {
    const states = await this.stateService.getCollectionStates(collectionId);
    const collectionName = (
      await this.collectionRepo.findOne({ where: { id: collectionId } })
    )?.title;

    const release = this.executionLock.tryAcquire(OVERLAY_EXECUTION_LOCK_KEY);
    if (!release) {
      // Queued rather than awaited: the caller is a collection delete, which
      // should not hang for the length of a run.
      this.logger.log(
        `Overlay processor is busy; reverting ${states.length} overlay(s) when it frees up`,
      );
      void this.revertWhenFree(collectionId, states, collectionName);
      return states.length;
    }

    await this.revertHolding(release, collectionId, states, collectionName);
    return states.length;
  }

  private async revertWhenFree(
    collectionId: number,
    states: { mediaServerId: string }[],
    collectionName?: string,
  ): Promise<void> {
    const release = await this.executionLock.acquire(
      OVERLAY_EXECUTION_LOCK_KEY,
    );
    try {
      await this.revertHolding(release, collectionId, states, collectionName);
    } catch (error) {
      this.logger.warn(
        `Failed to revert the overlays of "${collectionName ?? collectionId}"`,
      );
      this.logger.debug(error);
    }
  }

  private async revertHolding(
    release: () => void,
    collectionId: number,
    states: { mediaServerId: string }[],
    collectionName?: string,
  ): Promise<void> {
    this.status = 'running';
    try {
      await this.revertMultipleItems(collectionId, states, collectionName);
    } finally {
      this.status = 'idle';
      release();
    }
  }

  /**
   * Revert overlays for multiple items in the same collection. Aggregates
   * successful reverts into a single Overlay_Reverted event so callers don't
   * spam notifications when acting on a batch (bulk revert, CollectionMedia
   * removed events, etc.).
   */
  async revertMultipleItems(
    collectionId: number,
    mediaItems: { mediaServerId: string }[],
    collectionName?: string,
  ): Promise<void> {
    if (mediaItems.length === 0) return;

    const provider = await this.providerFactory.getProvider();
    if (!provider) {
      this.logger.warn(
        'Cannot revert overlays: no overlay provider for configured media server',
      );
      return;
    }

    const reverted: { mediaServerId: string }[] = [];
    for (const item of mediaItems) {
      try {
        const result = await this.revertItemInternal(
          collectionId,
          item.mediaServerId,
          provider,
        );

        if (result === 'restored') {
          reverted.push({ mediaServerId: item.mediaServerId });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to revert overlay for ${item.mediaServerId}; continuing batch`,
        );
        this.logger.debug(error);
      }
    }

    if (reverted.length === 0) return;

    const name =
      collectionName ??
      (await this.collectionRepo.findOne({ where: { id: collectionId } }))
        ?.title;
    if (!name) return;

    this.eventEmitter.emit(
      MaintainerrEvent.Overlay_Reverted,
      new OverlayRevertedDto(reverted, name, {
        type: 'collection',
        value: collectionId,
      }),
    );
  }

  // ── Process single collection ─────────────────────────────────────────────

  private async processCollectionInternal(
    collection: Collection & { collectionMedia: CollectionMedia[] },
    options: {
      inheritedTargets?: OverlayTarget[];
      appliedMediaItems?: { mediaServerId: string }[];
      force?: boolean;
    } = {},
  ): Promise<ProcessorRunResult> {
    const { appliedMediaItems, force = false } = options;
    const result = this.createEmptyResult();
    const processedMediaItems = appliedMediaItems ?? [];

    if (force) {
      this.logger.debug(
        `Force overlay processing requested for collection "${collection.title}"`,
      );
    }

    if (!this.deletesOnSchedule(collection)) {
      this.logger.debug(
        `Collection "${collection.title}" has no scheduled deletion to count down to, skipping`,
      );
      return result;
    }

    const settings = await this.settingsService.getSettings();
    if (!settings.enabled) return result;

    const provider = await this.providerFactory.getProvider();
    if (!provider) {
      this.logger.warn(
        `No overlay provider for configured media server; skipping collection "${collection.title}"`,
      );
      return result;
    }

    const mode = overlayModeForType(collection.type);

    // Resolve the template: collection override → default for mode → null
    const template = await this.templateService.resolveForCollection(
      collection.overlayTemplateId ?? null,
      mode,
    );

    if (!template) {
      this.logger.warn(
        `No overlay template found for collection "${collection.title}" (mode=${mode}). ` +
          `Set a default template or assign one to this collection.`,
      );
      return result;
    }

    this.logger.log(
      `Collection "${collection.title}" using template "${template.name}" (${mode})`,
    );

    const inheritedTargets =
      options.inheritedTargets ??
      (await this.collectInheritedTargets(collection)).targets;

    // Inherited items are not always of the collection's own kind, and one
    // template cannot render onto both posters and stills.
    const otherMode: OverlayTemplateMode =
      mode === 'poster' ? 'titlecard' : 'poster';
    let otherTemplate: OverlayTemplate | null = null;
    if (inheritedTargets.some((target) => target.mode === otherMode)) {
      otherTemplate = await this.templateService.resolveForCollection(
        collection.overlayTemplateId ?? null,
        otherMode,
      );
      if (!otherTemplate) {
        this.logger.warn(
          `No ${otherMode} overlay template found, skipping the inherited ${otherMode} items of "${collection.title}"`,
        );
      }
    }

    if (inheritedTargets.length > 0) {
      this.logger.log(
        `Collection "${collection.title}" also overlays ${inheritedTargets.length} item(s) that leave with it`,
      );
    }

    const targets: (OverlayTarget & { template: OverlayTemplate })[] = [];
    for (const member of this.getMemberTargets(collection)) {
      targets.push({ ...member, template });
    }
    for (const inherited of inheritedTargets) {
      const inheritedTemplate =
        inherited.mode === mode ? template : otherTemplate;
      if (!inheritedTemplate) {
        result.skipped++;
        continue;
      }
      targets.push({ ...inherited, template: inheritedTemplate });
    }

    for (const target of targets) {
      const itemId = target.itemId;
      const daysLeft = this.getDaysLeft(target.deleteDate);
      const existingState = await this.stateService.getItemState(
        collection.id,
        itemId,
      );

      // Forced runs bypass the stale-state skip so template changes can be reapplied.
      const shouldApply =
        force || !existingState || existingState.daysLeftShown !== daysLeft;

      if (shouldApply) {
        this.logger.log(
          `Applying template overlay to item ${itemId} - ${daysLeft} day(s) left`,
        );
        const success = await this.applyTemplateOverlay(
          itemId,
          collection.id,
          target.deleteDate,
          target.template,
          provider,
        );
        if (success) {
          result.processed++;
          this.addUniqueMediaItem(processedMediaItems, itemId);
        } else {
          result.errors++;
        }
      } else {
        result.skipped++;
      }
    }

    if (!appliedMediaItems && processedMediaItems.length > 0) {
      this.eventEmitter.emit(
        MaintainerrEvent.Overlay_Applied,
        new OverlayAppliedDto(processedMediaItems, collection.title, {
          type: 'collection',
          value: collection.id,
        }),
      );
    }

    return result;
  }

  async processCollection(
    collection: Collection & { collectionMedia: CollectionMedia[] },
    force = false,
  ): Promise<ProcessorRunResult> {
    const release = this.executionLock.tryAcquire(OVERLAY_EXECUTION_LOCK_KEY);
    if (!release) {
      this.logger.warn('Overlay processor is already running, skipping');
      return this.createEmptyResult();
    }

    this.status = 'running';

    try {
      return await this.processCollectionInternal(collection, { force });
    } finally {
      this.status = 'idle';
      release();
    }
  }

  // ── Process all enabled collections ───────────────────────────────────────

  async processAllCollections(force = false): Promise<ProcessorRunResult> {
    const release = this.executionLock.tryAcquire(OVERLAY_EXECUTION_LOCK_KEY);
    if (!release) {
      this.logger.warn('Overlay processor is already running, skipping');
      return this.createEmptyResult();
    }

    this.status = 'running';
    const totalResult = this.createEmptyResult();
    const appliedMediaItems: { mediaServerId: string }[] = [];
    const revertedMediaItems: { mediaServerId: string }[] = [];
    let finalStatus: ProcessorStatus = 'idle';

    if (force) {
      this.logger.debug(
        'Force overlay processing requested for all collections',
      );
    }

    try {
      const settings = await this.settingsService.getSettings();
      if (!settings.enabled) {
        this.logger.log('Overlay feature is disabled, skipping');
        return totalResult;
      }

      const provider = await this.providerFactory.getProvider();
      if (!provider || !(await provider.isAvailable())) {
        this.logger.warn(
          'Overlay processing skipped: no overlay provider available for the configured media server',
        );
        return totalResult;
      }

      this.eventEmitter.emit(MaintainerrEvent.OverlayHandler_Started);
      this.logger.log('=== Overlay processor started ===');

      // An empty list still runs: what an earlier run drew has to come off once
      // its collection stops drawing, and the revert loop below is what does it.
      const collections = await this.getOverlayCollections();

      this.logger.log(
        `Processing ${collections.length} overlay-enabled collection(s)`,
      );

      // Every id the overlay-enabled collections draw on: members + inherited.
      // Read from the member targets, not the raw membership, so a member the
      // run no longer draws on has its old overlay reverted below.
      const allCurrentItemIds = new Set<string>();
      for (const coll of collections) {
        for (const member of this.getMemberTargets(coll)) {
          allCurrentItemIds.add(member.itemId);
        }
      }

      const inheritedByCollection = new Map<number, OverlayTarget[]>();
      for (const coll of collections) {
        const inherited = await this.collectInheritedTargets(coll);
        // An item in an overlay collection keeps its own countdown.
        const targets = inherited.targets.filter(
          (target) => !allCurrentItemIds.has(target.itemId),
        );
        inheritedByCollection.set(coll.id, targets);
        for (const target of targets) {
          allCurrentItemIds.add(target.itemId);
        }

        // Hierarchy unresolved: hold what it drew instead of reverting it.
        if (!inherited.complete) {
          const states = await this.stateService.getCollectionStates(coll.id);
          for (const state of states) {
            allCurrentItemIds.add(state.mediaServerId);
          }
        }
      }

      // Revert items no longer in any overlay-enabled collection
      const allStates = await this.stateService.getAllStates();
      for (const state of allStates) {
        if (!allCurrentItemIds.has(state.mediaServerId)) {
          this.logger.log(
            `Item ${state.mediaServerId} no longer in any overlay collection, reverting`,
          );
          try {
            const result = await this.revertItemInternal(
              state.collectionId,
              state.mediaServerId,
              provider,
            );

            if (result === 'restored') {
              this.addUniqueMediaItem(revertedMediaItems, state.mediaServerId);
              totalResult.reverted++;
            } else if (result === 'failed') {
              totalResult.errors++;
            }
          } catch (error) {
            this.logger.warn(
              `Failed to revert stale overlay state for ${state.mediaServerId}; continuing run`,
            );
            this.logger.debug(error);
            totalResult.errors++;
          }
        }
      }

      // Process each collection
      for (const coll of collections) {
        this.logger.log(
          `--- Processing: "${coll.title}" (${coll.collectionMedia.length} items) ---`,
        );
        const collResult = await this.processCollectionInternal(coll, {
          inheritedTargets: inheritedByCollection.get(coll.id),
          appliedMediaItems,
          force,
        });
        totalResult.processed += collResult.processed;
        totalResult.reverted += collResult.reverted;
        totalResult.skipped += collResult.skipped;
        totalResult.errors += collResult.errors;
      }

      if (appliedMediaItems.length > 0) {
        this.eventEmitter.emit(
          MaintainerrEvent.Overlay_Applied,
          new OverlayAppliedDto(appliedMediaItems, 'All Collections'),
        );
      }

      if (revertedMediaItems.length > 0) {
        this.eventEmitter.emit(
          MaintainerrEvent.Overlay_Reverted,
          new OverlayRevertedDto(revertedMediaItems, 'All Collections'),
        );
      }

      this.logger.log(
        `=== Overlay run complete: ${totalResult.processed} applied, ${totalResult.reverted} reverted, ${totalResult.skipped} skipped, ${totalResult.errors} errors ===`,
      );

      this.eventEmitter.emit(MaintainerrEvent.OverlayHandler_Finished);
    } catch (error) {
      this.logger.error(
        `Unhandled error in overlay processor run: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.debug(error);
      this.eventEmitter.emit(MaintainerrEvent.OverlayHandler_Failed);
      finalStatus = 'error';
    } finally {
      this.status = finalStatus;
      release();
      this.lastRun = new Date();
      this.lastResult = totalResult;
    }

    return totalResult;
  }

  // ── Reset all overlays ────────────────────────────────────────────────────

  /**
   * Takes the same lock as a run: a reset restores originals and drops
   * the backups a concurrent run would be reading, so the two must never
   * interleave. The controller's own check cannot guarantee that on its own.
   */
  async resetAllOverlays(): Promise<void> {
    const release = this.executionLock.tryAcquire(OVERLAY_EXECUTION_LOCK_KEY);
    if (!release) {
      this.logger.warn('Overlay processor is already running, skipping reset');
      return;
    }

    this.status = 'running';
    this.logger.warn('Resetting all overlays...');
    // Reported through the same summary as a run, so a reset that could not
    // restore everything cannot read as a clean success.
    const summary = this.createEmptyResult();

    try {
      const provider = await this.providerFactory.getProvider();
      if (!provider) {
        this.logger.warn(
          'Cannot reset overlays: no overlay provider for configured media server',
        );
        return;
      }

      const allStates = await this.stateService.getAllStates();
      const tracked = new Set(allStates.map((state) => state.mediaServerId));
      // A saved original no state row claims is an upload whose state write
      // failed; the backup is the only record left that the artwork may have
      // been changed, so reset owns it too (#3549).
      const targets = [
        ...allStates.map((state) => ({
          collectionId: state.collectionId as number | null,
          mediaServerId: state.mediaServerId,
        })),
        ...this.listBackedUpItemIds()
          .filter((mediaServerId) => !tracked.has(mediaServerId))
          .map((mediaServerId) => ({ collectionId: null, mediaServerId })),
      ];

      const revertedMediaItems: { mediaServerId: string }[] = [];
      for (const target of targets) {
        try {
          const result = await this.revertItemInternal(
            target.collectionId,
            target.mediaServerId,
            provider,
          );

          if (result === 'restored') {
            this.addUniqueMediaItem(revertedMediaItems, target.mediaServerId);
            summary.reverted++;
          } else if (result === 'failed') {
            summary.errors++;
          }
        } catch (error) {
          this.logger.warn(
            `Failed to reset overlay for ${target.mediaServerId}; keeping state for retry`,
          );
          this.logger.debug(error);
          summary.errors++;
        }
      }

      if (revertedMediaItems.length > 0) {
        this.eventEmitter.emit(
          MaintainerrEvent.Overlay_Reverted,
          new OverlayRevertedDto(revertedMediaItems, 'All Collections'),
        );
      }

      this.logger.log('Overlay reset complete');
    } finally {
      this.status = 'idle';
      release();
      this.lastRun = new Date();
      this.lastResult = summary;
    }
  }

  // ── Template-based overlay application ────────────────────────────────────

  /**
   * Apply a template-based overlay to a single media-server item.
   */
  async applyTemplateOverlay(
    itemId: string,
    collectionId: number,
    deleteDate: Date,
    template: OverlayTemplate,
    provider: IOverlayProvider,
  ): Promise<boolean> {
    let posterBuf: Buffer;
    const savedOriginal = this.loadOriginalPoster(itemId);
    if (savedOriginal) {
      posterBuf = savedOriginal;
    } else {
      try {
        const downloaded = await provider.downloadImage(itemId);
        if (!downloaded) {
          this.logger.warn(
            `No ${template.mode} artwork available for item ${itemId}, skipping`,
          );
          return false;
        }
        posterBuf = downloaded;
      } catch (error) {
        this.logger.warn(`Failed to download poster for ${itemId}`);
        this.logger.debug(error);
        return false;
      }
      await this.saveOriginalPoster(itemId, posterBuf);
    }

    // Build render context - raw data; per-element formatting is done by the render service
    const daysLeft = this.getDaysLeft(deleteDate);
    const context: TemplateRenderContext = {
      deleteDate,
      daysLeft,
    };

    let result: OverlayResult;
    try {
      result = await this.renderService.renderFromTemplate(
        posterBuf,
        template.elements,
        template.canvasWidth,
        template.canvasHeight,
        context,
      );
    } catch (error) {
      this.logger.warn(
        `Template overlay rendering failed for ${itemId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.debug(error);
      // Nothing was uploaded, so a backup this pass just took records no
      // change. Leaving it would have reset restoring - and on Plex selecting
      // - a poster the item still has.
      if (!savedOriginal) this.deleteOriginalPoster(itemId);
      return false;
    }

    try {
      await provider.uploadImage(
        itemId,
        Buffer.from(result.buffer),
        result.contentType,
      );
      await this.stateService.markProcessed(
        collectionId,
        itemId,
        this.getOriginalPosterPath(itemId),
        daysLeft,
      );
      return true;
    } catch (error) {
      this.logger.warn(`Failed to apply template overlay for ${itemId}`);
      this.logger.debug(error);
      return false;
    }
  }

  /**
   * Generate a preview image using a template's elements. The provider
   * returns the item's own artwork (poster for movies/shows, still for
   * episodes) which is what every template renders onto.
   */
  async generateTemplatePreview(
    itemId: string,
    template: OverlayTemplate,
  ): Promise<OverlayResult> {
    const provider = await this.providerFactory.getProvider();
    if (!provider) {
      throw new Error(
        'Cannot generate preview: no overlay provider for configured media server',
      );
    }

    const posterBuf = await provider.downloadImage(itemId);
    if (!posterBuf) {
      throw new Error(
        `Could not find ${template.mode} artwork for item ${itemId}`,
      );
    }

    // Sample context: 14 days in the future
    const sampleDate = new Date();
    sampleDate.setDate(sampleDate.getDate() + 14);
    const context: TemplateRenderContext = {
      deleteDate: sampleDate,
      daysLeft: 14,
    };

    return this.renderService.renderFromTemplate(
      posterBuf,
      template.elements,
      template.canvasWidth,
      template.canvasHeight,
      context,
    );
  }
}
