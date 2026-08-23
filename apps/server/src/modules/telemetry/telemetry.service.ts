import {
  bucket,
  MediaItemTypes,
  ServarrAction,
  sizeBucket,
  TELEMETRY_MAX_RULE_PROPERTIES,
  TELEMETRY_MAX_RULE_PROPERTY_LENGTH,
  TELEMETRY_SAMPLE_DIVISOR,
  TelemetryPing,
  TelemetryStatus,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync } from 'fs';
import { Repository } from 'typeorm';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { Notification } from '../notifications/entities/notification.entities';
import { NotificationAgentKey } from '../notifications/notifications-interfaces';
import { RuleConstanstService } from '../rules/constants/constants.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { Rules } from '../rules/entities/rules.entities';
import { SettingsDataService } from '../settings/settings-data.service';
import { TasksService } from '../tasks/tasks.service';
import {
  RELEASE_VERSION_TAGS,
  VersionService,
} from '../version/version.service';
import { TelemetryApi } from './telemetry-api.helper';
import { TELEMETRY_TASK_NAME } from './telemetry.constants';

type TelemetrySample = NonNullable<TelemetryPing['sample']>;

const MILLISECONDS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
/**
 * The gap between sampled weeks is geometric, so a short bound silently returns
 * null for the unlucky tail: at 5x, 1 install in 157 had no date despite having
 * one scheduled.
 */
const SAMPLE_SCAN_WEEKS = TELEMETRY_SAMPLE_DIVISOR * 50;

/** Sorted so the surviving subset is deterministic rather than row order. */
const finalizeList = (values: string[], max: number): string[] =>
  [...new Set(values)].sort().slice(0, max);

