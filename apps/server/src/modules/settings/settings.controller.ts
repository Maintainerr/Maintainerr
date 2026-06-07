import {
  BasicResponseDto,
  EmbyLoginRequest,
  embyLoginRequestSchema,
  EmbySetting,
  embySettingSchema,
  JellyfinSetting,
  jellyfinSettingSchema,
  MediaServerSwitchPreview,
  MediaServerType,
  MetadataProviderPreference,
  DownloadClientSetting,
  downloadClientSettingSchema,
  MetadataProviderSetting,
  metadataProviderSettingSchema,
  MetadataWritebackSetting,
  metadataWritebackSettingSchema,
  RadarrSetting,
  radarrSettingSchema,
  SeerrSetting,
  seerrSettingSchema,
  SonarrSetting,
  sonarrSettingSchema,
  StreamystatsSetting,
  streamystatsSettingSchema,
  SwitchMediaServerRequest,
  SwitchMediaServerResponse,
  switchMediaServerSchema,
  TautulliSetting,
  tautulliSettingSchema,
  TmdbSetting,
  TmdbSettingForm,
  tmdbSettingSchema,
  TvdbSetting,
  TvdbSettingForm,
  tvdbSettingSchema,
} from '@maintainerr/contracts';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { DatabaseDownloadService } from './database-download.service';
import { CronScheduleDto } from "./dto's/cron.schedule.dto";
import { SettingDto } from "./dto's/setting.dto";
import { UpdateSettingDto } from "./dto's/update-setting.dto";
import { Settings } from './entities/settings.entities';
import { MediaServerSwitchService } from './media-server-switch.service';
import { MetadataProvider } from './metadata-provider';
import { MetadataSettingsService } from './metadata-settings.service';
import { SettingsDataService } from './settings-data.service';
import { SettingsOperationsService } from './settings-operations.service';

@ApiTags('settings')
@Controller('/api/settings')
export class SettingsController {
  constructor(
    private readonly settingsOperationsService: SettingsOperationsService,
    private readonly settingsDataService: SettingsDataService,
    private readonly metadataSettingsService: MetadataSettingsService,
    private readonly mediaServerSwitchService: MediaServerSwitchService,
    private readonly databaseDownloadService: DatabaseDownloadService,
  ) {}

  @Get()
  getSettings() {
    return this.settingsOperationsService.getPublicSettings();
  }
  @Get('/radarr')
  getRadarrSettings() {
    return this.settingsOperationsService.getRadarrSettings();
  }
  @Get('/sonarr')
  getSonarrSettings() {
    return this.settingsOperationsService.getSonarrSettings();
  }
  @Get('/version')
  getVersion() {
    return this.settingsOperationsService.appVersion();
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
    return this.settingsOperationsService.generateApiKey();
  }

  @Delete('/plex/auth')
  deletePlexApiAuth() {
    return this.settingsOperationsService.deletePlexApiAuth();
  }
  @Post()
  updateSettings(@Body() payload: SettingDto) {
    return this.settingsOperationsService.updateSettings(payload);
  }
  @Patch()
  patchSettings(@Body() payload: UpdateSettingDto) {
    return this.settingsOperationsService.patchSettings(payload);
  }
  @Post('/plex/token')
  updateAuthToken(@Body() payload: { plex_auth_token: string }) {
    return this.settingsOperationsService.savePlexApiAuthToken(
      payload.plex_auth_token,
    );
  }
  @Get('/test/setup')
  testSetup() {
    return this.settingsOperationsService.testSetup();
  }
  @Post('/test/radarr')
  testRadarr(
    @Body(new ZodValidationPipe(radarrSettingSchema))
    payload: RadarrSetting,
  ) {
    return this.settingsOperationsService.testRadarr(payload);
  }

  @Post('/radarr')
  async addRadarrSetting(
    @Body(new ZodValidationPipe(radarrSettingSchema))
    payload: RadarrSetting,
  ) {
    return await this.settingsOperationsService.addRadarrSetting(payload);
  }

  @Put('/radarr/:id')
  async updateRadarrSetting(
    @Param('id', new ParseIntPipe()) id: number,
    @Body(new ZodValidationPipe(radarrSettingSchema))
    payload: RadarrSetting,
  ) {
    return await this.settingsOperationsService.updateRadarrSetting({
      id,
      ...payload,
    });
  }

