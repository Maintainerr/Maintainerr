import {
  MediaServerSwitchPreview,
  MediaServerType,
  SwitchMediaServerRequest,
  SwitchMediaServerResponse,
} from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionLog } from '../collections/entities/collection_log.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { Settings } from './entities/settings.entities';
import { RuleMigrationService } from './rule-migration.service';
import { SettingsService } from './settings.service';

interface MediaServerDataCounts {
  collections: number;
  collectionMedia: number;
  exclusions: number;
  collectionLogs: number;
}

/**
 * Service for handling media server switching operations.
 *
 * Extracted from SettingsService to follow Single Responsibility Principle.
 * This service orchestrates the complex process of switching between
 * Plex and Jellyfin, including data cleanup and rule migration.
 */
@Injectable()
export class MediaServerSwitchService {
  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => MediaServerFactory))
    private readonly mediaServerFactory: MediaServerFactory,
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(CollectionMedia)
    private readonly collectionMediaRepo: Repository<CollectionMedia>,
    @InjectRepository(CollectionLog)
    private readonly collectionLogRepo: Repository<CollectionLog>,
    @InjectRepository(Exclusion)
    private readonly exclusionRepo: Repository<Exclusion>,
    private readonly connection: DataSource,
    private readonly ruleMigrationService: RuleMigrationService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(MediaServerSwitchService.name);
  }

  /**
   * Preview what data will be cleared when switching media servers
   */
  async previewSwitch(
    targetServerType: MediaServerType,
  ): Promise<MediaServerSwitchPreview> {
    const currentServerType = this.settingsService.getMediaServerType();
    const dataToBeCleared = await this.getMediaServerDataCounts();

    // Preview rule migration
    const ruleMigrationPreview = currentServerType
      ? await this.ruleMigrationService.previewMigration(
          currentServerType,
          targetServerType,
        )
      : undefined;

    return {
      currentServerType,
      targetServerType,
      dataToBeCleared,
      dataToBeKept: {
        generalSettings: true,
        radarrSettings: await this.settingsService.getRadarrSettingsCount(),
        sonarrSettings: await this.settingsService.getSonarrSettingsCount(),
        overseerrSettings: this.settingsService.overseerrConfigured(),
        jellyseerrSettings: this.settingsService.jellyseerrConfigured(),
        tautulliSettings: this.settingsService.tautulliConfigured(),
        notificationSettings: true,
      },
      ruleMigration: ruleMigrationPreview,
    };
  }

  /**
   * Switch media server type and clear media server-specific data.
   *
   * Keeps: general settings, *arr settings, notification settings
   * Clears: collections, collection media, exclusions, collection logs
   * Optionally migrates rules if migrateRules is true
   */
  async executeSwitch(
    request: SwitchMediaServerRequest,
  ): Promise<SwitchMediaServerResponse> {
    const { targetServerType, migrateRules } = request;

    // Get current server type - don't default to PLEX on fresh install
    const currentServerType = this.settingsService.getMediaServerType();

    // Check if already on target server type (only if currentServerType is actually set)
    if (currentServerType && currentServerType === targetServerType) {
      return {
        status: 'NOK',
        code: 0,
        message: `Already using ${targetServerType} as media server`,
      };
    }

    try {
      this.logger.log(
        currentServerType
          ? `Switching media server from ${currentServerType} to ${targetServerType}${migrateRules ? ' (with rule migration)' : ''}`
          : `Setting initial media server to ${targetServerType}`,
      );

      const dataToBeCleared = await this.getMediaServerDataCounts();

      const queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      let ruleMigrationResult = undefined;

      try {
        // Migrate rules if requested (inside transaction)
        if (migrateRules && currentServerType) {
          this.logger.log('Attempting rule migration...');
          ruleMigrationResult = await this.ruleMigrationService.migrateRules(
            currentServerType,
            targetServerType,
            true, // skipIncompatible
            queryRunner.manager,
          );
          this.logger.log(
            `Rule migration complete: ${ruleMigrationResult.migratedRules}/${ruleMigrationResult.totalRules} rules migrated`,
          );
        }

        // Clear media server-specific data in correct order (respecting foreign keys)
        await this.clearMediaServerData(
          queryRunner,
          migrateRules,
          targetServerType,
          dataToBeCleared,
        );

        await this.updateMediaServerTypeInTransaction(
          queryRunner,
          targetServerType,
          currentServerType,
        );

        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }

      // Refresh in-memory settings and uninitialize old server after commit
      await this.settingsService.init();

      // Uninitialize old media server adapter
      this.uninitializeOldServer(currentServerType);

      this.logger.log(
        `Successfully switched media server to ${targetServerType}`,
      );

      const response: SwitchMediaServerResponse = {
        status: 'OK',
        code: 1,
        message: this.buildSwitchSuccessMessage(
          currentServerType,
          targetServerType,
          migrateRules,
          ruleMigrationResult,
        ),
        clearedData: dataToBeCleared,
      };

      if (ruleMigrationResult) {
        response.ruleMigration = ruleMigrationResult;
      }

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error switching media server: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        status: 'NOK',
        code: 0,
        message:
          'Failed to switch media server. Please check your configuration and try again.',
      };
    }
  }

  /**
   * Clear media server-specific data in the correct order (respecting foreign keys).
   * All operations are wrapped in a transaction for atomicity.
   */
  private async clearMediaServerData(
    queryRunner: QueryRunner,
    migrateRules: boolean,
    targetServerType: MediaServerType,
    counts: MediaServerDataCounts,
  ): Promise<void> {
    // 1. Collection media (references collections)
    await queryRunner.manager.clear(CollectionMedia);
    this.logger.log(`Cleared ${counts.collectionMedia} collection media items`);

    // 2. Collection logs (references collections)
    await queryRunner.manager.clear(CollectionLog);
    this.logger.log(`Cleared ${counts.collectionLogs} collection logs`);

    // 3. Exclusions (references rule groups)
    await queryRunner.manager.clear(Exclusion);
    this.logger.log(`Cleared ${counts.exclusions} exclusions`);

    if (!migrateRules) {
      // 4. Rule groups (references collections via OneToOne) - cascades to rules
      await queryRunner.manager.clear(RuleGroup);
      this.logger.log(`Cleared rule groups and rules`);

      // 5. Collections - only clear if not migrating
      await queryRunner.manager.clear(Collection);
      this.logger.log(`Cleared ${counts.collections} collections`);
    } else {
      // When migrating rules, preserve collections but reset media server references:
      // - Reset libraryId on rule groups (will need to be re-assigned by user)
      // - Deactivate rule groups so they can't run without a valid library
      // - Keep collectionId linked so the collection metadata is preserved
      await queryRunner.manager
        .createQueryBuilder()
        .update(RuleGroup)
        .set({
          libraryId: '', // Mark as needing library assignment
          isActive: false, // Prevent execution until user re-assigns library
        })
        .execute();

      // Reset media server ID on collections (the Plex/Jellyfin collection will be recreated)
      // Also reset libraryId since library IDs differ between servers
      await queryRunner.manager
        .createQueryBuilder()
        .update(Collection)
        .set({
          mediaServerId: null,
          mediaServerType: targetServerType,
          libraryId: '', // Will be updated when user assigns library
        })
        .execute();

      this.logger.log(
        `Preserved ${counts.collections} collections, reset media server references`,
      );
    }
  }

  private async getMediaServerDataCounts(): Promise<MediaServerDataCounts> {
    const [collections, collectionMedia, exclusions, collectionLogs] =
      await Promise.all([
        this.collectionRepo.count(),
        this.collectionMediaRepo.count(),
        this.exclusionRepo.count(),
        this.collectionLogRepo.count(),
      ]);

    return {
      collections,
      collectionMedia,
      exclusions,
      collectionLogs,
    };
  }

  private buildSwitchSuccessMessage(
    currentServerType: MediaServerType | null,
    targetServerType: MediaServerType,
    migrateRules: boolean | undefined,
    ruleMigrationResult?: SwitchMediaServerResponse['ruleMigration'],
  ): string {
    if (!currentServerType) {
      return `Successfully set ${targetServerType} as media server`;
    }

    if (!migrateRules || !ruleMigrationResult) {
      return `Successfully switched from ${currentServerType} to ${targetServerType}`;
    }

    const skippedSummary =
      ruleMigrationResult.skippedRules > 0
        ? ` (${ruleMigrationResult.skippedRules} skipped due to incompatible properties)`
        : '';

    return (
      `Successfully switched from ${currentServerType} to ${targetServerType}. ` +
      `${ruleMigrationResult.migratedRules} of ${ruleMigrationResult.totalRules} rules migrated` +
      `${skippedSummary}. Rule groups have been deactivated and need library re-assignment.`
    );
  }

  private async updateMediaServerTypeInTransaction(
    queryRunner: QueryRunner,
    targetServerType: MediaServerType,
    currentServerType: MediaServerType | null,
  ): Promise<void> {
    const settingsDb = await queryRunner.manager.findOne(Settings, {
      where: {},
    });

    if (!settingsDb) {
      throw new Error('Settings not found');
    }

    const updatedSettings: Partial<Settings> = {
      ...settingsDb,
      media_server_type: targetServerType,
    };

    if (currentServerType === MediaServerType.PLEX) {
      updatedSettings.plex_name = null;
      updatedSettings.plex_hostname = null;
      updatedSettings.plex_port = null;
      updatedSettings.plex_ssl = null;
      updatedSettings.plex_auth_token = null;
    } else if (currentServerType === MediaServerType.JELLYFIN) {
      updatedSettings.jellyfin_url = null;
      updatedSettings.jellyfin_api_key = null;
      updatedSettings.jellyfin_user_id = null;
      updatedSettings.jellyfin_server_name = null;
    }

    await queryRunner.manager.save(Settings, updatedSettings);
  }

  /**
   * Uninitialize the old media server adapter
   */
  private uninitializeOldServer(
    currentServerType: MediaServerType | null,
  ): void {
    if (currentServerType) {
      this.mediaServerFactory.uninitializeServer(currentServerType);
    }
  }
}
