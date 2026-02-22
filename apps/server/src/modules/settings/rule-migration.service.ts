import {
  MediaServerType,
  RuleMigrationPreview,
  RuleMigrationResult,
  SkippedRuleDetail,
} from '@maintainerr/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Application, RuleConstants } from '../rules/constants/rules.constants';
import { RuleDto } from '../rules/dtos/rule.dto';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { Rules } from '../rules/entities/rules.entities';

/** Singleton instance – avoids re-creating the constant data on every call. */
const RULE_CONSTANTS = new RuleConstants();

/**
 * Outcome of checking whether a single rule can be migrated.
 */
interface RuleAnalysis {
  canMigrate: boolean;
  reason: string;
  propertyName?: string;
}

/**
 * Result of comparing property compatibility between two media server apps.
 */
interface PropertyCompatibility {
  /** Property IDs from the source that have no equivalent in the target. */
  incompatible: Set<number>;
  /**
   * Property IDs that exist in the source under a different name/ID in the
   * target.  Map key = source property ID, value = target property ID.
   * During migration the property ID is rewritten so the rule keeps working.
   *
   * Example: Plex `collectionsIncludingSmart` (39) → Jellyfin `collections` (6)
   * because Jellyfin has no smart-collection concept and falls back to regular
   * collections.
   */
  remapping: Map<number, number>;
}

/**
 * Dynamically compute the set of property IDs that exist in the source server
 * but are NOT compatible with the target server, together with a remapping
 * table for properties that have a different-name equivalent in the target.
 *
 * A property is:
 * - **compatible** if the target has a property with the same `(id, name)`.
 * - **remappable** if the target has a property with the same `name` (or the
 *   property declares a `migrateTo` fallback name) that resolves to a target
 *   property.  The ID will be rewritten during migration.
 * - **incompatible** if none of the above applies.
 *
 * This is fully data-driven from `rules.constants.ts` — no hardcoded lists.
 */
