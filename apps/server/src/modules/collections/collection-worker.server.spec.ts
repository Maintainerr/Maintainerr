import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Mocked, TestBed } from '@suites/unit';
import { Repository } from 'typeorm';
import { MaintainerrEvent } from '@maintainerr/contracts';
import {
  createCollection,
  createCollectionMedia,
} from '../../../test/utils/data';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsDataService } from '../settings/settings-data.service';
import { ExecutionLockService } from '../tasks/execution-lock.service';
import { TasksService } from '../tasks/tasks.service';
import { CollectionHandler } from './collection-handler';
import { CollectionWorkerService } from './collection-worker.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { Collection } from './entities/collection.entities';
import {
  CollectionMedia,
  CollectionMediaManualMembershipSource,
} from './entities/collection_media.entities';
import { ServarrAction } from './interfaces/collection.interface';

jest.mock('../../utils/delay');

describe('CollectionWorkerService', () => {
  let collectionWorkerService: CollectionWorkerService;
  let taskService: Mocked<TasksService>;
  let settings: Mocked<SettingsDataService>;
  let collectionRepository: Mocked<Repository<Collection>>;
  let collectionMediaRepository: Mocked<Repository<CollectionMedia>>;
  let exclusionRepository: Mocked<Repository<Exclusion>>;
  let ruleGroupRepository: Mocked<Repository<RuleGroup>>;
  let seerrApi: Mocked<SeerrApiService>;
  let collectionHandler: Mocked<CollectionHandler>;
  let executionLock: Mocked<ExecutionLockService>;
  let eventEmitter: Mocked<EventEmitter2>;
  let logger: Mocked<MaintainerrLogger>;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let getMetadataBatch: jest.Mock;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      CollectionWorkerService,
    ).compile();

    collectionWorkerService = unit;
    taskService = unitRef.get(TasksService);
    settings = unitRef.get(SettingsDataService);
    collectionRepository = unitRef.get(
      getRepositoryToken(Collection) as string,
    );
    collectionMediaRepository = unitRef.get(
      getRepositoryToken(CollectionMedia) as string,
    );
    exclusionRepository = unitRef.get(getRepositoryToken(Exclusion) as string);
    ruleGroupRepository = unitRef.get(getRepositoryToken(RuleGroup) as string);
    seerrApi = unitRef.get(SeerrApiService);
    collectionHandler = unitRef.get(CollectionHandler);
    executionLock = unitRef.get(ExecutionLockService);
    eventEmitter = unitRef.get(EventEmitter2);
    logger = unitRef.get(MaintainerrLogger);
    mediaServerFactory = unitRef.get(MediaServerFactory);

    executionLock.acquire.mockResolvedValue(jest.fn());
    eventEmitter.emit.mockImplementation();
    exclusionRepository.find.mockResolvedValue([]);
    ruleGroupRepository.find.mockResolvedValue([]);
    getMetadataBatch = jest.fn().mockResolvedValue([]);
    mediaServerFactory.verifyConnection.mockResolvedValue({
      supportsFeature: jest.fn().mockReturnValue(false),
      getActiveSessions: jest.fn().mockResolvedValue(new Set<string>()),
      getMetadataBatch,
    } as any);
  });

  it('should abort if another instance is running', async () => {
    taskService.isRunning.mockReturnValue(true);

    await collectionWorkerService.execute();

    expect(executionLock.acquire).not.toHaveBeenCalled();
  });

  it('should abort if the media server is unreachable', async () => {
    mediaServerFactory.verifyConnection.mockRejectedValue(
      new Error('Media server still unreachable after re-initialization'),
    );

    await collectionWorkerService.execute();

    expect(executionLock.acquire).toHaveBeenCalled();
    expect(collectionRepository.find).not.toHaveBeenCalled();

    const failedEvents = eventEmitter.emit.mock.calls.filter(
      ([eventName]) => eventName === MaintainerrEvent.CollectionHandler_Failed,
    );
    const finishedEvents = eventEmitter.emit.mock.calls.filter(
      ([eventName]) =>
        eventName === MaintainerrEvent.CollectionHandler_Finished,
    );

    expect(failedEvents).toHaveLength(1);
    expect(finishedEvents).toHaveLength(1);
  });

  it('should not handle media for Do Nothing collections', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DO_NOTHING,
    });

    collectionRepository.find.mockResolvedValue([collection]);
    collectionMediaRepository.find.mockResolvedValue([]);

    await collectionWorkerService.execute();

    expect(executionLock.acquire).toHaveBeenCalled();
    expect(collectionRepository.find).toHaveBeenCalled();
    expect(collectionHandler.handleMedia).not.toHaveBeenCalled();
  });

  it('should handle media for collection and trigger availability syncs', async () => {
    settings.seerrConfigured.mockReturnValue(true);

    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'show',
    });
    const collectionMedia = createCollectionMedia(collection);

    collectionRepository.find.mockResolvedValue([collection]);
    collectionMediaRepository.find.mockResolvedValue([collectionMedia]);
    collectionHandler.handleMedia.mockResolvedValue('handled');

    await collectionWorkerService.execute();

    expect(executionLock.acquire).toHaveBeenCalled();
    expect(collectionMediaRepository.find).toHaveBeenCalledWith({
      where: expect.objectContaining({
        collectionId: collection.id,
      }),
    });
    expect(collectionHandler.handleMedia).toHaveBeenCalled();
    expect(seerrApi.api.post).toHaveBeenCalled();
  });

  describe('exclusions protect a due member from the delete action', () => {
    const arrangeDueMember = (
      exclusions: Partial<Exclusion>[],
      {
        mediaServerId = 'episode-1',
        ruleGroups = [] as Partial<RuleGroup>[],
      } = {},
    ) => {
      const collection = createCollection({
        arrAction: ServarrAction.DELETE,
        type: 'movie',
      });

      collectionRepository.find.mockResolvedValue([collection]);
      collectionMediaRepository.find.mockResolvedValue([
        createCollectionMedia(collection, { mediaServerId }),
      ]);
      exclusionRepository.find.mockResolvedValue(exclusions as Exclusion[]);
      ruleGroupRepository.find.mockResolvedValue(ruleGroups as RuleGroup[]);
      collectionHandler.handleMedia.mockResolvedValue('handled');

      return collection;
    };

    it('skips a globally excluded member', async () => {
      arrangeDueMember([{ mediaServerId: 'episode-1', ruleGroupId: null }]);

      await collectionWorkerService.execute();

      expect(collectionHandler.handleMedia).not.toHaveBeenCalled();
    });

    it('skips a member excluded from this collection', async () => {
      const collection = arrangeDueMember([
        { mediaServerId: 'episode-1', ruleGroupId: 4 },
      ]);
      ruleGroupRepository.find.mockResolvedValue([
        { id: 4, collectionId: collection.id } as RuleGroup,
      ]);

      await collectionWorkerService.execute();

      expect(collectionHandler.handleMedia).not.toHaveBeenCalled();
    });

    it('still handles a member excluded from a different collection', async () => {
      const collection = arrangeDueMember([
        { mediaServerId: 'episode-1', ruleGroupId: 4 },
      ]);
      ruleGroupRepository.find.mockResolvedValue([
        { id: 4, collectionId: collection.id + 1 } as RuleGroup,
      ]);

      await collectionWorkerService.execute();

      expect(collectionHandler.handleMedia).toHaveBeenCalled();
    });

    it.each<[string, Partial<Exclusion>]>([
      ['a show', { mediaServerId: 'show-1', ruleGroupId: null, type: 'show' }],
      [
        'a season',
        { mediaServerId: 'season-1', ruleGroupId: null, type: 'season' },
      ],
      [
        'a legacy untyped row',
        { mediaServerId: 'other-1', ruleGroupId: null, parent: 'season-1' },
      ],
    ])('skips a member %s exclusion cascades to', async (_label, exclusion) => {
      arrangeDueMember([exclusion]);
      getMetadataBatch.mockResolvedValue([
        { id: 'episode-1', parentId: 'season-1', grandparentId: 'show-1' },
      ]);

      await collectionWorkerService.execute();

      expect(getMetadataBatch).toHaveBeenCalledWith(['episode-1']);
      expect(collectionHandler.handleMedia).not.toHaveBeenCalled();
    });

    it('does not read the hierarchy when no exclusion reaches past its own id', async () => {
      arrangeDueMember([{ mediaServerId: 'other-1', ruleGroupId: null }]);

      await collectionWorkerService.execute();

      expect(getMetadataBatch).not.toHaveBeenCalled();
      expect(collectionHandler.handleMedia).toHaveBeenCalled();
    });

    // A batch read omits what it could not resolve, so an unread hierarchy
    // cannot show the member sits outside the cascade.
    it.each([
      ['fails', () => getMetadataBatch.mockRejectedValue(new Error('boom'))],
      [
        'answers for other ids only',
        () => getMetadataBatch.mockResolvedValue([{ id: 'episode-2' }]),
      ],
    ])(
      'leaves a member to the next run when the batch %s',
      async (_l, fault) => {
        arrangeDueMember([
          { mediaServerId: 'show-9', ruleGroupId: null, type: 'show' },
        ]);
        fault();

        await collectionWorkerService.execute();

        expect(collectionHandler.handleMedia).not.toHaveBeenCalled();
      },
    );
  });

  it('captures the media title before handling and carries it on the handled event (#3249)', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'movie',
    });
    const collectionMedia = createCollectionMedia(collection, {
      mediaServerId: 'gone-after-delete',
    });

    // getMetadata resolves before handling, then reports the item gone once the
    // delete action has run - the pre-handling snapshot is what the handled
    // notification relies on.
    const snapshot = { title: 'A Sample Movie', type: 'movie' };
    const getMetadata = jest
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValue(undefined);
    mediaServerFactory.verifyConnection.mockResolvedValue({
      supportsFeature: jest.fn().mockReturnValue(false),
      getActiveSessions: jest.fn().mockResolvedValue(new Set<string>()),
      getMetadata,
    } as any);

    collectionRepository.find.mockResolvedValue([collection]);
    collectionMediaRepository.find.mockResolvedValue([collectionMedia]);
    collectionHandler.handleMedia.mockResolvedValue('handled');

    await collectionWorkerService.execute();

    expect(getMetadata).toHaveBeenCalledWith('gone-after-delete');
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.CollectionMedia_Handled,
      expect.objectContaining({
        collectionName: collection.title,
        mediaItems: [
          { mediaServerId: 'gone-after-delete', metadata: snapshot },
        ],
        identifier: { type: 'collection', value: collection.id },
      }),
    );
  });

  it('skips flagged rule-owned media but still handles flagged manual media', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'movie',
    });
    const flaggedRuleOwnedMedia = createCollectionMedia(collection, {
      mediaServerId: 'rule-owned',
      includedByRule: true,
      manualMembershipSource: null,
      ruleEvaluationFailed: true,
    });
    const flaggedManualMedia = createCollectionMedia(collection, {
      mediaServerId: 'manual',
      includedByRule: false,
      manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
      ruleEvaluationFailed: true,
    });

    collectionRepository.find.mockResolvedValue([collection]);
    collectionMediaRepository.find.mockResolvedValue([
      flaggedRuleOwnedMedia,
      flaggedManualMedia,
    ]);
    collectionHandler.handleMedia.mockResolvedValue('handled');

    await collectionWorkerService.execute();

    expect(collectionHandler.handleMedia).toHaveBeenCalledTimes(1);
    expect(collectionHandler.handleMedia).toHaveBeenCalledWith(
      collection,
      flaggedManualMedia,
    );
    expect(collectionHandler.handleMedia).not.toHaveBeenCalledWith(
      collection,
      flaggedRuleOwnedMedia,
    );
  });

  it('defers currently-playing media to the next run when the server reports active sessions', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'movie',
    });
    const playingMedia = createCollectionMedia(collection, {
      mediaServerId: 'playing',
    });
    const idleMedia = createCollectionMedia(collection, {
      mediaServerId: 'idle',
    });

    mediaServerFactory.verifyConnection.mockResolvedValue({
      supportsFeature: jest.fn().mockReturnValue(true),
      getActiveSessions: jest.fn().mockResolvedValue(new Set(['playing'])),
    } as any);

    collectionRepository.find.mockResolvedValue([collection]);
    collectionMediaRepository.find.mockResolvedValue([playingMedia, idleMedia]);
    collectionHandler.handleMedia.mockResolvedValue('handled');

    await collectionWorkerService.execute();

    expect(collectionHandler.handleMedia).toHaveBeenCalledTimes(1);
    expect(collectionHandler.handleMedia).toHaveBeenCalledWith(
      collection,
      idleMedia,
    );
    expect(collectionHandler.handleMedia).not.toHaveBeenCalledWith(
      collection,
      playingMedia,
    );
    expect(logger.log).toHaveBeenCalledWith(
      `Deferring 1 currently-playing media item(s) in collection '${collection.title}' to the next run`,
    );
  });

  it('should not report failed media as handled', async () => {
    settings.seerrConfigured.mockReturnValue(true);

    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'show',
    });
    const collectionMedia = createCollectionMedia(collection);

    collectionRepository.find.mockResolvedValue([collection]);
    collectionMediaRepository.find.mockResolvedValue([collectionMedia]);
    collectionHandler.handleMedia.mockResolvedValue('failed');

    await collectionWorkerService.execute();

    expect(seerrApi.api.post).not.toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.CollectionHandler_Failed,
      expect.objectContaining({
        collectionName: collection.title,
        mediaItems: [{ mediaServerId: collectionMedia.mediaServerId }],
        identifier: { type: 'collection', value: collection.id },
      }),
    );
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.CollectionMedia_Handled,
      expect.anything(),
    );
  });

  it('does not notify or trigger availability sync when media was pruned as missing', async () => {
    settings.seerrConfigured.mockReturnValue(true);

    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'show',
    });
    const collectionMedia = createCollectionMedia(collection);

    collectionRepository.find.mockResolvedValue([collection]);
    collectionMediaRepository.find.mockResolvedValue([collectionMedia]);
    collectionHandler.handleMedia.mockResolvedValue('removed-missing');

    await collectionWorkerService.execute();

    // The item was already gone - nothing on disk changed, so no sync and
    // neither the handled nor the failed notification fires.
    expect(seerrApi.api.post).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.CollectionHandler_Failed,
      expect.anything(),
    );
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.CollectionMedia_Handled,
      expect.anything(),
    );
  });

  it('should emit failure and continue when media handling throws', async () => {
    settings.seerrConfigured.mockReturnValue(true);

    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'show',
    });
    const firstCollectionMedia = createCollectionMedia(collection, {
      mediaServerId: '1',
    });
    const secondCollectionMedia = createCollectionMedia(collection, {
      mediaServerId: '2',
    });

    collectionRepository.find.mockResolvedValue([collection]);
    collectionMediaRepository.find.mockResolvedValue([
      firstCollectionMedia,
      secondCollectionMedia,
    ]);
    collectionHandler.handleMedia
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('handled');

    await collectionWorkerService.execute();

    expect(collectionHandler.handleMedia).toHaveBeenCalledTimes(2);
    expect(seerrApi.api.post).toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.CollectionHandler_Failed,
      expect.objectContaining({
        collectionName: collection.title,
        mediaItems: [{ mediaServerId: firstCollectionMedia.mediaServerId }],
        identifier: { type: 'collection', value: collection.id },
      }),
    );
  });

  it('should not emit collection progress when no media exceeds the delete threshold', async () => {
    const firstCollection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'show',
      title: 'Sonarr + Seerr',
    });
    const secondCollection = createCollection({
      id: 2,
      arrAction: ServarrAction.DELETE,
      type: 'show',
      title: 'Radarr + Seerr',
    });

    collectionRepository.find.mockResolvedValue([
      firstCollection,
      secondCollection,
    ]);
    collectionMediaRepository.find.mockResolvedValue([]);

    await collectionWorkerService.execute();

    expect(collectionHandler.handleMedia).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.CollectionHandler_Progressed,
      expect.anything(),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.CollectionHandler_Started,
      expect.anything(),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.CollectionHandler_Finished,
      expect.anything(),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      "Skipping collection 'Sonarr + Seerr' because no media is due for handling",
    );
    expect(logger.debug).toHaveBeenCalledWith(
      "Skipping collection 'Radarr + Seerr' because no media is due for handling",
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Collection handler summary: 2 total (isActive), 0 skipped (Do Nothing), 2 skipped (no due media), 0 queued for handling',
    );
  });
});
