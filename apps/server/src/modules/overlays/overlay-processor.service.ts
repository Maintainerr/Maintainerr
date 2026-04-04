import {
    FrameConfig,
    MaintainerrEvent,
    OverlayRenderOptions,
    OverlayResult,
    OverlaySettings,
    OverlayStyleConfig,
    OverlayTextConfig,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { format as dateFnsFormat, type Locale } from 'date-fns';
import * as dateFnsLocales from 'date-fns/locale';
import * as fs from 'fs';
import * as path from 'path';
import { dataDir as configDataDir } from '../../app/config/dataDir';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { CollectionsService } from '../collections/collections.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { OverlayRenderService } from './overlay-render.service';
import { OverlaySettingsService } from './overlay-settings.service';
import { OverlayStateService } from './overlay-state.service';

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
    if (!deleteAfterDays) return null;
    const d = new Date(addDate);
    d.setDate(d.getDate() + deleteAfterDays);
    return d;
  }

  private getDaysLeft(deleteDate: Date): number {
    const now = new Date();
    const diff = deleteDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  private ordinalSuffix(n: number): string {
    const abs = Math.abs(n);
    const lastTwo = abs % 100;
    if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
    switch (abs % 10) {
      case 1:
        return `${n}st`;
      case 2:
        return `${n}nd`;
      case 3:
        return `${n}rd`;
      default:
        return `${n}th`;
    }
  }

  formatDateLabel(deleteDate: Date, textCfg: OverlayTextConfig): string {
    let label: string;

    if (textCfg.useDays) {
      const days = this.getDaysLeft(deleteDate);
      if (days === 0) {
        label = textCfg.textToday;
      } else if (days === 1) {
        label = textCfg.textDay;
      } else {
        label = textCfg.textDays.replace('{0}', String(days));
      }
    } else {
      try {
        label = `${textCfg.overlayText} ${dateFnsFormat(
          deleteDate,
          this.convertDateFormat(textCfg.dateFormat),
          { locale: this.resolveLocale(textCfg.language) },
        )}`;

        if (textCfg.enableDaySuffix && textCfg.language.startsWith('en')) {
          const day = deleteDate.getDate();
          const suffix = this.ordinalSuffix(day);
          label = label.replace(new RegExp(`\\b${day}\\b`), suffix);
        }
      } catch {
        label = `${textCfg.overlayText} ${deleteDate.toLocaleDateString()}`;
      }
    }

    if (textCfg.enableUppercase) label = label.toUpperCase();
    return label;
  }

  private resolveLocale(language: string): Locale | undefined {
    const key = language.replace('-', '') || language.split('-')[0];
    const byFull = (dateFnsLocales as Record<string, Locale>)[key];
    if (byFull) return byFull;
    const primary = language.split('-')[0];
    return (dateFnsLocales as Record<string, Locale>)[primary];
  }

  private convertDateFormat(fmt: string): string {
    return fmt
      .replace(/MMMM/g, 'MMMM')
      .replace(/MMM/g, 'MMM')
      .replace(/MM/g, 'MM')
      .replace(/\bM\b/g, 'M')
      .replace(/dddd/g, 'EEEE')
      .replace(/ddd/g, 'EEE')
      .replace(/\bdd\b/g, 'dd')
      .replace(/\bd\b/g, 'd')
      .replace(/yyyy/g, 'yyyy')
      .replace(/\byy\b/g, 'yy');
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

  async revertItem(
    collectionId: number,
    mediaServerId: string,
  ): Promise<void> {
    if (!this.plexApi.isPlexSetup()) return;

    const originalBuf = this.loadOriginalPoster(mediaServerId);
    if (originalBuf) {
      try {
        await this.plexApi.setThumb(mediaServerId, originalBuf, 'image/jpeg');
        this.logger.log(
          `Restored original poster for item ${mediaServerId}`,
        );
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

  private async applyOverlay(
    plexId: string,
    collectionId: number,
    label: string,
    deleteDate: Date,
    settings: OverlaySettings,
    isTitleCard: boolean,
  ): Promise<boolean> {
    const overlayStyle: OverlayStyleConfig = isTitleCard
      ? settings.titleCardOverlayStyle
      : settings.posterOverlayStyle;
    const frameCfg: FrameConfig = isTitleCard
      ? settings.titleCardFrame
      : settings.posterFrame;
    const textCfg: OverlayTextConfig = isTitleCard
      ? settings.titleCardOverlayText
      : settings.posterOverlayText;

    // Get poster URL from Plex
    const thumbPath = await this.plexApi.getBestPosterUrl(plexId);
    if (!thumbPath) {
      this.logger.warn(
        `Could not find poster URL for item ${plexId}, skipping`,
      );
      return false;
    }

    // Use saved original as base to prevent stacking overlays on re-apply
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

    // Build render options
    const overlayOpts: OverlayRenderOptions = {
      text: label,
      fontPath: overlayStyle.fontPath,
      fontColor: overlayStyle.fontColor,
      backColor: overlayStyle.backColor,
      fontSize: overlayStyle.fontSize,
      padding: overlayStyle.padding,
      backRadius: overlayStyle.backRadius,
      horizontalOffset: overlayStyle.horizontalOffset,
      horizontalAlign: overlayStyle.horizontalAlign,
      verticalOffset: overlayStyle.verticalOffset,
      verticalAlign: overlayStyle.verticalAlign,
      overlayBottomCenter: overlayStyle.overlayBottomCenter,
      useFrame: frameCfg.useFrame,
      frameColor: frameCfg.frameColor,
      frameWidth: frameCfg.frameWidth,
      frameRadius: frameCfg.frameRadius,
      frameInnerRadius: frameCfg.frameInnerRadius,
      frameInnerRadiusMode: frameCfg.frameInnerRadiusMode,
      frameInset: frameCfg.frameInset,
      dockStyle: frameCfg.dockStyle,
      dockPosition: frameCfg.dockPosition,
    };

    let result: OverlayResult;
    try {
      result = await this.renderService.renderOverlay(posterBuf, overlayOpts);
    } catch (err) {
      this.logger.warn(`Overlay rendering failed for ${plexId}`);
      this.logger.debug(err);
      return false;
    }

    // Upload and select
    try {
      await this.plexApi.setThumb(plexId, Buffer.from(result.buffer), result.contentType);

      const daysLeftShown = textCfg.useDays
        ? this.getDaysLeft(deleteDate)
        : null;
      await this.stateService.markProcessed(
        collectionId,
        plexId,
        this.getOriginalPosterPath(plexId),
        daysLeftShown,
      );

      return true;
    } catch (err) {
      this.logger.warn(`Failed to apply overlay for ${plexId}`);
      this.logger.debug(err);
      return false;
    }
  }

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

    if (!collection.deleteAfterDays) {
      this.logger.debug(
        `Collection "${collection.title}" has no deleteAfterDays set, skipping`,
      );
      return result;
    }

    const settings = await this.settingsService.getSettings();
    if (!settings.enabled) return result;

    // Auto-detect title card vs poster based on collection type
    const isTitleCard = collection.type === 'episode';
    const textCfg: OverlayTextConfig = isTitleCard
      ? settings.titleCardOverlayText
      : settings.posterOverlayText;

    if (isTitleCard) {
      this.logger.log(
        `Collection "${collection.title}" uses title card overlay settings`,
      );
    }

    for (const mediaItem of collection.collectionMedia) {
      const plexId = mediaItem.mediaServerId;
      const deleteDate = this.getDeleteDate(
        mediaItem.addDate,
        collection.deleteAfterDays,
      );
      if (!deleteDate) continue;

      const label = this.formatDateLabel(deleteDate, textCfg);
      const daysLeft = this.getDaysLeft(deleteDate);
      const existingState = await this.stateService.getItemState(
        collection.id,
        plexId,
      );

      // Determine if we need to apply/re-apply
      const shouldApply =
        !existingState ||
        existingState.daysLeftShown !== daysLeft ||
        (textCfg.useDays && existingState.daysLeftShown !== daysLeft) ||
        (!textCfg.useDays && existingState.daysLeftShown !== null);

      if (shouldApply) {
        this.logger.log(`Applying overlay to item ${plexId} — "${label}"`);
        const success = await this.applyOverlay(
          plexId,
          collection.id,
          label,
          deleteDate,
          settings,
          isTitleCard,
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

  // ── Generate preview ──────────────────────────────────────────────────────

  async generatePreview(
    plexId: string,
    settings: OverlaySettings,
    mode: 'poster' | 'titlecard' = 'poster',
  ): Promise<OverlayResult> {
    const isTitleCard = mode === 'titlecard';
    const textCfg: OverlayTextConfig = isTitleCard
      ? settings.titleCardOverlayText
      : settings.posterOverlayText;
    const overlayStyle: OverlayStyleConfig = isTitleCard
      ? settings.titleCardOverlayStyle
      : settings.posterOverlayStyle;
    const frameCfg: FrameConfig = isTitleCard
      ? settings.titleCardFrame
      : settings.posterFrame;

    // Generate a sample label 14 days in the future
    const sampleDeleteDate = new Date();
    sampleDeleteDate.setDate(sampleDeleteDate.getDate() + 14);
    const label = this.formatDateLabel(sampleDeleteDate, textCfg);

    // Download poster from Plex
    const thumbPath = await this.plexApi.getBestPosterUrl(plexId);
    if (!thumbPath) {
      throw new Error(`Could not find poster for Plex item ${plexId}`);
    }
    const posterBuf = await this.plexApi.downloadPoster(thumbPath);

    // Build render options
    const overlayOpts: OverlayRenderOptions = {
      text: label,
      fontPath: overlayStyle.fontPath,
      fontColor: overlayStyle.fontColor,
      backColor: overlayStyle.backColor,
      fontSize: overlayStyle.fontSize,
      padding: overlayStyle.padding,
      backRadius: overlayStyle.backRadius,
      horizontalOffset: overlayStyle.horizontalOffset,
      horizontalAlign: overlayStyle.horizontalAlign,
      verticalOffset: overlayStyle.verticalOffset,
      verticalAlign: overlayStyle.verticalAlign,
      overlayBottomCenter: overlayStyle.overlayBottomCenter,
      useFrame: frameCfg.useFrame,
      frameColor: frameCfg.frameColor,
      frameWidth: frameCfg.frameWidth,
      frameRadius: frameCfg.frameRadius,
      frameInnerRadius: frameCfg.frameInnerRadius,
      frameInnerRadiusMode: frameCfg.frameInnerRadiusMode,
      frameInset: frameCfg.frameInset,
      dockStyle: frameCfg.dockStyle,
      dockPosition: frameCfg.dockPosition,
    };

    return this.renderService.renderOverlay(posterBuf, overlayOpts);
  }
}
