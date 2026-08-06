import { FindOperator } from 'typeorm';
import {
  createMockLogger,
  createMockServarrTagService,
} from '../../../test/utils/data';
import { BULK_EXCLUSION_CONCURRENCY, RulesService } from './rules.service';

// Regression coverage for global-exclusion handling (ruleGroupId IS NULL).
// TypeORM 1.x throws on a bare `null` in a `where` clause, so these paths must
// use IsNull() and must not feed a null id into a lookup.
describe('RulesService exclusions - global (null ruleGroupId) handling', () => {
  const logger = createMockLogger();

  const createService = (overrides?: {
    exclusionRepo?: any;
    ruleGroupRepository?: any;
    collectionMediaRepository?: any;
    collectionService?: any;
    mediaServerFactory?: any;
    servarrTagService?: any;
    radarrSettingsRepo?: any;
    sonarrSettingsRepo?: any;
  }) => {
    const exclusionRepo = overrides?.exclusionRepo ?? {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      // default: no exclusion survives a removal, so the shared-tag guard passes
      count: jest.fn().mockResolvedValue(0),
    };
    const radarrSettingsRepo = overrides?.radarrSettingsRepo ?? {
      find: jest.fn().mockResolvedValue([]),
    };
    const sonarrSettingsRepo = overrides?.sonarrSettingsRepo ?? {
      find: jest.fn().mockResolvedValue([]),
    };
    const collectionMediaRepository = overrides?.collectionMediaRepository ?? {
      findOne: jest.fn().mockResolvedValue(undefined),
    };
    const ruleGroupRepository = overrides?.ruleGroupRepository ?? {
      findOne: jest.fn().mockResolvedValue(undefined),
    };
    const collectionService = overrides?.collectionService ?? {
      CollectionLogRecordForChild: jest.fn().mockResolvedValue(undefined),
    };
    const servarrTagService =
      overrides?.servarrTagService ?? createMockServarrTagService();
    const mediaServerFactory = overrides?.mediaServerFactory ?? {
      getService: jest.fn(),
    };

    const service = new RulesService(
      {} as any, // rulesRepository
      ruleGroupRepository as any,
      collectionMediaRepository as any,
      {} as any, // communityRuleKarmaRepository
      exclusionRepo as any,
      {} as any, // settingsRepo
      radarrSettingsRepo as any,
      sonarrSettingsRepo as any,
      {} as any, // sportarrSettingsRepo
      collectionService as any,
      mediaServerFactory as any,
      {} as any, // connection
      {} as any, // ruleYamlService
      {} as any, // ruleComparatorServiceFactory
      {} as any, // ruleMigrationService
      {} as any, // eventEmitter
      servarrTagService as any,
      logger as any,
      {} as any, // tracearrApi
    );

    return {
      service,
      exclusionRepo,
      ruleGroupRepository,
      collectionService,
      mediaServerFactory,
      servarrTagService,
      radarrSettingsRepo,
      sonarrSettingsRepo,
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
    // second call: the global exclusions - must use IsNull(), never `null`
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

  // Behavior B (https://features.maintainerr.info/posts/81): the *arr exclusion-tag side effects are best-effort wiring
  // on top of the exclusion flow, gated by settings via the ServarrTagService.
  it('setExclusion(collection) applies the *arr exclusion tag for the top-level item when enabled', async () => {
    const exclusionRepo = {
      findOne: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 7, dataType: 'movie' }),
    };
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue({ type: 'movie' }),
      getAllIdsForContextAction: jest.fn().mockResolvedValue(['movie-1']),
    };
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    };
    const collectionService = {
      CollectionLogRecordForChild: jest.fn().mockResolvedValue(undefined),
      getCollection: jest
        .fn()
        .mockResolvedValue({ id: 9, type: 'movie', radarrSettingsId: 1 }),
    };
    // The item's cached tmdb id is passed through as a resolution fallback.
    const collectionMediaRepository = {
      findOne: jest.fn().mockResolvedValue({ tmdbId: 4242, tvdbId: null }),
    };
    const servarrTagService = createMockServarrTagService();
    servarrTagService.anyExclusionTaggingEnabled.mockReturnValue(true);

    const { service } = createService({
      exclusionRepo,
      ruleGroupRepository,
      collectionMediaRepository,
      mediaServerFactory,
      collectionService,
      servarrTagService,
    });

    await service.setExclusion({ mediaId: 'movie-1', collectionId: 9 } as any);

    expect(servarrTagService.applyExclusionTag).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaServerId: 'movie-1',
        type: 'movie',
        tmdbId: 4242,
      }),
      { radarrSettingsId: 1, sonarrSettingsId: undefined },
    );
  });

  // Naming the entry point after the collection's own type stopped the
  // traversal before it started: a show reaching a season collection wrote a
  // row for the show id, typed season, and left the season excluded by nothing.
  it('setExclusion(collection) traverses a show into a season collection', async () => {
    const metadataById: Record<string, { type: string }> = {
      'show-1': { type: 'show' },
      'season-1': { type: 'season' },
    };
    const exclusionRepo = {
      findOne: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    };
    const mediaServer = {
      getMetadata: jest
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve(metadataById[id] ?? undefined),
        ),
      getAllIdsForContextAction: jest.fn().mockResolvedValue(['season-1']),
    };
    const { service } = createService({
      exclusionRepo,
      ruleGroupRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 7, dataType: 'season' }),
      },
      mediaServerFactory: {
        getService: jest.fn().mockResolvedValue(mediaServer),
      },
    });

    const result = await service.setExclusion({
      mediaId: 'show-1',
      collectionId: 9,
    });

    expect(mediaServer.getAllIdsForContextAction).toHaveBeenCalledWith(
      'season',
      { type: 'show', id: 'show-1' },
      'show-1',
    );
    expect(exclusionRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        mediaServerId: 'season-1',
        ruleGroupId: 7,
        parent: 'show-1',
        type: 'season',
      }),
    ]);
    // The caller pairs the collection drop with these, so they must be the
    // resolved seasons and not the show the selection entered through.
    expect(result.handledIds).toEqual(['season-1']);
  });

  it('setExclusion does not tag when exclusion tagging is disabled', async () => {
    const exclusionRepo = {
      findOne: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 7, dataType: 'movie' }),
    };
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue({ type: 'movie' }),
      getAllIdsForContextAction: jest.fn().mockResolvedValue(['movie-1']),
    };
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    };
    const collectionService = {
      CollectionLogRecordForChild: jest.fn().mockResolvedValue(undefined),
      getCollection: jest.fn(),
    };
    const servarrTagService = createMockServarrTagService(); // disabled by default

    const { service } = createService({
      exclusionRepo,
      ruleGroupRepository,
      mediaServerFactory,
      collectionService,
      servarrTagService,
    });

    await service.setExclusion({ mediaId: 'movie-1', collectionId: 9 } as any);

    // The collection is never loaded and no tag is applied when disabled.
    expect(collectionService.getCollection).not.toHaveBeenCalled();
    expect(servarrTagService.applyExclusionTag).not.toHaveBeenCalled();
  });

  it('removeExclusion removes the *arr tag only when un-exclude removal is opted in', async () => {
    const exclusionRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 2,
        ruleGroupId: 7,
        mediaServerId: 'movie-1',
        type: 'movie',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    };
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 7, collectionId: 9 }),
    };
    const collectionService = {
      CollectionLogRecordForChild: jest.fn().mockResolvedValue(undefined),
      getCollection: jest
        .fn()
        .mockResolvedValue({ id: 9, type: 'movie', radarrSettingsId: 1 }),
    };
    const servarrTagService = createMockServarrTagService();
    servarrTagService.anyExclusionUntaggingEnabled.mockReturnValue(true);

    const { service } = createService({
      exclusionRepo,
      ruleGroupRepository,
      collectionService,
      servarrTagService,
    });

    await service.removeExclusion(2);

    expect(servarrTagService.removeExclusionTag).toHaveBeenCalledWith(
      expect.objectContaining({ mediaServerId: 'movie-1', type: 'movie' }),
      { radarrSettingsId: 1, sonarrSettingsId: undefined },
    );
  });

  it('setExclusion(global) tags the single configured radarr instance', async () => {
    const exclusionRepo = {
      findOne: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    };
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue({ type: 'movie' }),
      getAllIdsForContextAction: jest.fn().mockResolvedValue(['movie-1']),
    };
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    };
    const radarrSettingsRepo = {
      find: jest.fn().mockResolvedValue([{ id: 3 }]),
    };
    const servarrTagService = createMockServarrTagService();
    servarrTagService.anyExclusionTaggingEnabled.mockReturnValue(true);

    const { service } = createService({
      exclusionRepo,
      mediaServerFactory,
      radarrSettingsRepo,
      servarrTagService,
    });

    await service.setExclusion({ mediaId: 'movie-1' } as any);

    expect(servarrTagService.applyExclusionTag).toHaveBeenCalledWith(
      expect.objectContaining({ mediaServerId: 'movie-1', type: 'movie' }),
      { radarrSettingsId: 3 },
    );
  });

  it('setExclusion(global) does not tag when several radarr instances exist (ambiguous)', async () => {
    const exclusionRepo = {
      findOne: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    };
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue({ type: 'movie' }),
      getAllIdsForContextAction: jest.fn().mockResolvedValue(['movie-1']),
    };
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    };
    const radarrSettingsRepo = {
      find: jest.fn().mockResolvedValue([{ id: 3 }, { id: 4 }]),
    };
    const servarrTagService = createMockServarrTagService();
    servarrTagService.anyExclusionTaggingEnabled.mockReturnValue(true);

    const { service } = createService({
      exclusionRepo,
      mediaServerFactory,
      radarrSettingsRepo,
      servarrTagService,
    });

    await service.setExclusion({ mediaId: 'movie-1' } as any);

    expect(servarrTagService.applyExclusionTag).not.toHaveBeenCalled();
  });

  it('removeExclusionWitData removes the tag for the top-level item (the media-modal remove path)', async () => {
    const exclusionRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    };
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue({ type: 'movie' }),
      getAllIdsForContextAction: jest.fn().mockResolvedValue(['movie-1']),
    };
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    };
    const radarrSettingsRepo = {
      find: jest.fn().mockResolvedValue([{ id: 3 }]),
    };
    const servarrTagService = createMockServarrTagService();
    servarrTagService.anyExclusionUntaggingEnabled.mockReturnValue(true);

    const { service } = createService({
      exclusionRepo,
      mediaServerFactory,
      radarrSettingsRepo,
      servarrTagService,
    });

    await service.removeExclusionWitData({
      mediaId: 'movie-1',
      context: { type: 'movie', id: 'movie-1' },
    } as any);

    expect(servarrTagService.removeExclusionTag).toHaveBeenCalledWith(
      expect.objectContaining({ mediaServerId: 'movie-1', type: 'movie' }),
      { radarrSettingsId: 3 },
    );
  });

  it('removeAllExclusion removes the tag once every exclusion for the item is cleared', async () => {
    const exclusionRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    };
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue({ type: 'show' }),
      getAllIdsForContextAction: jest.fn().mockResolvedValue(['show-1']),
    };
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    };
    const sonarrSettingsRepo = {
      find: jest.fn().mockResolvedValue([{ id: 9 }]),
    };
    const servarrTagService = createMockServarrTagService();
    servarrTagService.anyExclusionUntaggingEnabled.mockReturnValue(true);

    const { service } = createService({
      exclusionRepo,
      mediaServerFactory,
      sonarrSettingsRepo,
      servarrTagService,
    });

    await service.removeAllExclusion('show-1');

    expect(servarrTagService.removeExclusionTag).toHaveBeenCalledWith(
      expect.objectContaining({ mediaServerId: 'show-1', type: 'show' }),
      { sonarrSettingsId: 9 },
    );
  });

  it('removeExclusion leaves the tag in place when another exclusion still protects the item', async () => {
    const exclusionRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 2,
        ruleGroupId: 7,
        mediaServerId: 'movie-1',
        type: 'movie',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      // another rule group still excludes this item - last-exclusion-wins
      count: jest.fn().mockResolvedValue(1),
    };
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 7, collectionId: 9 }),
    };
    const collectionService = {
      CollectionLogRecordForChild: jest.fn().mockResolvedValue(undefined),
      getCollection: jest
        .fn()
        .mockResolvedValue({ id: 9, type: 'movie', radarrSettingsId: 1 }),
    };
    const servarrTagService = createMockServarrTagService();
    servarrTagService.anyExclusionUntaggingEnabled.mockReturnValue(true);

    const { service } = createService({
      exclusionRepo,
      ruleGroupRepository,
      collectionService,
      servarrTagService,
    });

    await service.removeExclusion(2);

    expect(servarrTagService.removeExclusionTag).not.toHaveBeenCalled();
  });

  it('removeExclusion falls back to the collection type when the exclusion row has no type', async () => {
    const exclusionRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 2,
        ruleGroupId: 7,
        mediaServerId: 'movie-1',
        type: null, // old exclusion predating the type column
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    };
    const ruleGroupRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 7, collectionId: 9 }),
    };
    const collectionService = {
      CollectionLogRecordForChild: jest.fn().mockResolvedValue(undefined),
      getCollection: jest
        .fn()
        .mockResolvedValue({ id: 9, type: 'movie', radarrSettingsId: 1 }),
    };
    const servarrTagService = createMockServarrTagService();
    servarrTagService.anyExclusionUntaggingEnabled.mockReturnValue(true);

    const { service } = createService({
      exclusionRepo,
      ruleGroupRepository,
      collectionService,
      servarrTagService,
    });

    await service.removeExclusion(2);

    expect(servarrTagService.removeExclusionTag).toHaveBeenCalledWith(
      expect.objectContaining({ mediaServerId: 'movie-1', type: 'movie' }),
      { radarrSettingsId: 1, sonarrSettingsId: undefined },
    );
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

  const createBulkService = (
    metadataById: Record<string, { parentId?: string; grandparentId?: string }>,
  ) =>
    createService({
      mediaServerFactory: {
        getService: jest.fn().mockResolvedValue({
          getMetadata: jest
            .fn()
            .mockImplementation((id: string) =>
              Promise.resolve(metadataById[id]),
            ),
        }),
      },
    });

  it('setBulkExclusions dedupes ids and keeps individual failures', async () => {
    const { service } = createBulkService({ 'movie-1': {}, 'movie-2': {} });
    const setExclusion = jest
      .spyOn(service, 'setExclusion')
      .mockResolvedValueOnce({ code: 1, message: 'Success' })
      .mockResolvedValueOnce({ code: 0, message: 'Failed - no metadata' });

    await expect(
      service.setBulkExclusions(['movie-1', 'movie-2', 'movie-1']),
    ).resolves.toEqual({
      results: [
        { mediaId: 'movie-1', code: 1, message: 'Success' },
        { mediaId: 'movie-2', code: 0, message: 'Failed - no metadata' },
      ],
    });
    expect(setExclusion).toHaveBeenCalledTimes(2);
    expect(setExclusion).toHaveBeenNthCalledWith(1, { mediaId: 'movie-1' });
    expect(setExclusion).toHaveBeenNthCalledWith(2, { mediaId: 'movie-2' });
  });

  it('setBulkExclusions collapses ids nested under another selected id', async () => {
    // show-1 > season-1 > episode-1; excluding the show already cascades to
    // both, so neither may race its own concurrent setExclusion write.
    const { service } = createBulkService({
      'show-1': {},
      'season-1': { parentId: 'show-1' },
      'episode-1': { parentId: 'season-1', grandparentId: 'show-1' },
      'movie-1': {},
    });
    const setExclusion = jest
      .spyOn(service, 'setExclusion')
      .mockResolvedValue({ code: 1, message: 'Success' });

    const response = await service.setBulkExclusions([
      'episode-1',
      'show-1',
      'season-1',
      'movie-1',
    ]);

    expect(setExclusion).toHaveBeenCalledTimes(2);
    expect(setExclusion).toHaveBeenCalledWith({ mediaId: 'show-1' });
    expect(setExclusion).toHaveBeenCalledWith({ mediaId: 'movie-1' });
    // collapsed children report their covering ancestor's outcome
    expect(response.results).toEqual([
      { mediaId: 'episode-1', code: 1, message: 'Success' },
      { mediaId: 'show-1', code: 1, message: 'Success' },
      { mediaId: 'season-1', code: 1, message: 'Success' },
      { mediaId: 'movie-1', code: 1, message: 'Success' },
    ]);
  });

  it('setBulkExclusions reports a thrown setExclusion as a per-item failure', async () => {
    const { service } = createBulkService({ 'movie-1': {}, 'movie-2': {} });
    jest
      .spyOn(service, 'setExclusion')
      .mockResolvedValueOnce({ code: 1, message: 'Success' })
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      service.setBulkExclusions(['movie-1', 'movie-2']),
    ).resolves.toEqual({
      results: [
        { mediaId: 'movie-1', code: 1, message: 'Success' },
        { mediaId: 'movie-2', code: 0, message: 'Failed - see server logs' },
      ],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Bulk exclusion failed for media movie-2',
    );
  });

  it('setBulkExclusions processes bounded concurrent batches', async () => {
    const { service } = createBulkService(
      Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [`item-${i + 1}`, {}]),
      ),
    );
    let active = 0;
    let peak = 0;
    jest.spyOn(service, 'setExclusion').mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active -= 1;
      return { code: 1, message: 'Success' };
    });

    await service.setBulkExclusions([
      'item-1',
      'item-2',
      'item-3',
      'item-4',
      'item-5',
      'item-6',
    ]);

    expect(peak).toBe(BULK_EXCLUSION_CONCURRENCY);
  });

  const createScopedBulkService = (
    removeFromCollection = jest.fn().mockResolvedValue({ id: 3 }),
  ) => {
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue({ type: 'movie' }),
    };
    const collectionService = {
      CollectionLogRecordForChild: jest.fn().mockResolvedValue(undefined),
      removeFromCollection,
    };
    const { service } = createService({
      collectionService,
      mediaServerFactory: {
        getService: jest.fn().mockResolvedValue(mediaServer),
      },
    });

    return { service, collectionService, mediaServer, removeFromCollection };
  };

  it('setBulkExclusions scopes to the collection and drops the excluded items from it', async () => {
    const { service, removeFromCollection } = createScopedBulkService();
    const setExclusion = jest
      .spyOn(service, 'setExclusion')
      .mockResolvedValueOnce({
        code: 1,
        message: 'Success',
        handledIds: ['movie-1'],
      })
      .mockResolvedValueOnce({ code: 0, message: 'Failed - no rule group' });

    const response = await service.setBulkExclusions(
      ['movie-1', 'movie-2'],
      12,
    );

    expect(setExclusion).toHaveBeenNthCalledWith(1, {
      mediaId: 'movie-1',
      collectionId: 12,
    });
    expect(removeFromCollection).toHaveBeenCalledWith(12, [
      { mediaServerId: 'movie-1' },
    ]);
    expect(response.results).toEqual([
      { mediaId: 'movie-1', code: 1, message: 'Success' },
      { mediaId: 'movie-2', code: 0, message: 'Failed - no rule group' },
    ]);
  });

  it('setBulkExclusions reports a failed collection removal instead of claiming success', async () => {
    const { service } = createScopedBulkService(
      jest.fn().mockResolvedValue(undefined),
    );
    jest.spyOn(service, 'setExclusion').mockResolvedValue({
      code: 1,
      message: 'Success',
      handledIds: ['movie-1'],
    });

    await expect(service.setBulkExclusions(['movie-1'], 12)).resolves.toEqual({
      results: [
        {
          mediaId: 'movie-1',
          code: 0,
          message: 'Excluded, but not removed from the collection',
        },
      ],
    });
  });

  // A season or episode collection holds what the exclusion resolved to, not
  // the show the selection entered through. Dropping the entry point instead
  // matched nothing, so the excluded item stayed in the collection.
  it('setBulkExclusions drops the ids the exclusion resolved to, not the entry point', async () => {
    const { service, removeFromCollection } = createScopedBulkService();
    jest.spyOn(service, 'setExclusion').mockResolvedValue({
      code: 1,
      message: 'Success',
      handledIds: ['season-1', 'season-2'],
    });

    await service.setBulkExclusions(['show-1'], 12);

    expect(removeFromCollection).toHaveBeenCalledWith(12, [
      { mediaServerId: 'season-1' },
      { mediaServerId: 'season-2' },
    ]);
  });

  it('setBulkExclusions leaves the collection alone when nothing was excluded', async () => {
    const { service, removeFromCollection } = createScopedBulkService();
    jest
      .spyOn(service, 'setExclusion')
      .mockResolvedValue({ code: 0, message: 'Failed' });

    await service.setBulkExclusions(['movie-1'], 12);

    expect(removeFromCollection).not.toHaveBeenCalled();
  });

  // Honors the where clause rather than answering every row: a query that
  // stopped matching `parent`, or one that ignored a narrowing, would otherwise
  // still see the rows it no longer asks for and pass.
  const findMatchingRows = (
    rows: Record<string, unknown>[],
    where: Record<string, FindOperator<string>>[],
  ) =>
    rows.filter((row) =>
      [where]
        .flat()
        .some((clause) =>
          Object.entries(clause).every(([field, operator]) =>
            operator.value.includes(row[field] as string),
          ),
        ),
    );

  const createRemovalService = (
    rows: {
      id: number;
      mediaServerId: string;
      ruleGroupId: number | null;
      parent?: string;
    }[],
    ruleGroup: { id: number; dataType?: string } | null = { id: 5 },
    mediaServer?: { getAllIdsForContextAction: jest.Mock },
  ) =>
    createService({
      exclusionRepo: {
        find: jest
          .fn()
          .mockImplementation(({ where }) => findMatchingRows(rows, where)),
        findOne: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        count: jest.fn().mockResolvedValue(0),
      },
      ruleGroupRepository: { findOne: jest.fn().mockResolvedValue(ruleGroup) },
      ...(mediaServer
        ? {
            mediaServerFactory: {
              getService: jest.fn().mockResolvedValue(mediaServer),
            },
          }
        : {}),
    });

  it('removeBulkExclusions deletes the row covering each item in the collection', async () => {
    // an item is global or scoped, never both, so either row is the one to drop
    const { service } = createRemovalService([
      { id: 11, mediaServerId: 'movie-1', ruleGroupId: 5 },
      { id: 12, mediaServerId: 'movie-2', ruleGroupId: null },
      { id: 13, mediaServerId: 'movie-3', ruleGroupId: 9 },
    ]);
    const removeExclusion = jest
      .spyOn(service, 'removeExclusion')
      .mockResolvedValue({ code: 1, message: 'Success' });

    const response = await service.removeBulkExclusions(
      ['movie-1', 'movie-2', 'movie-3', 'movie-1'],
      12,
    );

    // an item with nothing excluding it here is already in the requested state
    expect(removeExclusion.mock.calls.map(([id]) => id).sort()).toEqual([
      11, 12,
    ]);
    expect(response.results).toEqual([
      { mediaId: 'movie-1', code: 1, message: 'Success' },
      { mediaId: 'movie-2', code: 1, message: 'Success' },
      { mediaId: 'movie-3', code: 1, message: 'Success' },
    ]);
  });

  // An excluded show writes a row per season and episode, all recording the
  // show as their parent. Matching only mediaServerId left them behind while
  // reporting success, so the item stayed excluded.
  it('removeBulkExclusions takes the rows an exclusion cascaded to', async () => {
    const { service } = createRemovalService([
      { id: 11, mediaServerId: 'show-1', ruleGroupId: null, parent: 'show-1' },
      {
        id: 12,
        mediaServerId: 'season-1',
        ruleGroupId: null,
        parent: 'show-1',
      },
      {
        id: 13,
        mediaServerId: 'episode-1',
        ruleGroupId: null,
        parent: 'show-1',
      },
      { id: 14, mediaServerId: 'other', ruleGroupId: null, parent: 'other' },
    ]);
    const removeExclusion = jest
      .spyOn(service, 'removeExclusion')
      .mockResolvedValue({ code: 1, message: 'Success' });

    const response = await service.removeBulkExclusions(['show-1']);

    expect(removeExclusion.mock.calls.map(([id]) => id).sort()).toEqual([
      11, 12, 13,
    ]);
    expect(response.results).toEqual([
      { mediaId: 'show-1', code: 1, message: 'Success' },
    ]);
  });

  // Narrowing is offered for an un-exclude too. Ignoring the context matched
  // the entry point's whole cascade, so un-excluding one season cleared every
  // row the show carried and still reported success.
  it('removeBulkExclusions narrowed to a season leaves the rest of the show excluded', async () => {
    const getAllIdsForContextAction = jest
      .fn()
      .mockResolvedValue(['season-1', 'episode-1']);
    const { service } = createRemovalService(
      [
        {
          id: 11,
          mediaServerId: 'show-1',
          ruleGroupId: null,
          parent: 'show-1',
        },
        {
          id: 12,
          mediaServerId: 'season-1',
          ruleGroupId: null,
          parent: 'show-1',
        },
        {
          id: 13,
          mediaServerId: 'episode-1',
          ruleGroupId: null,
          parent: 'show-1',
        },
        {
          id: 14,
          mediaServerId: 'season-2',
          ruleGroupId: null,
          parent: 'show-1',
        },
      ],
      { id: 5 },
      { getAllIdsForContextAction },
    );
    const removeExclusion = jest
      .spyOn(service, 'removeExclusion')
      .mockResolvedValue({ code: 1, message: 'Success' });

    const response = await service.removeBulkExclusions(['show-1'], undefined, {
      id: 'season-1',
      type: 'season',
    });

    expect(getAllIdsForContextAction).toHaveBeenCalledWith(
      undefined,
      { type: 'season', id: 'season-1' },
      'show-1',
    );
    expect(removeExclusion.mock.calls.map(([id]) => id).sort()).toEqual([
      12, 13,
    ]);
    expect(response.results).toEqual([
      { mediaId: 'show-1', code: 1, message: 'Success' },
    ]);
  });

  it('removeBulkExclusions drops every exclusion an item carries when no collection is named', async () => {
    const { service } = createRemovalService([
      { id: 11, mediaServerId: 'movie-1', ruleGroupId: 5 },
      { id: 14, mediaServerId: 'movie-1', ruleGroupId: 9 },
    ]);
    const removeExclusion = jest
      .spyOn(service, 'removeExclusion')
      .mockResolvedValue({ code: 1, message: 'Success' });

    await service.removeBulkExclusions(['movie-1']);

    expect(removeExclusion.mock.calls.map(([id]) => id).sort()).toEqual([
      11, 14,
    ]);
  });

  it('removeBulkExclusions reports a thrown removal as a per-item failure', async () => {
    const { service } = createRemovalService([
      { id: 11, mediaServerId: 'movie-1', ruleGroupId: null },
    ]);
    jest
      .spyOn(service, 'removeExclusion')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(service.removeBulkExclusions(['movie-1'])).resolves.toEqual({
      results: [
        { mediaId: 'movie-1', code: 0, message: 'Failed - see server logs' },
      ],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Bulk exclusion removal failed for media movie-1',
    );
  });

  it('removeBulkExclusions fails cleanly when the collection has no rule group', async () => {
    const { service } = createRemovalService([], null);

    await expect(
      service.removeBulkExclusions(['movie-1'], 12),
    ).resolves.toEqual({
      results: [
        { mediaId: 'movie-1', code: 0, message: 'Failed - no rule group' },
      ],
    });
  });

  it('setExclusion fails cleanly when the collection has no rule group', async () => {
    const { service, ruleGroupRepository } = createService();

    await expect(
      service.setExclusion({ mediaId: 'movie-1', collectionId: 12 }),
    ).resolves.toEqual({
      code: 0,
      result: 'Failed - no rule group',
      message: 'Failed - no rule group',
    });
    expect(ruleGroupRepository.findOne).toHaveBeenCalledWith({
      where: { collectionId: 12 },
    });
  });

  it('removeExclusionWitData fails cleanly when the collection has no rule group', async () => {
    const { service } = createService();

    await expect(
      service.removeExclusionWitData({ mediaId: 'movie-1', collectionId: 12 }),
    ).resolves.toEqual({
      code: 0,
      result: 'Failed - no rule group',
      message: 'Failed - no rule group',
    });
  });
});
