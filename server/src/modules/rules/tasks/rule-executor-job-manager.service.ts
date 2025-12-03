import { MaintainerrEvent } from '@maintainerr/contracts';
import { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, CronTime } from 'cron';
import { isEqual } from 'lodash';
import { MaintainerrLogger } from '../../logging/logs.service';
import { Settings } from '../../settings/entities/settings.entities';
import { SettingsService } from '../../settings/settings.service';
import { RulesDto } from '../dtos/rules.dto';
import { RuleGroup } from '../entities/rule-group.entities';
import { RulesService } from '../rules.service';
import { RuleExecutorService } from './rule-executor.service';

const EXECUTE_GLOBAL_SCHEDULE_RULES_JOB_NAME = 'execute-global-schedule-rules';

type QueueItem = {
  job: string;
  ruleGroupIds: number[];
};

export class RuleExecutorJobManagerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly queue: QueueItem[] = [];
  private isExecutingJob: string | null = null;
  private abortController: AbortController | undefined;
  // true while the internal queue is being processed
  private processingQueue = false;
  private processQueuePromise: Promise<void> | null = null;
  private isShuttingDown = false;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly rulesService: RulesService,
    private readonly ruleExecutorService: RuleExecutorService,
    private readonly settingsService: SettingsService,
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(RuleExecutorJobManagerService.name);
  }

  async onApplicationBootstrap() {
    const ruleGroups = await this.rulesService.getRuleGroups(true);

    const ruleGroupsWithCronSchedule = ruleGroups.filter(
      (rg) => rg.ruleHandlerCronSchedule,
    );

    for (const ruleGroup of ruleGroupsWithCronSchedule) {
      if (ruleGroup.ruleHandlerCronSchedule) {
        this.createCronJob(ruleGroup);
        this.logger.log(
          `Created cron job for rule group ${ruleGroup.id}: ${ruleGroup.ruleHandlerCronSchedule}`,
        );
      }
    }

    this.schedulerRegistry.addCronJob(
      EXECUTE_GLOBAL_SCHEDULE_RULES_JOB_NAME,
      new CronJob(this.settingsService.rules_handler_job_cron, () =>
        this.executeGlobalSchedule(),
      ),
    );

    this.logger.log(
      `Created global schedule cron job: ${this.settingsService.rules_handler_job_cron}`,
    );
  }

  async onApplicationShutdown() {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;

    // Drop any queued work – we only care about the in-flight execution
    this.queue.length = 0;

    this.abortController?.abort();

    // Wait for the active execution to exit (it will finish quickly once aborted)
    if (this.processQueuePromise != null) {
      try {
        await this.processQueuePromise;
      } catch (err) {
        this.logger.debug(err);
      }
    }
  }

  @OnEvent(MaintainerrEvent.RuleGroup_Created)
  async onRuleGroupCreated(data: { ruleGroup: RuleGroup }) {
    if (data.ruleGroup.isActive && data.ruleGroup.ruleHandlerCronSchedule) {
      this.createCronJob(data.ruleGroup);
    }
  }

  @OnEvent(MaintainerrEvent.RuleGroup_Updated)
  async onRuleGroupUpdated(data: {
    ruleGroup: RuleGroup;
    oldRuleGroup: RuleGroup;
  }) {
    const jobName = `execute-rule-${data.ruleGroup.id}`;
    const existingJob = this.getCronJob(jobName);
    const shouldHaveJob =
      data.ruleGroup.isActive && !!data.ruleGroup.ruleHandlerCronSchedule;

    if (
      data.ruleGroup.ruleHandlerCronSchedule ===
        data.oldRuleGroup.ruleHandlerCronSchedule &&
      data.ruleGroup.isActive === data.oldRuleGroup.isActive
    ) {
      if (shouldHaveJob && !existingJob) {
        this.logger.warn(
          `Cron job ${jobName} was missing for active rule group; recreating`,
        );
        this.createCronJob(data.ruleGroup);
      } else if (!shouldHaveJob && existingJob) {
        this.logger.log(
          `Rule group ${data.ruleGroup.id} no longer requires cron job ${jobName}; removing stray job`,
        );
        this.schedulerRegistry.deleteCronJob(jobName);
        this.tryRemoveJobFromPendingQueue(jobName);
      }
      return; // No change in schedule/state, only consistency checks
    }

    const noLongerActive =
      !data.ruleGroup.isActive && data.oldRuleGroup.isActive;
    const scheduleRemoved =
      !data.ruleGroup.ruleHandlerCronSchedule &&
      data.oldRuleGroup.ruleHandlerCronSchedule;

    // If the cron schedule was removed or the rule group was deactivated, remove the job
    if (noLongerActive || scheduleRemoved) {
      if (existingJob) {
        this.schedulerRegistry.deleteCronJob(jobName);
      }
      this.tryRemoveJobFromPendingQueue(jobName);
      return;
    }

    const ruleGroupMadeActive =
      data.ruleGroup.isActive && !data.oldRuleGroup.isActive;
    const scheduleAdded =
      data.ruleGroup.ruleHandlerCronSchedule &&
      !data.oldRuleGroup.ruleHandlerCronSchedule;

    if (
      data.ruleGroup.ruleHandlerCronSchedule &&
      (ruleGroupMadeActive || scheduleAdded)
    ) {
      this.createCronJob(data.ruleGroup);
      return;
    }

    const scheduledUpdated =
      data.ruleGroup.ruleHandlerCronSchedule !==
      data.oldRuleGroup.ruleHandlerCronSchedule;

    const job = this.getCronJob(jobName);
    if (job && scheduledUpdated) {
      this.tryRemoveJobFromPendingQueue(jobName);
      job.setTime(new CronTime(data.ruleGroup.ruleHandlerCronSchedule));
    }
  }

  private tryRemoveJobFromPendingQueue(jobName: string) {
    const indexOfJob = this.queue.findIndex((q) => q.job === jobName);
    if (indexOfJob !== -1) {
      this.queue.splice(indexOfJob, 1);
    }
  }

  @OnEvent(MaintainerrEvent.RuleGroup_Deleted)
  async onRuleGroupDeleted(data: { ruleGroup: RuleGroup }) {
    const jobName = `execute-rule-${data.ruleGroup.id}`;
    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
    }
    this.tryRemoveJobFromPendingQueue(jobName);
  }

  @OnEvent(MaintainerrEvent.Settings_Updated)
  async onSettingsUpdated(data: {
    oldSettings: Settings;
    newSettings: Settings;
  }) {
    if (
      data.oldSettings.rules_handler_job_cron ===
      data.newSettings.rules_handler_job_cron
    ) {
      return; // No change in cron schedule
    }

    this.tryRemoveJobFromPendingQueue(EXECUTE_GLOBAL_SCHEDULE_RULES_JOB_NAME);

    const globalJob = this.getCronJob(EXECUTE_GLOBAL_SCHEDULE_RULES_JOB_NAME);
    if (!globalJob) {
      this.logger.warn(
        `Global schedule cron job was missing; recreating with updated schedule`,
      );
      this.schedulerRegistry.addCronJob(
        EXECUTE_GLOBAL_SCHEDULE_RULES_JOB_NAME,
        new CronJob(this.settingsService.rules_handler_job_cron, () =>
          this.executeGlobalSchedule(),
        ),
      );
      return;
    }

    globalJob.setTime(
      new CronTime(this.settingsService.rules_handler_job_cron),
    );
  }

  private createCronJob(ruleGroup: RulesDto) {
    const jobName = `execute-rule-${ruleGroup.id}`;
    if (!ruleGroup.ruleHandlerCronSchedule) {
      this.logger.warn(
        `Cannot create cron job ${jobName}; rule group ${ruleGroup.id} has no schedule`,
      );
      return;
    }

    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.logger.warn(
        `Cron job ${jobName} already exists; skipping duplicate registration`,
      );
      return;
    }

    try {
      const job = new CronJob(ruleGroup.ruleHandlerCronSchedule, () =>
        this.enqueue({
          job: jobName,
          ruleGroupIds: [ruleGroup.id],
        }),
      );

      this.schedulerRegistry.addCronJob(jobName, job);
    } catch (error) {
      this.logger.error(
        `Failed to create cron job ${jobName} with schedule ${ruleGroup.ruleHandlerCronSchedule}: ${(error as Error).message}`,
      );
    }
  }

  private getCronJob(jobName: string): CronJob | undefined {
    if (!this.schedulerRegistry.doesExist('cron', jobName)) {
      return undefined;
    }

    try {
      return this.schedulerRegistry.getCronJob(jobName);
    } catch (error) {
      this.logger.warn(
        `Cron job ${jobName} exists but could not be retrieved: ${(error as Error).message}`,
      );
      return undefined;
    }
  }

  private enqueue(request: QueueItem) {
    const indexInQueue = this.queue.findIndex(
      (q) =>
        q.job === request.job && isEqual(q.ruleGroupIds, request.ruleGroupIds),
    );
    if (indexInQueue !== -1) return; // already queued

    if (this.isShuttingDown) {
      this.logger.warn(
        `Skipping enqueue for job ${request.job}; application shutdown in progress`,
      );
      return;
    }

    this.queue.push({ job: request.job, ruleGroupIds: request.ruleGroupIds });

    void this.processQueue();
  }

  private async processQueue() {
    if (this.processingQueue) return this.processQueuePromise;
    this.processingQueue = true;
    this.processQueuePromise = (async () => {
      try {
        while (this.queue.length > 0) {
          const next = this.queue.shift();
          if (!next) break;

          await this.executeJob(next);
        }
      } finally {
        this.processingQueue = false;
        this.processQueuePromise = null;
      }
    })();

    return this.processQueuePromise;
  }

  private async executeJob(request: QueueItem) {
    this.isExecutingJob = request.job;
    this.abortController = new AbortController();

    try {
      await this.ruleExecutorService.executeForRuleGroups(
        request.ruleGroupIds,
        this.abortController.signal,
      );
    } catch (e) {
      this.logger.debug(e);
    } finally {
      this.isExecutingJob = null;
      this.abortController = undefined;
    }
  }

  private async executeGlobalSchedule() {
    this.logger.log(`Executing global schedule cron job`);
    const ruleGroups = await this.rulesService.getRuleGroups(true);
    const ruleGroupsFollowingGlobalSchedule = ruleGroups.filter(
      (rg) => !rg.ruleHandlerCronSchedule,
    );
    this.enqueue({
      job: EXECUTE_GLOBAL_SCHEDULE_RULES_JOB_NAME,
      ruleGroupIds: ruleGroupsFollowingGlobalSchedule.map((x) => x.id),
    });
  }
}
