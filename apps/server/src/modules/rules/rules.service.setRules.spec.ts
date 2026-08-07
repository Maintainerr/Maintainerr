import axios from 'axios';
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
      ruleUsersService: unknown;
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
      {} as any,
      (overrides.ruleUsersService ?? {
        getUsernames: jest.fn().mockResolvedValue([]),
      }) as any,
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

  const createMediaServerFactory = (
    libraries: unknown[] = [{ id: '1', title: 'Movies', type: 'movie' }],
  ) => ({
    getService: jest.fn().mockReturnValue({
      getLibraries: jest.fn().mockResolvedValue(libraries),
    }),
  });

  const setRulesFor = (libraryId: unknown, libraries?: unknown[]) => {
    const service = createRulesService({
      collectionService: {
        createCollection: jest
          .fn()
          .mockResolvedValue({ dbCollection: { id: 9 } }),
      },
      mediaServerFactory: createMediaServerFactory(libraries),
    });

    return service.setRules({
      libraryId,
      name: 'Library probe',
      description: '',
      useRules: true,
      isActive: true,
      rules: validRules,
      collection: { keepLogsForMonths: 6 },
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Without the user, a saved rule would skip every item at run time.
  // The community list is public and shared between installs; a rule must not
  // carry the uploader's media-server user into it.
  it('uploads a per-user rule without the user it was scoped to', async () => {
    const patch = jest.fn().mockResolvedValue({});
    jest.spyOn(axios, 'patch').mockImplementation(patch);
    const service = createRulesService();
    jest.spyOn(service, 'getCommunityRules').mockResolvedValue([]);

    await service.addToCommunityRules({
      name: 'Rewatched by a user',
      description: 'keeps what one user rewatches',
      JsonRules: [
        {
          operator: null,
          action: RulePossibility.BIGGER,
          firstVal: [Application.TAUTULLI, 9],
          customVal: { ruleTypeId: 0, value: '3' },
          username: 'alice',
          section: 0,
        },
      ],
    } as never);

    const uploaded = patch.mock.calls[0][1][0].value;
    expect(uploaded.JsonRules[0]).not.toHaveProperty('username');
    expect(uploaded.JsonRules[0]).toMatchObject({
      firstVal: [Application.TAUTULLI, 9],
      customVal: { ruleTypeId: 0, value: '3' },
    });
  });

  describe('per-user property validation', () => {
    const perUserRule = (username?: string) => [
      {
        operator: null,
        action: RulePossibility.BIGGER,
        firstVal: [Application.TAUTULLI, 9],
        customVal: { ruleTypeId: 0, value: '3' },
        section: 0,
        ...(username != null ? { username } : {}),
      },
    ];

    const saveRules = (rules: unknown[], knownUsernames = ['alice']) => {
      const service = createRulesService({
        ruleUsersService: {
          getUsernames: jest.fn().mockResolvedValue(knownUsernames),
        },
        rulesRepository: { save: jest.fn().mockResolvedValue(undefined) },
        collectionService: {
          createCollection: jest
            .fn()
            .mockResolvedValue({ dbCollection: { id: 9 } }),
        },
        mediaServerFactory: createMediaServerFactory(),
      });
      jest.spyOn(service as any, 'createOrUpdateGroup').mockResolvedValue(7);

      return service.setRules({
        libraryId: '1',
        name: 'Per-user group',
        description: '',
        useRules: true,
        isActive: true,
        rules,
        collection: { keepLogsForMonths: 6 },
      } as any);
    };

    it('rejects a per-user property saved without a user', async () => {
      await expect(saveRules(perUserRule())).resolves.toEqual({
        code: 0,
        result: 'Select a user for properties that are scoped to one user',
        message: 'Select a user for properties that are scoped to one user',
      });
    });

    it('rejects a blank user as no user at all', async () => {
      await expect(saveRules(perUserRule('   '))).resolves.toEqual({
        code: 0,
        result: 'Select a user for properties that are scoped to one user',
        message: 'Select a user for properties that are scoped to one user',
      });
    });

    it('rejects a user picked for a property that ignores it', async () => {
      const rules = [{ ...validRules[0], username: 'alice' }];

      await expect(saveRules(rules)).resolves.toEqual({
        code: 0,
        result:
          'A user can only be selected for properties that are scoped to one user',
        message:
          'A user can only be selected for properties that are scoped to one user',
      });
    });

    it('accepts a per-user property with a user', async () => {
      await expect(saveRules(perUserRule('alice'))).resolves.toEqual({
        code: 1,
        result: 'Success',
        message: 'Success',
      });
    });

    // A YAML or community import carries the user of the install it came from,
    // and never passes through the editor's picker.
    it('rejects a user the media server does not have', async () => {
      await expect(saveRules(perUserRule('bob'))).resolves.toEqual({
        code: 0,
        result: "The media server has no user named 'bob'",
        message: "The media server has no user named 'bob'",
      });
    });

    it('saves anyway when the media server cannot list its users', async () => {
      await expect(saveRules(perUserRule('bob'), [])).resolves.toEqual({
        code: 1,
        result: 'Success',
        message: 'Success',
      });
    });
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
  // RuleGroupDto and from the createCollection call, which silently dropped it.
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

  // A library the caller never named, or named wrongly, is a bad request - not
  // the 500 a dereferenced library used to produce (#3384).
  it.each([
    ['no library', undefined],
    ['an empty library', ''],
  ])('rejects a rule group with %s', async (_name, libraryId) => {
    await expect(setRulesFor(libraryId)).rejects.toMatchObject({
      status: 400,
      message: 'A library is required',
    });
  });

  it('rejects a library the media server does not have', async () => {
    await expect(setRulesFor('999')).rejects.toMatchObject({
      status: 400,
      message: 'Library 999 does not exist on the media server',
    });
  });

  // Every getLibraries path answers [] when the media server is unreachable, so
  // an empty list must not be read as "the caller named a bad library".
  it('blames the media server, not the caller, when no library can be read', async () => {
    await expect(setRulesFor('1', [])).rejects.toMatchObject({ status: 502 });
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
