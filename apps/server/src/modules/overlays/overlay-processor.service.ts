import {
  MaintainerrEvent,
  OverlayResult,
  OverlayTemplate,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'fs';
import * as path from 'path';
import { dataDir as configDataDir } from '../../app/config/dataDir';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { CollectionsService } from '../collections/collections.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { OverlayAppliedDto } from '../events/events.dto';
import { MaintainerrLogger } from '../logging/logs.service';
import {
  OverlayRenderService,
  TemplateRenderContext,
} from './overlay-render.service';
import { OverlaySettingsService } from './overlay-settings.service';
import { OverlayStateService } from './overlay-state.service';
import { OverlayTemplateService } from './overlay-template.service';

export type ProcessorStatus = 'idle' | 'running' | 'error';

export interface ProcessorRunResult {
  processed: number;
  reverted: number;
  skipped: number;
  errors: number;
}

@Injectable()
export class OverlayProcessorService {
  public status: ProcessorStatus = 'idle';
  public lastRun: Date | null = null;
  public lastResult: ProcessorRunResult | null = null;

  private readonly dataDir: string;

  constructor(
    private readonly plexApi: PlexApiService,
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

  private getOriginalPosterPath(plexId: string): string {
    return path.join(this.dataDir, 'overlays', 'originals', `${plexId}.jpg`);
  }

  private async saveOriginalPoster(
    plexId: string,
    buffer: Buffer,
  ): Promise<string> {
    const filePath = this.getOriginalPosterPath(plexId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  private loadOriginalPoster(plexId: string): Buffer | null {
    const p = this.getOriginalPosterPath(plexId);
    if (fs.existsSync(p)) return fs.readFileSync(p);
    return null;
  }

  private deleteOriginalPoster(plexId: string): void {
    const p = this.getOriginalPosterPath(plexId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  // ── Revert ────────────────────────────────────────────────────────────────

  async revertItem(collectionId: number, mediaServerId: string): Promise<void> {
    if (!this.plexApi.isPlexSetup()) return;

    const originalBuf = this.loadOriginalPoster(mediaServerId);
    if (originalBuf) {
      try {
        await this.plexApi.setThumb(mediaServerId, originalBuf, 'image/jpeg');
        this.logger.log(`Restored original poster for item ${mediaServerId}`);
      } catch (err) {
        this.logger.warn(
          `Failed to restore original poster for ${mediaServerId}`,
        );
        this.logger.debug(err);
      }
    } else {
      this.logger.warn(
        `No saved original poster for ${mediaServerId}, cannot restore`,
      );
    }

    this.deleteOriginalPoster(mediaServerId);
    await this.stateService.removeState(collectionId, mediaServerId);
  }

  async revertCollection(collectionId: number): Promise<number> {
    const states = await this.stateService.getCollectionStates(collectionId);
    let reverted = 0;

    for (const state of states) {
      await this.revertItem(collectionId, state.mediaServerId);
      reverted++;
    }

    return reverted;
  }

  // ── Apply overlay to single item ──────────────────────────────────────────

  // ── Process single collection ─────────────────────────────────────────────

  async processCollection(
    collection: Collection & { collectionMedia: CollectionMedia[] },
  ): Promise<ProcessorRunResult> {
    const result: ProcessorRunResult = {
      processed: 0,
      reverted: 0,
      skipped: 0,
      errors: 0,
    };

    if (collection.deleteAfterDays == null) {
      this.logger.debug(
        `Collection "${collection.title}" has no deleteAfterDays set, skipping`,
      );
      return result;
    }

    const settings = await this.settingsService.getSettings();
    if (!settings.enabled) return result;

    // Auto-detect title card vs poster based on collection type
    const isTitleCard = collection.type === 'episode';
    const mode = isTitleCard ? 'titlecard' : 'poster';

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
      const plexId = mediaItem.mediaServerId;
      const deleteDate = this.getDeleteDate(
        mediaItem.addDate,
        collection.deleteAfterDays,
      );
      if (!deleteDate) continue;

      const daysLeft = this.getDaysLeft(deleteDate);
      const existingState = await this.stateService.getItemState(
        collection.id,
        plexId,
      );

      // Re-apply if not yet processed or if days-left changed
      const shouldApply =
        !existingState || existingState.daysLeftShown !== daysLeft;

      if (shouldApply) {
        this.logger.log(
          `Applying template overlay to item ${plexId} — ${daysLeft} day(s) left`,
        );
        const success = await this.applyTemplateOverlay(
          plexId,
          collection.id,
          deleteDate,
          template,
        );
        if (success) {
          result.processed++;
          // Emit notification event for successful overlay application
          this.eventEmitter.emit(
            MaintainerrEvent.Overlay_Applied,
            new OverlayAppliedDto(
              [{ mediaServerId: plexId }],
              collection.title,
              { type: 'collection', value: collection.id },
            ),
          );
        } else {
          result.errors++;
        }
      } else {
        result.skipped++;
      }
    }

    return result;
  }

  // ── Process all enabled collections ───────────────────────────────────────

  async processAllCollections(): Promise<ProcessorRunResult> {
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

    try {
      const settings = await this.settingsService.getSettings();
      if (!settings.enabled) {
        this.logger.log('Overlay feature is disabled, skipping');
        this.status = 'idle';
        return totalResult;
      }

      if (!this.plexApi.isPlexSetup()) {
        this.logger.warn('Plex is not configured, aborting overlay run');
        this.status = 'error';
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

      // Build set of all current plexIds across overlay-enabled collections
      const allCurrentPlexIds = new Set<string>();
      for (const coll of collections) {
        for (const item of coll.collectionMedia) {
          allCurrentPlexIds.add(item.mediaServerId);
        }
      }

      // Revert items no longer in any overlay-enabled collection
      const allStates = await this.stateService.getAllStates();
      for (const state of allStates) {
        if (!allCurrentPlexIds.has(state.mediaServerId)) {
          this.logger.log(
            `Item ${state.mediaServerId} no longer in any overlay collection, reverting`,
          );
          await this.revertItem(state.collectionId, state.mediaServerId);
          totalResult.reverted++;
        }
      }

      // Process each collection
      for (const coll of collections) {
        this.logger.log(
          `--- Processing: "${coll.title}" (${coll.collectionMedia.length} items) ---`,
        );
        const collResult = await this.processCollection(coll);
        totalResult.processed += collResult.processed;
        totalResult.reverted += collResult.reverted;
        totalResult.skipped += collResult.skipped;
        totalResult.errors += collResult.errors;
      }

      this.logger.log(
        `=== Overlay run complete: ${totalResult.processed} applied, ${totalResult.reverted} reverted, ${totalResult.skipped} skipped, ${totalResult.errors} errors ===`,
      );

      this.eventEmitter.emit(MaintainerrEvent.OverlayHandler_Finished);
      this.status = 'idle';
    } catch (err) {
      this.logger.error(
        `Unhandled error in overlay processor run: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.logger.debug(err);
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

    const allStates = await this.stateService.getAllStates();
    for (const state of allStates) {
      await this.revertItem(state.collectionId, state.mediaServerId);
    }

    await this.stateService.clearAllStates();
    this.logger.log('All overlays reset and state cleared');
  }

  // ── Template-based overlay application ────────────────────────────────────

  /**
   * Apply a template-based overlay to a single Plex item.
   */
  async applyTemplateOverlay(
    plexId: string,
    collectionId: number,
    deleteDate: Date,
    template: OverlayTemplate,
  ): Promise<boolean> {
    // Get poster
    const thumbPath = await this.plexApi.getBestPosterUrl(plexId);
    if (!thumbPath) {
      this.logger.warn(
        `Could not find poster URL for item ${plexId}, skipping`,
      );
      return false;
    }

    let posterBuf: Buffer;
    const savedOriginal = this.loadOriginalPoster(plexId);
    if (savedOriginal) {
      posterBuf = savedOriginal;
    } else {
      try {
        posterBuf = await this.plexApi.downloadPoster(thumbPath);
      } catch (err) {
        this.logger.warn(`Failed to download poster for ${plexId}`);
        this.logger.debug(err);
        return false;
      }
      await this.saveOriginalPoster(plexId, posterBuf);
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
    } catch (err) {
      this.logger.warn(
        `Template overlay rendering failed for ${plexId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.logger.debug(err);
      return false;
    }

    try {
      await this.plexApi.setThumb(
        plexId,
        Buffer.from(result.buffer),
        result.contentType,
      );
      await this.stateService.markProcessed(
        collectionId,
        plexId,
        this.getOriginalPosterPath(plexId),
        daysLeft,
      );
      return true;
    } catch (err) {
      this.logger.warn(`Failed to apply template overlay for ${plexId}`);
      this.logger.debug(err);
      return false;
    }
  }

  /**
   * Generate a preview image using a template's elements.
   */
  async generateTemplatePreview(
    plexId: string,
    template: OverlayTemplate,
  ): Promise<OverlayResult> {
    const thumbPath = await this.plexApi.getBestPosterUrl(plexId);
    if (!thumbPath) {
      throw new Error(`Could not find poster for Plex item ${plexId}`);
    }
    const posterBuf = await this.plexApi.downloadPoster(thumbPath);

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
