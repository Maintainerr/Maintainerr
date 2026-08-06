import { BadRequestException } from '@nestjs/common';
import { MaintainerrLogger } from '../logging/logs.service';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { RuleExecutorJobManagerService } from './tasks/rule-executor-job-manager.service';
import { RuleExecutorSchedulerService } from './tasks/rule-executor-scheduler.service';

describe('RulesController', () => {
  let controller: RulesController;

  const rulesService = {
    setRules: jest.fn(),
    updateRules: jest.fn(),
    setBulkExclusions: jest.fn(),
    removeBulkExclusions: jest.fn(),
  } as unknown as jest.Mocked<RulesService>;

  const ruleExecutorSchedulerService =
    {} as jest.Mocked<RuleExecutorSchedulerService>;
  const ruleExecutorJobManagerService =
    {} as jest.Mocked<RuleExecutorJobManagerService>;

  const logger = {
    setContext: jest.fn(),
  } as unknown as jest.Mocked<MaintainerrLogger>;

  const body = { name: 'Group', rules: [] } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RulesController(
      rulesService,
      ruleExecutorSchedulerService,
      ruleExecutorJobManagerService,
      logger,
    );
  });

  // A rejected rule group answered 201 with the reason in the body, so a
  // caller could not tell it from a save (#3384).
  it.each([
    ['setRules', () => controller.setRules(body)],
    ['updateRule', () => controller.updateRule(body)],
  ])(
    '%s answers 400 with the reason the rule group was rejected',
    async (_name, call) => {
      const rejected = {
        code: 0 as const,
        result: 'Operator is required for every rule after the first',
        message: 'Operator is required for every rule after the first',
      };
      rulesService.setRules.mockResolvedValue(rejected);
      rulesService.updateRules.mockResolvedValue(rejected);

      await expect(call()).rejects.toThrow(BadRequestException);
      await expect(call()).rejects.toThrow(
        'Operator is required for every rule after the first',
      );
    },
  );

  it.each([
    ['setRules', () => controller.setRules(body)],
    ['updateRule', () => controller.updateRule(body)],
  ])(
    '%s returns the status when the rule group was saved',
    async (_name, call) => {
      const saved = { code: 1 as const, result: 'Success', message: 'Success' };
      rulesService.setRules.mockResolvedValue(saved);
      rulesService.updateRules.mockResolvedValue(saved);

      await expect(call()).resolves.toEqual(saved);
    },
  );

  it('delegates bulk exclusions and returns per-item results', async () => {
    const response = {
      results: [
        { mediaId: 'item-1', code: 1 as const },
        { mediaId: 'item-2', code: 0 as const, message: 'Failed' },
      ],
    };
    rulesService.setBulkExclusions.mockResolvedValue(response);

    await expect(
      controller.setBulkExclusions({ mediaIds: ['item-1', 'item-2'] }),
    ).resolves.toEqual(response);
    expect(rulesService.setBulkExclusions).toHaveBeenCalledWith(
      ['item-1', 'item-2'],
      undefined,
      undefined,
    );
  });

  it('passes the collection through so bulk exclusions can be scoped', async () => {
    rulesService.setBulkExclusions.mockResolvedValue({ results: [] });

    await controller.setBulkExclusions({
      mediaIds: ['item-1'],
      collectionId: 7,
    });

    expect(rulesService.setBulkExclusions).toHaveBeenCalledWith(
      ['item-1'],
      7,
      undefined,
    );
  });

  it('routes a removal action to the removal service, not the add path', async () => {
    const response = {
      results: [{ mediaId: 'item-1', code: 1 as const }],
    };
    rulesService.removeBulkExclusions.mockResolvedValue(response);

    await expect(
      controller.setBulkExclusions({
        mediaIds: ['item-1'],
        collectionId: 7,
        action: 1,
      }),
    ).resolves.toEqual(response);
    expect(rulesService.removeBulkExclusions).toHaveBeenCalledWith(
      ['item-1'],
      7,
      undefined,
    );
    expect(rulesService.setBulkExclusions).not.toHaveBeenCalled();
  });

  // The modal offers season narrowing for an un-exclude as well. Dropping the
  // context here removed every exclusion the entry point carried.
  it('passes the narrowing context through on a removal too', async () => {
    rulesService.removeBulkExclusions.mockResolvedValue({ results: [] });

    await controller.setBulkExclusions({
      mediaIds: ['show-1'],
      action: 1,
      context: { id: 'season-1', type: 'season' },
    });

    expect(rulesService.removeBulkExclusions).toHaveBeenCalledWith(
      ['show-1'],
      undefined,
      { id: 'season-1', type: 'season' },
    );
  });
});
