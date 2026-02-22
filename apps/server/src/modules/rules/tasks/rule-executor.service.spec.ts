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
      removeFromCollection: jest.fn().mockResolvedValue(undefined),
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
        syncManualMediaServerToCollectionDB: (ruleGroup: {
          id: number;
          collectionId: number;
        }) => Promise<void>;
      }
    ).syncManualMediaServerToCollectionDB({ id: 10, collectionId: 1 });

    expect(collectionService.removeFromCollection).not.toHaveBeenCalled();
  });

  it('removes collection items on Plex when children are empty', async () => {
    const { service, collectionService } = createService(MediaServerType.PLEX);

    await (
      service as unknown as {
        syncManualMediaServerToCollectionDB: (ruleGroup: {
          id: number;
          collectionId: number;
        }) => Promise<void>;
      }
    ).syncManualMediaServerToCollectionDB({ id: 10, collectionId: 1 });

    expect(collectionService.removeFromCollection).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          mediaServerId: 'm1',
          reason: { type: 'media_removed_manually' },
        }),
      ]),
    );
  });

  it('skips excluded media when syncing manually added children', async () => {
    const { service, mediaServer, rulesService, collectionService } =
      createService(MediaServerType.JELLYFIN);

    mediaServer.getCollectionChildren.mockResolvedValue([
      { id: 'm-excluded' },
      { id: 'm-allowed' },
    ]);
    collectionService.getCollectionMedia.mockResolvedValue([]);
    rulesService.getExclusions.mockResolvedValue([
      { mediaServerId: 'm-excluded', parent: null },
    ] as any);

    await (
      service as unknown as {
        syncManualMediaServerToCollectionDB: (ruleGroup: {
          id: number;
          collectionId: number;
        }) => Promise<void>;
      }
    ).syncManualMediaServerToCollectionDB({ id: 10, collectionId: 1 });

    expect(collectionService.addToCollection).toHaveBeenCalledTimes(1);
    expect(collectionService.addToCollection).toHaveBeenCalledWith(
      1,
      [
        {
          mediaServerId: 'm-allowed',
          reason: { type: 'media_added_manually' },
        },
      ],
      true,
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

    await service.executeForRuleGroups(77, abortController.signal);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.RuleHandler_Failed,
    );
    expect(progressManager.reset).not.toHaveBeenCalled();
  });
});
