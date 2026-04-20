import { CollectionMediaRemovedDto } from '../events/events.dto';
import { createCollection, createMockLogger } from '../../../test/utils/data';
import { OverlayTaskService } from './overlay-task.service';

describe('OverlayTaskService', () => {
  const buildTaskService = (
    overrides: {
      processor?: Partial<Record<string, jest.Mock>>;
      collections?: Array<{
        id: number;
        collectionMedia: { mediaServerId: string }[];
      }>;
      settings?: { enabled: boolean };
    } = {},
  ) => {
    const processor = {
      revertMultipleItems: jest.fn().mockResolvedValue(undefined),
      processAllCollections: jest.fn(),
      processCollection: jest.fn(),
      ...(overrides.processor ?? {}),
    };
    const settingsService = {
      getSettings: jest
        .fn()
        .mockResolvedValue(overrides.settings ?? { enabled: true }),
    };
    const collectionsService = {
      getCollectionsWithOverlayEnabled: jest
        .fn()
        .mockResolvedValue(overrides.collections ?? []),
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

    return { service, processor, stateService };
  };

  it('clears stale state instead of reverting when an item remains in another overlay collection', async () => {
    const { service, processor, stateService } = buildTaskService({
      collections: [
        {
          ...createCollection({ id: 99, overlayEnabled: true }),
          collectionMedia: [{ mediaServerId: 'media-1' }],
        },
      ],
    });

    await service.handleCollectionMediaRemoved(
      new CollectionMediaRemovedDto(
        [{ mediaServerId: 'media-1' }],
        'Collection A',
        { type: 'collection', value: 42 },
        42,
      ),
    );

    expect(stateService.removeState).toHaveBeenCalledWith(42, 'media-1');
    expect(processor.revertMultipleItems).not.toHaveBeenCalled();
  });

  it('aggregates removed items into a single revertMultipleItems call', async () => {
    const { service, processor } = buildTaskService();

    await service.handleCollectionMediaRemoved(
      new CollectionMediaRemovedDto(
        [
          { mediaServerId: 'media-1' },
          { mediaServerId: 'media-2' },
          { mediaServerId: 'media-3' },
        ],
        'Collection A',
        { type: 'collection', value: 42 },
        42,
      ),
    );

    expect(processor.revertMultipleItems).toHaveBeenCalledTimes(1);
    expect(processor.revertMultipleItems).toHaveBeenCalledWith(
      42,
      [
        { mediaServerId: 'media-1' },
        { mediaServerId: 'media-2' },
        { mediaServerId: 'media-3' },
      ],
      'Collection A',
    );
  });

  it('uses payload.collectionId (not identifier.value) when reverting rule-driven removals', async () => {
    // Rule-executor emits with identifier { type: 'rulegroup', value: rulegroupId }
    // but state and revert ops must key by the actual collection id.
    const { service, processor, stateService } = buildTaskService({
      collections: [
        {
          ...createCollection({ id: 7, overlayEnabled: true }),
          collectionMedia: [{ mediaServerId: 'media-shared' }],
        },
      ],
    });

    await service.handleCollectionMediaRemoved(
      new CollectionMediaRemovedDto(
        [{ mediaServerId: 'media-shared' }, { mediaServerId: 'media-gone' }],
        'Collection A',
        { type: 'rulegroup', value: 999 },
        42,
      ),
    );

    // state cleared against collectionId=42, not rulegroupId=999
    expect(stateService.removeState).toHaveBeenCalledWith(42, 'media-shared');
    expect(processor.revertMultipleItems).toHaveBeenCalledWith(
      42,
      [{ mediaServerId: 'media-gone' }],
      'Collection A',
    );
  });

  it('does not call revertMultipleItems when overlays are disabled', async () => {
    const { service, processor } = buildTaskService({
      settings: { enabled: false },
    });

    await service.handleCollectionMediaRemoved(
      new CollectionMediaRemovedDto(
        [{ mediaServerId: 'media-1' }],
        'Collection A',
        { type: 'collection', value: 42 },
        42,
      ),
    );

    expect(processor.revertMultipleItems).not.toHaveBeenCalled();
  });
});
