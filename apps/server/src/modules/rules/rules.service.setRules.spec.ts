import {
  createMockLogger,
  createMockServarrTagService,
} from '../../../test/utils/data';
import { ServarrAction } from '../collections/interfaces/collection.interface';
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
      sportarrSettingsRepo: unknown;
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
      (overrides.sportarrSettingsRepo ?? {}) as any,
      (overrides.collectionService ?? {}) as any,
      (overrides.mediaServerFactory ?? {}) as any,
      (overrides.connection ?? {}) as any,
      (overrides.ruleYamlService ?? {}) as any,
      (overrides.ruleComparatorServiceFactory ?? {}) as any,
      (overrides.ruleMigrationService ?? {}) as any,
      (overrides.eventEmitter ?? {}) as any,
      createMockServarrTagService() as any,
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

  // The UI submits the leftover-folder cleanup opt-in on the rule-group payload,
  // so setRules is the only path that can turn it on. It used to be missing from
  // RulesDto and from the createCollection call, which silently dropped it.
  it('persists the leftover-folder cleanup opt-in for an action that strands a folder', async () => {
    const createCollection = jest
      .fn()
      .mockResolvedValue({ dbCollection: { id: 99 } });

    const service = createRulesService({
      rulesRepository: { save: jest.fn().mockResolvedValue(undefined) },
      collectionService: { createCollection },
      mediaServerFactory: createMediaServerFactory(),
    });

    jest.spyOn(service as any, 'createOrUpdateGroup').mockResolvedValue(7);

    await service.setRules({
      libraryId: '1',
      name: 'Cleanup on',
      description: '',
      useRules: true,
      isActive: true,
      rules: validRules,
      arrAction: ServarrAction.UNMONITOR_DELETE_ALL,
      cleanupLeftoverFolders: true,
    } as any);

    expect(createCollection).toHaveBeenCalledWith(
      expect.objectContaining({ cleanupLeftoverFolders: true }),
    );
  });

  // Mirrors the forceSeerr clamp: the checkbox is hidden for an action that
  // strands nothing, so a value left over from switching action after ticking it
  // must not be stored - a filesystem delete may not end up enabled unseen.
  it('clears the cleanup opt-in for an action that strands no folder', async () => {
    const createCollection = jest
      .fn()
      .mockResolvedValue({ dbCollection: { id: 99 } });

    const service = createRulesService({
      rulesRepository: { save: jest.fn().mockResolvedValue(undefined) },
      collectionService: { createCollection },
      mediaServerFactory: createMediaServerFactory(),
    });

    jest.spyOn(service as any, 'createOrUpdateGroup').mockResolvedValue(7);

    await service.setRules({
      libraryId: '1',
      name: 'Cleanup stale',
      description: '',
      useRules: true,
      isActive: true,
      rules: validRules,
      // Radarr removes the movie folder itself on a whole-entity delete.
      arrAction: ServarrAction.DELETE,
      cleanupLeftoverFolders: true,
    } as any);

    expect(createCollection).toHaveBeenCalledWith(
      expect.objectContaining({ cleanupLeftoverFolders: false }),
    );
  });

  it('rejects a payload that binds both Sonarr and Sportarr', async () => {
    // A show-library collection is managed by exactly one arr; the UI
    // enforces this, so the guard exists for raw API payloads.
    const createCollection = jest.fn();
    const service = createRulesService({
      collectionService: { createCollection },
      mediaServerFactory: createMediaServerFactory(),
    });

    const result = await service.setRules({
      libraryId: '1',
      name: 'Both managers',
      description: '',
      useRules: true,
      isActive: true,
      rules: validRules,
      collection: { keepLogsForMonths: 6 },
      sonarrSettingsId: 1,
      sportarrSettingsId: 2,
    } as any);

    expect(result.code).toBe(0);
    expect(result.result).toContain('either Sonarr or Sportarr');
    expect(createCollection).not.toHaveBeenCalled();
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
  // empty body - indistinguishable from success to the client. A returned
  // failure was still a 201, so it now answers with a status code (#3384).
  it('fails with a server error when collection creation fails', async () => {
    const service = createRulesService({
      collectionService: {
        createCollection: jest
          .fn()
          .mockResolvedValue({ dbCollection: undefined }),
      },
      mediaServerFactory: createMediaServerFactory(),
    });

    await expect(
      service.setRules({
        libraryId: '1',
        name: 'Collection fails',
        description: '',
        useRules: true,
        isActive: true,
        rules: validRules,
        collection: { keepLogsForMonths: 6 },
      } as any),
    ).rejects.toMatchObject({
      status: 500,
      message: 'Failed to create collection',
    });
  });

  it('fails with a server error, and logs the cause, when saving throws', async () => {
    const service = createRulesService({
      collectionService: {
        createCollection: jest
          .fn()
          .mockRejectedValue(new Error('database is locked')),
      },
      mediaServerFactory: createMediaServerFactory(),
    });

    await expect(
      service.setRules({
        libraryId: '1',
        name: 'Throws',
        description: '',
        useRules: true,
        isActive: true,
        rules: validRules,
        collection: { keepLogsForMonths: 6 },
      } as any),
    ).rejects.toMatchObject({
      status: 500,
      message: 'Failed to save the rule group',
    });
    // Short reason at error, the stack behind debug.
    expect(logger.error).toHaveBeenCalledWith('Failed to save the rule group');
    expect(logger.debug).toHaveBeenCalledWith(expect.any(Error));
  });
});
