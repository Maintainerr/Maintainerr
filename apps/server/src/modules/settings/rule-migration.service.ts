import { MediaServerType } from '@maintainerr/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Application } from '../rules/constants/rules.constants';
import { RuleDto } from '../rules/dtos/rule.dto';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { Rules } from '../rules/entities/rules.entities';

/**
 * Properties that exist in Plex but NOT in Jellyfin.
 * Rules using these properties cannot be migrated.
 *
 * From rules.constants.ts, Plex has these properties that Jellyfin doesn't:
 * - 28: watchlist_isListedByUsers (Plex watchlist integration)
 * - 30: watchlist_isWatchlisted (Plex watchlist integration)
 * - 31: rating_imdb (external rating source)
 * - 32: rating_rottenTomatoesCritic (external rating source)
 * - 33: rating_rottenTomatoesAudience (external rating source)
 * - 34: rating_tmdb (external rating source)
 * - 35: rating_imdbShow (external rating source)
 * - 36: rating_rottenTomatoesCriticShow (external rating source)
 * - 37: rating_rottenTomatoesAudienceShow (external rating source)
 * - 38: rating_tmdbShow (external rating source)
 * - 39: collectionsIncludingSmart (smart collections)
 * - 40: sw_collections_including_parent_and_smart (smart collections)
 * - 41: sw_collection_names_including_parent_and_smart (smart collections)
 * - 42: collection_names_including_smart (smart collections)
 *
 * Note: Property 29 (sw_seasonLastEpisodeAiredAt) exists in BOTH Plex and Jellyfin
 */
const PLEX_ONLY_PROPERTIES = new Set([
  28, // watchlist_isListedByUsers
  30, // watchlist_isWatchlisted
  31, // rating_imdb
  32, // rating_rottenTomatoesCritic
  33, // rating_rottenTomatoesAudience
  34, // rating_tmdb
  35, // rating_imdbShow
  36, // rating_rottenTomatoesCriticShow
  37, // rating_rottenTomatoesAudienceShow
  38, // rating_tmdbShow
  39, // collectionsIncludingSmart
  40, // sw_collections_including_parent_and_smart
  41, // sw_collection_names_including_parent_and_smart
  42, // collection_names_including_smart
]);

/**
 * Properties that exist in Jellyfin but NOT in Plex.
 * Rules using these properties cannot be migrated.
 */
const JELLYFIN_ONLY_PROPERTIES = new Set<number>([
  // Currently none - Jellyfin properties are a subset of Plex
]);

export interface RuleMigrationResult {
  /** Total rules processed */
  totalRules: number;
  /** Successfully migrated rules */
  migratedRules: number;
  /** Rules that couldn't be migrated */
  skippedRules: number;
  /** Rule groups that had all rules migrated */
  fullyMigratedGroups: number;
  /** Rule groups that had some rules skipped */
  partiallyMigratedGroups: number;
  /** Rule groups that couldn't be migrated at all */
  skippedGroups: number;
  /** Details about skipped rules */
  skippedDetails: SkippedRuleDetail[];
}

export interface SkippedRuleDetail {
  ruleGroupId: number;
  ruleGroupName: string;
  ruleId: number;
  reason: string;
  propertyName?: string;
}

export interface RuleMigrationPreview {
  /** Can rules be migrated at all */
  canMigrate: boolean;
  /** Total rule groups */
  totalGroups: number;
  /** Total rules */
  totalRules: number;
  /** Rules that can be migrated */
  migratableRules: number;
  /** Rules that will be skipped */
  skippedRules: number;
  /** Details about what will be skipped */
  skippedDetails: SkippedRuleDetail[];
}

@Injectable()
export class RuleMigrationService {
  private readonly logger = new Logger(RuleMigrationService.name);

  constructor(
    @InjectRepository(Rules)
    private readonly rulesRepo: Repository<Rules>,
    @InjectRepository(RuleGroup)
    private readonly ruleGroupRepo: Repository<RuleGroup>,
  ) {}

