import { BasicResponseDto, TautulliSettingDto } from '@maintainerr/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CronScheduleDto } from "./dto's/cron.schedule.dto";
import { RadarrSettingRawDto } from "./dto's/radarr-setting.dto";
import { SettingDto } from "./dto's/setting.dto";
import { SonarrSettingRawDto } from "./dto's/sonarr-setting.dto";
import { Settings } from './entities/settings.entities';
import { SettingsService } from './settings.service';

@Controller('/api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
  @Post('/plex/token')
  updateAuthToken(@Body() payload: { plex_auth_token: string }) {
    return this.settingsService.savePlexApiAuthToken(payload.plex_auth_token);
  }
  @Get('/test/setup')
  testSetup() {
    return this.settingsService.testSetup();
  }
  @Get('/test/overseerr')
  testOverseerr() {
    return this.settingsService.testOverseerr();
  }
  @Get('/test/jellyseerr')
  testJellyseerr() {
    return this.settingsService.testJellyseerr();
  }
  @Get('/test/ombi')
  testOmbi() {
    return this.settingsService.testOmbi();
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
  async getTautulliSetting(): Promise<TautulliSettingDto | BasicResponseDto> {
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
  async updateTautlliSetting(@Body() payload: TautulliSettingDto) {
    return await this.settingsService.updateTautulliSetting(payload);
  }

  @Delete('/tautulli')
  async removeTautlliSetting() {
    return await this.settingsService.removeTautulliSetting();
  }

  @Post('/test/tautulli')
  testTautulli(@Body() payload: TautulliSettingDto): Promise<BasicResponseDto> {
    return this.settingsService.testTautulli(payload);
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
}
