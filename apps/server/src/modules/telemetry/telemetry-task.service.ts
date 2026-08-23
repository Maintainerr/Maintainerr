import { TELEMETRY_SAMPLE_DIVISOR } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsDataService } from '../settings/settings-data.service';
import { TaskBase } from '../tasks/task.base';
import { TasksService } from '../tasks/tasks.service';
import { TelemetryService } from './telemetry.service';

const MINUTES_PER_DAY = 1440;
const DAYS_PER_WEEK = 7;

@Injectable()
export class TelemetryTaskService extends TaskBase {
  protected name = 'Telemetry Ping';

  /** Seam for tests. */
  protected rng: () => number = Math.random;

  constructor(
    protected readonly taskService: TasksService,
    protected readonly logger: MaintainerrLogger,
    private readonly settings: SettingsDataService,
    private readonly telemetry: TelemetryService,
  ) {
    logger.setContext(TelemetryTaskService.name);
    super(taskService, logger);
  }

  /**
   * The clientId is used ONLY for this local arithmetic and is never
   * transmitted. Settings hydrate in AppModule.onModuleInit, which runs before
   * onApplicationBootstrap, so it is available here.
   */
  protected onBootstrapHook() {
    let hash = 0;
    for (const character of this.settings?.clientId ?? '') {
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }

    // Day and minute-of-day come from independent components of the hash.
    // Deriving both directly (hash % 60, hash % 24, hash % 7) would correlate
    // minute and hour mod 12, collapsing 10,080 slots to 840 and bunching
    // instances into shared minutes.
    const day = hash % DAYS_PER_WEEK;
    const minuteOfDay = Math.floor(hash / DAYS_PER_WEEK) % MINUTES_PER_DAY;

    this.cronSchedule = `${minuteOfDay % 60} ${Math.floor(
      minuteOfDay / 60,
    )} * * ${day}`;
  }

  protected async executeTask() {
    // Drawn fresh each week so the sampled cohort is not fixed per instance.
    await this.telemetry.send(this.rng() * TELEMETRY_SAMPLE_DIVISOR < 1);
  }
}
