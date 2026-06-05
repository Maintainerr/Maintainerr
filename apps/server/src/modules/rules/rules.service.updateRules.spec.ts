import { createMockLogger } from '../../../test/utils/data';
import {
  Application,
  RulePossibility,
  RuleType,
} from './constants/rules.constants';
import { RulesService } from './rules.service';

describe('RulesService.updateRules', () => {
  const logger = createMockLogger();

  const createRulesService = (
    overrides: Partial<{
      rulesRepository: unknown;
      ruleGroupRepository: unknown;
      collectionMediaRepository: unknown;
      communityRuleKarmaRepository: unknown;
      exclusionRepo: unknown;
      settingsRepo: unknown;
      radarrSettingsRepo: unknown;
      sonarrSettingsRepo: unknown;
      collectionService: unknown;
      mediaServerFactory: unknown;
      connection: unknown;
      ruleYamlService: unknown;
      ruleComparatorServiceFactory: unknown;
      ruleMigrationService: unknown;
      eventEmitter: unknown;
    }> = {},
  ) =>
    new RulesService(
      (overrides.rulesRepository ?? {}) as any,
      (overrides.ruleGroupRepository ?? {}) as any,
      (overrides.collectionMediaRepository ?? {}) as any,
      (overrides.communityRuleKarmaRepository ?? {}) as any,
      (overrides.exclusionRepo ?? {}) as any,
      (overrides.settingsRepo ?? {}) as any,
      (overrides.radarrSettingsRepo ?? {}) as any,
      (overrides.sonarrSettingsRepo ?? {}) as any,
      (overrides.collectionService ?? {}) as any,
      (overrides.mediaServerFactory ?? {}) as any,
      (overrides.connection ?? {}) as any,
      (overrides.ruleYamlService ?? {}) as any,
      (overrides.ruleComparatorServiceFactory ?? {}) as any,
      (overrides.ruleMigrationService ?? {}) as any,
      (overrides.eventEmitter ?? {}) as any,
      logger as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns error status when rule group is not found', async () => {
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const service = createRulesService({ ruleGroupRepository });

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

  it('continues past validation for date rules using custom_days values', async () => {
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const service = createRulesService({ ruleGroupRepository });

    const result = await service.updateRules({
      id: 999,
      libraryId: '1',
      dataType: 'movie',
      name: 'Test',
      description: '',
      rules: [
        {
          operator: null,
          action: RulePossibility.EQUALS,
          firstVal: [Application.PLEX, 7],
          customVal: {
            ruleTypeId: +RuleType.NUMBER,
            value: (330 * 86400).toString(),
          },
          section: 0,
        },
      ],
    } as any);

    expect(ruleGroupRepository.findOne).toHaveBeenCalledWith({
      where: { id: 999 },
    });
    expect(result).toEqual({
      code: 0,
      result: 'Rule group not found',
      message: 'Rule group not found',
    });
  });

  it('rejects numeric custom values for non-date rules', async () => {
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const service = createRulesService({ ruleGroupRepository });

    const result = await service.updateRules({
      id: 999,
      libraryId: '1',
      dataType: 'movie',
      name: 'Test',
      description: '',
      rules: [
        {
          operator: null,
          action: RulePossibility.EQUALS,
          firstVal: [Application.PLEX, 10],
          customVal: {
            ruleTypeId: +RuleType.NUMBER,
            value: '6',
          },
          section: 0,
        },
      ],
    } as any);

    expect(ruleGroupRepository.findOne).not.toHaveBeenCalled();
    expect(result).toEqual({
      code: 0,
      result: 'Validation failed',
      message: 'Validation failed',
    });
  });

  it('rejects missing operators on non-first rules before saving', async () => {
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const service = createRulesService({ ruleGroupRepository });

    const result = await service.updateRules({
      id: 999,
      libraryId: '1',
      dataType: 'movie',
      name: 'Test',
      description: '',
      rules: [
        {
          operator: null,
          action: RulePossibility.EXISTS,
          firstVal: [Application.PLEX, 10],
          section: 0,
        },
        {
          operator: null,
          action: RulePossibility.EXISTS,
          firstVal: [Application.PLEX, 10],
          section: 1,
        },
      ],
    } as any);

    expect(ruleGroupRepository.findOne).not.toHaveBeenCalled();
    expect(result).toEqual({
      code: 0,
      result: 'Operator is required for every rule after the first',
      message: 'Operator is required for every rule after the first',
    });
  });

  it('returns a clean status (not a crash) when a rule references a property not on this server', async () => {
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const service = createRulesService({ ruleGroupRepository });

    const result = await service.updateRules({
      id: 999,
      libraryId: '1',
      dataType: 'movie',
      name: 'Test',
      description: '',
      rules: [
        {
          operator: null,
          action: RulePossibility.EQUALS,
          // Application/property that does not exist (e.g. an imported rule for
          // an unconfigured service). Previously threw a TypeError that surfaced
          // as a generic "Unexpected error occurred".
          firstVal: [999, 999],
          customVal: { ruleTypeId: 0, value: '1' },
          section: 0,
        },
      ],
    } as any);

    expect(ruleGroupRepository.findOne).not.toHaveBeenCalled();
    expect(result).toEqual({
      code: 0,
      result: 'First value is not available for this server',
      message: 'First value is not available for this server',
    });
  });

  it('cleans up the previous library when a rule moves libraries', async () => {
    const rulesRepository = {
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const group = {
      id: 5,
      collectionId: 42,
      dataType: 'show',
    };

    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue(group),
    };

    const collectionMediaRepository = {
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const exclusionRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const dbCollection = {
      id: 42,
      libraryId: 'old-library',
      mediaServerId: 'server-collection-id',
      manualCollection: true,
      manualCollectionName: 'Shared Collection',
    };

    const collectionService = {
      getCollection: jest.fn().mockResolvedValue(dbCollection),
      saveCollection: jest.fn().mockResolvedValue(undefined),
      addLogRecord: jest.fn().mockResolvedValue(undefined),
      updateCollection: jest.fn().mockResolvedValue({
        dbCollection: { id: 42 },
      }),
    };

    const mediaServer = {
      cleanupCollectionForLibrary: jest.fn().mockResolvedValue(undefined),
      getLibraries: jest.fn().mockResolvedValue([
        {
          id: 'new-library',
          title: 'New Library',
          type: 'show',
        },
      ]),
    };

    const service = createRulesService({
      rulesRepository,
      ruleGroupRepository,
      collectionMediaRepository,
      exclusionRepo,
      collectionService,
      mediaServerFactory: {
        getService: jest.fn().mockReturnValue(mediaServer),
      },
    });

    jest
      .spyOn(service as any, 'createOrUpdateGroup')
      .mockResolvedValue(group.id);

    const result = await service.updateRules({
      id: group.id,
      libraryId: 'new-library',
      dataType: 'show',
      name: 'Test Rule Group',
      description: 'Test description',
      rules: [],
      useRules: true,
      isActive: true,
      collection: {
        manualCollection: true,
        manualCollectionName: 'Shared Collection',
        keepLogsForMonths: 1,
      },
      notifications: [],
    } as any);

    expect(mediaServer.cleanupCollectionForLibrary).toHaveBeenCalledWith(
      'server-collection-id',
      'old-library',
      true,
    );
    expect(collectionMediaRepository.delete).toHaveBeenCalledWith({
      collectionId: group.collectionId,
    });
    expect(collectionService.saveCollection).toHaveBeenCalledWith({
      ...dbCollection,
      mediaServerId: null,
    });
    expect(collectionService.updateCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: group.collectionId,
        libraryId: 'new-library',
      }),
    );
    expect(rulesRepository.delete).toHaveBeenCalledWith({
      ruleGroupId: group.id,
    });
    expect(result).toEqual({
      code: 1,
      result: 'Success',
      message: 'Success',
    });
  });

  // Regression for #3044: an update payload that omits the `collection` block
  // used to throw on `params.collection.manualCollection` during the
  // "crucial setting changed" check. It must now update without throwing, fall
  // back to the default keepLogsForMonths (6), and not trigger a spurious media
  // wipe (an absent field means "unchanged", not "changed to undefined").
  it('updates without throwing when the collection block is omitted', async () => {
    const group = { id: 5, collectionId: 42, dataType: 'movie' };
    const dbCollection = {
      id: 42,
      libraryId: 'lib-1',
      mediaServerId: 'col-1',
      manualCollection: false,
      manualCollectionName: '',
    };

    const collectionMediaRepository = { delete: jest.fn() };
    const collectionService = {
      getCollection: jest.fn().mockResolvedValue(dbCollection),
      saveCollection: jest.fn().mockResolvedValue(undefined),
      addLogRecord: jest.fn().mockResolvedValue(undefined),
      updateCollection: jest
        .fn()
        .mockResolvedValue({ dbCollection: { id: 42 } }),
    };
    const mediaServer = {
      cleanupCollectionForLibrary: jest.fn().mockResolvedValue(undefined),
      getLibraries: jest
        .fn()
        .mockResolvedValue([{ id: 'lib-1', title: 'Movies', type: 'movie' }]),
    };

    const service = createRulesService({
      rulesRepository: { delete: jest.fn(), save: jest.fn() },
      ruleGroupRepository: { findOne: jest.fn().mockResolvedValue(group) },
      collectionMediaRepository,
      exclusionRepo: { delete: jest.fn() },
      collectionService,
      mediaServerFactory: {
        getService: jest.fn().mockReturnValue(mediaServer),
      },
    });

    jest
      .spyOn(service as any, 'createOrUpdateGroup')
      .mockResolvedValue(group.id);

    const result = await service.updateRules({
      id: group.id,
      libraryId: 'lib-1',
      dataType: 'movie',
      name: 'No collection block',
      description: '',
      rules: [],
      useRules: true,
      isActive: true,
      // collection intentionally omitted
    } as any);

    // Absent collection settings must not be read as a "crucial" change.
    expect(collectionMediaRepository.delete).not.toHaveBeenCalled();
    expect(collectionService.updateCollection).toHaveBeenCalledWith(
      expect.objectContaining({ keepLogsForMonths: 6 }),
    );
    expect(result).toEqual({
      code: 1,
      result: 'Success',
      message: 'Success',
    });
  });

  const buildSortTransitionFixture = (options: {
    previousSort: string | null;
    nextSort: string | null;
  }) => {
    const dbCollection = {
      id: 7,
      libraryId: 'lib-1',
      mediaServerId: 'plex-col-1',
      manualCollection: false,
      manualCollectionName: '',
      mediaServerSort: options.previousSort,
    } as any;

    const freshCollection = {
      ...dbCollection,
      mediaServerSort: options.nextSort,
    } as any;

    const collectionService = {
      getCollection: jest.fn().mockResolvedValue(dbCollection),
      saveCollection: jest.fn().mockResolvedValue(undefined),
      addLogRecord: jest.fn().mockResolvedValue(undefined),
      updateCollection: jest.fn().mockResolvedValue({
        dbCollection: freshCollection,
      }),
      applyCollectionSort: jest.fn().mockResolvedValue(undefined),
    };

    const mediaServer = {
      cleanupCollectionForLibrary: jest.fn().mockResolvedValue(undefined),
      getLibraries: jest
        .fn()
        .mockResolvedValue([{ id: 'lib-1', title: 'Movies', type: 'movie' }]),
    };

    const service = createRulesService({
      rulesRepository: { delete: jest.fn(), save: jest.fn() },
      ruleGroupRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 5,
          collectionId: dbCollection.id,
          dataType: 'movie',
        }),
      },
      collectionMediaRepository: { delete: jest.fn() },
      exclusionRepo: { delete: jest.fn() },
      collectionService,
      mediaServerFactory: {
        getService: jest.fn().mockReturnValue(mediaServer),
      },
    });

    jest.spyOn(service as any, 'createOrUpdateGroup').mockResolvedValue(5);

    return { service, collectionService, dbCollection, freshCollection };
  };

  it('applies the collection sort immediately when newly enabled on save', async () => {
    const { service, collectionService, freshCollection } =
      buildSortTransitionFixture({
        previousSort: null,
        nextSort: 'title.asc',
      });

    await service.updateRules({
      id: 5,
      libraryId: 'lib-1',
      dataType: 'movie',
      name: 'rg',
      description: '',
      rules: [],
      useRules: false,
      isActive: true,
      collection: {
        manualCollection: false,
        manualCollectionName: '',
        keepLogsForMonths: 1,
        mediaServerSort: 'title.asc',
      },
      notifications: [],
    } as any);

    expect(collectionService.applyCollectionSort).toHaveBeenCalledWith(
      freshCollection,
    );
  });

  it('does not reapply sort on save when the sort value is cleared', async () => {
    const { service, collectionService } = buildSortTransitionFixture({
      previousSort: 'title.asc',
      nextSort: null,
    });

    await service.updateRules({
      id: 5,
      libraryId: 'lib-1',
      dataType: 'movie',
      name: 'rg',
      description: '',
      rules: [],
      useRules: false,
      isActive: true,
      collection: {
        manualCollection: false,
        manualCollectionName: '',
        keepLogsForMonths: 1,
        mediaServerSort: null,
      },
      notifications: [],
    } as any);

    expect(collectionService.applyCollectionSort).not.toHaveBeenCalled();
  });

  it('does not touch sort on save when the sort value is unchanged', async () => {
    const { service, collectionService } = buildSortTransitionFixture({
      previousSort: 'title.asc',
      nextSort: 'title.asc',
    });

    await service.updateRules({
      id: 5,
      libraryId: 'lib-1',
      dataType: 'movie',
      name: 'rg',
      description: '',
      rules: [],
      useRules: false,
      isActive: true,
      collection: {
        manualCollection: false,
        manualCollectionName: '',
        keepLogsForMonths: 1,
        mediaServerSort: 'title.asc',
      },
      notifications: [],
    } as any);

    expect(collectionService.applyCollectionSort).not.toHaveBeenCalled();
  });
});
