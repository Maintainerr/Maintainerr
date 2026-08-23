import {
  createMockLogger,
  createMockServarrTagService,
} from '../../../test/utils/data';
import { ServarrAction } from '../collections/interfaces/collection.interface';
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
      sportarrSettingsRepo: unknown;
      collectionService: unknown;
      mediaServerFactory: unknown;
      connection: unknown;
      ruleYamlService: unknown;
      ruleComparatorServiceFactory: unknown;
      ruleMigrationService: unknown;
      eventEmitter: unknown;
      servarrTagService: unknown;
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
      (overrides.servarrTagService ?? createMockServarrTagService()) as any,
      logger as any,
      {} as any,
      (overrides.ruleUsersService ?? {
        getUsernames: jest.fn().mockResolvedValue([]),
      }) as any,
    );

  // Let the fire-and-forget membership reconcile settle before asserting on it.
  const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // TypeORM drops an undefined id from the where clause instead of rejecting
  // it, so this has to be caught before the lookup (#3384).
  it('rejects an update that names no rule group', async () => {
    const ruleGroupRepository = { findOne: jest.fn() };
    const service = createRulesService({ ruleGroupRepository });

    await expect(
      service.updateRules({
        libraryId: '1',
        dataType: 'movie',
        name: 'Test',
        rules: [],
        description: '',
      } as any),
    ).rejects.toMatchObject({
      status: 400,
      message: 'A rule group id is required',
    });
    expect(ruleGroupRepository.findOne).not.toHaveBeenCalled();
  });

  // Moving libraries wipes the collection's members. A library the media
  // server does not have is rejected before that happens, so a bad payload
  // cannot cost the collection its contents on the way to a 400.
  it('rejects an unknown library without wiping the collection first', async () => {
    const collectionMediaRepository = { delete: jest.fn() };
    const exclusionRepo = { delete: jest.fn() };
    const mediaServer = {
      getLibraries: jest
        .fn()
        .mockResolvedValue([{ id: '1', title: 'Movies', type: 'movie' }]),
      cleanupCollectionForLibrary: jest.fn(),
    };

    const service = createRulesService({
      ruleGroupRepository: {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 5, collectionId: 42, dataType: 'movie' }),
      },
      collectionMediaRepository,
      exclusionRepo,
      collectionService: {
        getCollection: jest
          .fn()
          .mockResolvedValue({ id: 42, libraryId: 'old-library' }),
      },
      mediaServerFactory: {
        getService: jest.fn().mockReturnValue(mediaServer),
      },
    });

    await expect(
      service.updateRules({
        id: 5,
        libraryId: 'gone-library',
        dataType: 'movie',
        name: 'Test',
        rules: [],
        description: '',
      } as any),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Library gone-library does not exist on the media server',
    });

    expect(collectionMediaRepository.delete).not.toHaveBeenCalled();
    expect(exclusionRepo.delete).not.toHaveBeenCalled();
    expect(mediaServer.cleanupCollectionForLibrary).not.toHaveBeenCalled();
  });

  it('fails with a not-found status when the rule group is gone', async () => {
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const service = createRulesService({ ruleGroupRepository });

    await expect(
      service.updateRules({
        id: 999,
        libraryId: '1',
        dataType: 'show',
        name: 'Test',
        rules: [],
        description: '',
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: 'Rule group not found',
    });
  });

  it('continues past validation for date rules using custom_days values', async () => {
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const service = createRulesService({ ruleGroupRepository });

    // Reaching the (missing) rule group means validation let the rule through.
    await expect(
      service.updateRules({
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
      } as any),
    ).rejects.toMatchObject({ status: 404 });

    expect(ruleGroupRepository.findOne).toHaveBeenCalledWith({
      where: { id: 999 },
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

  // Leaving the collection block out of an update shouldn't throw, wipe media,
  // or quietly drop the saved keepLogsForMonths, manual link, or visibility
  // (#3044 + partial-update review).
  it('keeps existing collection settings when the collection block is omitted', async () => {
    const group = { id: 5, collectionId: 42, dataType: 'movie' };
    const dbCollection = {
      id: 42,
      libraryId: 'lib-1',
      mediaServerId: 'col-1',
      manualCollection: true,
      manualCollectionName: 'Shared Collection',
      visibleOnHome: true,
      visibleOnRecommended: true,
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

    // An absent block means "unchanged", not a crucial change or a reset.
    expect(collectionMediaRepository.delete).not.toHaveBeenCalled();
    expect(collectionService.updateCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        keepLogsForMonths: 6,
        manualCollection: true,
        manualCollectionName: 'Shared Collection',
        visibleOnHome: true,
        visibleOnRecommended: true,
      }),
    );
    expect(result).toEqual({
      code: 1,
      result: 'Success',
      message: 'Success',
    });
  });

  // The rule-group payload is the only way the UI can turn the leftover-folder
  // cleanup off again; updateRules used to drop the field, so an enabled
  // collection could never be switched back.
  it('round-trips the leftover-folder cleanup opt-in, clamped to the chosen action', async () => {
    const runUpdate = async (arrAction: number) => {
      const group = { id: 5, collectionId: 42, dataType: 'movie' };
      const collectionService = {
        getCollection: jest.fn().mockResolvedValue({ id: 42 }),
        saveCollection: jest.fn().mockResolvedValue(undefined),
        addLogRecord: jest.fn().mockResolvedValue(undefined),
        updateCollection: jest
          .fn()
          .mockResolvedValue({ dbCollection: { id: 42 } }),
      };

      const service = createRulesService({
        rulesRepository: { delete: jest.fn(), save: jest.fn() },
        ruleGroupRepository: { findOne: jest.fn().mockResolvedValue(group) },
        collectionMediaRepository: { delete: jest.fn() },
        exclusionRepo: { delete: jest.fn() },
        collectionService,
        mediaServerFactory: {
          getService: jest.fn().mockReturnValue({
            cleanupCollectionForLibrary: jest.fn().mockResolvedValue(undefined),
            getLibraries: jest
              .fn()
              .mockResolvedValue([
                { id: 'lib-1', title: 'Movies', type: 'movie' },
              ]),
          }),
        },
      });

      jest
        .spyOn(service as any, 'createOrUpdateGroup')
        .mockResolvedValue(group.id);

      await service.updateRules({
        id: group.id,
        libraryId: 'lib-1',
        dataType: 'movie',
        name: 'Cleanup toggle',
        description: '',
        rules: [],
        useRules: true,
        isActive: true,
        arrAction,
        cleanupLeftoverFolders: true,
      } as any);

      return collectionService.updateCollection;
    };

    // Per-file delete: the folder is stranded, so the opt-in is honoured.
    expect(
      await runUpdate(ServarrAction.UNMONITOR_DELETE_ALL),
    ).toHaveBeenCalledWith(
      expect.objectContaining({ cleanupLeftoverFolders: true }),
    );
    // Whole-entity delete: Radarr removes the folder itself, so it is cleared.
    expect(await runUpdate(ServarrAction.DELETE)).toHaveBeenCalledWith(
      expect.objectContaining({ cleanupLeftoverFolders: false }),
    );
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

  it('backfills *arr membership tags when tagInArr is turned on (false→true)', async () => {
    const group = { id: 5, collectionId: 42, dataType: 'movie' };
    const dbCollection = {
      id: 42,
      libraryId: '1',
      manualCollection: false,
      manualCollectionName: '',
      tagInArr: false,
    };
    const savedCollection = {
      id: 42,
      title: 'My Group',
      type: 'movie',
      radarrSettingsId: 1,
      tagInArr: true,
    };
    const members = [{ mediaServerId: 'm1', tmdbId: 1, tvdbId: null }];
    const servarrTagService = createMockServarrTagService();
    const collectionService = {
      getCollection: jest.fn().mockResolvedValue(dbCollection),
      saveCollection: jest.fn().mockResolvedValue(undefined),
      addLogRecord: jest.fn().mockResolvedValue(undefined),
      updateCollection: jest
        .fn()
        .mockResolvedValue({ dbCollection: savedCollection }),
      getCollectionMedia: jest.fn().mockResolvedValue(members),
      applyCollectionSort: jest.fn(),
    };
    const mediaServer = {
      getLibraries: jest
        .fn()
        .mockResolvedValue([{ id: '1', title: 'Movies', type: 'movie' }]),
    };
    const service = createRulesService({
      rulesRepository: {
        delete: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockResolvedValue(undefined),
      },
      ruleGroupRepository: { findOne: jest.fn().mockResolvedValue(group) },
      collectionMediaRepository: {
        delete: jest.fn().mockResolvedValue(undefined),
      },
      collectionService,
      mediaServerFactory: {
        getService: jest.fn().mockReturnValue(mediaServer),
      },
      servarrTagService,
    });
    jest
      .spyOn(service as any, 'createOrUpdateGroup')
      .mockResolvedValue(group.id);

    await service.updateRules({
      id: 5,
      libraryId: '1',
      dataType: 'movie',
      name: 'My Group',
      description: '',
      rules: [],
      useRules: false,
      isActive: true,
      radarrSettingsId: 1,
      tagInArr: true,
      collection: {
        manualCollection: false,
        manualCollectionName: '',
        keepLogsForMonths: 1,
      },
      notifications: [],
    } as any);
    await flushAsync();

    expect(servarrTagService.syncMembershipTags).toHaveBeenCalledWith(
      savedCollection,
      [{ mediaServerId: 'm1', tmdbId: 1, tvdbId: null }],
      [],
    );
  });

  it('untags members captured before the wipe when tagInArr is disabled alongside a crucial change', async () => {
    const group = { id: 5, collectionId: 42, dataType: 'movie' };
    const dbCollection = {
      id: 42,
      libraryId: 'old-lib',
      mediaServerId: 'srv-coll',
      manualCollection: false,
      manualCollectionName: '',
      title: 'My Group',
      type: 'movie',
      radarrSettingsId: 1,
      tagInArr: true,
    };
    const savedCollection = {
      id: 42,
      title: 'My Group',
      type: 'movie',
      radarrSettingsId: 1,
      tagInArr: false,
    };
    const members = [{ mediaServerId: 'm1', tmdbId: 1, tvdbId: null }];
    const servarrTagService = createMockServarrTagService();
    const collectionService = {
      getCollection: jest.fn().mockResolvedValue(dbCollection),
      saveCollection: jest.fn().mockResolvedValue(undefined),
      addLogRecord: jest.fn().mockResolvedValue(undefined),
      updateCollection: jest
        .fn()
        .mockResolvedValue({ dbCollection: savedCollection }),
      // members exist pre-wipe; the crucial-change deletion empties them afterward
      getCollectionMedia: jest
        .fn()
        .mockResolvedValueOnce(members)
        .mockResolvedValue([]),
      applyCollectionSort: jest.fn(),
    };
    const mediaServer = {
      cleanupCollectionForLibrary: jest.fn().mockResolvedValue(undefined),
      getLibraries: jest
        .fn()
        .mockResolvedValue([{ id: 'new-lib', title: 'Movies', type: 'movie' }]),
    };
    const service = createRulesService({
      rulesRepository: {
        delete: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockResolvedValue(undefined),
      },
      ruleGroupRepository: { findOne: jest.fn().mockResolvedValue(group) },
      collectionMediaRepository: {
        delete: jest.fn().mockResolvedValue(undefined),
      },
      exclusionRepo: { delete: jest.fn().mockResolvedValue(undefined) },
      collectionService,
      mediaServerFactory: {
        getService: jest.fn().mockReturnValue(mediaServer),
      },
      servarrTagService,
    });
    jest
      .spyOn(service as any, 'createOrUpdateGroup')
      .mockResolvedValue(group.id);

    await service.updateRules({
      id: 5,
      libraryId: 'new-lib',
      dataType: 'movie',
      name: 'My Group',
      description: '',
      rules: [],
      useRules: false,
      isActive: true,
      radarrSettingsId: 1,
      tagInArr: false,
      collection: {
        manualCollection: false,
        manualCollectionName: '',
        keepLogsForMonths: 1,
      },
      notifications: [],
    } as any);
    await flushAsync();

    // untagged via the previous collection, using the pre-wipe member snapshot
    expect(servarrTagService.syncMembershipTags).toHaveBeenCalledWith(
      dbCollection,
      [],
      [{ mediaServerId: 'm1', tmdbId: 1, tvdbId: null }],
    );
  });

  // A per-user rule keeps working on the items it can still resolve and pauses
  // on the rest, so an account that has since gone must not block every later
  // edit to the group it sits in.
  describe('a user the media server no longer reports', () => {
    const perUserRule = (username: string) => ({
      operator: null,
      action: RulePossibility.BIGGER,
      firstVal: [Application.TAUTULLI, 9],
      customVal: { ruleTypeId: 0, value: '3' },
      username,
      section: 0,
    });

    const updateWith = (username: string, savedUsername?: string) => {
      const service = createRulesService({
        ruleGroupRepository: {
          findOne: jest.fn().mockResolvedValue({ id: 1, collectionId: 1 }),
        },
        ruleUsersService: {
          getUsernames: jest.fn().mockResolvedValue(['alice']),
        },
      });
      jest
        .spyOn(service, 'getRules')
        .mockResolvedValue(
          savedUsername
            ? ([
                { ruleJson: JSON.stringify(perUserRule(savedUsername)) },
              ] as never)
            : ([] as never),
        );

      return service.updateRules({
        id: 1,
        libraryId: '1',
        name: 'Per-user group',
        description: '',
        useRules: true,
        isActive: true,
        rules: [perUserRule(username)],
        collection: { keepLogsForMonths: 6 },
      } as never);
    };

    it('keeps a user the group already saved', async () => {
      // The save itself runs past validation into repositories this test does
      // not stand up, so assert only on what is under test: it is not the
      // username that stops it.
      const outcome = await updateWith('bob', 'bob').catch((error) => error);

      expect(outcome).not.toMatchObject({
        result: "The media server has no user named 'bob'",
      });
    });

    it('still rejects one the group never had', async () => {
      await expect(updateWith('bob')).resolves.toMatchObject({
        code: 0,
        result: "The media server has no user named 'bob'",
      });
    });
  });
  // #11: turning "keep in Maintainerr only" on tears down the media-server
  // collection. Keyed on the flag, not on the toggle transition: a failed delete
  // keeps the link, so every later save retries it. Turning it back off needs
  // nothing - the next run recreates it through the ordinary add path.
  describe('keep in Maintainerr only', () => {
    const saveWith = async ({
      dbCollection,
      savedCollection,
      params = {},
    }: {
      dbCollection: Record<string, unknown>;
      savedCollection: Record<string, unknown>;
      params?: Record<string, unknown>;
    }) => {
      const group = { id: 5, collectionId: 42, dataType: 'movie' };
      const collectionService = {
        getCollection: jest.fn().mockResolvedValue(dbCollection),
        saveCollection: jest.fn().mockResolvedValue(undefined),
        addLogRecord: jest.fn().mockResolvedValue(undefined),
        updateCollection: jest
          .fn()
          .mockResolvedValue({ dbCollection: savedCollection }),
        stopMediaServerSync: jest.fn().mockResolvedValue(undefined),
      };

      const service = createRulesService({
        rulesRepository: { delete: jest.fn(), save: jest.fn() },
        ruleGroupRepository: { findOne: jest.fn().mockResolvedValue(group) },
        collectionMediaRepository: { delete: jest.fn() },
        exclusionRepo: { delete: jest.fn() },
        collectionService,
        mediaServerFactory: {
          getService: jest.fn().mockReturnValue({
            cleanupCollectionForLibrary: jest.fn().mockResolvedValue(undefined),
            getLibraries: jest
              .fn()
              .mockResolvedValue([
                { id: 'lib-1', title: 'Movies', type: 'movie' },
              ]),
          }),
        },
      });
      jest
        .spyOn(service as any, 'createOrUpdateGroup')
        .mockResolvedValue(group.id);

      await service.updateRules({
        id: group.id,
        libraryId: 'lib-1',
        dataType: 'movie',
        name: 'Kept local',
        description: '',
        rules: [],
        useRules: true,
        isActive: true,
        keepInMaintainerrOnly: true,
        collection: { keepLogsForMonths: 6 },
        ...params,
      } as any);

      return collectionService;
    };

    it('removes the media server collection when it is turned on', async () => {
      const savedCollection = {
        id: 42,
        keepInMaintainerrOnly: true,
        mediaServerId: 'coll-1',
      };
      const collectionService = await saveWith({
        dbCollection: { id: 42, keepInMaintainerrOnly: false },
        savedCollection,
      });

      expect(collectionService.updateCollection).toHaveBeenCalledWith(
        expect.objectContaining({ keepInMaintainerrOnly: true }),
      );
      expect(collectionService.stopMediaServerSync).toHaveBeenCalledWith(
        savedCollection,
      );
    });

    it('retries on a later save when an earlier delete left the link behind', async () => {
      const savedCollection = {
        id: 42,
        keepInMaintainerrOnly: true,
        mediaServerId: 'coll-1',
      };
      const collectionService = await saveWith({
        dbCollection: { id: 42, keepInMaintainerrOnly: true },
        savedCollection,
      });

      expect(collectionService.stopMediaServerSync).toHaveBeenCalledWith(
        savedCollection,
      );
    });

    it('never keeps a custom collection in Maintainerr only - the two are exclusive', async () => {
      const collectionService = await saveWith({
        dbCollection: { id: 42 },
        savedCollection: { id: 42 },
        params: {
          name: 'Custom collection',
          collection: {
            manualCollection: true,
            manualCollectionName: 'Shared Collection',
            keepLogsForMonths: 6,
          },
        },
      });

      expect(collectionService.updateCollection).toHaveBeenCalledWith(
        expect.objectContaining({ keepInMaintainerrOnly: false }),
      );
      expect(collectionService.stopMediaServerSync).not.toHaveBeenCalled();
    });
  });
});