  @Delete('/radarr/:id')
  async deleteRadarrSetting(@Param('id', new ParseIntPipe()) id: number) {
    return await this.settingsOperationsService.deleteRadarrSetting(id);
  }

  @Post('/test/sonarr')
  testSonarr(
    @Body(new ZodValidationPipe(sonarrSettingSchema))
    payload: SonarrSetting,
  ) {
    return this.settingsOperationsService.testSonarr(payload);
  }

  @Post('/sonarr')
  async addSonarrSetting(
    @Body(new ZodValidationPipe(sonarrSettingSchema))
    payload: SonarrSetting,
  ) {
    return await this.settingsOperationsService.addSonarrSetting(payload);
  }

  @Put('/sonarr/:id')
  async updateSonarrSetting(
    @Param('id', new ParseIntPipe()) id: number,
    @Body(new ZodValidationPipe(sonarrSettingSchema))
    payload: SonarrSetting,
  ) {
    return await this.settingsOperationsService.updateSonarrSetting({
      id,
      ...payload,
    });
  }

  @Get('/tautulli')
  async getTautulliSetting(): Promise<TautulliSetting | BasicResponseDto> {
    const settings = await this.settingsOperationsService.getSettings();

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
    return await this.settingsOperationsService.updateTautulliSetting(payload);
  }

  @Delete('/tautulli')
  async removeTautlliSetting() {
    return await this.settingsOperationsService.removeTautulliSetting();
  }

  @Post('/test/tautulli')
  testTautulli(
    @Body(new ZodValidationPipe(tautulliSettingSchema))
    payload: TautulliSetting,
  ): Promise<BasicResponseDto> {
    return this.settingsOperationsService.testTautulli(payload);
  }

  @Get('/streamystats')
  async getStreamystatsSetting(): Promise<
    StreamystatsSetting | BasicResponseDto
  > {
    const settings = await this.settingsOperationsService.getSettings();

    if (!(settings instanceof Settings)) {
      return settings;
    }

    this.assertJellyfinActive();

    return {
      url: settings.streamystats_url,
    };
  }

  @Post('/streamystats')
  async updateStreamystatsSetting(
    @Body(new ZodValidationPipe(streamystatsSettingSchema))
    payload: StreamystatsSetting,
  ) {
    this.assertJellyfinActive();
    return await this.settingsOperationsService.updateStreamystatsSetting(
      payload,
    );
  }

  @Delete('/streamystats')
  async removeStreamystatsSetting() {
    this.assertJellyfinActive();
    return await this.settingsOperationsService.removeStreamystatsSetting();
  }

  @Post('/test/streamystats')
  testStreamystats(
    @Body(new ZodValidationPipe(streamystatsSettingSchema))
    payload: StreamystatsSetting,
  ): Promise<BasicResponseDto> {
    this.assertJellyfinActive();
    return this.settingsOperationsService.testStreamystats(payload);
  }

  @Get('/download-client')
  async getDownloadClientSetting(): Promise<
    DownloadClientSetting | BasicResponseDto
  > {
    const settings = await this.settingsOperationsService.getSettings();

    if (!(settings instanceof Settings)) {
      return settings;
    }

    return {
      download_client_url: settings.download_client_url ?? '',
      download_client_username: settings.download_client_username ?? '',
      download_client_password: settings.download_client_password ?? '',
      download_client_delete_data: settings.download_client_delete_data ?? true,
      download_client_fallback_ratio:
        settings.download_client_fallback_ratio ?? 0.5,
    };
  }

  @Post('/download-client')
  async updateDownloadClientSetting(
    @Body(new ZodValidationPipe(downloadClientSettingSchema))
    payload: DownloadClientSetting,
  ) {
    return await this.settingsOperationsService.updateDownloadClientSetting(
      payload,
    );
  }

  @Delete('/download-client')
  async removeDownloadClientSetting() {
    return await this.settingsOperationsService.removeDownloadClientSetting();
  }

  @Post('/test/download-client')
  testDownloadClient(
    @Body(new ZodValidationPipe(downloadClientSettingSchema))
    payload: DownloadClientSetting,
  ): Promise<BasicResponseDto> {
    return this.settingsOperationsService.testDownloadClient(payload);
  }

