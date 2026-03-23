import {
  BasicResponseDto,
  MaintainerrEvent,
  MetadataProviderPreference,
  TmdbSetting,
  TvdbSetting,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TmdbApiService } from '../api/tmdb-api/tmdb.service';
import { TvdbApiService } from '../api/tvdb-api/tvdb.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { Settings } from './entities/settings.entities';

@Injectable()
export class MetadataSettingsService {
  constructor(
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
    private readonly eventEmitter: EventEmitter2,
    private readonly tmdbApi: TmdbApiService,
    private readonly tvdbApi: TvdbApiService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(MetadataSettingsService.name);
  }

  private async saveSettings(update: Partial<Settings>): Promise<Settings> {
    const settingsDb = await this.settingsRepo.findOne({ where: {} });

    const updatedSettings = await this.settingsRepo.save({
      ...settingsDb,
      ...update,
    });

    this.eventEmitter.emit(MaintainerrEvent.Settings_Updated, {
      oldSettings: settingsDb,
      settings: updatedSettings,
    });

    return updatedSettings;
  }

  private async updateMetadataApiKey(
    provider: 'tmdb' | 'tvdb',
    apiKey: string,
    validateApiKey: (apiKey: string) => Promise<BasicResponseDto>,
  ): Promise<BasicResponseDto> {
    const column = `${provider}_api_key` as const;

    try {
      const validation = await validateApiKey(apiKey);
      if (validation.code !== 1) {
        return validation;
      }

      await this.saveSettings({ [column]: apiKey } as Partial<Settings>);
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error(
        `Error while updating ${provider.toUpperCase()} settings: `,
        e,
      );
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  private async removeMetadataApiKey(
    provider: 'tmdb' | 'tvdb',
  ): Promise<BasicResponseDto> {
    const column = `${provider}_api_key` as const;

    try {
      await this.saveSettings({ [column]: null } as Partial<Settings>);
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error(
        `Error removing ${provider.toUpperCase()} settings: `,
        e,
      );
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async updateTmdbSetting(
    settings: TmdbSetting,
  ): Promise<BasicResponseDto> {
    return this.updateMetadataApiKey('tmdb', settings.api_key, (apiKey) =>
      this.tmdbApi.testConnection(apiKey),
    );
  }

  public async removeTmdbSetting(): Promise<BasicResponseDto> {
    return this.removeMetadataApiKey('tmdb');
  }

  public async testTmdb(setting?: TmdbSetting): Promise<BasicResponseDto> {
    return this.tmdbApi.testConnection(setting?.api_key);
  }

  public async updateTvdbSetting(
    settings: TvdbSetting,
  ): Promise<BasicResponseDto> {
    return this.updateMetadataApiKey('tvdb', settings.api_key, (apiKey) =>
      this.tvdbApi.testConnection(apiKey),
    );
  }

  public async removeTvdbSetting(): Promise<BasicResponseDto> {
    return this.removeMetadataApiKey('tvdb');
  }

  public async testTvdb(setting?: TvdbSetting): Promise<BasicResponseDto> {
    return this.tvdbApi.testConnection(setting?.api_key);
  }

  public async updateMetadataProviderPreference(
    preference: MetadataProviderPreference,
  ): Promise<BasicResponseDto> {
    try {
      await this.saveSettings({ metadata_provider_preference: preference });

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.error(
        'Error while updating metadata provider preference: ',
        e,
      );
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }
}
