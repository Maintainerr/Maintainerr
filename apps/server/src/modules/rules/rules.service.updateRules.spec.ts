import { createMockLogger } from '../../../test/utils/data';
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
});
