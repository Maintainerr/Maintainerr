import { createMockLogger } from '../../../test/utils/data';
import { Application, RulePossibility } from './constants/rules.constants';
import { RulesService } from './rules.service';

describe('RulesService.setRules', () => {
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

  // A minimal, valid single-rule section (Plex "date added" EXISTS). EXISTS is
  // self-contained so the rule needs no second value to pass validation.
  const validRules = [
    {
      operator: null,
      action: RulePossibility.EXISTS,
      firstVal: [Application.PLEX, 0],
      section: 0,
    },
  ];

  const createMediaServerFactory = () => ({
    getService: jest.fn().mockReturnValue({
      getLibraries: jest
        .fn()
        .mockResolvedValue([{ id: '1', title: 'Movies', type: 'movie' }]),
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists a valid rule group and reports success', async () => {
    const createCollection = jest
      .fn()
      .mockResolvedValue({ dbCollection: { id: 99 } });
    const rulesRepository = { save: jest.fn().mockResolvedValue(undefined) };

    const service = createRulesService({
      rulesRepository,
      collectionService: { createCollection },
      mediaServerFactory: createMediaServerFactory(),
    });

    jest.spyOn(service as any, 'createOrUpdateGroup').mockResolvedValue(7);

    const result = await service.setRules({
      libraryId: '1',
      name: 'Valid group',
      description: '',
      useRules: true,
      isActive: true,
      rules: validRules,
      collection: { keepLogsForMonths: 6 },
    } as any);

    expect(rulesRepository.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      code: 1,
      result: 'Success',
      message: 'Success',
    });
  });

  // Regression for #3044: an incomplete payload that omits the `collection`
  // block used to make `+params.collection?.keepLogsForMonths` evaluate to NaN,
  // which better-sqlite3 cannot bind - the insert threw and the group silently
  // failed to save. It must now fall back to the column default (6) and persist.
  it('falls back to the default keepLogsForMonths when the collection block is omitted', async () => {
    const createCollection = jest
      .fn()
      .mockResolvedValue({ dbCollection: { id: 99 } });

    const service = createRulesService({
      rulesRepository: { save: jest.fn().mockResolvedValue(undefined) },
      collectionService: { createCollection },
      mediaServerFactory: createMediaServerFactory(),
    });

    jest.spyOn(service as any, 'createOrUpdateGroup').mockResolvedValue(7);

    const result = await service.setRules({
      libraryId: '1',
      name: 'No collection block',
      description: '',
      useRules: true,
      isActive: true,
      rules: validRules,
    } as any);

    expect(createCollection).toHaveBeenCalledWith(
      expect.objectContaining({ keepLogsForMonths: 6 }),
    );
    expect(result).toEqual({
      code: 1,
      result: 'Success',
      message: 'Success',
    });
  });

  // Regression for #3044: when collection creation fails, setRules used to
  // `return undefined`, which NestJS serialized as a silent HTTP 201 with an
  // empty body - indistinguishable from success to the client. It must now
  // return a structured failure the UI can surface.
  it('returns a structured failure (not undefined) when collection creation fails', async () => {
    const service = createRulesService({
      collectionService: {
        createCollection: jest
          .fn()
          .mockResolvedValue({ dbCollection: undefined }),
      },
      mediaServerFactory: createMediaServerFactory(),
    });

    const result = await service.setRules({
      libraryId: '1',
      name: 'Collection fails',
      description: '',
      useRules: true,
      isActive: true,
      rules: validRules,
      collection: { keepLogsForMonths: 6 },
    } as any);

    expect(result).toEqual({
      code: 0,
      result: 'Failed to create collection',
      message: 'Failed to create collection',
    });
  });

  it('returns a structured failure (not undefined) when saving throws', async () => {
    const service = createRulesService({
      collectionService: {
        createCollection: jest
          .fn()
          .mockRejectedValue(new Error('database is locked')),
      },
      mediaServerFactory: createMediaServerFactory(),
    });

    const result = await service.setRules({
      libraryId: '1',
      name: 'Throws',
      description: '',
      useRules: true,
      isActive: true,
      rules: validRules,
      collection: { keepLogsForMonths: 6 },
    } as any);

    expect(result).toEqual({
      code: 0,
      result: 'Failed to save the rule group',
      message: 'Failed to save the rule group',
    });
  });
});
