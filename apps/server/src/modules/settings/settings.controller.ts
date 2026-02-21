import {
  BasicResponseDto,
  JellyfinSetting,
  jellyfinSettingSchema,
  JellyseerrSetting,
  jellyseerrSettingSchema,
  MediaServerSwitchPreview,
  MediaServerType,
  OverseerrSetting,
  overseerrSettingSchema,
  SwitchMediaServerRequest,
  SwitchMediaServerResponse,
  TautulliSetting,
  tautulliSettingSchema,
} from '@maintainerr/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { CronScheduleDto } from "./dto's/cron.schedule.dto";
import { RadarrSettingRawDto } from "./dto's/radarr-setting.dto";
import { SettingDto } from "./dto's/setting.dto";
import { SonarrSettingRawDto } from "./dto's/sonarr-setting.dto";
import { UpdateSettingDto } from "./dto's/update-setting.dto";
import { DatabaseDownloadService } from './database-download.service';
import { Settings } from './entities/settings.entities';
import { MediaServerSwitchService } from './media-server-switch.service';
import { SettingsService } from './settings.service';
import { ZodValidationPipe } from 'nestjs-zod';

@Controller('/api/settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly mediaServerSwitchService: MediaServerSwitchService,
    private readonly databaseDownloadService: DatabaseDownloadService,
  ) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }
  @Get('/radarr')
  getRadarrSettings() {
    return this.settingsService.getRadarrSettings();
  }
  @Get('/sonarr')
  getSonarrSettings() {
    return this.settingsService.getSonarrSettings();
  }
  @Get('/version')
  getVersion() {
    return this.settingsService.appVersion();
  }

  @Get('/database/download')
  @Header('Content-Type', 'application/x-sqlite3')
  @Header('X-Content-Type-Options', 'nosniff')
  async downloadDatabase(
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { fileStream, fileName, fileSize } =
      await this.databaseDownloadService.getDatabaseDownload();

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileSize.toString());
    res.setHeader('Cache-Control', 'no-store');

    return new StreamableFile(fileStream);
  }

  @Get('/api/generate')
  generateApiKey() {
    return this.settingsService.generateApiKey();
  }

  @Delete('/plex/auth')
  deletePlexApiAuth() {
    return this.settingsService.deletePlexApiAuth();
  }
  @Post()
  updateSettings(@Body() payload: SettingDto) {
    return this.settingsService.updateSettings(payload);
  }
  @Patch()
  patchSettings(@Body() payload: UpdateSettingDto) {
    return this.settingsService.patchSettings(payload);
  }
  @Post('/plex/token')
  updateAuthToken(@Body() payload: { plex_auth_token: string }) {
    return this.settingsService.savePlexApiAuthToken(payload.plex_auth_token);
  }
  @Get('/test/setup')
  testSetup() {
    return this.settingsService.testSetup();
  }
  @Post('/test/radarr')
  testRadarr(@Body() payload: RadarrSettingRawDto) {
    return this.settingsService.testRadarr(payload);
  }

  @Post('/radarr')
  async addRadarrSetting(@Body() payload: RadarrSettingRawDto) {
    return await this.settingsService.addRadarrSetting(payload);
  }

  @Put('/radarr/:id')
  async updateRadarrSetting(
    @Param('id', new ParseIntPipe()) id: number,
    @Body() payload: RadarrSettingRawDto,
  ) {
    return await this.settingsService.updateRadarrSetting({
      id,
      ...payload,
    });
  }

  @Delete('/radarr/:id')
  async deleteRadarrSetting(@Param('id', new ParseIntPipe()) id: number) {
    return await this.settingsService.deleteRadarrSetting(id);
  }

  @Post('/test/sonarr')
  testSonarr(@Body() payload: SonarrSettingRawDto) {
    return this.settingsService.testSonarr(payload);
  }

  @Post('/sonarr')
  async addSonarrSetting(@Body() payload: SonarrSettingRawDto) {
    return await this.settingsService.addSonarrSetting(payload);
  }

  @Put('/sonarr/:id')
  async updateSonarrSetting(
    @Param('id', new ParseIntPipe()) id: number,
    @Body() payload: SonarrSettingRawDto,
  ) {
    return await this.settingsService.updateSonarrSetting({
      id,
      ...payload,
    });
  }

  @Get('/tautulli')
  async getTautulliSetting(): Promise<TautulliSetting | BasicResponseDto> {
    const settings = await this.settingsService.getSettings();

    if (!(settings instanceof Settings)) {
      return settings;
    }

    return {
      api_key: settings.tautulli_api_key,
      url: settings.tautulli_url,
    };
  }

  @Post('/tautulli')
  async updateTautlliSetting(
    @Body(new ZodValidationPipe(tautulliSettingSchema))
    payload: TautulliSetting,
  ) {
    return await this.settingsService.updateTautulliSetting(payload);
  }

  @Delete('/tautulli')
  async removeTautlliSetting() {
    return await this.settingsService.removeTautulliSetting();
  }

  @Post('/test/tautulli')
  testTautulli(
    @Body(new ZodValidationPipe(tautulliSettingSchema))
    payload: TautulliSetting,
  ): Promise<BasicResponseDto> {
    return this.settingsService.testTautulli(payload);
  }

  @Get('/jellyseerr')
  async getJellyseerrSetting(): Promise<JellyseerrSetting | BasicResponseDto> {
    const settings = await this.settingsService.getSettings();

    if (!(settings instanceof Settings)) {
      return settings;
    }

    return {
      api_key: settings.jellyseerr_api_key,
      url: settings.jellyseerr_url,
    };
  }

  @Get('/overseerr')
  async getOverseerrSetting(): Promise<OverseerrSetting | BasicResponseDto> {
    const settings = await this.settingsService.getSettings();

    if (!(settings instanceof Settings)) {
      return settings;
    }

    return {
      api_key: settings.overseerr_api_key,
      url: settings.overseerr_url,
    };
  }

  @Post('/jellyseerr')
  async updateJellyseerrSetting(
    @Body(new ZodValidationPipe(jellyseerrSettingSchema))
    payload: JellyseerrSetting,
  ) {
    return await this.settingsService.updateJellyseerrSetting(payload);
  }

  @Delete('/jellyseerr')
  async removeJellyseerrSetting() {
    return await this.settingsService.removeJellyseerrSetting();
  }

  @Post('/test/jellyseerr')
  testJellyseerr(
    @Body(new ZodValidationPipe(jellyseerrSettingSchema))
    payload: JellyseerrSetting,
  ): Promise<BasicResponseDto> {
    return this.settingsService.testJellyseerr(payload);
  }

  @Post('/overseerr')
  async updateOverseerrSetting(
    @Body(new ZodValidationPipe(overseerrSettingSchema))
    payload: OverseerrSetting,
  ) {
    return await this.settingsService.updateOverseerrSetting(payload);
  }

  @Delete('/overseerr')
  async removeOverseerrSetting() {
    return await this.settingsService.removeOverseerrSetting();
  }

  @Post('/test/overseerr')
  testOverseerr(
    @Body(new ZodValidationPipe(overseerrSettingSchema))
    payload: OverseerrSetting,
  ): Promise<BasicResponseDto> {
    return this.settingsService.testOverseerr(payload);
  }

  @Post('/jellyfin/test')
  testJellyfin(
    @Body(new ZodValidationPipe(jellyfinSettingSchema))
    payload: JellyfinSetting,
  ): Promise<BasicResponseDto> {
    return this.settingsService.testJellyfin(payload);
  }

  @Post('/jellyfin')
  async saveJellyfinSettings(
    @Body(new ZodValidationPipe(jellyfinSettingSchema))
    payload: JellyfinSetting,
  ): Promise<BasicResponseDto> {
    return await this.settingsService.saveJellyfinSettings(payload);
  }

  @Delete('/jellyfin')
  async removeJellyfinSettings(): Promise<BasicResponseDto> {
    return await this.settingsService.removeJellyfinSettings();
  }

  @Delete('/sonarr/:id')
  async deleteSonarrSetting(@Param('id', new ParseIntPipe()) id: number) {
    return await this.settingsService.deleteSonarrSetting(id);
  }

  @Get('/test/plex')
  testPlex() {
    return this.settingsService.testPlex();
  }

  @Get('/plex/devices/servers')
  async getPlexServers() {
    return await this.settingsService.getPlexServers();
  }

  @Post('/cron/validate')
  validateSingleCron(@Body() payload: CronScheduleDto) {
    return this.settingsService.cronIsValid(payload.schedule)
      ? { status: 'OK', code: 1, message: 'Success' }
      : { status: 'NOK', code: 0, message: 'Failure' };
  }

  /**
   * Preview what data will be cleared when switching media servers
   */
  @Get('/media-server/switch/preview/:targetServerType')
  async previewMediaServerSwitch(
    @Param('targetServerType') targetServerType: MediaServerType,
  ): Promise<MediaServerSwitchPreview> {
    return this.mediaServerSwitchService.previewSwitch(targetServerType);
  }

  /**
   * Switch media server type and clear media server-specific data
   * Keeps: general settings, *arr settings, notification settings
   * Clears: collections, collection media, exclusions, collection logs
   */
  @Post('/media-server/switch')
  async switchMediaServer(
    @Body() payload: SwitchMediaServerRequest,
  ): Promise<SwitchMediaServerResponse> {
    return this.mediaServerSwitchService.executeSwitch(payload);
  }
}
