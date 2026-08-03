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
});
