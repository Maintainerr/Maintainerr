import { CollectionMediaRemovedDto } from '../events/events.dto';
import {
  createCollection,
  createMockLogger,
} from '../../../test/utils/data';
import { OverlayTaskService } from './overlay-task.service';

describe('OverlayTaskService', () => {
  it('clears stale state instead of reverting when an item remains in another overlay collection', async () => {
    const processor = {
      revertItem: jest.fn(),
      processAllCollections: jest.fn(),
      processCollection: jest.fn(),
    };
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const collectionsService = {
      getCollectionsWithOverlayEnabled: jest.fn().mockResolvedValue([
        {
          ...createCollection({ id: 99, overlayEnabled: true }),
          collectionMedia: [{ mediaServerId: 'media-1' }],
        },
      ]),
    };
    const stateService = {
      removeState: jest.fn().mockResolvedValue(undefined),
    };

    const service = new OverlayTaskService(
      {
        createJob: jest.fn(),
        updateJob: jest.fn(),
        isRunning: jest.fn().mockReturnValue(false),
        setRunning: jest.fn(),
        clearRunning: jest.fn(),
      } as any,
      createMockLogger(),
      processor as any,
      settingsService as any,
      collectionsService as any,
      stateService as any,
    );

    await service.handleCollectionMediaRemoved(
      new CollectionMediaRemovedDto(
        [{ mediaServerId: 'media-1' }],
        'Collection A',
        { type: 'collection', value: 42 },
      ),
    );

    expect(stateService.removeState).toHaveBeenCalledWith(42, 'media-1');
    expect(processor.revertItem).not.toHaveBeenCalled();
  });
});