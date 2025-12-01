import { EventEmitter2 } from '@nestjs/event-emitter';
import { RuleExecutorService } from './rule-executor.service';
import { RulesDto } from '../dtos/rules.dto';

const createService = (mockRulesService: any = {}) => {
  const mockLogger = {
    setContext: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  } as any;

  const service = new RuleExecutorService(
    mockRulesService as any,
    {} as any,
    {} as any,
    {} as any,
    {
      rules_handler_job_cron: '* * * * *',
      testConnections: jest.fn(),
    } as any,
    { create: jest.fn() } as any,
    { emit: jest.fn() } as unknown as EventEmitter2,
    mockLogger,
  );

  return { service };
};

describe('RuleExecutorService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('executeRuleGroup', () => {
    it('should call execute and reset overrides for a specific rule group', async () => {
      const { service } = createService();
      const executeSpy = jest
        .spyOn(service, 'execute')
        .mockResolvedValue(undefined);

      await service.executeRuleGroup(5);

      expect(executeSpy).toHaveBeenCalledTimes(1);
      expect(service['ruleGroupOverrides']).toBeUndefined();
    });

    it('should reset overrides when execute rejects', async () => {
      const { service } = createService();
      const error = new Error('failure');
      jest.spyOn(service, 'execute').mockRejectedValue(error);

      await expect(service.executeRuleGroup(7)).rejects.toThrow(error);
      expect(service['ruleGroupOverrides']).toBeUndefined();
    });
  });

  describe('getRuleGroupsForExecution', () => {
    it('should return filtered rule groups when overrides are set', async () => {
      const mockRuleGroups: RulesDto[] = [
        { id: 1, name: 'Group 1' } as RulesDto,
        { id: 2, name: 'Group 2' } as RulesDto,
        { id: 3, name: 'Group 3' } as RulesDto,
      ];

      const mockRulesService = {
        getRuleGroups: jest.fn().mockResolvedValue(mockRuleGroups),
      };

      const { service } = createService(mockRulesService);
      service['ruleGroupOverrides'] = [2, 3];

      const result = await service['getRuleGroupsForExecution']();

      expect(mockRulesService.getRuleGroups).toHaveBeenCalledWith(false);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(3);
    });

    it('should return all active rule groups when no overrides are set', async () => {
      const mockActiveRuleGroups: RulesDto[] = [
        { id: 1, name: 'Active Group 1', isActive: true } as RulesDto,
        { id: 2, name: 'Active Group 2', isActive: true } as RulesDto,
      ];

      const mockRulesService = {
        getRuleGroups: jest.fn().mockResolvedValue(mockActiveRuleGroups),
      };

      const { service } = createService(mockRulesService);

      const result = await service['getRuleGroupsForExecution']();

      expect(mockRulesService.getRuleGroups).toHaveBeenCalledWith(true);
      expect(result).toEqual(mockActiveRuleGroups);
    });

    it('should return empty array when no rule groups exist', async () => {
      const mockRulesService = {
        getRuleGroups: jest.fn().mockResolvedValue(null),
      };

      const { service } = createService(mockRulesService);
      service['ruleGroupOverrides'] = [1];

      const result = await service['getRuleGroupsForExecution']();

      expect(result).toEqual([]);
    });

    it('should filter out rule groups without defined IDs', async () => {
      const mockRuleGroups: RulesDto[] = [
        { id: 1, name: 'Group 1' } as RulesDto,
        { id: undefined, name: 'Group 2' } as RulesDto,
        { id: 3, name: 'Group 3' } as RulesDto,
      ];

      const mockRulesService = {
        getRuleGroups: jest.fn().mockResolvedValue(mockRuleGroups),
      };

      const { service } = createService(mockRulesService);
      service['ruleGroupOverrides'] = [1, 3];

      const result = await service['getRuleGroupsForExecution']();

      expect(result).toHaveLength(2);
      expect(result.every((g) => g.id !== undefined)).toBe(true);
    });
  });

  describe('buildExecutionScopeDescription', () => {
    it('should return single rule group name when executing one override', () => {
      const { service } = createService();
      service['ruleGroupOverrides'] = [1];

      const ruleGroups: RulesDto[] = [
        { id: 1, name: 'Test Rule Group' } as RulesDto,
      ];

      const result = service['buildExecutionScopeDescription'](ruleGroups);

      expect(result).toBe("rule group 'Test Rule Group'");
    });

    it('should return "selected rule groups" when executing multiple overrides', () => {
      const { service } = createService();
      service['ruleGroupOverrides'] = [1, 2, 3];

      const ruleGroups: RulesDto[] = [
        { id: 1, name: 'Group 1' } as RulesDto,
        { id: 2, name: 'Group 2' } as RulesDto,
        { id: 3, name: 'Group 3' } as RulesDto,
      ];

      const result = service['buildExecutionScopeDescription'](ruleGroups);

      expect(result).toBe('selected rule groups');
    });

    it('should return "all active rules" when no overrides are set', () => {
      const { service } = createService();

      const ruleGroups: RulesDto[] = [
        { id: 1, name: 'Group 1' } as RulesDto,
        { id: 2, name: 'Group 2' } as RulesDto,
      ];

      const result = service['buildExecutionScopeDescription'](ruleGroups);

      expect(result).toBe('all active rules');
    });
  });
});
