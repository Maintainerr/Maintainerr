import {
  OverlaySettings,
  OverlaySettingsUpdate,
  OverlayTemplateCreate,
  OverlayTemplateUpdate,
  overlaySettingsUpdateSchema,
  overlayTemplateCreateSchema,
  overlayTemplateExportSchema,
  overlayTemplateUpdateSchema,
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
import { OverlaySettingsService } from './overlay-settings.service';
import { OverlayTaskService } from './overlay-task.service';
import { OverlayTemplateService } from './overlay-template.service';

@Controller('api/overlays')
export class OverlaysController {
  private readonly fontsDir: string;

  constructor(
    private readonly settingsService: OverlaySettingsService,
    private readonly processorService: OverlayProcessorService,
    private readonly taskService: OverlayTaskService,
    private readonly templateService: OverlayTemplateService,
    private readonly plexApi: PlexApiService,
    private readonly collectionsService: CollectionsService,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(OverlaysController.name);
    // Bundled fonts: check dist/assets/fonts first, then source assets/fonts for dev mode
    const distFonts = path.join(__dirname, '..', '..', 'assets', 'fonts');
    const srcFonts = path.join(__dirname, '..', '..', '..', 'assets', 'fonts');
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

  // ── Plex helpers (for preview UI) ─────────────────────────────────────

  @Get('sections')
  async getSections() {
    return this.plexApi.getOverlayLibrarySections();
  }

  @Get('random-item')
  async getRandomItem(@Query('sectionId') sectionId: string) {
    if (!sectionId) {
      throw new HttpException('sectionId is required', HttpStatus.BAD_REQUEST);
    }
    return this.plexApi.getRandomLibraryItem([sectionId]);
  }

  @Get('random-episode')
  async getRandomEpisode(@Query('sectionId') sectionId: string) {
    if (!sectionId) {
      throw new HttpException('sectionId is required', HttpStatus.BAD_REQUEST);
    }
    return this.plexApi.getRandomEpisodeItem([sectionId]);
  }

  @Get('poster')
  async getPoster(
    @Query('plexId') plexId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!plexId) {
      throw new HttpException('plexId is required', HttpStatus.BAD_REQUEST);
    }
    const thumbPath = await this.plexApi.getBestPosterUrl(plexId);
    if (!thumbPath) {
      throw new HttpException('Poster not found', HttpStatus.NOT_FOUND);
    }
    const buf = await this.plexApi.downloadPoster(thumbPath);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return new StreamableFile(buf);
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

    const collection =
      await this.collectionsService.getCollection(collectionId);
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

  // ── Templates ───────────────────────────────────────────────────────────

  @Get('templates')
  async listTemplates() {
    return this.templateService.findAll();
  }

  @Get('templates/:id')
  async getTemplate(@Param('id', ParseIntPipe) id: number) {
    const template = await this.templateService.findById(id);
    if (!template) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
    return template;
  }

  @Post('templates')
  async createTemplate(
    @Body(new ZodValidationPipe(overlayTemplateCreateSchema))
    dto: OverlayTemplateCreate,
  ) {
    return this.templateService.create(dto);
  }

  @Put('templates/:id')
  async updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(overlayTemplateUpdateSchema))
    dto: OverlayTemplateUpdate,
  ) {
    const updated = await this.templateService.update(id, dto);
    if (!updated) {
      throw new HttpException(
        'Template not found or is a preset',
        HttpStatus.NOT_FOUND,
      );
    }
    return updated;
  }

  @Delete('templates/:id')
  async deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    const deleted = await this.templateService.remove(id);
    if (!deleted) {
      throw new HttpException(
        'Template not found or is a preset',
        HttpStatus.NOT_FOUND,
      );
    }
    return { success: true };
  }

  @Post('templates/:id/duplicate')
  async duplicateTemplate(@Param('id', ParseIntPipe) id: number) {
    const duplicate = await this.templateService.duplicate(id);
    if (!duplicate) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
    return duplicate;
  }

  @Post('templates/:id/default')
  async setDefaultTemplate(@Param('id', ParseIntPipe) id: number) {
    const result = await this.templateService.setDefault(id);
    if (!result) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Post('templates/:id/export')
  async exportTemplate(@Param('id', ParseIntPipe) id: number) {
    const template = await this.templateService.findById(id);
    if (!template) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
    return this.templateService.exportTemplate(template);
  }

  @Post('templates/import')
  async importTemplate(
    @Body(new ZodValidationPipe(overlayTemplateExportSchema)) data: unknown,
  ) {
    return this.templateService.importTemplate(data);
  }

  @Post('templates/:id/preview')
  async previewTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Query('plexId') plexId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!plexId) {
      throw new HttpException('plexId is required', HttpStatus.BAD_REQUEST);
    }
    const template = await this.templateService.findById(id);
    if (!template) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
    const result = await this.processorService.generateTemplatePreview(
      plexId,
      template,
    );
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-cache');
    return new StreamableFile(result.buffer);
  }
}