  /**
   * Preview what will happen if rules are migrated between media servers.
   * Does not modify any data.
   */
  async previewMigration(
    fromServer: MediaServerType,
    toServer: MediaServerType,
  ): Promise<RuleMigrationPreview> {
    const sourceApp = this.getApplicationId(fromServer);
    // Validate target server type (throws if invalid)
    this.getApplicationId(toServer);
    const incompatibleProperties = this.getIncompatibleProperties(
      fromServer,
      toServer,
    );

    const allRules = await this.rulesRepo.find({
      relations: ['ruleGroup'],
    });

    const skippedDetails: SkippedRuleDetail[] = [];
    let migratableRules = 0;
    let skippedRules = 0;

    for (const rule of allRules) {
      const analysis = this.analyzeRule(
        rule,
        sourceApp,
        incompatibleProperties,
      );

      if (analysis.canMigrate) {
        migratableRules++;
      } else {
        skippedRules++;
        skippedDetails.push({
          ruleGroupId: rule.ruleGroup?.id ?? rule.ruleGroupId,
          ruleGroupName: rule.ruleGroup?.name ?? 'Unknown',
          ruleId: rule.id,
          reason: analysis.reason,
          propertyName: analysis.propertyName,
        });
      }
    }

    const totalGroups = await this.ruleGroupRepo.count();

    return {
      canMigrate: migratableRules > 0,
      totalGroups,
      totalRules: allRules.length,
      migratableRules,
      skippedRules,
      skippedDetails,
    };
  }

  /**
   * Migrate rules from one media server type to another.
   * This modifies the ruleJson in the database to use the target server's application ID.
   *
   * @param fromServer Source media server type
   * @param toServer Target media server type
   * @param skipIncompatible If true, skip rules that can't be migrated. If false, fail on first incompatible rule.
   */
  async migrateRules(
    fromServer: MediaServerType,
    toServer: MediaServerType,
    skipIncompatible = true,
  ): Promise<RuleMigrationResult> {
    const sourceApp = this.getApplicationId(fromServer);
    const targetApp = this.getApplicationId(toServer);
    const incompatibleProperties = this.getIncompatibleProperties(
      fromServer,
      toServer,
    );

    this.logger.log(
      `Starting rule migration from ${fromServer} (app ${sourceApp}) to ${toServer} (app ${targetApp})`,
    );

    const allRules = await this.rulesRepo.find({
      relations: ['ruleGroup'],
    });

    const result: RuleMigrationResult = {
      totalRules: allRules.length,
      migratedRules: 0,
      skippedRules: 0,
      fullyMigratedGroups: 0,
      partiallyMigratedGroups: 0,
      skippedGroups: 0,
      skippedDetails: [],
    };

    // Group rules by ruleGroupId for tracking group-level stats
    const rulesByGroup = new Map<number, Rules[]>();
    for (const rule of allRules) {
      const groupId = rule.ruleGroupId;
      if (!rulesByGroup.has(groupId)) {
        rulesByGroup.set(groupId, []);
      }
      rulesByGroup.get(groupId)!.push(rule);
    }

    // Track migration status per group
    const groupMigrationStatus = new Map<
      number,
      { migrated: number; skipped: number; total: number }
    >();

    for (const rule of allRules) {
      const groupId = rule.ruleGroupId;

      if (!groupMigrationStatus.has(groupId)) {
        groupMigrationStatus.set(groupId, {
          migrated: 0,
          skipped: 0,
          total: 0,
        });
      }
      const groupStatus = groupMigrationStatus.get(groupId)!;
      groupStatus.total++;

      const analysis = this.analyzeRule(
        rule,
        sourceApp,
        incompatibleProperties,
      );

      if (!analysis.canMigrate) {
        if (!skipIncompatible) {
          throw new Error(
            `Rule ${rule.id} in group "${rule.ruleGroup?.name}" cannot be migrated: ${analysis.reason}`,
          );
        }

        result.skippedRules++;
        groupStatus.skipped++;
        result.skippedDetails.push({
          ruleGroupId: groupId,
          ruleGroupName: rule.ruleGroup?.name ?? 'Unknown',
          ruleId: rule.id,
          reason: analysis.reason,
          propertyName: analysis.propertyName,
        });

        this.logger.warn(
          `Skipping rule ${rule.id}: ${analysis.reason}${analysis.propertyName ? ` (property: ${analysis.propertyName})` : ''}`,
        );
        continue;
      }

      // Migrate the rule
      try {
        const migratedJson = this.migrateRuleJson(
          rule.ruleJson,
          sourceApp,
          targetApp,
        );
        await this.rulesRepo.update(rule.id, { ruleJson: migratedJson });
        result.migratedRules++;
        groupStatus.migrated++;

        this.logger.debug(`Migrated rule ${rule.id}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to migrate rule ${rule.id}: ${errorMessage}`);
        result.skippedRules++;
        groupStatus.skipped++;
        result.skippedDetails.push({
          ruleGroupId: groupId,
          ruleGroupName: rule.ruleGroup?.name ?? 'Unknown',
          ruleId: rule.id,
          reason: `Migration error: ${errorMessage}`,
        });
      }
    }

    // Calculate group-level statistics
    for (const [, status] of groupMigrationStatus) {
      if (status.skipped === 0 && status.migrated > 0) {
        result.fullyMigratedGroups++;
      } else if (status.migrated === 0) {
        result.skippedGroups++;
      } else {
        result.partiallyMigratedGroups++;
      }
    }

    this.logger.log(
      `Rule migration complete: ${result.migratedRules}/${result.totalRules} rules migrated, ` +
        `${result.fullyMigratedGroups} groups fully migrated, ` +
        `${result.partiallyMigratedGroups} partially migrated, ` +
        `${result.skippedGroups} skipped`,
    );

    return result;
  }