  private assertJellyfinActive(): void {
    if (
      this.settingsDataService.media_server_type !== MediaServerType.JELLYFIN
    ) {
      throw new ForbiddenException(
        'Streamystats is only available when Jellyfin is the active media server.',
      );
    }
  }

  @Get('/tmdb')
  async getTmdbSetting(): Promise<TmdbSettingForm | BasicResponseDto> {
    const settings = await this.settingsOperationsService.getSettings();

    if (!(settings instanceof Settings)) {
      return settings;
    }

    return {
      api_key: settings.tmdb_api_key ?? '',
    };
  }

  @Post('/tmdb')
  async updateTmdbSetting(
    @Body(new ZodValidationPipe(tmdbSettingSchema))
    payload: TmdbSetting,
  ) {
    return await this.metadataSettingsService.updateTmdbSetting(payload);
  }

  @Delete('/tmdb')
  async removeTmdbSetting() {
    return await this.metadataSettingsService.removeTmdbSetting();
  }

  @Post('/test/tmdb')
  testTmdb(
    @Body(new ZodValidationPipe(tmdbSettingSchema))
    payload: TmdbSetting,
  ): Promise<BasicResponseDto> {
    return this.metadataSettingsService.testTmdb(payload);
  }

  @Get('/tvdb')
  async getTvdbSetting(): Promise<TvdbSettingForm | BasicResponseDto> {
    const settings = await this.settingsOperationsService.getSettings();

    if (!(settings instanceof Settings)) {
      return settings;
    }

    return {
      api_key: settings.tvdb_api_key ?? '',
    };
  }

  @Post('/tvdb')
  async updateTvdbSetting(
    @Body(new ZodValidationPipe(tvdbSettingSchema))
    payload: TvdbSetting,
  ) {
    return await this.metadataSettingsService.updateTvdbSetting(payload);
  }

  @Delete('/tvdb')
  async removeTvdbSetting() {
    return await this.metadataSettingsService.removeTvdbSetting();
  }

  @Post('/test/tvdb')
  testTvdb(
    @Body(new ZodValidationPipe(tvdbSettingSchema))
    payload: TvdbSetting,
  ): Promise<BasicResponseDto> {
    return this.metadataSettingsService.testTvdb(payload);
  }

  @Get('/metadata-provider')
  async getMetadataProviderPreference(): Promise<{
    preference: MetadataProviderPreference;
  }> {
    const settings = await this.settingsOperationsService.getSettings();

    if (!(settings instanceof Settings)) {
      return { preference: MetadataProviderPreference.TMDB_PRIMARY };
    }

    return {
      preference:
        settings.metadata_provider_preference ??
        MetadataProviderPreference.TMDB_PRIMARY,
    };
  }

  @Post('/metadata-provider')
  async updateMetadataProviderPreference(
    @Body(new ZodValidationPipe(metadataProviderSettingSchema))
    payload: MetadataProviderSetting,
  ): Promise<BasicResponseDto> {
    return this.metadataSettingsService.updateMetadataProviderPreference(
      payload.preference,
    );
  }

  @Get('/metadata/writeback')
  async getMetadataWriteback(): Promise<{ enabled: boolean }> {
    const settings = await this.settingsOperationsService.getSettings();

    if (!(settings instanceof Settings)) {
      return { enabled: false };
    }

    return { enabled: settings.metadata_writeback ?? false };
  }

  @Post('/metadata/writeback')
  async updateMetadataWriteback(
    @Body(new ZodValidationPipe(metadataWritebackSettingSchema))
    payload: MetadataWritebackSetting,
  ): Promise<BasicResponseDto> {
    return this.metadataSettingsService.updateMetadataWriteback(
      payload.enabled,
    );
  }

  @Post('/metadata/refresh/:provider')
  async refreshMetadataCache(
    @Param('provider', new ParseEnumPipe(MetadataProvider))
    provider: MetadataProvider,
  ): Promise<BasicResponseDto> {
    return this.metadataSettingsService.refreshMetadataCache(provider);
  }