function computePropertyCompatibility(
  sourceApp: Application,
  targetApp: Application,
): PropertyCompatibility {
  const sourceAppDef = RULE_CONSTANTS.applications.find(
    (a) => a.id === sourceApp,
  );
  const targetAppDef = RULE_CONSTANTS.applications.find(
    (a) => a.id === targetApp,
  );

  if (!sourceAppDef || !targetAppDef) {
    return { incompatible: new Set(), remapping: new Map() };
  }

  // Build target lookups: by (id → name) and by (name → id)
  const targetIdToName = new Map<number, string>();
  const targetNameToId = new Map<string, number>();
  for (const prop of targetAppDef.props) {
    targetIdToName.set(prop.id, prop.name);
    targetNameToId.set(prop.name, prop.id);
  }

  const incompatible = new Set<number>();
  const remapping = new Map<number, number>();

  for (const prop of sourceAppDef.props) {
    const targetName = targetIdToName.get(prop.id);

    // Exact (id, name) match → compatible, nothing to do
    if (targetName === prop.name) continue;

    // Name exists in target at a different ID → remappable
    const targetId = targetNameToId.get(prop.name);
    if (targetId !== undefined) {
      remapping.set(prop.id, targetId);
      continue;
    }

    // Check migrateTo fallback declared on the property itself
    if (prop.migrateTo) {
      const fallbackTargetId = targetNameToId.get(prop.migrateTo);
      if (fallbackTargetId !== undefined) {
        remapping.set(prop.id, fallbackTargetId);
        continue;
      }
    }

    // No match at all → incompatible
    incompatible.add(prop.id);
  }

  return { incompatible, remapping };
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
    const targetApp = this.getApplicationId(toServer);
    const compat = computePropertyCompatibility(sourceApp, targetApp);

    const allRules = await this.rulesRepo.find({
      relations: ['ruleGroup'],
    });

    const skippedDetails: SkippedRuleDetail[] = [];
    let migratableRules = 0;
    let skippedRules = 0;

    for (const rule of allRules) {
      const analysis = this.analyzeRule(rule, sourceApp, compat);

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
    manager?: EntityManager,
  ): Promise<RuleMigrationResult> {
    const rulesRepo = manager ? manager.getRepository(Rules) : this.rulesRepo;
    const ruleGroupRepo = manager
      ? manager.getRepository(RuleGroup)
      : this.ruleGroupRepo;

    const sourceApp = this.getApplicationId(fromServer);
    const targetApp = this.getApplicationId(toServer);
    const compat = computePropertyCompatibility(sourceApp, targetApp);

    this.logger.log(
      `Starting rule migration from ${fromServer} (app ${sourceApp}) to ${toServer} (app ${targetApp})`,
    );

    if (compat.remapping.size > 0) {
      this.logger.log(
        `Property remapping: ${[...compat.remapping.entries()].map(([s, t]) => `${getPropertyName(sourceApp, s)} (${s})→${getPropertyName(targetApp, t)} (${t})`).join(', ')}`,
      );
    }

    const allRules = await rulesRepo.find({
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

      const analysis = this.analyzeRule(rule, sourceApp, compat);

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
          `Deleting incompatible rule ${rule.id}: ${analysis.reason}${analysis.propertyName ? ` (property: ${analysis.propertyName})` : ''}`,
        );
        await rulesRepo.delete(rule.id);
        continue;
      }

      // Migrate the rule
      try {
        const migratedJson = this.migrateRuleJson(
          rule.ruleJson,
          sourceApp,
          targetApp,
          compat.remapping,
        );
        await rulesRepo.update(rule.id, { ruleJson: migratedJson });
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

    // Calculate group-level statistics and clean up empty groups
    for (const [groupId, status] of groupMigrationStatus) {
      if (status.skipped === 0 && status.migrated > 0) {
        result.fullyMigratedGroups++;
      } else if (status.migrated === 0 && status.skipped > 0) {
        result.skippedGroups++;
        await ruleGroupRepo.delete(groupId);
        this.logger.log(
          `Deleted rule group ${groupId} - all ${status.skipped} rules were incompatible`,
        );
      } else if (status.migrated > 0 && status.skipped > 0) {
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
   * Migrate in-memory RuleDto objects to match the configured media server type.
   * This is intended for imports (e.g. community/YAML) and does not touch the DB.
   *
   * Behavior:
   * - Auto-detects source app per rule (Plex/Jellyfin only)
   * - Rewrites firstVal/lastVal app ID to the target app
   * - Skips rules that use properties not available on the target server
   */
  migrateImportedRuleDtos(
    rules: RuleDto[],
    toServer: MediaServerType,
  ): { rules: RuleDto[]; migratedRules: number; skippedRules: number } {
    if (!Array.isArray(rules) || rules.length === 0) {
      return { rules, migratedRules: 0, skippedRules: 0 };
    }

    const targetApp = this.getApplicationId(toServer);

    // Cache compatibility per source app – avoids recomputing for every rule.
    const compatCache = new Map<Application, PropertyCompatibility>();

    let migratedRules = 0;
    let skippedRules = 0;

    const migrated = rules.map((rule) => {
      const sourceApp = this.detectRuleSourceApp(rule);

      // Only migrate if rule clearly belongs to Plex/Jellyfin and is not already on target.
      if (sourceApp === undefined || sourceApp === targetApp) {
        return rule;
      }

      if (!compatCache.has(sourceApp)) {
        compatCache.set(
          sourceApp,
          computePropertyCompatibility(sourceApp, targetApp),
        );
      }
      const compat = compatCache.get(sourceApp)!;

      const analysis = this.analyzeRuleDto(rule, sourceApp, compat);
      if (!analysis.canMigrate) {
        skippedRules += 1;
        this.logger.warn(
          `Skipping imported rule migration: ${analysis.reason}${analysis.propertyName ? ` (property: ${analysis.propertyName})` : ''}`,
        );
        return undefined;
      }

      migratedRules += 1;
      return this.migrateRuleDto(rule, sourceApp, targetApp, compat.remapping);
    });

    return {
      rules: migrated.filter((rule): rule is RuleDto => rule !== undefined),
      migratedRules,
      skippedRules,
    };
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
   * Analyze a persisted rule to determine if it can be migrated.
   */
  private analyzeRule(
    rule: Rules,
    sourceApp: Application,
    compat: PropertyCompatibility,
  ): RuleAnalysis {
    try {
      const ruleDto: RuleDto = JSON.parse(rule.ruleJson);
      return this.analyzeRuleDto(ruleDto, sourceApp, compat);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        canMigrate: false,
        reason: `Invalid rule JSON: ${message}`,
      };
    }
  }

  /**
   * Analyze an in-memory rule DTO to determine if it can be migrated.
   * Only the `incompatible` set is checked — remapped properties are compatible
   * by definition (the two sets are mutually exclusive).
   */
  private analyzeRuleDto(
    ruleDto: RuleDto,
    sourceApp: Application,
    { incompatible }: PropertyCompatibility,
  ): RuleAnalysis {
    // Check firstVal (required)
    if (ruleDto.firstVal && ruleDto.firstVal[0] === sourceApp) {
      const propertyId = ruleDto.firstVal[1];
      if (incompatible.has(propertyId)) {
        return {
          canMigrate: false,
          reason: `Uses property ID ${propertyId} which is not available in target server`,
          propertyName: getPropertyName(sourceApp, propertyId),
        };
      }
    }

    // Check lastVal (optional)
    if (ruleDto.lastVal && ruleDto.lastVal[0] === sourceApp) {
      const propertyId = ruleDto.lastVal[1];
      if (incompatible.has(propertyId)) {
        return {
          canMigrate: false,
          reason: `Uses property ID ${propertyId} in comparison which is not available in target server`,
          propertyName: getPropertyName(sourceApp, propertyId),
        };
      }
    }

    return { canMigrate: true, reason: '' };
  }

  private detectRuleSourceApp(
    rule: RuleDto,
  ): Application.PLEX | Application.JELLYFIN | undefined {
    const firstApp = rule.firstVal?.[0];
    const lastApp = rule.lastVal?.[0];

    if (firstApp !== Application.PLEX && firstApp !== Application.JELLYFIN) {
      return undefined;
    }

    if (lastApp !== undefined && lastApp !== firstApp) {
      return undefined;
    }

    return firstApp;
  }

  private migrateRuleDto(
    ruleDto: RuleDto,
    sourceApp: Application,
    targetApp: Application,
    remapping: Map<number, number> = new Map(),
  ): RuleDto {
    const migrated: RuleDto = JSON.parse(JSON.stringify(ruleDto));

    if (migrated.firstVal && migrated.firstVal[0] === sourceApp) {
      const propId = migrated.firstVal[1];
      migrated.firstVal = [targetApp, remapping.get(propId) ?? propId];
    }

    if (migrated.lastVal && migrated.lastVal[0] === sourceApp) {
      const propId = migrated.lastVal[1];
      migrated.lastVal = [targetApp, remapping.get(propId) ?? propId];
    }

    return migrated;
  }

  /**
   * Migrate a rule JSON string by replacing the source application ID with the
   * target, and remapping property IDs where the same property exists at a
   * different ID in the target.
   */
  private migrateRuleJson(
    ruleJson: string,
    sourceApp: Application,
    targetApp: Application,
    remapping: Map<number, number> = new Map(),
  ): string {
    const ruleDto: RuleDto = JSON.parse(ruleJson);
    const migrated = this.migrateRuleDto(
      ruleDto,
      sourceApp,
      targetApp,
      remapping,
    );
    return JSON.stringify(migrated);
  }
}

/**
 * Get a human-readable property name for logging.
 */
function getPropertyName(app: Application, propertyId: number): string {
  const appDef = RULE_CONSTANTS.applications.find((a) => a.id === app);
  const prop = appDef?.props.find((p) => p.id === propertyId);
  return prop?.name ?? `property_${propertyId}`;
}
