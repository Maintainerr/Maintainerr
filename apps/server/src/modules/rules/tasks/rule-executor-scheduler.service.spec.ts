import { createMockLogger } from '../../../../test/utils/data';
import { RuleExecutorSchedulerService } from './rule-executor-scheduler.service';

// Mock cron to avoid starting real timers while still exposing setTime
jest.mock('cron', () => {
  return {
    CronJob: jest
      .fn()
      .mockImplementation((cronTime: string, onTick: () => void) => {
        return {
          cronTime,
          onTick,
          setTime: jest.fn(),
          fireOnTick: jest.fn(() => onTick()),
        };
      }),
    CronTime: jest
      .fn()
      .mockImplementation((expression: string) => ({ expression })),
  };
});

describe('RuleExecutorSchedulerService', () => {
  const logger = createMockLogger();

  const createScheduler = () => {
    const schedulerRegistry = {
      addCronJob: jest.fn(),
      deleteCronJob: jest.fn(),
      doesExist: jest.fn().mockReturnValue(false),
      getCronJob: jest.fn(),
      getCronJobs: jest.fn().mockReturnValue(new Map()),
    };

    const rulesService = {
      getRuleGroups: jest.fn(),
    };

    const settingsService = {
      rules_handler_job_cron: '*/5 * * * * *',
    } as const;

    const queueManager = {
      enqueue: jest.fn().mockReturnValue(true),
      removeFromQueue: jest.fn(),
      stopProcessing: jest.fn().mockResolvedValue(undefined),
      getQueuedRuleGroupIds: jest.fn().mockReturnValue([] as number[]),
    };

    const service = new RuleExecutorSchedulerService(
      schedulerRegistry as any,
      rulesService as any,
      settingsService as any,
      queueManager as any,
      logger as any,
    );

    return {
      service,
      schedulerRegistry,
      rulesService,
      settingsService,
      queueManager,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers cron jobs for scheduled rule groups and global schedule on bootstrap', async () => {
    const { service, schedulerRegistry, rulesService, settingsService } =
      createScheduler();

    rulesService.getRuleGroups.mockResolvedValue([
      { id: 1, isActive: true, ruleHandlerCronSchedule: '*/10 * * * * *' },
      { id: 2, isActive: true, ruleHandlerCronSchedule: undefined },
      { id: 3, isActive: true, ruleHandlerCronSchedule: '*/15 * * * * *' },
    ]);

    await service.onApplicationBootstrap();

    // Two per-group jobs + one global job
    expect(schedulerRegistry.addCronJob).toHaveBeenCalledTimes(3);
    expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
      'rule-group-executor-1',
      expect.objectContaining({ cronTime: '*/10 * * * * *' }),
    );
    expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
      'rule-group-executor-3',
      expect.objectContaining({ cronTime: '*/15 * * * * *' }),
    );
    expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
      'execute-global-schedule-rules',
      expect.objectContaining({
        cronTime: settingsService.rules_handler_job_cron,
      }),
    );
  });

  it('creates a cron job when a rule group is created with a schedule', async () => {
    const { service, schedulerRegistry } = createScheduler();

    await service['onRuleGroupCreated']({
      ruleGroup: {
        id: 99,
        isActive: true,
        ruleHandlerCronSchedule: '* * * * * *',
      } as any,
    });

    expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
      'rule-group-executor-99',
      expect.anything(),
    );
  });

  it('removes cron job and queue entry when a rule group is deactivated or schedule removed', async () => {
    const { service, schedulerRegistry, queueManager } = createScheduler();

    const cronJobMock = { setTime: jest.fn() };
    schedulerRegistry.doesExist.mockReturnValue(true);
    schedulerRegistry.getCronJob.mockReturnValue(cronJobMock);

    await service['onRuleGroupUpdated']({
      ruleGroup: {
        id: 5,
        isActive: false,
        ruleHandlerCronSchedule: undefined,
      } as any,
      oldRuleGroup: {
        id: 5,
        isActive: true,
        ruleHandlerCronSchedule: '* * * * * *',
      } as any,
    });

    expect(schedulerRegistry.deleteCronJob).toHaveBeenCalledWith(
      'rule-group-executor-5',
    );
    expect(queueManager.removeFromQueue).toHaveBeenCalledWith(5);
  });

  it('updates cron time and clears pending work when schedule changes', async () => {
    const { service, schedulerRegistry, queueManager } = createScheduler();

    const cronJobMock = { setTime: jest.fn() };
    schedulerRegistry.doesExist.mockReturnValue(true);
    schedulerRegistry.getCronJob.mockReturnValue(cronJobMock);

    await service['onRuleGroupUpdated']({
      ruleGroup: {
        id: 7,
        isActive: true,
        ruleHandlerCronSchedule: '*/30 * * * * *',
      } as any,
      oldRuleGroup: {
        id: 7,
        isActive: true,
        ruleHandlerCronSchedule: '*/10 * * * * *',
      } as any,
    });

    expect(queueManager.removeFromQueue).toHaveBeenCalledWith(7);
    expect(cronJobMock.setTime).toHaveBeenCalledWith(expect.anything());
  });

  it('adds a global cron job when settings are updated and the job is missing', async () => {
    const { service, schedulerRegistry } = createScheduler();

    schedulerRegistry.getCronJob.mockReturnValue(undefined);
    schedulerRegistry.doesExist.mockReturnValue(false);

    await service['onSettingsUpdated']({
      oldSettings: { rules_handler_job_cron: '* * * * * *' } as any,
      settings: { rules_handler_job_cron: '*/2 * * * * *' } as any,
    });

    expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
      'execute-global-schedule-rules',
      expect.objectContaining({ cronTime: '*/2 * * * * *' }),
    );
  });
});