  // Unified Seerr endpoints (replaces both Overseerr and Jellyseerr)
  @Get(['/seerr', '/overseerr', '/jellyseerr'])
  async getSeerrSetting(): Promise<SeerrSetting | BasicResponseDto> {
    const settings = await this.settingsOperationsService.getSettings();

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
    return await this.settingsOperationsService.updateSeerrSetting(payload);
  }

  @Delete(['/seerr', '/overseerr', '/jellyseerr'])
  async removeSeerrSetting() {
    return await this.settingsOperationsService.removeSeerrSetting();
  }

  @Post(['/test/seerr', '/test/overseerr', '/test/jellyseerr'])
  testSeerr(
    @Body(new ZodValidationPipe(seerrSettingSchema))
    payload: SeerrSetting,
  ): Promise<BasicResponseDto> {
    return this.settingsOperationsService.testSeerr(payload);
  }

  @Get('/jellyfin')
  async getJellyfinSetting(): Promise<JellyfinSetting | BasicResponseDto> {
    const settings = await this.settingsOperationsService.getSettings();

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
    return this.settingsOperationsService.testJellyfin(payload);
  }

  @Post('/jellyfin')
  async saveJellyfinSettings(
    @Body(new ZodValidationPipe(jellyfinSettingSchema))
    payload: JellyfinSetting,
  ): Promise<BasicResponseDto> {
    return await this.settingsOperationsService.saveJellyfinSettings(payload);
  }

  @Delete('/jellyfin')
  async removeJellyfinSettings(): Promise<BasicResponseDto> {
    return await this.settingsOperationsService.removeJellyfinSettings();
  }

  // --------------------------------------------------------------------------
  // Emby
  // --------------------------------------------------------------------------

  @Get('/emby')
  async getEmbySetting(): Promise<EmbySetting | BasicResponseDto> {
    const settings = await this.settingsOperationsService.getSettings();

    if (!(settings instanceof Settings)) {
      return settings;
    }

    return {
      emby_url: settings.emby_url,
      emby_api_key: settings.emby_api_key,
      emby_user_id: settings.emby_user_id,
    };
  }

  @Post('/emby/test')
  testEmby(
    @Body(new ZodValidationPipe(embySettingSchema))
    payload: EmbySetting,
  ): Promise<BasicResponseDto> {
    return this.settingsOperationsService.testEmby(payload);
  }

  @Post('/emby')
  async saveEmbySettings(
    @Body(new ZodValidationPipe(embySettingSchema))
    payload: EmbySetting,
  ): Promise<BasicResponseDto> {
    return await this.settingsOperationsService.saveEmbySettings(payload);
  }

  @Delete('/emby')
  async removeEmbySettings(): Promise<BasicResponseDto> {
    return await this.settingsOperationsService.removeEmbySettings();
  }

  /**
   * Authenticate against an Emby server with username/password (Plex-style
   * login UX). Returns library/user lists for confirmation before save.
   */
  @Post('/emby/login')
  async loginEmby(
    @Body(new ZodValidationPipe(embyLoginRequestSchema))
    payload: EmbyLoginRequest,
  ) {
    return this.settingsOperationsService.loginEmby(
      payload.emby_url,
      payload.username,
      payload.password,
    );
  }

  @Delete('/sonarr/:id')
  async deleteSonarrSetting(@Param('id', new ParseIntPipe()) id: number) {
    return await this.settingsOperationsService.deleteSonarrSetting(id);
  }

  @Get('/test/plex')
  @ApiOperation({ summary: 'Test Plex server connectivity' })
  @ApiResponse({ status: 200, description: 'Plex connectivity test result' })
  testPlex() {
    return this.settingsOperationsService.testPlex();
  }

  @Get('/test/plex/auth')
  @ApiOperation({ summary: 'Validate stored Plex authentication token' })
  @ApiResponse({
    status: 200,
    description: 'Plex auth token validation result',
  })
  testPlexAuth() {
    return this.settingsOperationsService.testPlexAuthToken();
  }

  @Get('/plex/devices/servers')
  async getPlexServers() {
    return await this.settingsOperationsService.getPlexServers();
  }

  @Post('/cron/validate')
  validateSingleCron(@Body() payload: CronScheduleDto) {
    return this.settingsOperationsService.cronIsValid(payload.schedule)
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
