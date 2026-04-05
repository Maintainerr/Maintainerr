import {
  BasicResponseDto,
  MaintainerrEvent,
  MetadataProviderPreference,
  TmdbSetting,
  TvdbSetting,
} from '@maintainerr/contracts';
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import cacheManager from '../api/lib/cache';
import {
  isBlankMediaServerId,
  shouldRefreshMetadataItemId,
} from '../api/media-server/media-server-id.utils';
import { MEDIA_SERVER_BATCH_SIZE } from '../api/media-server/media-server.constants';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import type { IMediaServerService } from '../api/media-server/media-server.interface';
import { TmdbApiService } from '../api/tmdb-api/tmdb.service';
import { TvdbApiService } from '../api/tvdb-api/tvdb.service';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { Settings } from './entities/settings.entities';
import { MetadataProvider } from './metadata-provider';

@Injectable()
export class MetadataSettingsService {
  private activeMetadataRefreshProvider: MetadataProvider | null = null;
  private refreshLockAcquired = false;

  constructor(
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
    @InjectRepository(CollectionMedia)
    private readonly collectionMediaRepo: Repository<CollectionMedia>,
    @Inject(forwardRef(() => MediaServerFactory))
    private readonly mediaServerFactory: MediaServerFactory,
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
    provider: MetadataProvider,
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
    } catch (error) {
      this.logger.error(
        `Error while updating ${provider.toUpperCase()} settings`,
      );
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  private async removeMetadataApiKey(
    provider: MetadataProvider,
  ): Promise<BasicResponseDto> {
    const column = `${provider}_api_key` as const;

    try {
      await this.saveSettings({ [column]: null } as Partial<Settings>);
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (error) {
      this.logger.error(`Error removing ${provider.toUpperCase()} settings`);
      this.logger.debug(error);
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
    } catch (error) {
      this.logger.error('Error while updating metadata provider preference');
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  public async refreshMetadataCache(
    provider: MetadataProvider,
  ): Promise<BasicResponseDto> {
    if (this.refreshLockAcquired) {
      return {
        status: 'OK',
        code: 1,
        message: `${(this.activeMetadataRefreshProvider ?? provider).toUpperCase()} metadata refresh is already in progress`,
      };
    }

    this.refreshLockAcquired = true;
    this.activeMetadataRefreshProvider = provider;

    try {
      const connection =
        provider === 'tmdb'
          ? await this.tmdbApi.testConnection()
          : await this.tvdbApi.testConnection();

      if (connection.code !== 1) {
        this.activeMetadataRefreshProvider = null;
        this.refreshLockAcquired = false;
        return { status: 'NOK', code: 0, message: connection.message };
      }

      cacheManager.getCache(provider)?.flush();
      this.logger.log(`${provider.toUpperCase()} metadata cache cleared`);

      void this.refreshMediaServerItems(provider, {
        retryFailedItemsWithMetadataLookup: true,
      }).finally(() => {
        this.activeMetadataRefreshProvider = null;
        this.refreshLockAcquired = false;
      });

      return {
        status: 'OK',
        code: 1,
        message: `${provider.toUpperCase()} metadata refresh started`,
      };
    } catch (error) {
      this.activeMetadataRefreshProvider = null;
      this.refreshLockAcquired = false;
      this.logger.error(
        `Error refreshing ${provider.toUpperCase()} metadata cache`,
      );
      this.logger.debug(error);
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  private async refreshMediaServerItems(
    provider: MetadataProvider,
    {
      retryFailedItemsWithMetadataLookup = false,
    }: {
      retryFailedItemsWithMetadataLookup?: boolean;
    } = {},
  ): Promise<void> {
    try {
      const mediaServer = await this.mediaServerFactory.getService();
      if (!mediaServer?.isSetup()) return;
      const serverType = mediaServer.getServerType();

      const providerColumn: Record<MetadataProvider, 'tmdbId' | 'tvdbId'> = {
        tmdb: 'tmdbId',
        tvdb: 'tvdbId',
      };
      const column = providerColumn[provider];
      const rows = await this.collectionMediaRepo
        .createQueryBuilder('cm')
        .select('DISTINCT cm.mediaServerId', 'mediaServerId')
        .where(`cm.${column} IS NOT NULL`)
        .andWhere(`cm.mediaServerId IS NOT NULL`)
        .andWhere(`cm.mediaServerId != ''`)
        .getRawMany<{ mediaServerId: string }>();

      if (rows.length === 0) return;

      const refreshableMediaServerIds = rows
        .map(({ mediaServerId }) => mediaServerId.trim())
        .filter((mediaServerId) =>
          shouldRefreshMetadataItemId(serverType, mediaServerId),
        );

      const skippedCount = rows.length - refreshableMediaServerIds.length;
      if (skippedCount > 0) {
        this.logger.warn(
          `Skipped ${skippedCount} item id(s) not recognized for ${serverType} while refreshing ${provider.toUpperCase()} metadata`,
        );
      }

      if (refreshableMediaServerIds.length === 0) return;

      let failed = 0;

      for (
        let index = 0;
        index < refreshableMediaServerIds.length;
        index += MEDIA_SERVER_BATCH_SIZE.METADATA_REFRESH
      ) {
        const batch = refreshableMediaServerIds.slice(
          index,
          index + MEDIA_SERVER_BATCH_SIZE.METADATA_REFRESH,
        );
        const results = await Promise.allSettled(
          batch.map((mediaServerId) =>
            this.refreshMediaServerItem(
              mediaServer,
              mediaServerId,
              retryFailedItemsWithMetadataLookup,
            ),
          ),
        );

        failed += results.filter(
          (result) => result.status === 'rejected',
        ).length;
      }

      this.logger.log(
        `${provider.toUpperCase()} media server refresh: ${refreshableMediaServerIds.length - failed}/${refreshableMediaServerIds.length} items queued`,
      );
      if (failed > 0) {
        this.logger.warn(`${failed} item(s) could not be refreshed`);
      }
    } catch (error) {
      this.logger.warn(
        `Could not refresh ${provider.toUpperCase()} items on media server`,
      );
      this.logger.debug(error);
    }
  }

  private async refreshMediaServerItem(
    mediaServer: IMediaServerService,
    itemId: string,
    retryFailedItemsWithMetadataLookup: boolean,
  ): Promise<void> {
    try {
      await mediaServer.refreshItemMetadata(itemId);
    } catch (error) {
      if (!retryFailedItemsWithMetadataLookup) {
        throw error;
      }

      const serverType = mediaServer.getServerType();
      this.logger.warn(
        `Initial ${serverType} metadata refresh failed for item ${itemId}; verifying item before one retry`,
      );
      this.logger.debug(error);

      let metadata;

      try {
        metadata = await mediaServer.getMetadata(itemId);
      } catch (lookupError) {
        this.logger.warn(
          `Failed to verify ${serverType} item ${itemId} after metadata refresh failure`,
        );
        this.logger.debug(lookupError);
        throw error;
      }

      if (!metadata || isBlankMediaServerId(metadata.id)) {
        this.logger.warn(
          `Skipping ${serverType} metadata refresh retry for item ${itemId}; item lookup did not return a usable id`,
        );
        throw error;
      }

      const verifiedItemId = metadata.id.trim();

      if (verifiedItemId !== itemId) {
        this.logger.warn(
          `Retrying ${serverType} metadata refresh with verified item id ${verifiedItemId} after failure on ${itemId}`,
        );
      } else {
        this.logger.warn(
          `Retrying ${serverType} metadata refresh for item ${itemId} after successful verification`,
        );
      }

      try {
        await mediaServer.refreshItemMetadata(verifiedItemId);
      } catch (retryError) {
        this.logger.warn(
          `Retried ${serverType} metadata refresh failed for item ${verifiedItemId}`,
        );
        this.logger.debug(retryError);
        throw retryError;
      }
    }
  }
}
