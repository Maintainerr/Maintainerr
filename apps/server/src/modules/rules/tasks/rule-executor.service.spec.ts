import { MaintainerrEvent, MediaServerType } from '@maintainerr/contracts';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createMockLogger } from '../../../../test/utils/data';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { CollectionsService } from '../../collections/collections.service';
import { SettingsService } from '../../settings/settings.service';
import { RuleComparatorServiceFactory } from '../helpers/rule.comparator.service';
import { RulesService } from '../rules.service';
import { RuleExecutorProgressService } from './rule-executor-progress.service';
import { RuleExecutorService } from './rule-executor.service';

describe('RuleExecutorService', () => {
  const createService = (mediaServerType: MediaServerType) => {
    const rulesService = {
      getRuleGroup: jest.fn(),
      getRuleGroupById: jest.fn(),
      resetCacheIfGroupUsesRuleThatRequiresIt: jest.fn(),
      getExclusions: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<RulesService>;

    const mediaServer = {
      getCollectionChildren: jest.fn().mockResolvedValue([]),
      getLibraryContentCount: jest.fn().mockResolvedValue(0),
      getLibraryContents: jest.fn().mockResolvedValue({
        items: [],
        totalSize: 0,
      }),
    };

    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    } as unknown as jest.Mocked<MediaServerFactory>;

    const collectionService = {
      getCollection: jest.fn().mockResolvedValue({
        id: 1,
        title: 'Test Collection',
        mediaServerId: 'coll-1',
        manualCollection: false,
      }),
      isMediaServerCollectionShared: jest.fn().mockResolvedValue(false),
      reconcileSharedManualCollectionState: jest
        .fn()
        .mockResolvedValue(undefined),
      relinkManualCollection: jest.fn().mockImplementation(async (c) => c),
      getCollectionMedia: jest.fn().mockResolvedValue([
        {
          mediaServerId: 'm1',
        },
      ]),
      addToCollection: jest.fn().mockImplementation(async (_id, items) => {
        return {
          id: 1,
          mediaServerId: 'coll-1',
          title: 'Test Collection',
          addedCount: items?.length ?? 0,
        };
      }),
      addToCollectionWithResolvedLink: jest
        .fn()
        .mockImplementation(async (_collection, items) => {
          return {
            id: 1,
            mediaServerId: 'coll-1',
            title: 'Test Collection',
            addedCount: items?.length ?? 0,
          };
        }),
      syncMediaServerChildrenToCollection: jest
        .fn()
        .mockImplementation(async (_collection, items) => {
          return {
            id: 1,
            mediaServerId: 'coll-1',
            title: 'Test Collection',
            addedCount: items?.length ?? 0,
          };
        }),
      removeFromCollection: jest.fn().mockResolvedValue(undefined),
      removeFromCollectionWithResolvedLink: jest
        .fn()
        .mockImplementation(async (collection) => collection),
      saveCollection: jest.fn().mockResolvedValue(undefined),
      checkAutomaticMediaServerLink: jest
        .fn()
        .mockImplementation(async (c) => c),
    } as unknown as jest.Mocked<CollectionsService>;

    const settings = {
      media_server_type: mediaServerType,
      testConnections: jest.fn().mockResolvedValue(true),
      testSetup: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<SettingsService>;

    const comparatorFactory = {
      create: jest.fn().mockReturnValue({
        executeRulesWithData: jest
          .fn()
          .mockResolvedValue({ stats: [], data: [] }),
      }),
    } as unknown as jest.Mocked<RuleComparatorServiceFactory>;

    const eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    const progressManager = {
      initialize: jest.fn(),
      incrementProcessed: jest.fn(),
      reset: jest.fn(),
    } as unknown as jest.Mocked<RuleExecutorProgressService>;

    const logger = createMockLogger();

    const service = new RuleExecutorService(
      rulesService,
      mediaServerFactory,
      collectionService,
      settings,
      comparatorFactory,
      eventEmitter,
      progressManager,
      logger,
    );

    return {
      service,
      rulesService,
      mediaServerFactory,
      mediaServer,
      collectionService,
      settings,
      eventEmitter,
      progressManager,
      logger,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not remove collection items when Jellyfin returns empty children (sync delay workaround)', async () => {
    const { service, collectionService } = createService(
      MediaServerType.JELLYFIN,
    );

    await (
      service as unknown as {
        syncManualMediaServerToCollectionDB: (
          ruleGroup: {
            id: number;
            collectionId: number;
          },
          touchedMediaServerIds: Set<string>,
        ) => Promise<void>;
      }
    ).syncManualMediaServerToCollectionDB(
      { id: 10, collectionId: 1 },
      new Set(),
    );

    expect(collectionService.removeFromCollection).not.toHaveBeenCalled();
  });

  it('does not emit a failed rule notification when a rule group finishes successfully', async () => {
    const { service, rulesService, eventEmitter } = createService(
      MediaServerType.JELLYFIN,
    );

    const ruleGroup = {
      id: 10,
      name: 'Filmer',
      isActive: true,
      libraryId: 'library-1',
      useRules: true,
      rules: [],
      collectionId: 1,
      collection: { title: 'Test Collection' },
    };

    rulesService.getRuleGroup.mockResolvedValue(ruleGroup as any);
    rulesService.getRuleGroupById.mockResolvedValue(ruleGroup as any);

    await expect(
      service.executeForRuleGroups(10, new AbortController().signal),
    ).resolves.toEqual({ status: 'success' });

    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.RuleHandler_Failed,
      expect.anything(),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.RuleHandler_Finished,
      expect.objectContaining({
        message: "Finished execution of rule 'Filmer'",
      }),
    );
  });

  it('emits a single failed rule notification when collection handling fails', async () => {
    const { service, rulesService, collectionService, eventEmitter } =
      createService(MediaServerType.JELLYFIN);

    const ruleGroup = {
      id: 11,
      name: 'Serier SEASON',
      isActive: true,
      libraryId: 'library-1',
      useRules: true,
      rules: [],
      collectionId: 1,
      collection: { title: 'Missing Collection' },
    };

    rulesService.getRuleGroup.mockResolvedValue(ruleGroup as any);
    rulesService.getRuleGroupById.mockResolvedValue(ruleGroup as any);
    collectionService.getCollection.mockResolvedValue(undefined as any);

    await expect(
      service.executeForRuleGroups(11, new AbortController().signal),
    ).resolves.toEqual({
      status: 'failed',
      failedPayload: expect.objectContaining({
        collectionName: 'Missing Collection',
        identifier: { type: 'rulegroup', value: 11 },
      }),
    });

    const failedEvents = eventEmitter.emit.mock.calls.filter(
      ([eventName]) => eventName === MaintainerrEvent.RuleHandler_Failed,
    );

    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0][1]).toEqual(
      expect.objectContaining({
        collectionName: 'Missing Collection',
        identifier: { type: 'rulegroup', value: 11 },
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.RuleHandler_Finished,
      expect.objectContaining({
        message: "Finished execution of rule 'Serier SEASON' with errors.",
      }),
    );
  });

  it('skips media server sync when an automatic collection link is stale', async () => {
    const { service, mediaServer, collectionService, logger } = createService(
      MediaServerType.JELLYFIN,
    );

    collectionService.checkAutomaticMediaServerLink.mockResolvedValue({
      id: 1,
      title: 'Test Collection',
      mediaServerId: null,
      manualCollection: false,
    } as any);

    await (
      service as unknown as {
        syncManualMediaServerToCollectionDB: (
          ruleGroup: {
            id: number;
            collectionId: number;
          },
          touchedMediaServerIds: Set<string>,
        ) => Promise<void>;
      }
    ).syncManualMediaServerToCollectionDB(
      { id: 10, collectionId: 1 },
      new Set(),
    );

    expect(collectionService.checkAutomaticMediaServerLink).toHaveBeenCalled();
    expect(mediaServer.getCollectionChildren).not.toHaveBeenCalled();
    expect(collectionService.addToCollection).not.toHaveBeenCalled();
    expect(collectionService.removeFromCollection).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      "Skipping media server sync for 'Test Collection' — no media server collection exists because no items currently match the rule.",
    );
  });

  it('does not import existing children as manual after auto-linking an automatic collection', async () => {
    const { service, mediaServer, collectionService, logger } = createService(
      MediaServerType.JELLYFIN,
    );

    collectionService.getCollection.mockResolvedValue({
      id: 1,
      title: 'Test Collection',
      mediaServerId: null,
      manualCollection: false,
    } as any);
    collectionService.checkAutomaticMediaServerLink.mockResolvedValue({
      id: 1,
      title: 'Test Collection',
      mediaServerId: 'coll-1',
      manualCollection: false,
    } as any);
    collectionService.getCollectionMedia.mockResolvedValue([]);
    mediaServer.getCollectionChildren.mockResolvedValue([{ id: 'm-existing' }]);

    await (
      service as unknown as {
        syncManualMediaServerToCollectionDB: (
          ruleGroup: {
            id: number;
            collectionId: number;
          },
          touchedMediaServerIds: Set<string>,
        ) => Promise<void>;
      }
    ).syncManualMediaServerToCollectionDB(
      { id: 10, collectionId: 1 },
      new Set(),
    );

    expect(
      collectionService.syncMediaServerChildrenToCollection,
    ).not.toHaveBeenCalled();
    expect(collectionService.addToCollection).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      "Skipping manual child import for newly linked automatic collection 'Test Collection' to avoid marking existing collection contents as manual.",
    );
  });

  it('reconciles shared manual collections through the collection service', async () => {
    const { service, mediaServer, collectionService, logger } = createService(
      MediaServerType.JELLYFIN,
    );

    collectionService.getCollection.mockResolvedValue({
      id: 1,
      title: 'Foreign Movies',
      mediaServerId: 'coll-1',
      manualCollection: true,
      manualCollectionName: 'Leaving Media',
    } as any);
    collectionService.relinkManualCollection.mockResolvedValue({
      id: 1,
      title: 'Foreign Movies',
      mediaServerId: 'coll-1',
      manualCollection: true,
      manualCollectionName: 'Leaving Media',
    } as any);
    collectionService.isMediaServerCollectionShared.mockResolvedValue(true);
    collectionService.getCollectionMedia.mockResolvedValue([]);
    mediaServer.getCollectionChildren.mockResolvedValue([{ id: 'm-shared' }]);

    await (
      service as unknown as {
        syncManualMediaServerToCollectionDB: (
          ruleGroup: {
            id: number;
            collectionId: number;
          },
          touchedMediaServerIds: Set<string>,
        ) => Promise<void>;
      }
    ).syncManualMediaServerToCollectionDB(
      { id: 10, collectionId: 1 },
      new Set(),
    );

    expect(
      collectionService.isMediaServerCollectionShared,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        mediaServerId: 'coll-1',
        manualCollection: true,
      }),
    );
    expect(
      collectionService.reconcileSharedManualCollectionState,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        mediaServerId: 'coll-1',
        manualCollection: true,
      }),
      {
        touchedMediaServerIds: new Set(),
      },
    );
    expect(
      collectionService.syncMediaServerChildrenToCollection,
    ).not.toHaveBeenCalled();
    expect(collectionService.addToCollection).not.toHaveBeenCalled();
    expect(mediaServer.getCollectionChildren).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "Synced collection 'Leaving Media' with media server",
    );
  });

  it('removes collection items on Plex when children are empty', async () => {
    const { service, collectionService } = createService(MediaServerType.PLEX);

    await (
      service as unknown as {
        syncManualMediaServerToCollectionDB: (
          ruleGroup: {
            id: number;
            collectionId: number;
          },
          touchedMediaServerIds: Set<string>,
        ) => Promise<void>;
      }
    ).syncManualMediaServerToCollectionDB(
      { id: 10, collectionId: 1 },
      new Set(),
    );

    expect(collectionService.removeFromCollection).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          mediaServerId: 'm1',
          reason: { type: 'media_removed_manually' },
        }),
      ]),
      'manual',
    );
  });

  it('skips excluded media when syncing manually added children', async () => {
    const { service, mediaServer, rulesService, collectionService } =
      createService(MediaServerType.JELLYFIN);

    mediaServer.getCollectionChildren.mockResolvedValue([
      { id: 'm-excluded' },
      { id: 'm-allowed-1' },
      { id: 'm-allowed-2' },
    ]);
    collectionService.getCollectionMedia.mockResolvedValue([]);
    rulesService.getExclusions.mockResolvedValue([
      { mediaServerId: 'm-excluded', parent: null },
    ] as any);

    await (
      service as unknown as {
        syncManualMediaServerToCollectionDB: (
          ruleGroup: {
            id: number;
            collectionId: number;
          },
          touchedMediaServerIds: Set<string>,
        ) => Promise<void>;
      }
    ).syncManualMediaServerToCollectionDB(
      { id: 10, collectionId: 1 },
      new Set(),
    );

    expect(
      collectionService.syncMediaServerChildrenToCollection,
    ).toHaveBeenCalledTimes(1);
    expect(
      collectionService.syncMediaServerChildrenToCollection,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, mediaServerId: 'coll-1' }),
      [
        {
          mediaServerId: 'm-allowed-1',
          reason: { type: 'media_added_manually' },
        },
        {
          mediaServerId: 'm-allowed-2',
          reason: { type: 'media_added_manually' },
        },
      ],
      'local',
    );
    expect(collectionService.addToCollection).not.toHaveBeenCalled();
  });

  it('only syncs media server children that are missing from the DB', async () => {
    const { service, mediaServer, rulesService, collectionService } =
      createService(MediaServerType.JELLYFIN);

    mediaServer.getCollectionChildren.mockResolvedValue([
      { id: 'm-existing' },
      { id: 'm-missing' },
    ]);
    collectionService.getCollectionMedia.mockResolvedValue([
      { mediaServerId: 'm-existing' },
    ] as any);
    rulesService.getExclusions.mockResolvedValue([] as any);

    await (
      service as unknown as {
        syncManualMediaServerToCollectionDB: (
          ruleGroup: {
            id: number;
            collectionId: number;
          },
          touchedMediaServerIds: Set<string>,
        ) => Promise<void>;
      }
    ).syncManualMediaServerToCollectionDB(
      { id: 10, collectionId: 1 },
      new Set(),
    );

    expect(
      collectionService.syncMediaServerChildrenToCollection,
    ).toHaveBeenCalledTimes(1);
    expect(
      collectionService.syncMediaServerChildrenToCollection,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, mediaServerId: 'coll-1' }),
      [
        {
          mediaServerId: 'm-missing',
          reason: { type: 'media_added_manually' },
        },
      ],
      'local',
    );
  });

  it('treats child enumeration failures as recoverable and clears stale automatic links', async () => {
    const { service, mediaServer, collectionService, logger } = createService(
      MediaServerType.JELLYFIN,
    );

    mediaServer.getCollectionChildren.mockRejectedValueOnce(new Error('boom'));
    collectionService.checkAutomaticMediaServerLink
      .mockResolvedValueOnce({
        id: 1,
        title: 'Test Collection',
        mediaServerId: 'coll-1',
        manualCollection: false,
      } as any)
      .mockResolvedValueOnce({
        id: 1,
        title: 'Test Collection',
        mediaServerId: null,
        manualCollection: false,
      } as any);

    await expect(
      (
        service as unknown as {
          syncManualMediaServerToCollectionDB: (
            ruleGroup: {
              id: number;
              collectionId: number;
            },
            touchedMediaServerIds: Set<string>,
          ) => Promise<void>;
        }
      ).syncManualMediaServerToCollectionDB(
        { id: 10, collectionId: 1 },
        new Set(),
      ),
    ).resolves.toBeUndefined();

    expect(
      collectionService.checkAutomaticMediaServerLink,
    ).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      "Skipping media server child sync for collection 'Test Collection' because the linked media server collection could not be enumerated.",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "Cleared stale media server link for collection 'Test Collection' after child sync failed.",
    );
    expect(logger.debug).toHaveBeenCalledWith(expect.any(Error));
    expect(collectionService.addToCollection).not.toHaveBeenCalled();
    expect(collectionService.removeFromCollection).not.toHaveBeenCalled();
  });

  it('does not re-add a rule-removed item as manual when media server returns stale children', async () => {
    const { service, mediaServer, collectionService } = createService(
      MediaServerType.PLEX,
    );

    // Media server still returns the item as a child (stale / sync delay)
    mediaServer.getCollectionChildren.mockResolvedValue([{ id: 'm-stale' }]);
    // DB no longer has the item (rule already removed it)
    collectionService.getCollectionMedia.mockResolvedValue([]);

    await (
      service as unknown as {
        syncManualMediaServerToCollectionDB: (
          ruleGroup: {
            id: number;
            collectionId: number;
          },
          touchedMediaServerIds: Set<string>,
        ) => Promise<void>;
      }
    ).syncManualMediaServerToCollectionDB(
      { id: 10, collectionId: 1 },
      new Set(['m-stale']), // item was touched by rule execution
    );

    // Should NOT be re-added as manual
    expect(collectionService.addToCollection).not.toHaveBeenCalled();
  });

  it('does not re-run addToCollection with no additions after resyncing a stale link', async () => {
    const { service, collectionService } = createService(
      MediaServerType.JELLYFIN,
    );

    const staleCollection = {
      id: 1,
      title: 'Test Collection',
      mediaServerId: 'stale-coll',
      manualCollection: false,
      deleteAfterDays: 0,
    };

    collectionService.getCollection.mockResolvedValue(staleCollection as any);
    collectionService.getCollectionMedia.mockResolvedValue([
      { mediaServerId: 'm1' },
    ] as any);
    collectionService.checkAutomaticMediaServerLink.mockResolvedValueOnce({
      ...staleCollection,
      mediaServerId: null,
    } as any);
    collectionService.addToCollection.mockResolvedValueOnce({
      ...staleCollection,
      mediaServerId: 'new-coll',
    } as any);
    collectionService.saveCollection.mockImplementation(async (collection) => {
      return collection as any;
    });
    collectionService.removeFromCollection.mockResolvedValue({
      ...staleCollection,
      mediaServerId: 'new-coll',
    } as any);

    (service as any).startTime = new Date();
    (service as any).resultData = [];
    (service as any).statisticsData = [];

    await (service as any).handleCollection({ id: 10, collectionId: 1 });

    expect(collectionService.addToCollection).toHaveBeenCalledTimes(1);
    expect(
      collectionService.addToCollectionWithResolvedLink,
    ).not.toHaveBeenCalled();
    expect(collectionService.addToCollection).toHaveBeenCalledWith(
      1,
      [{ mediaServerId: 'm1' }],
      false,
    );
    expect(
      collectionService.removeFromCollectionWithResolvedLink,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        mediaServerId: 'new-coll',
      }),
      [
        {
          mediaServerId: 'm1',
          reason: {
            type: 'media_removed_by_rule',
            data: undefined,
          },
        },
      ],
      'rule',
    );
  });

  it('reuses the reconciled collection link for additions later in the same run', async () => {
    const { service, collectionService } = createService(
      MediaServerType.JELLYFIN,
    );

    const staleCollection = {
      id: 1,
      title: 'Test Collection',
      mediaServerId: 'stale-coll',
      manualCollection: false,
      deleteAfterDays: 0,
    };

    collectionService.getCollection.mockResolvedValue(staleCollection as any);
    collectionService.getCollectionMedia.mockResolvedValue([
      { mediaServerId: 'm1' },
    ] as any);
    collectionService.checkAutomaticMediaServerLink.mockResolvedValueOnce({
      ...staleCollection,
      mediaServerId: null,
    } as any);
    collectionService.addToCollection
      .mockResolvedValueOnce({
        ...staleCollection,
        mediaServerId: 'new-coll',
      } as any)
      .mockResolvedValueOnce({
        ...staleCollection,
        mediaServerId: 'new-coll',
      } as any);
    collectionService.saveCollection.mockImplementation(async (collection) => {
      return collection as any;
    });
    collectionService.removeFromCollection.mockResolvedValue({
      ...staleCollection,
      mediaServerId: 'new-coll',
    } as any);

    (service as any).startTime = new Date();
    (service as any).resultData = [{ id: 'm2' }];
    (service as any).statisticsData = [];

    await (service as any).handleCollection({ id: 10, collectionId: 1 });

    expect(
      collectionService.addToCollectionWithResolvedLink,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        mediaServerId: 'new-coll',
      }),
      [
        {
          mediaServerId: 'm2',
          reason: {
            type: 'media_added_by_rule',
            data: undefined,
          },
        },
      ],
    );
  });

  it('emits failed and skips execution when rule group has no library assigned', async () => {
    const { service, rulesService, eventEmitter, progressManager } =
      createService(MediaServerType.JELLYFIN);

    rulesService.getRuleGroup.mockResolvedValue({
      id: 77,
      name: 'No Library Group',
      isActive: true,
      libraryId: '',
    } as any);

    const abortController = new AbortController();

    await expect(
      service.executeForRuleGroups(77, abortController.signal),
    ).resolves.toEqual({
      status: 'failed',
      failedPayload: expect.objectContaining({
        collectionName: 'No Library Group',
        identifier: { type: 'rulegroup', value: 77 },
      }),
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.RuleHandler_Failed,
      expect.objectContaining({
        collectionName: 'No Library Group',
        identifier: { type: 'rulegroup', value: 77 },
      }),
    );
    expect(progressManager.reset).toHaveBeenCalled();
  });

  it('does not emit started and still cleans up when execution was already aborted before starting', async () => {
    const {
      service,
      rulesService,
      eventEmitter,
      progressManager,
      settings,
      logger,
    } = createService(MediaServerType.JELLYFIN);

    rulesService.getRuleGroup.mockResolvedValue({
      id: 77,
      name: 'Aborted Group',
      isActive: true,
      libraryId: 'library-1',
      rules: [],
      useRules: false,
    } as any);

    const abortController = new AbortController();
    abortController.abort();

    await expect(
      service.executeForRuleGroups(77, abortController.signal),
    ).resolves.toEqual({ status: 'aborted' });

    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.RuleHandler_Started,
      expect.anything(),
    );
    expect(settings.testConnections).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "Execution of rule 'Aborted Group' was aborted.",
    );
    expect(progressManager.reset).toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.RuleHandler_Finished,
      expect.anything(),
    );
  });

  it('returns skipped when the rule group does not exist', async () => {
    const { service, rulesService, eventEmitter } = createService(
      MediaServerType.JELLYFIN,
    );

    rulesService.getRuleGroup.mockResolvedValue(undefined as any);

    await expect(
      service.executeForRuleGroups(404, new AbortController().signal),
    ).resolves.toEqual({ status: 'skipped', reason: 'not-found' });

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('returns skipped when the rule group is inactive', async () => {
    const { service, rulesService, eventEmitter } = createService(
      MediaServerType.JELLYFIN,
    );

    rulesService.getRuleGroup.mockResolvedValue({
      id: 12,
      name: 'Inactive Group',
      isActive: false,
    } as any);

    await expect(
      service.executeForRuleGroups(12, new AbortController().signal),
    ).resolves.toEqual({ status: 'skipped', reason: 'inactive' });

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('aborts between collection add and remove phases', async () => {
    const { service, collectionService } = createService(MediaServerType.PLEX);
    const abortController = new AbortController();

    (service as any).resultData = [{ id: 'm2' }];
    (service as any).statisticsData = [];

    const abortMock = async () => {
      abortController.abort();
      return {
        id: 1,
        mediaServerId: 'coll-1',
        title: 'Test Collection',
        deleteAfterDays: 0,
      } as any;
    };
    collectionService.addToCollection.mockImplementation(abortMock);
    collectionService.addToCollectionWithResolvedLink.mockImplementation(
      abortMock,
    );

    await expect(
      (
        service as unknown as {
          handleCollection: (
            ruleGroup: { id: number; collectionId: number },
            abortSignal: AbortSignal,
          ) => Promise<Set<string>>;
        }
      ).handleCollection({ id: 10, collectionId: 1 }, abortController.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(collectionService.removeFromCollection).not.toHaveBeenCalled();
    expect(
      collectionService.removeFromCollectionWithResolvedLink,
    ).not.toHaveBeenCalled();
  });

  it('fails cleanly when collection sync returns undefined', async () => {
    const { service, collectionService } = createService(
      MediaServerType.JELLYFIN,
    );

    collectionService.addToCollectionWithResolvedLink.mockResolvedValueOnce(
      undefined,
    );

    (service as any).startTime = new Date();
    (service as any).resultData = [{ id: 'm2' }];
    (service as any).statisticsData = [];

    await expect(
      (
        service as unknown as {
          handleCollection: (ruleGroup: {
            id: number;
            collectionId: number;
          }) => Promise<Set<string>>;
        }
      ).handleCollection({ id: 10, collectionId: 1 }),
    ).rejects.toMatchObject({ name: 'RuleExecutionFailure' });

    expect(
      collectionService.removeFromCollectionWithResolvedLink,
    ).not.toHaveBeenCalled();
  });
});
