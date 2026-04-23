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
import { MaintainerrLogger } from '../logging/logs.service';
import {
  OverlayRenderService,
  TemplateRenderContext,
} from './overlay-render.service';
import { OverlaySettingsService } from './overlay-settings.service';
import { OverlayStateService } from './overlay-state.service';
import { OverlayTemplateService } from './overlay-template.service';
import { MediaServerFactory } from '../api/media-server/media-server.factory';


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
    private readonly mediaServerFactory: MediaServerFactory,
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

  async revertItem(collectionId: number, mediaServerId: string): Promise<void> {
    const originalBuf = this.loadOriginalPoster(mediaServerId);
    if (originalBuf) {
      try {
        const service = await this.mediaServerFactory.getService();
        const posterobject: OverlayResult = { buffer: originalBuf, contentType: 'image/jpeg' };
        await service.setPoster(mediaServerId, posterobject);
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
      const mediaServerId = mediaItem.mediaServerId;
      const deleteDate = this.getDeleteDate(
        mediaItem.addDate,
        collection.deleteAfterDays,
      );
      if (!deleteDate) continue;

      const daysLeft = this.getDaysLeft(deleteDate);
      const existingState = await this.stateService.getItemState(
        collection.id,
        mediaServerId,
      );

      // Re-apply if not yet processed or if days-left changed
      const shouldApply =
        !existingState || existingState.daysLeftShown !== daysLeft;

      if (shouldApply) {
        this.logger.log(
          `Applying template overlay to item ${mediaServerId} — ${daysLeft} day(s) left`,
        );
        const success = await this.applyTemplateOverlay(
          mediaServerId,
          collection.id,
          deleteDate,
          template,
        );
        if (success) {
          result.processed++;
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

      // Build set of all current mediaServerIds across overlay-enabled collections
      const allCurrentmediaServerIds = new Set<string>();
      for (const coll of collections) {
        for (const item of coll.collectionMedia) {
          allCurrentmediaServerIds.add(item.mediaServerId);
        }
      }

      // Revert items no longer in any overlay-enabled collection
      const allStates = await this.stateService.getAllStates();
      for (const state of allStates) {
        if (!allCurrentmediaServerIds.has(state.mediaServerId)) {
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
   * Apply a template-based overlay to a single Media-server item.
   */
  async applyTemplateOverlay(
    mediaServerItemId: string,
    collectionId: number,
    deleteDate: Date,
    template: OverlayTemplate,
  ): Promise<boolean> {
    let posterBuf: Buffer;
    const savedOriginal = this.loadOriginalPoster(mediaServerItemId);
    if (savedOriginal) {
      posterBuf = savedOriginal;
    } else {
      try {
        posterBuf = await (
          await this.mediaServerFactory.getService()
        ).getPoster(mediaServerItemId);
        if (!posterBuf) {
          this.logger.warn(
            `Could not find poster URL for item ${mediaServerItemId}, skipping`,
          );
          return false;
        }
      } catch (err) {
        this.logger.warn(`Failed to download poster for ${mediaServerItemId}`);
        this.logger.debug(err);
        return false;
      }
      await this.saveOriginalPoster(mediaServerItemId, posterBuf);
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
        `Template overlay rendering failed for ${mediaServerItemId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.logger.debug(err);
      return false;
    }

    try {
      await this.saveOriginalPoster('test', Buffer.from(result.buffer));
      await (
        await this.mediaServerFactory.getService()
      ).setPoster(mediaServerItemId, result);

      await this.stateService.markProcessed(
        collectionId,
        mediaServerItemId,
        this.getOriginalPosterPath(mediaServerItemId),
        daysLeft,
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `Failed to apply template overlay for ${mediaServerItemId}`,
      );
      this.logger.debug(err);
      return false;
    }
  }

  /**
   * Generate a preview image using a template's elements.
   */
  async generateTemplatePreview(
    mediaServerId: string,
    template: OverlayTemplate,
  ): Promise<OverlayResult> {
    const thumbPath = await this.plexApi.getBestPosterUrl(mediaServerId);
    if (!thumbPath) {
      throw new Error(`Could not find poster for Plex item ${mediaServerId}`);
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
