import {
    OverlayExport,
    OverlayPreviewWithSettings,
    OverlayRenderOptions,
    OverlaySettings,
    OverlaySettingsUpdate,
    overlayExportSchema,
    overlayPreviewRequestSchema,
    overlayPreviewWithSettingsSchema,
    overlaySettingsUpdateSchema,
} from '@maintainerr/contracts';
import {
    Body,
    Controller,
    Delete,
    Get,
    HttpException,
    HttpStatus,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Query,
    Res,
    StreamableFile,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import { ZodValidationPipe } from 'nestjs-zod';
import * as path from 'path';
import { dataDir as configDataDir } from '../../app/config/dataDir';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { CollectionsService } from '../collections/collections.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { OverlayProcessorService } from './overlay-processor.service';
import { OverlayRenderService } from './overlay-render.service';
import { OverlaySettingsService } from './overlay-settings.service';
import { OverlayTaskService } from './overlay-task.service';

@Controller('api/overlays')
export class OverlaysController {
  private readonly fontsDir: string;

  constructor(
    private readonly settingsService: OverlaySettingsService,
    private readonly processorService: OverlayProcessorService,
    private readonly renderService: OverlayRenderService,
    private readonly taskService: OverlayTaskService,
    private readonly plexApi: PlexApiService,
    private readonly collectionsService: CollectionsService,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(OverlaysController.name);
    // Bundled fonts: check dist/assets/fonts first, then source assets/fonts for dev mode
    const distFonts = path.join(__dirname, '..', '..', 'assets', 'fonts');
    const srcFonts = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'assets',
      'fonts',
    );
    this.fontsDir = fs.existsSync(distFonts) ? distFonts : srcFonts;
  }

  // ── Settings ────────────────────────────────────────────────────────────

  @Get('settings')
  async getSettings(): Promise<OverlaySettings> {
    return this.settingsService.getSettings();
  }

  @Put('settings')
  async updateSettings(
    @Body(new ZodValidationPipe(overlaySettingsUpdateSchema))
    dto: OverlaySettingsUpdate,
  ): Promise<OverlaySettings> {
    const updated = await this.settingsService.updateSettings(dto);

    // If cron or enabled changed, update the scheduled job
    if (dto.cronSchedule !== undefined || dto.enabled !== undefined) {
      await this.taskService.updateCronSchedule(
        updated.cronSchedule,
        updated.enabled,
      );
    }

    return updated;
  }

  // ── Import / Export ─────────────────────────────────────────────────────

  @Post('settings/export/:type')
  async exportSettings(
    @Param('type') type: 'poster' | 'titlecard',
  ): Promise<OverlayExport> {
    if (type !== 'poster' && type !== 'titlecard') {
      throw new HttpException(
        'Type must be "poster" or "titlecard"',
        HttpStatus.BAD_REQUEST,
      );
    }
    const settings = await this.settingsService.getSettings();
    return this.settingsService.exportSettings(type, settings);
  }

  @Post('settings/import/:type')
  async importSettings(
    @Param('type') type: 'poster' | 'titlecard',
    @Body(new ZodValidationPipe(overlayExportSchema)) data: OverlayExport,
  ): Promise<OverlaySettings> {
    if (type !== 'poster' && type !== 'titlecard') {
      throw new HttpException(
        'Type must be "poster" or "titlecard"',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.settingsService.importSettings(type, data);
  }

  // ── Preview ─────────────────────────────────────────────────────────────

  @Get('preview')
  async getPreview(
    @Query(new ZodValidationPipe(overlayPreviewRequestSchema))
    query: { plexId: string; mode?: 'poster' | 'titlecard' },
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const settings = await this.settingsService.getSettings();
    const result = await this.processorService.generatePreview(
      query.plexId,
      settings,
      query.mode,
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-cache');
    return new StreamableFile(result.buffer);
  }

  @Post('preview/with-settings')
  async previewWithSettings(
    @Body(new ZodValidationPipe(overlayPreviewWithSettingsSchema))
    body: OverlayPreviewWithSettings,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Download poster from Plex
    const thumbPath = await this.plexApi.getBestPosterUrl(body.plexId);
    if (!thumbPath) {
      throw new HttpException(
        `Could not find poster for Plex item ${body.plexId}`,
        HttpStatus.NOT_FOUND,
      );
    }
    const posterBuf = await this.plexApi.downloadPoster(thumbPath);

    // Build render options from the provided settings
    const opts: OverlayRenderOptions = {
      text: this.processorService.formatDateLabel(
        (() => {
          const d = new Date();
          d.setDate(d.getDate() + 14);
          return d;
        })(),
        body.overlayText,
      ),
      fontPath: body.overlayStyle.fontPath,
      fontColor: body.overlayStyle.fontColor,
      backColor: body.overlayStyle.backColor,
      fontSize: body.overlayStyle.fontSize,
      padding: body.overlayStyle.padding,
      backRadius: body.overlayStyle.backRadius,
      horizontalOffset: body.overlayStyle.horizontalOffset,
      horizontalAlign: body.overlayStyle.horizontalAlign,
      verticalOffset: body.overlayStyle.verticalOffset,
      verticalAlign: body.overlayStyle.verticalAlign,
      overlayBottomCenter: body.overlayStyle.overlayBottomCenter,
      useFrame: body.frame.useFrame,
      frameColor: body.frame.frameColor,
      frameWidth: body.frame.frameWidth,
      frameRadius: body.frame.frameRadius,
      frameInnerRadius: body.frame.frameInnerRadius,
      frameInnerRadiusMode: body.frame.frameInnerRadiusMode,
      frameInset: body.frame.frameInset,
      dockStyle: body.frame.dockStyle,
      dockPosition: body.frame.dockPosition,
    };

    const result = await this.renderService.renderOverlay(posterBuf, opts);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-cache');
    return new StreamableFile(result.buffer);
  }

  // ── Plex helpers (for preview UI) ─────────────────────────────────────

  @Get('sections')
  async getSections() {
    return this.plexApi.getOverlayLibrarySections();
  }

  @Get('random-item')
  async getRandomItem(@Query('sectionId') sectionId: string) {
    if (!sectionId) {
      throw new HttpException(
        'sectionId is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.plexApi.getRandomLibraryItem([sectionId]);
  }

  @Get('random-episode')
  async getRandomEpisode(@Query('sectionId') sectionId: string) {
    if (!sectionId) {
      throw new HttpException(
        'sectionId is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.plexApi.getRandomEpisodeItem([sectionId]);
  }

  // ── Processing ──────────────────────────────────────────────────────────

  @Get('status')
  getStatus() {
    return {
      status: this.processorService.status,
      lastRun: this.processorService.lastRun,
      lastResult: this.processorService.lastResult,
    };
  }

  @Post('process')
  async processAll() {
    if (this.processorService.status === 'running') {
      throw new HttpException(
        'Overlay processing is already running',
        HttpStatus.CONFLICT,
      );
    }
    const result = await this.processorService.processAllCollections();
    return result;
  }

  @Post('process/:collectionId')
  async processCollection(
    @Param('collectionId', ParseIntPipe) collectionId: number,
  ) {
    if (this.processorService.status === 'running') {
      throw new HttpException(
        'Overlay processing is already running',
        HttpStatus.CONFLICT,
      );
    }

    const collection = await this.collectionsService.getCollection(
      collectionId,
    );
    if (!collection) {
      throw new HttpException('Collection not found', HttpStatus.NOT_FOUND);
    }

    // Ensure collectionMedia is loaded
    if (!collection.collectionMedia) {
      const media =
        await this.collectionsService.getCollectionMedia(collectionId);
      collection.collectionMedia = media ?? [];
    }

    const result = await this.processorService.processCollection(collection);
    return result;
  }

  @Post('revert/:collectionId')
  async revertCollection(
    @Param('collectionId', ParseIntPipe) collectionId: number,
  ) {
    await this.processorService.revertCollection(collectionId);
    return { success: true };
  }

  @Delete('reset')
  async resetAll() {
    await this.processorService.resetAllOverlays();
    return { success: true };
  }

  // ── Fonts ───────────────────────────────────────────────────────────────

  @Get('fonts')
  listFonts() {
    const dirs = [this.fontsDir];

    // Also check user-uploaded fonts directory
    const userFontsDir = path.join(configDataDir, 'overlays', 'fonts');
    if (fs.existsSync(userFontsDir)) {
      dirs.push(userFontsDir);
    }

    const fonts: { name: string; path: string }[] = [];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return ext === '.ttf' || ext === '.otf' || ext === '.woff';
      });
      for (const file of files) {
        fonts.push({ name: file, path: path.join(dir, file) });
      }
    }

    return fonts;
  }

  @Post('fonts')
  @UseInterceptors(FileInterceptor('font'))
  async uploadFont(
    @UploadedFile() file: { originalname: string; buffer: Buffer },
  ) {
    if (!file) {
      throw new HttpException('No font file uploaded', HttpStatus.BAD_REQUEST);
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.ttf' && ext !== '.otf' && ext !== '.woff') {
      throw new HttpException(
        'Only .ttf, .otf, and .woff font files are supported',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Sanitize filename: only allow alphanumeric, dash, underscore, dot
    const safeName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const userFontsDir = path.join(configDataDir, 'overlays', 'fonts');

    fs.mkdirSync(userFontsDir, { recursive: true });
    const destPath = path.join(userFontsDir, safeName);
    fs.writeFileSync(destPath, file.buffer);

    return { name: safeName, path: destPath };
  }
}
