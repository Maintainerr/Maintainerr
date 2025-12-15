import { getRepositoryToken } from '@nestjs/typeorm';
import { Mocked, TestBed } from '@suites/unit';
import { Repository } from 'typeorm';
import {
  createCollection,
  createCollectionMedia,
} from '../../../test/utils/data';
import { JellyseerrApiService } from '../api/jellyseerr-api/jellyseerr-api.service';
import { OverseerrApiService } from '../api/overseerr-api/overseerr-api.service';
import { EPlexDataType } from '../api/plex-api/enums/plex-data-type-enum';
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
  let overseerrApi: Mocked<OverseerrApiService>;
  let jellyseerrApi: Mocked<JellyseerrApiService>;
  let collectionHandler: Mocked<CollectionHandler>;
  let executionLock: Mocked<ExecutionLockService>;

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
    overseerrApi = unitRef.get(OverseerrApiService);
    jellyseerrApi = unitRef.get(JellyseerrApiService);
    collectionHandler = unitRef.get(CollectionHandler);
    executionLock = unitRef.get(ExecutionLockService);

    executionLock.acquire.mockResolvedValue(jest.fn());
  });

  it('should abort if another instance is running', async () => {
    taskService.isRunning.mockResolvedValue(true);

    await collectionWorkerService.execute();

    expect(executionLock.acquire).not.toHaveBeenCalled();
  });

  it('should abort if testing connection fails', async () => {
    settings.testConnections.mockResolvedValue(false);

    await collectionWorkerService.execute();

    expect(executionLock.acquire).toHaveBeenCalled();
    expect(collectionRepository.find).not.toHaveBeenCalled();
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
    settings.overseerrConfigured.mockReturnValue(true);
    settings.jellyseerrConfigured.mockReturnValue(true);

    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: EPlexDataType.SHOWS,
    });
    const collectionMedia = createCollectionMedia(collection);

    collectionRepository.find.mockResolvedValue([collection]);
    collectionMediaRepository.find.mockResolvedValue([collectionMedia]);

    await collectionWorkerService.execute();

    expect(executionLock.acquire).toHaveBeenCalled();
    expect(collectionHandler.handleMedia).toHaveBeenCalled();
    expect(overseerrApi.api.post).toHaveBeenCalled();
    expect(jellyseerrApi.api.post).toHaveBeenCalled();
  });
});
