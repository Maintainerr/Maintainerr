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
import { SettingsService } from '../settings/settings.service';
import { ExecutionLockService } from '../tasks/execution-lock.service';
import { TasksService } from '../tasks/tasks.service';
import { CollectionHandler } from './collection-handler';
import { CollectionWorkerService } from './collection-worker.service';
import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';
import { ServarrAction } from './interfaces/collection.interface';

jest.mock('../../utils/delay');

describe('CollectionWorkerService', () => {
  let collectionWorkerService: CollectionWorkerService;
  let taskService: Mocked<TasksService>;
  let settings: Mocked<SettingsService>;
  let collectionRepository: Mocked<Repository<Collection>>;
  let collectionMediaRepository: Mocked<Repository<CollectionMedia>>;
  let seerrApi: Mocked<SeerrApiService>;
  let collectionHandler: Mocked<CollectionHandler>;
  let executionLock: Mocked<ExecutionLockService>;
  let eventEmitter: Mocked<EventEmitter2>;
  let logger: Mocked<MaintainerrLogger>;
  let mediaServerFactory: Mocked<MediaServerFactory>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      CollectionWorkerService,
    ).compile();

    collectionWorkerService = unit;
    taskService = unitRef.get(TasksService);
    settings = unitRef.get(SettingsService);
    collectionRepository = unitRef.get(
      getRepositoryToken(Collection) as string,
    );
    collectionMediaRepository = unitRef.get(
      getRepositoryToken(CollectionMedia) as string,
    );
    seerrApi = unitRef.get(SeerrApiService);
    collectionHandler = unitRef.get(CollectionHandler);
    executionLock = unitRef.get(ExecutionLockService);
    eventEmitter = unitRef.get(EventEmitter2);
    logger = unitRef.get(MaintainerrLogger);
    mediaServerFactory = unitRef.get(MediaServerFactory);

    executionLock.acquire.mockResolvedValue(jest.fn());
    eventEmitter.emit.mockImplementation();
    mediaServerFactory.verifyConnection.mockResolvedValue({} as any);
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
    settings.testConnections.mockResolvedValue(true);

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
    settings.testConnections.mockResolvedValue(true);
    settings.seerrConfigured.mockReturnValue(true);

    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'show',
    });
    const collectionMedia = createCollectionMedia(collection);

    collectionRepository.find.mockResolvedValue([collection]);
    collectionMediaRepository.find.mockResolvedValue([collectionMedia]);
    collectionHandler.handleMedia.mockResolvedValue(true);

    await collectionWorkerService.execute();

    expect(executionLock.acquire).toHaveBeenCalled();
    expect(collectionHandler.handleMedia).toHaveBeenCalled();
    expect(seerrApi.api.post).toHaveBeenCalled();
  });

  it('should not report failed media as handled', async () => {
    settings.testConnections.mockResolvedValue(true);
    settings.seerrConfigured.mockReturnValue(true);

    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'show',
    });
    const collectionMedia = createCollectionMedia(collection);

    collectionRepository.find.mockResolvedValue([collection]);
    collectionMediaRepository.find.mockResolvedValue([collectionMedia]);
    collectionHandler.handleMedia.mockResolvedValue(false);

    await collectionWorkerService.execute();

    expect(seerrApi.api.post).not.toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.CollectionHandler_Failed,
    );
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.CollectionMedia_Handled,
      expect.anything(),
    );
  });

  it('should emit failure and continue when media handling throws', async () => {
    settings.testConnections.mockResolvedValue(true);
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
      .mockResolvedValueOnce(true);

    await collectionWorkerService.execute();

    expect(collectionHandler.handleMedia).toHaveBeenCalledTimes(2);
    expect(seerrApi.api.post).toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.CollectionHandler_Failed,
    );
  });

  it('should not emit collection progress when no media exceeds the delete threshold', async () => {
    settings.testConnections.mockResolvedValue(true);

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