  /**
   * Get the Application enum value for a media server type.
   */
  private getApplicationId(serverType: MediaServerType): Application {
    switch (serverType) {
      case MediaServerType.PLEX:
        return Application.PLEX;
      case MediaServerType.JELLYFIN:
        return Application.JELLYFIN;
      default:
        throw new Error(`Unknown media server type: ${serverType}`);
    }
  }

  /**
   * Get properties that exist in the source but not in the target server.
   */
  private getIncompatibleProperties(
    fromServer: MediaServerType,
    toServer: MediaServerType,
  ): Set<number> {
    if (
      fromServer === MediaServerType.PLEX &&
      toServer === MediaServerType.JELLYFIN
    ) {
      return PLEX_ONLY_PROPERTIES;
    }
    if (
      fromServer === MediaServerType.JELLYFIN &&
      toServer === MediaServerType.PLEX
    ) {
      return JELLYFIN_ONLY_PROPERTIES;
    }
    return new Set();
  }

  /**
   * Analyze a rule to determine if it can be migrated.
   */
  private analyzeRule(
    rule: Rules,
    sourceApp: Application,
    incompatibleProperties: Set<number>,
  ): { canMigrate: boolean; reason: string; propertyName?: string } {
    try {
      const ruleDto: RuleDto = JSON.parse(rule.ruleJson);

      // Check firstVal (required)
      if (ruleDto.firstVal && ruleDto.firstVal[0] === sourceApp) {
        const propertyId = ruleDto.firstVal[1];
        if (incompatibleProperties.has(propertyId)) {
          return {
            canMigrate: false,
            reason: `Uses property ID ${propertyId} which is not available in target server`,
            propertyName: this.getPropertyName(sourceApp, propertyId),
          };
        }
      }

      // Check lastVal (optional - for comparing two properties)
      if (ruleDto.lastVal && ruleDto.lastVal[0] === sourceApp) {
        const propertyId = ruleDto.lastVal[1];
        if (incompatibleProperties.has(propertyId)) {
          return {
            canMigrate: false,
            reason: `Uses property ID ${propertyId} in comparison which is not available in target server`,
            propertyName: this.getPropertyName(sourceApp, propertyId),
          };
        }
      }

      return { canMigrate: true, reason: '' };
    } catch (error) {
      return {
        canMigrate: false,
        reason: `Invalid rule JSON: ${error.message}`,
      };
    }
  }

  /**
   * Migrate a rule JSON string by replacing the source application ID with the target.
   */
  private migrateRuleJson(
    ruleJson: string,
    sourceApp: Application,
    targetApp: Application,
  ): string {
    const ruleDto: RuleDto = JSON.parse(ruleJson);

    // Migrate firstVal
    if (ruleDto.firstVal && ruleDto.firstVal[0] === sourceApp) {
      ruleDto.firstVal = [targetApp, ruleDto.firstVal[1]];
    }

    // Migrate lastVal (if present and from source app)
    if (ruleDto.lastVal && ruleDto.lastVal[0] === sourceApp) {
      ruleDto.lastVal = [targetApp, ruleDto.lastVal[1]];
    }

    return JSON.stringify(ruleDto);
  }

  /**
   * Get a human-readable property name for logging.
   */
  private getPropertyName(app: Application, propertyId: number): string {
    // Property names for Plex-specific properties
    const plexPropertyNames: Record<number, string> = {
      28: 'watchlist_isListedByUsers',
      30: 'watchlist_isWatchlisted',
      31: 'rating_imdb',
      32: 'rating_rottenTomatoesCritic',
      33: 'rating_rottenTomatoesAudience',
      34: 'rating_tmdb',
      35: 'rating_imdbShow',
    };

    if (app === Application.PLEX && plexPropertyNames[propertyId]) {
      return plexPropertyNames[propertyId];
    }

    return `property_${propertyId}`;
  }
}
