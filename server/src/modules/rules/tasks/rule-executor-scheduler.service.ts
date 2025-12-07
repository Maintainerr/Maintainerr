import { MaintainerrEvent } from '@maintainerr/contracts';
import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, CronTime } from 'cron';
import { MaintainerrLogger } from '../../logging/logs.service';
import { Settings } from '../../settings/entities/settings.entities';
import { SettingsService } from '../../settings/settings.service';
import { RulesDto } from '../dtos/rules.dto';
import { RuleGroup } from '../entities/rule-group.entities';
import { RulesService } from '../rules.service';
import { RuleExecutorJobManagerService } from './rule-executor-job-manager.service';

const EXECUTE_GLOBAL_SCHEDULE_RULES_JOB_NAME = 'execute-global-schedule-rules';

/*
 * Handles cron registration and event wiring for rule execution.
 * Delegates actual execution/queueing to RuleExecutorJobManagerService.
 */
@Injectable()
export class RuleExecutorSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private isShuttingDown = false;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly rulesService: RulesService,
    private readonly settingsService: SettingsService,
    private readonly queueManager: RuleExecutorJobManagerService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(RuleExecutorSchedulerService.name);
  }

  async onApplicationBootstrap() {
    const ruleGroups = await this.rulesService.getRuleGroups(true);

    const ruleGroupsWithCronSchedule = ruleGroups.filter(
      (rg) => rg.ruleHandlerCronSchedule,
    );

    for (const ruleGroup of ruleGroupsWithCronSchedule) {
      if (ruleGroup.ruleHandlerCronSchedule) {
        this.createRuleGroupCronJob(ruleGroup);
        this.logger.log(
          `Created cron job for rule group ${ruleGroup.id}: ${ruleGroup.ruleHandlerCronSchedule}`,
        );
      }
    }

    this.registerOrUpdateGlobalSchedule(
      this.settingsService.rules_handler_job_cron,
    );

    this.logger.log(
      `Created global schedule cron job: ${this.settingsService.rules_handler_job_cron}`,
    );
  }

  async onApplicationShutdown() {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;

    await this.queueManager.stopProcessing();
  }

  public async enqueueAllActiveRuleGroups() {
    const ruleGroups = await this.rulesService.getRuleGroups(true);
    for (const rg of ruleGroups) {
      this.logger.log(
        `Enqueuing rule group ${rg.id} for execution as part of enqueueAllActiveRuleGroups`,
      );
      this.queueManager.enqueue({
        ruleGroupId: rg.id,
      });
    }
  }

  @OnEvent(MaintainerrEvent.RuleGroup_Created)
  private async onRuleGroupCreated(data: { ruleGroup: RuleGroup }) {
    if (data.ruleGroup.isActive && data.ruleGroup.ruleHandlerCronSchedule) {
      this.createRuleGroupCronJob(data.ruleGroup);
    }
  }

  @Interval(2000)
  public debugLogs() {
    this.schedulerRegistry.getCronJobs().forEach((job, jobName) => {
      this.logger.debug(`${jobName} next scheduled run: ${job.nextDate()}`);
    });
    this.logger.debug(
      `Current execution queue: ${this.queueManager
        .getQueuedRuleGroupIds()
        .map((id) => `Rule Group ID: ${id}`)
        .join(', ')}`,
    );
  }

  @OnEvent(MaintainerrEvent.RuleGroup_Updated)
  private async onRuleGroupUpdated(data: {
    ruleGroup: RuleGroup;
    oldRuleGroup: RuleGroup;
  }) {
    const existingJob = this.getCronJob(data.ruleGroup.id);
    const shouldHaveJob =
      data.ruleGroup.isActive && !!data.ruleGroup.ruleHandlerCronSchedule;
    const jobName = this.getJobNameForRuleGroup(data.ruleGroup.id);

    if (
      data.ruleGroup.ruleHandlerCronSchedule ===
        data.oldRuleGroup.ruleHandlerCronSchedule &&
      data.ruleGroup.isActive === data.oldRuleGroup.isActive
    ) {
      if (shouldHaveJob && !existingJob) {
        this.logger.warn(
          `Cron job was missing for active rule group ${data.ruleGroup.id}; recreating`,
        );
        this.createRuleGroupCronJob(data.ruleGroup);
      } else if (!shouldHaveJob && existingJob) {
        this.logger.log(
          `Rule group ${data.ruleGroup.id} no longer requires cron job; removing stray job`,
        );
        this.schedulerRegistry.deleteCronJob(jobName);
        this.queueManager.removeFromQueue(data.ruleGroup.id);
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
      this.queueManager.removeFromQueue(data.ruleGroup.id);
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
      this.createRuleGroupCronJob(data.ruleGroup);
      return;
    }

    const scheduledUpdated =
      data.ruleGroup.ruleHandlerCronSchedule !==
      data.oldRuleGroup.ruleHandlerCronSchedule;

    const job = this.getCronJob(data.ruleGroup.id);
    if (job && scheduledUpdated) {
      this.queueManager.removeFromQueue(data.ruleGroup.id);
      job.setTime(new CronTime(data.ruleGroup.ruleHandlerCronSchedule));
    }
  }

  @OnEvent(MaintainerrEvent.RuleGroup_Deleted)
  private async onRuleGroupDeleted(data: { ruleGroup: RuleGroup }) {
    const jobName = this.getJobNameForRuleGroup(data.ruleGroup.id);
    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
    }
    this.queueManager.removeFromQueue(data.ruleGroup.id);
  }

  @OnEvent(MaintainerrEvent.Settings_Updated)
  private async onSettingsUpdated(data: {
    oldSettings: Settings;
    settings: Settings;
  }) {
    if (
      data.oldSettings.rules_handler_job_cron ===
      data.settings.rules_handler_job_cron
    ) {
      return; // No change in cron schedule
    }

    const globalJob = this.schedulerRegistry.getCronJob(
      EXECUTE_GLOBAL_SCHEDULE_RULES_JOB_NAME,
    );
    if (!globalJob) {
      this.logger.warn(
        `Global schedule cron job was missing; recreating with updated schedule`,
      );
      this.registerOrUpdateGlobalSchedule(data.settings.rules_handler_job_cron);
      return;
    }

    globalJob.setTime(new CronTime(data.settings.rules_handler_job_cron));
  }

  private createRuleGroupCronJob(ruleGroup: RulesDto) {
    const jobName = this.getJobNameForRuleGroup(ruleGroup.id);
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
      const job = new CronJob(
        ruleGroup.ruleHandlerCronSchedule,
        () =>
          void this.queueManager.enqueue({
            ruleGroupId: ruleGroup.id,
          }),
        undefined,
        true,
      );

      this.schedulerRegistry.addCronJob(jobName, job);
    } catch (error) {
      this.logger.error(
        `Failed to create cron job ${jobName} with schedule ${ruleGroup.ruleHandlerCronSchedule}: ${(error as Error).message}`,
      );
    }
  }

  private getJobNameForRuleGroup(ruleGroupId: number): string {
    return `rule-group-executor-${ruleGroupId}`;
  }

  private getCronJob(ruleGroupId: number): CronJob | undefined {
    const jobName = this.getJobNameForRuleGroup(ruleGroupId);
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

  private registerOrUpdateGlobalSchedule(cronExpression: string) {
    if (
      this.schedulerRegistry.doesExist(
        'cron',
        EXECUTE_GLOBAL_SCHEDULE_RULES_JOB_NAME,
      )
    ) {
      const job = this.schedulerRegistry.getCronJob(
        EXECUTE_GLOBAL_SCHEDULE_RULES_JOB_NAME,
      );
      job.setTime(new CronTime(cronExpression));
      return;
    }

    this.schedulerRegistry.addCronJob(
      EXECUTE_GLOBAL_SCHEDULE_RULES_JOB_NAME,
      new CronJob(
        cronExpression,
        () => this.executeGlobalSchedule(),
        undefined,
        true,
      ),
    );
  }

  private async executeGlobalSchedule() {
    this.logger.log(`Executing global schedule cron job`);
    const ruleGroups = await this.rulesService.getRuleGroups(true);
    const ruleGroupsFollowingGlobalSchedule = ruleGroups.filter(
      (rg) => !rg.ruleHandlerCronSchedule,
    );

    for (const ruleGroup of ruleGroupsFollowingGlobalSchedule) {
      this.logger.log(
        `Scheduling rule group ${ruleGroup.id} as part of global schedule execution`,
      );

      this.queueManager.enqueue({
        ruleGroupId: ruleGroup.id,
      });
    }
  }
}
