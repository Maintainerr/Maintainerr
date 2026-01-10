import { Injectable } from '@nestjs/common';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, CronTime } from 'cron';
import { MaintainerrLogger } from '../logging/logs.service';
import { Status } from './interfaces/status.interface';
import { StatusService } from './status.service';

interface TaskState {
  name: string;
  running: boolean;
  runningSince: Date | null;
}

@Injectable()
export class TasksService {
  private readonly runningTasks = new Map<string, TaskState>();

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private readonly status: StatusService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TasksService.name);
  }

  public createJob(
    name: string,
    cronExp: CronExpression | string,
    task: () => void,
  ): Status {
    try {
      if (this.schedulerRegistry.getCronJobs().has(name)) {
        throw new Error(`Task ${name} already exists.`);
      }

      const job = new CronJob(cronExp, () => {
        task();
      });

      this.schedulerRegistry.addCronJob(name, job);
      job.start();

      if (!this.runningTasks.has(name)) {
        this.runningTasks.set(name, {
          name,
          running: false,
          runningSince: null,
        });
      }

      this.logger.log(`Task ${name} created successfully`);
      return this.status.createStatus(
        true,
        `Task ${name} created successfully`,
      );
    } catch (e) {
      const message = `An error occurred while creating the ${name} task.`;
      this.logger.error(message, e);
      return this.status.createStatus(false, message);
    }
  }

  public async updateJob(
    name: string,
    cronExp: CronExpression | string,
  ): Promise<Status> {
    try {
      const job = this.schedulerRegistry.getCronJobs().get(name);

      if (!job) {
        const message = `Task ${name} does not exist.`;
        this.logger.error(message);
        return this.status.createStatus(false, message);
      }

      await job.stop();
      job.setTime(new CronTime(cronExp));
      job.start();

      this.logger.log(`Task ${name} updated successfully`);
      return this.status.createStatus(
        true,
        `Task ${name} updated successfully`,
      );
    } catch (e) {
      const message = `An error occurred while updating the ${name} task.`;
      this.logger.error(message, e);
      return this.status.createStatus(false, message);
    }
  }

  public setRunning(name: string) {
    const task = this.getTask(name);

    if (!task) {
      throw new Error(`Task ${name} does not exist.`);
    }

    task.running = true;
    task.runningSince = new Date();
  }

  public isRunning(name: string) {
    const task = this.getTask(name);
    return task?.running ?? false;
  }

  public getTask(name: string): TaskState | undefined {
    return this.runningTasks.get(name);
  }

  public clearRunning(name: string) {
    const task = this.getTask(name);

    if (!task) {
      throw new Error(`Task ${name} does not exist.`);
    }

    task.running = false;
    task.runningSince = null;
  }
}
