import { FindOperator } from 'typeorm';
import { createMockLogger } from '../../../test/utils/data';
import { RulesService } from './rules.service';

// Regression coverage for global-exclusion handling (ruleGroupId IS NULL).
// TypeORM 1.x throws on a bare `null` in a `where` clause, so these paths must
// use IsNull() and must not feed a null id into a lookup.
describe('RulesService exclusions — global (null ruleGroupId) handling', () => {
  const logger = createMockLogger();

  const createService = (overrides?: {
    exclusionRepo?: any;
    ruleGroupRepository?: any;
    collectionService?: any;
    mediaServerFactory?: any;
  }) => {
    const exclusionRepo = overrides?.exclusionRepo ?? {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const ruleGroupRepository = overrides?.ruleGroupRepository ?? {
      findOne: jest.fn().mockResolvedValue(undefined),
    };
    const collectionService = overrides?.collectionService ?? {
      CollectionLogRecordForChild: jest.fn().mockResolvedValue(undefined),
    };
    const mediaServerFactory = overrides?.mediaServerFactory ?? {
      getService: jest.fn(),
    };

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
      mediaServerFactory as any,
      {} as any, // connection
      {} as any, // ruleYamlService
      {} as any, // ruleComparatorServiceFactory
      {} as any, // ruleMigrationService
      {} as any, // eventEmitter
      logger as any,
    );

    return {
      service,
      exclusionRepo,
      ruleGroupRepository,
      collectionService,
      mediaServerFactory,
    };
  };

  const isNullOperator = (value: unknown) =>
    value instanceof FindOperator && value.type === 'isNull';

  beforeEach(() => jest.clearAllMocks());

  it('getExclusions(rulegroupId) fetches global exclusions with IsNull(), not bare null', async () => {
    const { service, exclusionRepo } = createService();

    await service.getExclusions(5);

    // first call: the rule-group-specific exclusions
    expect(exclusionRepo.find).toHaveBeenNthCalledWith(1, {
      where: { ruleGroupId: 5 },
    });
    // second call: the global exclusions — must use IsNull(), never `null`
    const globalCallWhere = exclusionRepo.find.mock.calls[1][0].where;
    expect(isNullOperator(globalCallWhere.ruleGroupId)).toBe(true);
  });

  it('removeExclusion skips the rule-group lookup for a global exclusion (null ruleGroupId)', async () => {
    const exclusionRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 1, ruleGroupId: null, mediaServerId: 'a' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const ruleGroupRepository = { findOne: jest.fn() };
    const { service } = createService({ exclusionRepo, ruleGroupRepository });

    const result = await service.removeExclusion(1);

    expect(ruleGroupRepository.findOne).not.toHaveBeenCalled();
    expect(exclusionRepo.delete).toHaveBeenCalledWith(1);
    expect(result.code).toBe(1);
  });

  it('removeExclusion looks up the rule group for a scoped exclusion', async () => {
    const exclusionRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 2, ruleGroupId: 7, mediaServerId: 'b' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 7, collectionId: 9 }),
    };
    const { service } = createService({ exclusionRepo, ruleGroupRepository });

    await service.removeExclusion(2);

    expect(ruleGroupRepository.findOne).toHaveBeenCalledWith({
      where: { id: 7 },
    });
  });

  it('setExclusion(global) looks up with IsNull(), saves a null ruleGroupId, and removes redundant scoped exclusions', async () => {
    const exclusionRepo = {
      findOne: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue({ type: 'movie' }),
      getAllIdsForContextAction: jest.fn().mockResolvedValue(['movie-1']),
    };
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    };
    const { service } = createService({ exclusionRepo, mediaServerFactory });

    const result = await service.setExclusion({ mediaId: 'movie-1' } as any);

    const findOneWhere = exclusionRepo.findOne.mock.calls[0][0].where;
    expect(isNullOperator(findOneWhere.ruleGroupId)).toBe(true);
    expect(exclusionRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        mediaServerId: 'movie-1',
        ruleGroupId: null,
        parent: 'movie-1',
        type: 'movie',
      }),
    ]);
    // global subsumes scoped: any rule-group exclusions for this item are dropped
    const deleteCriteria = exclusionRepo.delete.mock.calls[0][0];
    expect(deleteCriteria.mediaServerId).toBe('movie-1');
    expect(deleteCriteria.ruleGroupId).toBeInstanceOf(FindOperator);
    expect(deleteCriteria.ruleGroupId.type).toBe('not');
    expect(result.code).toBe(1);
  });

  it('setExclusion(scoped) is a no-op when the item is already globally excluded', async () => {
    const exclusionRepo = {
      // the first lookup (existing-global check) finds a global exclusion
      findOne: jest.fn().mockResolvedValue({
        id: 9,
        mediaServerId: 'movie-1',
        ruleGroupId: null,
      }),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue({ type: 'movie' }),
      getAllIdsForContextAction: jest.fn().mockResolvedValue(['movie-1']),
    };
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    };
    const { service } = createService({ exclusionRepo, mediaServerFactory });

    const result = await service.setExclusion({
      mediaId: 'movie-1',
      ruleGroupId: 5,
    } as any);

    // the existing-global check used IsNull(), and the scoped row was skipped
    expect(
      isNullOperator(exclusionRepo.findOne.mock.calls[0][0].where.ruleGroupId),
    ).toBe(true);
    expect(exclusionRepo.save).not.toHaveBeenCalled();
    expect(result.code).toBe(1);
  });
});
