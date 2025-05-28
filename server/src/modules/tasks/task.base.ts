import { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { delay } from '../../utils/delay';
import { MaintainerrLogger } from '../logging/logs.service';
import { TasksService } from './tasks.service';

export abstract class TaskBase
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private jobCreationAttempts = 0;
  protected name = '';
  protected cronSchedule = '';
  private abortController: AbortController | undefined;

  constructor(
    protected readonly taskService: TasksService,
    protected readonly logger: MaintainerrLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.onBootstrapHook();

    new Promise<void>(
      void (async (resolve: () => void, reject: () => void) => {
        while (this.jobCreationAttempts < 3) {
          this.jobCreationAttempts++;
          const state = await this.taskService.createJob(
            this.name,
            this.cronSchedule,
            this.execute.bind(this),
            true,
          );

          if (state.code === 1) {
            resolve();
            return;
          }

          if (this.jobCreationAttempts < 3) {
            this.logger.warn(
              `Creation of ${this.name} task failed. Retrying in 10s... (Attempt ${this.jobCreationAttempts}/3)`,
            );

            await delay(10_000);
          }
        }

        reject();
      }),
    ).catch((err) => {
      this.logger.error(
        `Creation of ${this.name} task failed after 3 attempts.`,
        err,
      );
    });
  }

  async onApplicationShutdown() {
    this.abortController?.abort();

    if (!(await this.isRunning())) return;

    this.logger.log(`Stopping the ${this.name} task...`);

    while (await this.isRunning()) {
      await delay(1000);
    }

    this.logger.log(`Task ${this.name} stopped`);
  }

  // implement this on subclasses to do things in onApplicationBootstrap
  protected onBootstrapHook() {}

  public async execute(abortController?: AbortController) {
    if (await this.isRunning()) {
      this.logger.log(
        `Another instance of the ${this.name} task is currently running. Skipping this execution`,
      );
      return;
    }

    this.abortController = abortController || new AbortController();
    await this.taskService.setRunning(this.name);

    try {
      abortController?.signal.throwIfAborted();
      await this.executeTask(this.abortController.signal);
    } finally {
      this.abortController = undefined;
      await this.taskService.clearRunning(this.name);
    }
  }

  protected abstract executeTask(abortSignal: AbortSignal): Promise<void>;

  public async stopExecution() {
    if (!(await this.isRunning()) || this.abortController.signal.aborted)
      return;

    this.logger.log(`Requesting to stop the ${this.name} task`);
    this.abortController.abort();

    while (await this.isRunning()) {
      await delay(1000);
    }

    this.logger.log(`Task ${this.name} stopped by request`);
  }

  public updateJob(cron: string) {
    return this.taskService.updateJob(this.name, cron, this.execute.bind(this));
  }

  public async isRunning() {
    return await this.taskService.isRunning(this.name);
  }
}
