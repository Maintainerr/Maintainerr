import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { createMockLogger } from '../../../test/utils/data';
import { MaintainerrLogger } from '../logging/logs.service';
import { StatusService } from './status.service';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  class MockSchedulerRegistry implements Partial<SchedulerRegistry> {
    private readonly jobs = new Map<string, CronJob>();

    getCronJobs(): Map<string, CronJob> {
      return this.jobs;
    }

    addCronJob(name: string, job: CronJob): void {
      this.jobs.set(name, job);
    }

    deleteCronJob(name: string): void {
      this.jobs.delete(name);
    }
  }

  let schedulerRegistry: MockSchedulerRegistry;
  let tasksService: TasksService;
  const logger = createMockLogger() as unknown as MaintainerrLogger;

  beforeEach(() => {
    schedulerRegistry = new MockSchedulerRegistry();
    tasksService = new TasksService(
      schedulerRegistry as unknown as SchedulerRegistry,
      new StatusService(),
      logger,
    );
  });

  afterEach(() => {
    schedulerRegistry.getCronJobs().forEach((job) => {
      void job.stop();
    });
    jest.clearAllTimers();
  });

  it('creates and stores a job with initial task state', () => {
    const result = tasksService.createJob(
      'test-task',
      '* * * * * *',
      () => undefined,
    );

    expect(result.code).toBe(1);
    expect(schedulerRegistry.getCronJobs().has('test-task')).toBe(true);

    const taskState = tasksService.getTask('test-task');
    expect(taskState?.running).toBe(false);
    expect(taskState?.runningSince).toBeNull();
  });

  it('returns failure status when creating a duplicate job', () => {
    // seed an existing job
    schedulerRegistry.addCronJob(
      'dupe-task',
      new CronJob('* * * * * *', () => undefined),
    );

    const result = tasksService.createJob(
      'dupe-task',
      '* * * * * *',
      () => undefined,
    );

    expect(result.code).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('reports running state for existing and missing tasks', () => {
    expect(tasksService.isRunning('missing')).toBe(false);

    tasksService.createJob('stateful', '* * * * * *', () => undefined);
    tasksService.setRunning('stateful');

    expect(tasksService.isRunning('stateful')).toBe(true);
  });

  it('returns task state when requested', () => {
    tasksService.createJob('introspect', '* * * * * *', () => undefined);

    const task = tasksService.getTask('introspect');
    expect(task).toMatchObject({ name: 'introspect', running: false });
  });

  it('clears running state and throws for unknown task', () => {
    expect(() => tasksService.clearRunning('nope')).toThrow(
      'Task nope does not exist.',
    );

    tasksService.createJob('clear-me', '* * * * * *', () => undefined);
    tasksService.setRunning('clear-me');

    tasksService.clearRunning('clear-me');
    expect(tasksService.isRunning('clear-me')).toBe(false);
  });

  it('throws when setting running state for an unknown task', () => {
    expect(() => tasksService.setRunning('missing-task')).toThrow(
      'Task missing-task does not exist.',
    );
  });

  it('returns error status when updating a missing job', async () => {
    const result = await tasksService.updateJob('absent', '*/5 * * * * *');

    expect(result.code).toBe(0);
    expect(logger.error).toHaveBeenCalledWith('Task absent does not exist.');
  });

  it('updates the cron timing for an existing job', async () => {
    tasksService.createJob('update-me', '* * * * * *', () => undefined);
    const job = schedulerRegistry.getCronJobs().get('update-me');
    expect(job).toBeDefined();
    const setTimeSpy = jest.spyOn(job as CronJob, 'setTime');

    const result = await tasksService.updateJob('update-me', '*/2 * * * * *');

    expect(result.code).toBe(1);
    expect(setTimeSpy).toHaveBeenCalled();
  });
});
