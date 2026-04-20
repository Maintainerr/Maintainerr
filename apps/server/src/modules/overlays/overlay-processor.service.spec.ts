import { MaintainerrEvent, type OverlayTemplate } from '@maintainerr/contracts';
import {
  createCollection,
  createCollectionMedia,
  createMockLogger,
} from '../../../test/utils/data';
import { OverlayProcessorService } from './overlay-processor.service';

describe('OverlayProcessorService', () => {
  it('processes collections with deleteAfterDays equal to zero', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getItemState: jest.fn().mockResolvedValue(null),
    };
    const template: OverlayTemplate = {
      id: 1,
      name: 'Default poster',
      description: '',
      mode: 'poster',
      canvasWidth: 1000,
      canvasHeight: 1500,
      elements: [],
      isDefault: true,
      isPreset: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(template),
    };
    const logger = createMockLogger();

    const service = new OverlayProcessorService(
      {} as any,
      {} as any,
      settingsService as any,
      stateService as any,
      {} as any,
      templateService as any,
      { emit: jest.fn() } as any,
      logger,
    );

    const collection = createCollection({
      id: 1,
      title: 'Immediate action',
      type: 'movie',
      deleteAfterDays: 0,
      overlayTemplateId: null,
    });
    collection.collectionMedia = [
      createCollectionMedia(collection, {
        mediaServerId: 'media-1',
        addDate: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ];

    jest.spyOn(service, 'applyTemplateOverlay').mockResolvedValue(true);

    const result = await service.processCollection(collection as any);

    expect(service.applyTemplateOverlay).toHaveBeenCalledWith(
      'media-1',
      collection.id,
      expect.any(Date),
      template,
    );
    expect(result.processed).toBe(1);
  });

  it('emits one aggregated overlay applied notification for process-all runs', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getAllStates: jest.fn().mockResolvedValue([]),
      getItemState: jest.fn().mockResolvedValue(null),
    };
    const template: OverlayTemplate = {
      id: 1,
      name: 'Default poster',
      description: '',
      mode: 'poster',
      canvasWidth: 1000,
      canvasHeight: 1500,
      elements: [],
      isDefault: true,
      isPreset: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(template),
    };
    const collection = createCollection({
      id: 1,
      title: 'Batch run',
      type: 'movie',
      deleteAfterDays: 0,
      overlayTemplateId: null,
    });
    collection.collectionMedia = [
      createCollectionMedia(collection, {
        mediaServerId: 'media-1',
        addDate: new Date('2026-04-01T00:00:00.000Z'),
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'media-2',
        addDate: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ];
    const collectionsService = {
      getCollectionsWithOverlayEnabled: jest
        .fn()
        .mockResolvedValue([collection]),
    };
    const plexApi = {
      isPlexSetup: jest.fn().mockReturnValue(true),
    };
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      plexApi as any,
      collectionsService as any,
      settingsService as any,
      stateService as any,
      {} as any,
      templateService as any,
      eventEmitter as any,
      createMockLogger(),
    );

    jest.spyOn(service, 'applyTemplateOverlay').mockResolvedValue(true);

    const result = await service.processAllCollections();

    expect(result.processed).toBe(2);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.Overlay_Applied,
      expect.objectContaining({
        mediaItems: [
          { mediaServerId: 'media-1' },
          { mediaServerId: 'media-2' },
        ],
        collectionName: 'All Collections',
        identifier: undefined,
      }),
    );
    expect(
      eventEmitter.emit.mock.calls.filter(
        ([eventName]) => eventName === MaintainerrEvent.Overlay_Applied,
      ),
    ).toHaveLength(1);
  });

  it('deduplicates media items in aggregated overlay applied notifications', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getAllStates: jest.fn().mockResolvedValue([]),
      getItemState: jest.fn().mockResolvedValue(null),
    };
    const template: OverlayTemplate = {
      id: 1,
      name: 'Default poster',
      description: '',
      mode: 'poster',
      canvasWidth: 1000,
      canvasHeight: 1500,
      elements: [],
      isDefault: true,
      isPreset: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(template),
    };
    const firstCollection = createCollection({
      id: 1,
      title: 'Batch run A',
      type: 'movie',
      deleteAfterDays: 0,
      overlayTemplateId: null,
    });
    const secondCollection = createCollection({
      id: 2,
      title: 'Batch run B',
      type: 'movie',
      deleteAfterDays: 0,
      overlayTemplateId: null,
    });
    firstCollection.collectionMedia = [
      createCollectionMedia(firstCollection, {
        mediaServerId: 'media-1',
        addDate: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ];
    secondCollection.collectionMedia = [
      createCollectionMedia(secondCollection, {
        mediaServerId: 'media-1',
        addDate: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ];
    const collectionsService = {
      getCollectionsWithOverlayEnabled: jest
        .fn()
        .mockResolvedValue([firstCollection, secondCollection]),
    };
    const plexApi = {
      isPlexSetup: jest.fn().mockReturnValue(true),
    };
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      plexApi as any,
      collectionsService as any,
      settingsService as any,
      stateService as any,
      {} as any,
      templateService as any,
      eventEmitter as any,
      createMockLogger(),
    );

    jest.spyOn(service, 'applyTemplateOverlay').mockResolvedValue(true);

    await service.processAllCollections();

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.Overlay_Applied,
      expect.objectContaining({
        mediaItems: [{ mediaServerId: 'media-1' }],
        collectionName: 'All Collections',
      }),
    );
  });

  it('emits one aggregated overlay reverted notification for reset-all runs', async () => {
    const stateService = {
      getAllStates: jest.fn().mockResolvedValue([
        { collectionId: 1, mediaServerId: 'media-1' },
        { collectionId: 2, mediaServerId: 'media-2' },
      ]),
      clearAllStates: jest.fn().mockResolvedValue(undefined),
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const plexApi = {
      isPlexSetup: jest.fn().mockReturnValue(true),
      setThumb: jest.fn().mockResolvedValue(undefined),
    };
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      plexApi as any,
      { getCollection: jest.fn() } as any,
      {} as any,
      stateService as any,
      {} as any,
      {} as any,
      eventEmitter as any,
      createMockLogger(),
    );

    jest
      .spyOn(service as any, 'loadOriginalPoster')
      .mockReturnValue(Buffer.from('poster'));
    jest
      .spyOn(service as any, 'deleteOriginalPoster')
      .mockImplementation(() => {});

    await service.resetAllOverlays();

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.Overlay_Reverted,
      expect.objectContaining({
        mediaItems: [
          { mediaServerId: 'media-1' },
          { mediaServerId: 'media-2' },
        ],
        collectionName: 'All Collections',
        identifier: undefined,
      }),
    );
    expect(
      eventEmitter.emit.mock.calls.filter(
        ([eventName]) => eventName === MaintainerrEvent.Overlay_Reverted,
      ),
    ).toHaveLength(1);
  });

  it('deduplicates media items in aggregated overlay reverted notifications', async () => {
    const stateService = {
      getAllStates: jest.fn().mockResolvedValue([
        { collectionId: 1, mediaServerId: 'media-1' },
        { collectionId: 2, mediaServerId: 'media-1' },
      ]),
      clearAllStates: jest.fn().mockResolvedValue(undefined),
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const plexApi = {
      isPlexSetup: jest.fn().mockReturnValue(true),
      setThumb: jest.fn().mockResolvedValue(undefined),
    };
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      plexApi as any,
      { getCollection: jest.fn() } as any,
      {} as any,
      stateService as any,
      {} as any,
      {} as any,
      eventEmitter as any,
      createMockLogger(),
    );

    jest
      .spyOn(service as any, 'loadOriginalPoster')
      .mockReturnValue(Buffer.from('poster'));
    jest
      .spyOn(service as any, 'deleteOriginalPoster')
      .mockImplementation(() => {});

    await service.resetAllOverlays();

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.Overlay_Reverted,
      expect.objectContaining({
        mediaItems: [{ mediaServerId: 'media-1' }],
        collectionName: 'All Collections',
      }),
    );
  });
});
