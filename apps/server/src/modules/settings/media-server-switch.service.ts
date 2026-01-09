import {
  MediaServerSwitchPreview,
  MediaServerType,
  SwitchMediaServerRequest,
  SwitchMediaServerResponse,
} from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JellyfinAdapterService } from '../api/media-server/jellyfin/jellyfin-adapter.service';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionLog } from '../collections/entities/collection_log.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { RuleMigrationService } from './rule-migration.service';
import { SettingsService } from './settings.service';

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
    @Inject(forwardRef(() => PlexApiService))
    private readonly plexApi: PlexApiService,
    @Inject(forwardRef(() => JellyfinAdapterService))
    private readonly jellyfinAdapter: JellyfinAdapterService,
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(CollectionMedia)
    private readonly collectionMediaRepo: Repository<CollectionMedia>,
    @InjectRepository(CollectionLog)
    private readonly collectionLogRepo: Repository<CollectionLog>,
    @InjectRepository(Exclusion)
    private readonly exclusionRepo: Repository<Exclusion>,
    @InjectRepository(RuleGroup)
    private readonly ruleGroupRepo: Repository<RuleGroup>,
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

    // Count media server-specific data
    const collectionsCount = await this.collectionRepo.count();
    const collectionMediaCount = await this.collectionMediaRepo.count();
    const exclusionsCount = await this.exclusionRepo.count();
    const collectionLogsCount = await this.collectionLogRepo.count();

    // Preview rule migration
    const ruleMigrationPreview =
      await this.ruleMigrationService.previewMigration(
        currentServerType,
        targetServerType,
      );

    return {
      currentServerType,
      targetServerType,
      dataToBeCleared: {
        collections: collectionsCount,
        collectionMedia: collectionMediaCount,
        exclusions: exclusionsCount,
        collectionLogs: collectionLogsCount,
      },
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

      // Count data before clearing (for response)
      const collectionsCount = await this.collectionRepo.count();
      const collectionMediaCount = await this.collectionMediaRepo.count();
      const exclusionsCount = await this.exclusionRepo.count();
      const collectionLogsCount = await this.collectionLogRepo.count();

      // Migrate rules if requested (BEFORE clearing data)
      let ruleMigrationResult = undefined;
      if (migrateRules) {
        this.logger.log('Attempting rule migration...');
        ruleMigrationResult = await this.ruleMigrationService.migrateRules(
          currentServerType,
          targetServerType,
          true, // skipIncompatible
        );
        this.logger.log(
          `Rule migration complete: ${ruleMigrationResult.migratedRules}/${ruleMigrationResult.totalRules} rules migrated`,
        );
      }

      // Clear media server-specific data in correct order (respecting foreign keys)
      await this.clearMediaServerData(migrateRules, targetServerType, {
        collectionsCount,
        collectionMediaCount,
        exclusionsCount,
        collectionLogsCount,
      });

      // Update settings and uninitialize old server
      await this.settingsService.updateMediaServerType(
        targetServerType,
        currentServerType,
      );

      // Uninitialize old media server adapter
      this.uninitializeOldServer(currentServerType);

      this.logger.log(
        `Successfully switched media server to ${targetServerType}`,
      );

      const response: SwitchMediaServerResponse = {
        status: 'OK',
        code: 1,
        message: currentServerType
          ? migrateRules
            ? `Successfully switched from ${currentServerType} to ${targetServerType}. ${ruleMigrationResult?.migratedRules || 0} rules migrated. Rule groups need library re-assignment.`
            : `Successfully switched from ${currentServerType} to ${targetServerType}`
          : `Successfully set ${targetServerType} as media server`,
        clearedData: {
          collections: collectionsCount,
          collectionMedia: collectionMediaCount,
          exclusions: exclusionsCount,
          collectionLogs: collectionLogsCount,
        },
      };

      if (ruleMigrationResult) {
        response.ruleMigration = ruleMigrationResult;
      }

      return response;
    } catch (error) {
      this.logger.error(`Error switching media server: ${error}`);
      return {
        status: 'NOK',
        code: 0,
        message: `Failed to switch media server: ${error.message || error}`,
      };
    }
  }

  /**
   * Clear media server-specific data in the correct order (respecting foreign keys).
   * All operations are wrapped in a transaction for atomicity.
   */
  private async clearMediaServerData(
    migrateRules: boolean,
    targetServerType: MediaServerType,
    counts: {
      collectionsCount: number;
      collectionMediaCount: number;
      exclusionsCount: number;
      collectionLogsCount: number;
    },
  ): Promise<void> {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Collection media (references collections)
      await queryRunner.manager.clear(CollectionMedia);
      this.logger.log(
        `Cleared ${counts.collectionMediaCount} collection media items`,
      );

      // 2. Collection logs (references collections)
      await queryRunner.manager.clear(CollectionLog);
      this.logger.log(`Cleared ${counts.collectionLogsCount} collection logs`);

      // 3. Exclusions (references rule groups)
      await queryRunner.manager.clear(Exclusion);
      this.logger.log(`Cleared ${counts.exclusionsCount} exclusions`);

      // If NOT migrating rules, also clear rules and rule groups
      if (!migrateRules) {
        // 4. Rule groups (references collections via OneToOne) - cascades to rules
        await queryRunner.manager.clear(RuleGroup);
        this.logger.log(`Cleared rule groups and rules`);

        // 5. Collections - only clear if not migrating
        await queryRunner.manager.clear(Collection);
        this.logger.log(`Cleared ${counts.collectionsCount} collections`);
      } else {
        // When migrating rules, preserve collections but reset media server references
        // 1. Reset libraryId on rule groups (will need to be re-assigned by user)
        // 2. Keep collectionId linked so the collection metadata is preserved
        await queryRunner.manager
          .createQueryBuilder()
          .update(RuleGroup)
          .set({
            libraryId: '', // Mark as needing library assignment
          })
          .execute();

        // 3. Reset media server ID on collections (the Plex/Jellyfin collection will be recreated)
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
          `Preserved ${counts.collectionsCount} collections, reset media server references`,
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Uninitialize the old media server adapter
   */
  private uninitializeOldServer(
    currentServerType: MediaServerType | null,
  ): void {
    if (currentServerType === MediaServerType.PLEX) {
      this.plexApi.uninitialize();
    } else if (currentServerType === MediaServerType.JELLYFIN) {
      this.jellyfinAdapter.uninitialize();
    }
  }
}