@Injectable()
export class TelemetryService {
  constructor(
    @InjectRepository(Rules)
    private readonly rulesRepo: Repository<Rules>,
    @InjectRepository(RuleGroup)
    private readonly ruleGroupRepo: Repository<RuleGroup>,
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(CollectionMedia)
    private readonly collectionMediaRepo: Repository<CollectionMedia>,
    @InjectRepository(Exclusion)
    private readonly exclusionRepo: Repository<Exclusion>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly settings: SettingsDataService,
    private readonly versionService: VersionService,
    private readonly ruleConstants: RuleConstanstService,
    private readonly taskService: TasksService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TelemetryService.name);
  }

  /**
   * Whether the week containing `date` carries the sample. Deterministic per
   * (install, week) rather than a coin flip, so the settings page can show a
   * real date; seeding on the week keeps the sampled subset rotating instead of
   * fixing a panel that would only ever report its own habits.
   */
  sampledOn(date: Date): boolean {
    const week = Math.floor(date.getTime() / MILLISECONDS_PER_WEEK);
    let seed = 0;
    for (const character of this.settings.clientId ?? '') {
      seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
    }

    // Avalanche rather than appending the week to the string: hashing
    // "<id>:<week>" leaves consecutive weeks correlated in the low bits, which
    // starved a quarter of installs of any sample across a decade.
    let mixed = (seed ^ Math.imul(week, 0x9e3779b1)) >>> 0;
    mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad) >>> 0;
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97) >>> 0;
    mixed = (mixed ^ (mixed >>> 15)) >>> 0;

    return mixed % TELEMETRY_SAMPLE_DIVISOR === 0;
  }

  /** The environment override, which beats whatever is stored. */
  forcedOff(): boolean {
    return process.env.TELEMETRY === 'off';
  }

  /**
   * Null means nobody has answered the prompt yet, which reports: a census only
   * some people take part in describes only those people. Only an explicit
   * `false` stops it. TELEMETRY=off wins over the setting.
   */
  enabled(): boolean {
    return this.forcedOff() ? false : this.settings.telemetryEnabled !== false;
  }

  /**
   * Schedule the settings page shows. Both dates are null when nothing is
   * going out, so the page never promises a report that will not happen.
   */
  status(): TelemetryStatus {
    const nextWeekly = this.enabled()
      ? this.taskService.getNextRun(TELEMETRY_TASK_NAME)
      : null;

    return {
      forcedOff: this.forcedOff(),
      nextSendAtWeekly: nextWeekly?.toISOString() ?? null,
      nextSendAtRich: this.nextSampledRun(nextWeekly)?.toISOString() ?? null,
    };
  }

  /** First upcoming weekly slot whose draw hits, walking one week at a time. */
  private nextSampledRun(nextWeekly: Date | null): Date | null {
    if (!nextWeekly) {
      return null;
    }

    for (let week = 0; week < SAMPLE_SCAN_WEEKS; week++) {
      const candidate = new Date(
        nextWeekly.getTime() + week * MILLISECONDS_PER_WEEK,
      );
      if (this.sampledOn(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  async buildPayload(includeSample: boolean): Promise<TelemetryPing> {
    const versionTag = this.versionService.getVersionTag();
    const ping: TelemetryPing = {
      // A non-release build's version is just its stream: the per-build sha
      // getCurrentVersion() appends is near-unique and would fingerprint the
      // sender in an otherwise identifier-free census.
      version: RELEASE_VERSION_TAGS.has(versionTag)
        ? this.versionService.getCurrentVersion()
        : versionTag,
      versionTag,
      isDocker: existsSync('/.dockerenv'),
      nodeMajor: Number.parseInt(process.versions.node, 10),
      arch: process.arch,
      platform: process.platform,
      mediaServer: this.settings.media_server_type ?? 'none',
    };

    if (!includeSample) {
      return ping;
    }

    const [usage, ruleValues, mediaTypes, arrActions, notificationAgents] =
      await Promise.all([
        this.collectUsage(),
        this.collectRuleValues(),
        this.collectMediaTypes(),
        this.collectArrActions(),
        this.collectNotificationAgents(),
      ]);

    ping.sample = {
      usage,
      rulesApps: ruleValues.apps,
      ruleProperties: ruleValues.properties,
      mediaTypes,
      arrActions,
      notificationAgents,
      integrations: await this.collectIntegrations(),
      features: await this.collectFeatures(),
    };

    return ping;
  }

  /** Never throws: telemetry must not affect the task runner or startup. */
  async send(includeSample: boolean): Promise<void> {
    if (!this.enabled()) {
      return;
    }

    try {
      const payload = await this.buildPayload(includeSample);
      await new TelemetryApi(this.logger).sendPing(payload);
    } catch (error) {
      this.logger.debug(error);
    }
  }

  private async collectUsage(): Promise<TelemetrySample['usage']> {
    const [
      ruleGroups,
      activeRuleGroups,
      collections,
      manualCollections,
      exclusions,
      notifications,
      collectionItems,
    ] = await Promise.all([
      this.ruleGroupRepo.count(),
      this.ruleGroupRepo.count({ where: { isActive: true } }),
      this.collectionRepo.count(),
      this.collectionRepo.count({ where: { manualCollection: true } }),
      this.exclusionRepo.count(),
      this.notificationRepo.count(),
      this.collectionMediaRepo.count(),
    ]);

    return {
      ruleGroups: bucket(ruleGroups),
      activeRuleGroups: bucket(activeRuleGroups),
      collections: bucket(collections),
      manualCollections: bucket(manualCollections),
      exclusions: bucket(exclusions),
      notifications: bucket(notifications),
      // A wider scale: item counts run to thousands, where bucket() stops at 25+.
      collectionItems: sizeBucket(collectionItems),
    };
  }

  /** Only the [Application, propertyId] references, never a rule's values. */
  private async collectRuleValues(): Promise<{
    apps: string[];
    properties: string[];
  }> {
    const rows = await this.rulesRepo.find({ select: { ruleJson: true } });

    const apps: string[] = [];
    const properties: string[] = [];

    for (const row of rows) {
      let parsed: { firstVal?: unknown; lastVal?: unknown };
      try {
        parsed = JSON.parse(row.ruleJson);
      } catch {
        continue;
      }

      for (const location of [parsed?.firstVal, parsed?.lastVal]) {
        const identifier = this.resolveRuleValue(location);
        if (!identifier) {
          continue;
        }
        apps.push(identifier.app);
        properties.push(identifier.property);
      }
    }

    return {
      apps: finalizeList(apps, 10),
      properties: finalizeList(properties, TELEMETRY_MAX_RULE_PROPERTIES),
    };
  }

  private resolveRuleValue(
    location: unknown,
  ): { app: string; property: string } | null {
    if (!Array.isArray(location) || location.length < 2) {
      return null;
    }

    // firstVal elements are typed as numbers but reach the database as strings
    // from some UI paths, so coerce before the constants lookup.
    const reference: [number, number] = [+location[0], +location[1]];
    if (Number.isNaN(reference[0]) || Number.isNaN(reference[1])) {
      return null;
    }

    const identifier = this.ruleConstants.getValueIdentifier(reference);
    if (!identifier) {
      return null;
    }

    const separator = identifier.indexOf('.');
    const app = identifier.slice(0, separator).toLowerCase();
    const property = `${app}${identifier.slice(separator)}`.slice(
      0,
      TELEMETRY_MAX_RULE_PROPERTY_LENGTH,
    );

    return { app, property };
  }

  private async collectMediaTypes(): Promise<string[]> {
    const rows = await this.ruleGroupRepo.find({
      select: { dataType: true },
      // RuleGroup eager-loads its collection and notifications, which a single
      // varchar column does not need.
      loadEagerRelations: false,
    });
    const known = new Set<string>(MediaItemTypes);

    return finalizeList(
      rows.map((row) => row.dataType).filter((type) => known.has(type)),
      MediaItemTypes.length,
    );
  }

  private async collectArrActions(): Promise<string[]> {
    const rows = await this.collectionRepo.find({
      select: { arrAction: true },
    });

    return finalizeList(
      rows
        .map((row) => ServarrAction[row.arrAction])
        .filter((name): name is string => Boolean(name)),
      // The collector caps this below the size of the ServarrAction enum, so an
      // instance using more than six distinct actions reports only six.
      6,
    );
  }

  private async collectNotificationAgents(): Promise<string[]> {
    const rows = await this.notificationRepo.find({ select: { agent: true } });
    const known = new Set<string>(Object.values(NotificationAgentKey));

    return finalizeList(
      rows.map((row) => row.agent).filter((agent) => known.has(agent)),
      known.size,
    );
  }

  private async collectIntegrations(): Promise<string[]> {
    const [radarr, sonarr, sportarr] = await Promise.all([
      this.settings.getRadarrSettingsCount(),
      this.settings.getSonarrSettingsCount(),
      this.settings.getSportarrSettingsCount(),
    ]);

    const configured: Array<[string, boolean]> = [
      ['radarr', radarr > 0],
      ['sonarr', sonarr > 0],
      ['sportarr', sportarr > 0],
      ['seerr', this.settings.seerrConfigured()],
      ['tautulli', this.settings.tautulliConfigured()],
      ['streamystats', Boolean(this.settings.streamystats_url)],
      ['tracearr', Boolean(this.settings.tracearr_url)],
      ['downloadClient', this.settings.downloadClientConfigured()],
    ];

    return finalizeList(
      configured.filter(([, on]) => on).map(([name]) => name),
      configured.length,
    );
  }

  private async collectFeatures(): Promise<string[]> {
    // Counted rather than read from a setting: each is a per-collection opt-in,
    // so the only question worth reporting is whether anyone turned it on.
    const [overlays, keepInMaintainerrOnly, leftoverCleanup] =
      await Promise.all([
        this.collectionRepo.count({ where: { overlayEnabled: true } }),
        this.collectionRepo.count({ where: { keepInMaintainerrOnly: true } }),
        this.collectionRepo.count({ where: { cleanupLeftoverFolders: true } }),
      ]);

    const features: Array<[string, boolean]> = [
      ['overlays', overlays > 0],
      ['keepInMaintainerrOnly', keepInMaintainerrOnly > 0],
      ['leftoverCleanup', leftoverCleanup > 0],
      ['arrTagExclusionsRadarr', Boolean(this.settings.radarr_tag_exclusions)],
      ['arrTagExclusionsSonarr', Boolean(this.settings.sonarr_tag_exclusions)],
    ];

    const active = features.filter(([, on]) => on).map(([name]) => name);

    if (this.settings.metadata_provider_preference) {
      active.push(`metadata_${this.settings.metadata_provider_preference}`);
    }

    return finalizeList(active, 10);
  }
}
