import { MaintainerrEvent } from '@maintainerr/contracts';
import { createMockLogger } from '../../../test/utils/data';
import { RulesService } from './rules.service';

describe('RulesService.updateRules - null guard', () => {
  const logger = createMockLogger();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns error status when rule group is not found', async () => {
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const service = new RulesService(
      {} as any, // rulesRepository
      ruleGroupRepository as any,
      {} as any, // collectionMediaRepository
      {} as any, // communityRuleKarmaRepository
      {} as any, // exclusionRepo
      {} as any, // settingsRepo
      {} as any, // radarrSettingsRepo
      {} as any, // sonarrSettingsRepo
      {} as any, // collectionService
      {} as any, // mediaServerFactory
      {} as any, // connection
      {} as any, // ruleYamlService
      {} as any, // ruleComparatorServiceFactory
      {} as any, // ruleMigrationService
      {} as any, // eventEmitter
      logger as any,
    );

    // Before the fix, this would throw:
    // TypeError: Cannot read properties of null (reading 'collectionId')
    const result = await service.updateRules({
      id: 999,
      libraryId: '1',
      dataType: 'show',
      name: 'Test',
      rules: [],
      description: '',
    });

    expect(result).toEqual({
      code: 0,
      result: 'Rule group not found',
      message: 'Rule group not found',
    });
  });
});

describe('RulesService.deleteRuleGroup', () => {
  const logger = createMockLogger();

  const createRulesService = (options?: { group?: any }) => {
    const { group = undefined } = options ?? {};

    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue(group),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const exclusionRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const collectionService = {
      deleteCollection: jest.fn().mockResolvedValue(undefined),
    };

    const eventEmitter = {
      emit: jest.fn(),
    };

    // RulesService has many deps; we only need the ones used by deleteRuleGroup
    const service = new RulesService(
      {} as any, // rulesRepository
      ruleGroupRepository as any,
      {} as any, // collectionMediaRepository
      {} as any, // communityRuleKarmaRepository
      exclusionRepo as any,
      {} as any, // settingsRepo
      {} as any, // radarrSettingsRepo
      {} as any, // sonarrSettingsRepo
      collectionService as any,
      {} as any, // mediaServerFactory
      {} as any, // connection
      {} as any, // ruleYamlService
      {} as any, // ruleComparatorServiceFactory
      {} as any, // ruleMigrationService
      eventEmitter as any,
      logger as any,
    );

    return {
      service,
      ruleGroupRepository,
      exclusionRepo,
      collectionService,
      eventEmitter,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Bug #2358 regression: TypeError on collection deletion', () => {
    /**
     * Reproduces the TypeError from GitHub issue #2358.
     *
     * When deleteRuleGroup is called and findOne returns null (e.g., the
     * rule group was already deleted), the original code accessed
     * `group.collectionId` without a null check, causing:
     *   TypeError: Cannot read properties of null (reading 'collectionId')
     *
     * The fix wraps the event emission and collectionId access in a
     * null guard: `if (group) { ... }`.
     */
    it('does not throw TypeError when findOne returns null', async () => {
      const { service } = createRulesService({ group: null });

      // Before the fix, this would throw:
      // TypeError: Cannot read properties of null (reading 'collectionId')
      const result = await service.deleteRuleGroup(999);

      expect(result).toEqual({
        code: 1,
        result: 'Success',
        message: 'Success',
      });
    });

    it('still performs exclusion and ruleGroup deletes when group is null', async () => {
      const { service, exclusionRepo, ruleGroupRepository } =
        createRulesService({
          group: null,
        });

      await service.deleteRuleGroup(999);

      expect(exclusionRepo.delete).toHaveBeenCalledWith({ ruleGroupId: 999 });
      expect(ruleGroupRepository.delete).toHaveBeenCalledWith(999);
    });

    it('does not emit event or delete collection when group is null', async () => {
      const { service, eventEmitter, collectionService } = createRulesService({
        group: null,
      });

      await service.deleteRuleGroup(999);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(collectionService.deleteCollection).not.toHaveBeenCalled();
    });
  });

  describe('normal deletion flow', () => {
    it('emits RuleGroup_Deleted event when group exists', async () => {
      const group = { id: 42, collectionId: 100 };
      const { service, eventEmitter } = createRulesService({ group });

      await service.deleteRuleGroup(42);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        MaintainerrEvent.RuleGroup_Deleted,
        { ruleGroup: group },
      );
    });

    it('deletes associated collection when group has collectionId', async () => {
      const group = { id: 42, collectionId: 100 };
      const { service, collectionService } = createRulesService({ group });

      await service.deleteRuleGroup(42);

      expect(collectionService.deleteCollection).toHaveBeenCalledWith(100);
    });

    it('does not delete collection when group has no collectionId', async () => {
      const group = { id: 42, collectionId: null };
      const { service, collectionService } = createRulesService({ group });

      await service.deleteRuleGroup(42);

      expect(collectionService.deleteCollection).not.toHaveBeenCalled();
    });

    it('cleans up exclusions and ruleGroup rows', async () => {
      const group = { id: 42, collectionId: null };
      const { service, exclusionRepo, ruleGroupRepository } =
        createRulesService({
          group,
        });

      await service.deleteRuleGroup(42);

      expect(exclusionRepo.delete).toHaveBeenCalledWith({ ruleGroupId: 42 });
      expect(ruleGroupRepository.delete).toHaveBeenCalledWith(42);
    });
  });
});
