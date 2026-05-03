import { MaintainerrEvent, type OverlayTemplate } from '@maintainerr/contracts';
import {
  createCollection,
  createCollectionMedia,
  createMockLogger,
} from '../../../test/utils/data';
import { OverlayProcessorService } from './overlay-processor.service';

const makeTemplate = (
  overrides: Partial<OverlayTemplate> = {},
): OverlayTemplate => ({
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
  ...overrides,
});

const makeProvider = (overrides: Partial<Record<string, jest.Mock>> = {}) => ({
  isAvailable: jest.fn().mockResolvedValue(true),
  getSections: jest.fn(),
  getRandomItem: jest.fn(),
  getRandomEpisode: jest.fn(),
  downloadImage: jest.fn(),
  uploadImage: jest.fn().mockResolvedValue(undefined),
  itemExists: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const makeProviderFactory = (
  provider: ReturnType<typeof makeProvider> | null,
) => ({
  getProvider: jest.fn().mockResolvedValue(provider),
});

describe('OverlayProcessorService', () => {
  it('processes collections with deleteAfterDays equal to zero', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getItemState: jest.fn().mockResolvedValue(null),
    };
    const template = makeTemplate();
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(template),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);

    const service = new OverlayProcessorService(
      providerFactory as any,
      {} as any,
      settingsService as any,
      stateService as any,
      {} as any,
      templateService as any,
      { emit: jest.fn() } as any,
      createMockLogger(),
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
      provider,
    );
    expect(templateService.resolveForCollection).toHaveBeenCalledWith(
      null,
      'poster',
    );
    expect(result.processed).toBe(1);
  });

  it('resolves a titlecard template when the collection is of type episode', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getItemState: jest.fn().mockResolvedValue(null),
    };
    const template = makeTemplate({ mode: 'titlecard' });
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(template),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);

    const service = new OverlayProcessorService(
      providerFactory as any,
      {} as any,
      settingsService as any,
      stateService as any,
      {} as any,
      templateService as any,
      { emit: jest.fn() } as any,
      createMockLogger(),
    );

    const collection = createCollection({
      id: 1,
      title: 'Episode overlays',
      type: 'episode',
      deleteAfterDays: 7,
      overlayTemplateId: null,
    });
    collection.collectionMedia = [
      createCollectionMedia(collection, {
        mediaServerId: 'ep-1',
        addDate: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ];

    jest.spyOn(service, 'applyTemplateOverlay').mockResolvedValue(true);

    await service.processCollection(collection as any);

    expect(templateService.resolveForCollection).toHaveBeenCalledWith(
      null,
      'titlecard',
    );
    expect(service.applyTemplateOverlay).toHaveBeenCalledWith(
      'ep-1',
      collection.id,
      expect.any(Date),
      template,
      provider,
    );
  });

  it('skips items whose overlay state already matches the current day count during normal runs', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getItemState: jest.fn().mockResolvedValue({ daysLeftShown: 0 }),
    };
    const template = makeTemplate();
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(template),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);

    const service = new OverlayProcessorService(
      providerFactory as any,
      {} as any,
      settingsService as any,
      stateService as any,
      {} as any,
      templateService as any,
      { emit: jest.fn() } as any,
      createMockLogger(),
    );

    const collection = createCollection({
      id: 1,
      title: 'Stable overlay',
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

    expect(service.applyTemplateOverlay).not.toHaveBeenCalled();
    expect(result).toEqual({
      processed: 0,
      reverted: 0,
      skipped: 1,
      errors: 0,
    });
  });

  it('rebuilds items whose overlay state already matches the current day count during forced runs', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getItemState: jest.fn().mockResolvedValue({ daysLeftShown: 0 }),
    };
    const template = makeTemplate();
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(template),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);

    const service = new OverlayProcessorService(
      providerFactory as any,
      {} as any,
      settingsService as any,
      stateService as any,
      {} as any,
      templateService as any,
      { emit: jest.fn() } as any,
      createMockLogger(),
    );

    const collection = createCollection({
      id: 1,
      title: 'Forced overlay',
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

    const result = await service.processCollection(
      collection as any,
      undefined,
      true,
    );

    expect(service.applyTemplateOverlay).toHaveBeenCalledWith(
      'media-1',
      collection.id,
      expect.any(Date),
      template,
      provider,
    );
    expect(result).toEqual({
      processed: 1,
      reverted: 0,
      skipped: 0,
      errors: 0,
    });
  });

  it('blocks concurrent standalone collection runs while one is already in progress', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getItemState: jest.fn().mockResolvedValue(null),
    };
    const template = makeTemplate();
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(template),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);

    const service = new OverlayProcessorService(
      providerFactory as any,
      {} as any,
      settingsService as any,
      stateService as any,
      {} as any,
      templateService as any,
      { emit: jest.fn() } as any,
      createMockLogger(),
    );

    const collection = createCollection({
      id: 1,
      title: 'Exclusive overlay',
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

    jest.spyOn(service, 'applyTemplateOverlay').mockImplementation(async () => {
      expect(service.status).toBe('running');

      await expect(
        service.processCollection(collection as any),
      ).resolves.toEqual({
        processed: 0,
        reverted: 0,
        skipped: 0,
        errors: 0,
      });

      return true;
    });

    await expect(service.processCollection(collection as any)).resolves.toEqual(
      {
        processed: 1,
        reverted: 0,
        skipped: 0,
        errors: 0,
      },
    );

    expect(service.status).toBe('idle');
  });

  it('skips same-day overlay state during normal process-all runs', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getAllStates: jest.fn().mockResolvedValue([]),
      getItemState: jest.fn().mockResolvedValue({ daysLeftShown: 0 }),
    };
    const template = makeTemplate();
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(template),
    };
    const collection = createCollection({
      id: 1,
      title: 'Stable batch',
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
    const collectionsService = {
      getCollectionsWithOverlayEnabled: jest
        .fn()
        .mockResolvedValue([collection]),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
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

    expect(service.applyTemplateOverlay).not.toHaveBeenCalled();
    expect(result).toEqual({
      processed: 0,
      reverted: 0,
      skipped: 1,
      errors: 0,
    });
  });

  it('rebuilds same-day overlay state during forced process-all runs', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getAllStates: jest.fn().mockResolvedValue([]),
      getItemState: jest.fn().mockResolvedValue({ daysLeftShown: 0 }),
    };
    const template = makeTemplate();
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(template),
    };
    const collection = createCollection({
      id: 1,
      title: 'Forced batch',
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
    const collectionsService = {
      getCollectionsWithOverlayEnabled: jest
        .fn()
        .mockResolvedValue([collection]),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
      settingsService as any,
      stateService as any,
      {} as any,
      templateService as any,
      eventEmitter as any,
      createMockLogger(),
    );

    jest.spyOn(service, 'applyTemplateOverlay').mockResolvedValue(true);

    const result = await service.processAllCollections(true);

    expect(service.applyTemplateOverlay).toHaveBeenCalledWith(
      'media-1',
      collection.id,
      expect.any(Date),
      template,
      provider,
    );
    expect(result).toEqual({
      processed: 1,
      reverted: 0,
      skipped: 0,
      errors: 0,
    });
  });

  it('emits one aggregated overlay applied notification for process-all runs', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getAllStates: jest.fn().mockResolvedValue([]),
      getItemState: jest.fn().mockResolvedValue(null),
    };
    const template = makeTemplate();
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
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
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
    const template = makeTemplate();
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
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
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

  it('aborts processAllCollections cleanly when no overlay provider is available', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const providerFactory = makeProviderFactory(null);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      {} as any,
      settingsService as any,
      {} as any,
      {} as any,
      {} as any,
      eventEmitter as any,
      createMockLogger(),
    );

    const result = await service.processAllCollections();

    expect(result).toEqual({
      processed: 0,
      reverted: 0,
      skipped: 0,
      errors: 0,
    });
    expect(service.status).toBe('idle');
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('aborts processAllCollections when the provider reports unavailable', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const provider = makeProvider({
      isAvailable: jest.fn().mockResolvedValue(false),
    });
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      {} as any,
      settingsService as any,
      {} as any,
      {} as any,
      {} as any,
      eventEmitter as any,
      createMockLogger(),
    );

    const result = await service.processAllCollections();

    expect(result.processed).toBe(0);
    expect(service.status).toBe('idle');
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('counts stale-state restore failures as errors and keeps retry state during process-all runs', async () => {
    const epipeError = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
    });
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getAllStates: jest
        .fn()
        .mockResolvedValue([{ collectionId: 42, mediaServerId: 'media-1' }]),
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const collection = createCollection({
      id: 1,
      title: 'Overlay run',
      type: 'movie',
      deleteAfterDays: null,
    });
    collection.collectionMedia = [];
    const collectionsService = {
      getCollectionsWithOverlayEnabled: jest
        .fn()
        .mockResolvedValue([collection]),
    };
    const provider = makeProvider({
      uploadImage: jest.fn().mockRejectedValue(epipeError),
    });
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
      settingsService as any,
      stateService as any,
      {} as any,
      {} as any,
      eventEmitter as any,
      createMockLogger(),
    );

    jest
      .spyOn(service as any, 'loadOriginalPoster')
      .mockReturnValue(Buffer.from('poster'));
    const deleteSpy = jest
      .spyOn(service as any, 'deleteOriginalPoster')
      .mockImplementation(() => {});

    const result = await service.processAllCollections();

    expect(result).toEqual({
      processed: 0,
      reverted: 0,
      skipped: 0,
      errors: 1,
    });
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(stateService.removeState).not.toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.OverlayHandler_Finished,
    );
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.OverlayHandler_Failed,
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
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const collectionsService = {
      getCollection: jest.fn().mockResolvedValue({ type: 'movie' }),
    };
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
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

    expect(stateService.removeState).toHaveBeenNthCalledWith(1, 1, 'media-1');
    expect(stateService.removeState).toHaveBeenNthCalledWith(2, 2, 'media-2');
    expect(stateService.removeState).toHaveBeenCalledTimes(2);

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

  it('keeps overlay state on reset when individual uploads fail so retries are possible', async () => {
    const stateService = {
      getAllStates: jest
        .fn()
        .mockResolvedValue([{ collectionId: 1, mediaServerId: 'media-1' }]),
      clearAllStates: jest.fn().mockResolvedValue(undefined),
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const provider = makeProvider({
      uploadImage: jest.fn().mockRejectedValue(new Error('upload failed')),
    });
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      {} as any,
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
    const deleteSpy = jest
      .spyOn(service as any, 'deleteOriginalPoster')
      .mockImplementation(() => {});

    await service.resetAllOverlays();

    expect(stateService.clearAllStates).not.toHaveBeenCalled();
    expect(stateService.removeState).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.Overlay_Reverted,
      expect.anything(),
    );
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
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const collectionsService = {
      getCollection: jest.fn().mockResolvedValue({ type: 'movie' }),
    };
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
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

  it('emits one aggregated overlay reverted notification for revertCollection', async () => {
    const stateService = {
      getCollectionStates: jest
        .fn()
        .mockResolvedValue([
          { mediaServerId: 'media-1' },
          { mediaServerId: 'media-2' },
        ]),
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };
    const collectionsService = {
      getCollection: jest
        .fn()
        .mockResolvedValue({ type: 'movie', title: 'Target collection' }),
    };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
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

    const count = await service.revertCollection(7);

    expect(count).toBe(2);
    const revertEmits = eventEmitter.emit.mock.calls.filter(
      ([eventName]) => eventName === MaintainerrEvent.Overlay_Reverted,
    );
    expect(revertEmits).toHaveLength(1);
    expect(revertEmits[0][1]).toEqual(
      expect.objectContaining({
        mediaItems: [
          { mediaServerId: 'media-1' },
          { mediaServerId: 'media-2' },
        ],
        collectionName: 'Target collection',
        identifier: { type: 'collection', value: 7 },
      }),
    );
  });

  it('preserves the backup and state when the upload fails during revert', async () => {
    const stateService = {
      getCollectionStates: jest
        .fn()
        .mockResolvedValue([{ mediaServerId: 'media-1' }]),
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const provider = makeProvider({
      uploadImage: jest.fn().mockRejectedValue(new Error('Server unreachable')),
    });
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };
    const collectionsService = {
      getCollection: jest
        .fn()
        .mockResolvedValue({ type: 'movie', title: 'Flaky collection' }),
    };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
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
    const deleteSpy = jest
      .spyOn(service as any, 'deleteOriginalPoster')
      .mockImplementation(() => {});

    await service.revertCollection(42);

    // Backup file must not be deleted on failure — we still need it for retry.
    expect(deleteSpy).not.toHaveBeenCalled();
    // State must not be cleared on failure — next run reattempts the revert.
    expect(stateService.removeState).not.toHaveBeenCalled();
    // No reverted event should be emitted because nothing was actually reverted.
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('drops state and backup without uploading when the item no longer exists on the media server', async () => {
    const stateService = {
      getCollectionStates: jest
        .fn()
        .mockResolvedValue([{ mediaServerId: 'media-1' }]),
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const provider = makeProvider({
      itemExists: jest.fn().mockResolvedValue(false),
    });
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };
    const collectionsService = {
      getCollection: jest.fn().mockResolvedValue({ type: 'movie' }),
    };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
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
    const deleteSpy = jest
      .spyOn(service as any, 'deleteOriginalPoster')
      .mockImplementation(() => {});

    await service.revertCollection(42);

    expect(provider.itemExists).toHaveBeenCalledWith('media-1');
    // Skip the upload — Plex would close the connection mid-stream (EPIPE)
    // for a deleted item.
    expect(provider.uploadImage).not.toHaveBeenCalled();
    // Stale state and the backup are no longer useful — clear them so we
    // don't retry forever and pin a deleted item's bitmap on disk.
    expect(deleteSpy).toHaveBeenCalledWith('media-1');
    expect(stateService.removeState).toHaveBeenCalledWith(42, 'media-1');
    // Quiet cleanup: not surfaced as a revert event.
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.Overlay_Reverted,
      expect.anything(),
    );
  });

  it('treats an existence-check error as inconclusive and falls through to the upload', async () => {
    const stateService = {
      getCollectionStates: jest
        .fn()
        .mockResolvedValue([{ mediaServerId: 'media-1' }]),
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const provider = makeProvider({
      itemExists: jest.fn().mockRejectedValue(new Error('network blip')),
    });
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };
    const collectionsService = {
      getCollection: jest
        .fn()
        .mockResolvedValue({ type: 'movie', title: 'Flaky collection' }),
    };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
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

    await service.revertCollection(42);

    // Inconclusive existence → still attempt the upload so a transient
    // network blip can't drop a backup we'll need on the next run.
    expect(provider.uploadImage).toHaveBeenCalledWith(
      'media-1',
      expect.any(Buffer),
      'image/jpeg',
    );
  });

  it('does not count item-gone reverts as errors during process-all runs', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getAllStates: jest
        .fn()
        .mockResolvedValue([{ collectionId: 42, mediaServerId: 'media-1' }]),
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const collection = createCollection({
      id: 1,
      title: 'Overlay run',
      type: 'movie',
      deleteAfterDays: null,
    });
    collection.collectionMedia = [];
    const collectionsService = {
      getCollectionsWithOverlayEnabled: jest
        .fn()
        .mockResolvedValue([collection]),
    };
    const provider = makeProvider({
      itemExists: jest.fn().mockResolvedValue(false),
    });
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
      settingsService as any,
      stateService as any,
      {} as any,
      {} as any,
      eventEmitter as any,
      createMockLogger(),
    );

    jest
      .spyOn(service as any, 'loadOriginalPoster')
      .mockReturnValue(Buffer.from('poster'));
    const deleteSpy = jest
      .spyOn(service as any, 'deleteOriginalPoster')
      .mockImplementation(() => {});

    const result = await service.processAllCollections();

    expect(result).toEqual({
      processed: 0,
      reverted: 0,
      skipped: 0,
      errors: 0,
    });
    expect(provider.uploadImage).not.toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith('media-1');
    expect(stateService.removeState).toHaveBeenCalledWith(42, 'media-1');
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.Overlay_Reverted,
      expect.anything(),
    );
  });

  it('clears state (but does not delete a non-existent backup) when no backup is saved', async () => {
    const stateService = {
      getCollectionStates: jest
        .fn()
        .mockResolvedValue([{ mediaServerId: 'media-1' }]),
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };
    const collectionsService = {
      getCollection: jest.fn().mockResolvedValue({ type: 'movie' }),
    };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
      {} as any,
      stateService as any,
      {} as any,
      {} as any,
      eventEmitter as any,
      createMockLogger(),
    );

    jest.spyOn(service as any, 'loadOriginalPoster').mockReturnValue(null);
    const deleteSpy = jest
      .spyOn(service as any, 'deleteOriginalPoster')
      .mockImplementation(() => {});

    await service.revertCollection(42);

    // Nothing to restore → upload never called.
    expect(provider.uploadImage).not.toHaveBeenCalled();
    // No backup on disk → nothing to delete.
    expect(deleteSpy).not.toHaveBeenCalled();
    // Clear state so we stop tracking this item.
    expect(stateService.removeState).toHaveBeenCalledWith(42, 'media-1');
  });

  it('emits one aggregated overlay reverted notification for revertMultipleItems', async () => {
    const stateService = {
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };
    const collectionsService = {
      getCollection: jest.fn().mockResolvedValue({ type: 'movie' }),
    };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
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

    await service.revertMultipleItems(
      42,
      [
        { mediaServerId: 'media-1' },
        { mediaServerId: 'media-2' },
        { mediaServerId: 'media-3' },
      ],
      'Batch revert',
    );

    const revertEmits = eventEmitter.emit.mock.calls.filter(
      ([eventName]) => eventName === MaintainerrEvent.Overlay_Reverted,
    );
    expect(revertEmits).toHaveLength(1);
    expect(revertEmits[0][1]).toEqual(
      expect.objectContaining({
        mediaItems: [
          { mediaServerId: 'media-1' },
          { mediaServerId: 'media-2' },
          { mediaServerId: 'media-3' },
        ],
        collectionName: 'Batch revert',
        identifier: { type: 'collection', value: 42 },
      }),
    );
  });

  it('falls back to the collection title when revertMultipleItems receives no name', async () => {
    const stateService = {
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };
    const collectionsService = {
      getCollection: jest
        .fn()
        .mockResolvedValue({ type: 'movie', title: 'Stored title' }),
    };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
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

    await service.revertMultipleItems(42, [{ mediaServerId: 'media-1' }]);

    expect(collectionsService.getCollection).toHaveBeenCalledWith(42);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.Overlay_Reverted,
      expect.objectContaining({
        mediaItems: [{ mediaServerId: 'media-1' }],
        collectionName: 'Stored title',
      }),
    );
  });

  it('does not emit when revertMultipleItems has no successful reverts', async () => {
    const stateService = {
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };
    const collectionsService = {
      getCollection: jest.fn().mockResolvedValue({ type: 'movie' }),
    };

    const service = new OverlayProcessorService(
      providerFactory as any,
      collectionsService as any,
      {} as any,
      stateService as any,
      {} as any,
      {} as any,
      eventEmitter as any,
      createMockLogger(),
    );

    // No original poster stored → revertItemInternal reports no restore
    jest.spyOn(service as any, 'loadOriginalPoster').mockReturnValue(null);
    jest
      .spyOn(service as any, 'deleteOriginalPoster')
      .mockImplementation(() => {});

    await service.revertMultipleItems(
      42,
      [{ mediaServerId: 'media-1' }],
      'Batch',
    );

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
