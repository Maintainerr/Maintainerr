import { Injectable } from '@nestjs/common';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { Repository } from 'typeorm';
import { delay } from '../../utils/delay';
import { MaintainerrLogger } from '../logging/logs.service';
import { TaskRunning } from '../tasks/entities/task_running.entities';
import { Status } from './interfaces/status.interface';
import { StatusService } from './status.service';

@Injectable()
export class TasksService {
  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private readonly status: StatusService,
    @InjectRepository(TaskRunning)
    private readonly taskRunningRepo: Repository<TaskRunning>,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TasksService.name);
  }

  public async createJob(
    name: string,
    cronExp: CronExpression | string,
    task: () => void,
    isNewInstance: boolean,
  ): Promise<Status> {
    try {
      const job = new CronJob(cronExp, () => {
        task();
      });

      this.schedulerRegistry.addCronJob(name, job);
      job.start();

      if (isNewInstance) {
        // create database running entry
        const taskRunning = await this.taskRunningRepo.findOne({
          where: { name: name },
        });

        await this.taskRunningRepo.save({
          id: taskRunning?.id ?? null,
          name: name,
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
    task: () => void,
  ): Promise<Status> {
    const output = this.removeJob(name);
    if (output.code === 1) {
      return this.createJob(name, cronExp, task, false);
    }
  }

  private removeJob(name: string): Status {
    try {
      this.schedulerRegistry.deleteCronJob(name);
      this.logger.log(`Task ${name} removed successfully`);
      return this.status.createStatus(
        true,
        `Task ${name} removed successfully`,
      );
    } catch (e) {
      const message = `An error occurred while removing the ${name} task.`;
      this.logger.error(message, e);
      return this.status.createStatus(false, message);
    }
  }

  public async setRunning(name: string) {
    const resp = await this.taskRunningRepo.findOne({ where: { name: name } });
    if (resp) {
      await this.taskRunningRepo.update(
        { id: resp.id },
        {
          running: true,
          runningSince: new Date(),
        },
      );
    }
  }

  public async isRunning(name: string) {
    const resp = await this.taskRunningRepo.findOne({ where: { name: name } });
    return resp.running;
  }

  public async clearRunning(name: string) {
    const resp = await this.taskRunningRepo.findOne({ where: { name: name } });
    if (resp) {
      await this.taskRunningRepo.update(
        { id: resp.id },
        {
          running: false,
          runningSince: null,
        },
      );
    }
  }

  public async getRunningSince(name: string) {
    const resp = await this.taskRunningRepo.findOne({ where: { name } });
    return resp.runningSince;
  }

  public async waitUntilTaskIsFinished(
    name: string,
    myname: string = undefined,
  ) {
    let task = await this.taskRunningRepo.findOne({ where: { name: name } });

    if (task?.running) {
      this.logger.log(
        `${myname ? `Task ${myname} is waiting` : `Waiting`} for task ${name} to finish...`,
      );
      while (task.running) {
        await delay(10_000);
        task = await this.taskRunningRepo.findOne({ where: { name: name } });
      }
    }
  }
}
