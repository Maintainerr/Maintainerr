import {
  MaintainerrEvent,
  OverlayResult,
  OverlayTemplate,
  OverlayTemplateMode,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'fs';
import * as path from 'path';
import { dataDir as configDataDir } from '../../app/config/dataDir';
import { CollectionsService } from '../collections/collections.service';
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

export interface ProcessorRunResult {
  processed: number;
  reverted: number;
  skipped: number;
  errors: number;
}

type RevertItemResult = 'restored' | 'failed' | 'no-backup';

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

  constructor(
    private readonly providerFactory: OverlayProviderFactory,
    private readonly collectionsService: CollectionsService,
    private readonly settingsService: OverlaySettingsService,
    private readonly stateService: OverlayStateService,
    private readonly renderService: OverlayRenderService,
    private readonly templateService: OverlayTemplateService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(OverlayProcessorService.name);
    this.dataDir = configDataDir;
  }

  // ── Date helpers ──────────────────────────────────────────────────────────

  private getDeleteDate(
    addDate: string | Date,
    deleteAfterDays: number | null,
  ): Date | null {
    if (deleteAfterDays == null) return null;
    const d = new Date(addDate);
    d.setDate(d.getDate() + deleteAfterDays);
    return d;
  }

  private getDaysLeft(deleteDate: Date): number {
    const now = new Date();
    const diff = deleteDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  // ── Poster backup helpers ─────────────────────────────────────────────────

  private getOriginalPosterPath(mediaServerId: string): string {
    return path.join(
      this.dataDir,
      'overlays',
      'originals',
      `${mediaServerId}.jpg`,
    );
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

  // ── Revert ────────────────────────────────────────────────────────────────

  /**
   * Revert one item. Reports whether the original poster was restored or the
   * restore failed, so callers can emit events and count retryable failures.
   *
   * Failure handling:
   *  - No backup on disk → nothing we can do; clear state so we stop tracking.
   *  - Backup on disk, upload fails → keep both backup and state so a later
   *    run can retry cleanly. Destroying the only recovery data on a
   *    transient media-server outage would strand the item overlaid forever.
   *  - Backup on disk, upload succeeds → clear backup and state (revert done).
   */
  private async revertItemInternal(
    collectionId: number,
    mediaServerId: string,
    provider: IOverlayProvider,
  ): Promise<RevertItemResult> {
    const originalBuf = this.loadOriginalPoster(mediaServerId);

    if (!originalBuf) {
      this.logger.warn(
        `No saved original poster for ${mediaServerId}, cannot restore`,
      );
      await this.stateService.removeState(collectionId, mediaServerId);
      return 'no-backup';
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
    await this.stateService.removeState(collectionId, mediaServerId);
    return 'restored';
  }

  async revertCollection(collectionId: number): Promise<number> {
    const states = await this.stateService.getCollectionStates(collectionId);
    await this.revertMultipleItems(collectionId, states);
    return states.length;
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
      (await this.collectionsService.getCollection(collectionId))?.title;
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

  async processCollection(
    collection: Collection & { collectionMedia: CollectionMedia[] },
    appliedMediaItems?: { mediaServerId: string }[],
    force = false,
  ): Promise<ProcessorRunResult> {
    const result: ProcessorRunResult = {
      processed: 0,
      reverted: 0,
      skipped: 0,
      errors: 0,
    };
    const processedMediaItems = appliedMediaItems ?? [];

    if (force) {
      this.logger.debug(
        `Force overlay processing requested for collection "${collection.title}"`,
      );
    }

    if (collection.deleteAfterDays == null) {
      this.logger.debug(
        `Collection "${collection.title}" has no deleteAfterDays set, skipping`,
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

    // Auto-detect title card vs poster based on collection type
    const mode: OverlayTemplateMode =
      collection.type === 'episode' ? 'titlecard' : 'poster';

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

    for (const mediaItem of collection.collectionMedia) {
      const itemId = mediaItem.mediaServerId;
      const deleteDate = this.getDeleteDate(
        mediaItem.addDate,
        collection.deleteAfterDays,
      );
      if (!deleteDate) continue;

      const daysLeft = this.getDaysLeft(deleteDate);
      const existingState = await this.stateService.getItemState(
        collection.id,
        itemId,
      );

      // Forced runs bypass the stale-state skip so template changes can be reapplied.
      const shouldApply =
        force || !existingState || existingState.daysLeftShown !== daysLeft;

      if (shouldApply) {
        this.logger.log(
          `Applying template overlay to item ${itemId} — ${daysLeft} day(s) left`,
        );
        const success = await this.applyTemplateOverlay(
          itemId,
          collection.id,
          deleteDate,
          template,
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

  // ── Process all enabled collections ───────────────────────────────────────

  async processAllCollections(force = false): Promise<ProcessorRunResult> {
    if (this.status === 'running') {
      this.logger.warn('Overlay processor is already running, skipping');
      return { processed: 0, reverted: 0, skipped: 0, errors: 0 };
    }

    this.status = 'running';
    const totalResult: ProcessorRunResult = {
      processed: 0,
      reverted: 0,
      skipped: 0,
      errors: 0,
    };
    const appliedMediaItems: { mediaServerId: string }[] = [];
    const revertedMediaItems: { mediaServerId: string }[] = [];

    if (force) {
      this.logger.debug(
        'Force overlay processing requested for all collections',
      );
    }

    try {
      const settings = await this.settingsService.getSettings();
      if (!settings.enabled) {
        this.logger.log('Overlay feature is disabled, skipping');
        this.status = 'idle';
        return totalResult;
      }

      const provider = await this.providerFactory.getProvider();
      if (!provider || !(await provider.isAvailable())) {
        this.logger.warn(
          'Overlay processing skipped: no overlay provider available for the configured media server',
        );
        this.status = 'idle';
        return totalResult;
      }

      this.eventEmitter.emit(MaintainerrEvent.OverlayHandler_Started);
      this.logger.log('=== Overlay processor started ===');

      // Get all collections with overlay enabled
      const collections =
        await this.collectionsService.getCollectionsWithOverlayEnabled();

      if (!collections.length) {
        this.logger.log('No collections have overlays enabled');
        this.status = 'idle';
        return totalResult;
      }

      this.logger.log(
        `Processing ${collections.length} overlay-enabled collection(s)`,
      );

      // Build set of all current item ids across overlay-enabled collections
      const allCurrentItemIds = new Set<string>();
      for (const coll of collections) {
        for (const item of coll.collectionMedia) {
          allCurrentItemIds.add(item.mediaServerId);
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
        const collResult = await this.processCollection(
          coll,
          appliedMediaItems,
          force,
        );
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
      this.status = 'idle';
    } catch (error) {
      this.logger.error(
        `Unhandled error in overlay processor run: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.debug(error);
      this.eventEmitter.emit(MaintainerrEvent.OverlayHandler_Failed);
      this.status = 'error';
    } finally {
      this.lastRun = new Date();
      this.lastResult = totalResult;
    }

    return totalResult;
  }

  // ── Reset all overlays ────────────────────────────────────────────────────

  async resetAllOverlays(): Promise<void> {
    this.logger.warn('Resetting all overlays...');

    const provider = await this.providerFactory.getProvider();
    if (!provider) {
      this.logger.warn(
        'Cannot reset overlays: no overlay provider for configured media server',
      );
      return;
    }

    const allStates = await this.stateService.getAllStates();
    const revertedMediaItems: { mediaServerId: string }[] = [];
    for (const state of allStates) {
      try {
        const result = await this.revertItemInternal(
          state.collectionId,
          state.mediaServerId,
          provider,
        );

        if (result === 'restored') {
          this.addUniqueMediaItem(revertedMediaItems, state.mediaServerId);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to reset overlay for ${state.mediaServerId}; keeping state for retry`,
        );
        this.logger.debug(error);
      }
    }

    if (revertedMediaItems.length > 0) {
      this.eventEmitter.emit(
        MaintainerrEvent.Overlay_Reverted,
        new OverlayRevertedDto(revertedMediaItems, 'All Collections'),
      );
    }

    this.logger.log('Overlay reset complete');
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

    // Build render context — raw data; per-element formatting is done by the render service
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
