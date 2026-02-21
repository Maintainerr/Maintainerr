import {
  BasicResponseDto,
  JellyfinSetting,
  jellyfinSettingSchema,
  MediaServerSwitchPreview,
  MediaServerType,
  SeerrSetting,
  seerrSettingSchema,
  SwitchMediaServerRequest,
  SwitchMediaServerResponse,
  switchMediaServerSchema,
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
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { DatabaseDownloadService } from './database-download.service';
import { CronScheduleDto } from "./dto's/cron.schedule.dto";
import { RadarrSettingRawDto } from "./dto's/radarr-setting.dto";
import { SettingDto } from "./dto's/setting.dto";
import { SonarrSettingRawDto } from "./dto's/sonarr-setting.dto";
import { UpdateSettingDto } from "./dto's/update-setting.dto";
import { Settings } from './entities/settings.entities';
import { MediaServerSwitchService } from './media-server-switch.service';
import { SettingsService } from './settings.service';

@Controller('/api/settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly mediaServerSwitchService: MediaServerSwitchService,
    private readonly databaseDownloadService: DatabaseDownloadService,
  ) {}

  @Get()
  getSettings() {
    return this.settingsService.getPublicSettings();
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

  // Unified Seerr endpoints (replaces both Overseerr and Jellyseerr)
  @Get(['/seerr', '/overseerr', '/jellyseerr'])
  async getSeerrSetting(): Promise<SeerrSetting | BasicResponseDto> {
    const settings = await this.settingsService.getSettings();

    if (!(settings instanceof Settings)) {
      return settings;
    }

    return {
      api_key: settings.seerr_api_key,
      url: settings.seerr_url,
    };
  }

  @Post(['/seerr', '/overseerr', '/jellyseerr'])
  async updateSeerrSetting(
    @Body(new ZodValidationPipe(seerrSettingSchema))
    payload: SeerrSetting,
  ) {
    return await this.settingsService.updateSeerrSetting(payload);
  }

  @Delete(['/seerr', '/overseerr', '/jellyseerr'])
  async removeSeerrSetting() {
    return await this.settingsService.removeSeerrSetting();
  }

  @Post(['/test/seerr', '/test/overseerr', '/test/jellyseerr'])
  testSeerr(
    @Body(new ZodValidationPipe(seerrSettingSchema))
    payload: SeerrSetting,
  ): Promise<BasicResponseDto> {
    return this.settingsService.testSeerr(payload);
  }

  @Get('/jellyfin')
  async getJellyfinSetting(): Promise<JellyfinSetting | BasicResponseDto> {
    const settings = await this.settingsService.getSettings();

    if (!(settings instanceof Settings)) {
      return settings;
    }

    return {
      jellyfin_url: settings.jellyfin_url,
      jellyfin_api_key: settings.jellyfin_api_key,
      jellyfin_user_id: settings.jellyfin_user_id,
    };
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
    @Param('targetServerType', new ParseEnumPipe(MediaServerType))
    targetServerType: MediaServerType,
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
    @Body(new ZodValidationPipe(switchMediaServerSchema))
    payload: SwitchMediaServerRequest,
  ): Promise<SwitchMediaServerResponse> {
    return this.mediaServerSwitchService.executeSwitch(payload);
  }
}
