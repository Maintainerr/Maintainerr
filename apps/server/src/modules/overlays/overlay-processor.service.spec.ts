import {
  MaintainerrEvent,
  ServarrAction,
  type MediaItem,
  type MediaItemType,
  type OverlayTemplate,
  type OverlayTemplateMode,
} from '@maintainerr/contracts';
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
  ...overrides,
});

const makeProviderFactory = (
  provider: ReturnType<typeof makeProvider> | null,
) => ({
  getProvider: jest.fn().mockResolvedValue(provider),
});

// The existence check now lives on IMediaServerService (single source of
// truth), resolved via MediaServerFactory.getService(). Defaults to "present".
const makeMediaServer = (
  overrides: Partial<Record<string, jest.Mock>> = {},
) => ({
  itemExists: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const makeMediaServerFactory = (
  mediaServer: ReturnType<typeof makeMediaServer> = makeMediaServer(),
) => ({
  getService: jest.fn().mockResolvedValue(mediaServer),
});

// The processor loads its own collections now.
const makeCollectionRepos = (collections: any[] = []) => ({
  collectionRepo: {
    find: jest.fn().mockResolvedValue(collections),
    findOne: jest
      .fn()
      .mockImplementation(({ where }) =>
        collections.find((collection) => collection.id === where.id),
      ),
  },
  collectionMediaRepo: {
    find: jest
      .fn()
      .mockImplementation(
        ({ where }) =>
          collections.find((collection) => collection.id === where.collectionId)
            ?.collectionMedia ?? [],
      ),
  },
});

const makeItem = (
  id: string,
  type: MediaItemType,
  overrides: Partial<MediaItem> = {},
): MediaItem => ({ id, type, ...overrides }) as MediaItem;

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
      makeMediaServerFactory() as any,
      {} as any,
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

  it('draws nothing when the collection window cannot name a day', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = { getItemState: jest.fn().mockResolvedValue(null) };
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(makeTemplate()),
    };
    const provider = makeProvider();

    const service = new OverlayProcessorService(
      makeProviderFactory(provider) as any,
      makeMediaServerFactory() as any,
      {} as any,
      {} as any,
      settingsService as any,
      stateService as any,
      {} as any,
      templateService as any,
      { emit: jest.fn() } as any,
      createMockLogger(),
    );

    // Out of Date's range: the sum used to be an Invalid Date, which is truthy,
    // so it reached the artwork as "Leaving Invalid Date" (#3549).
    const collection = createCollection({
      id: 1,
      title: 'Impossible window',
      type: 'movie',
      deleteAfterDays: 999999999,
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
      skipped: 0,
      errors: 0,
    });
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
      makeMediaServerFactory() as any,
      {} as any,
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
      makeMediaServerFactory() as any,
      {} as any,
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
      makeMediaServerFactory() as any,
      {} as any,
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

    const result = await service.processCollection(collection as any, true);

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
      makeMediaServerFactory() as any,
      {} as any,
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
    const collectionRepos = makeCollectionRepos([collection]);
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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
    const collectionRepos = makeCollectionRepos([collection]);
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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
    const collectionRepos = makeCollectionRepos([collection]);
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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
    const collectionRepos = makeCollectionRepos([
      firstCollection,
      secondCollection,
    ]);
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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
      makeMediaServerFactory() as any,
      {} as any,
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
      makeMediaServerFactory() as any,
      {} as any,
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
    const collectionRepos = makeCollectionRepos([collection]);
    const provider = makeProvider({
      uploadImage: jest.fn().mockRejectedValue(epipeError),
    });
    const providerFactory = makeProviderFactory(provider);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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
    const collectionRepos = makeCollectionRepos([{ id: 42, type: 'movie' }]);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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

    jest.spyOn(service as any, 'listBackedUpItemIds').mockReturnValue([]);

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

  it('drops the backup it just took when the render fails, so reset cannot restore it', async () => {
    const provider = makeProvider({
      downloadImage: jest.fn().mockResolvedValue(Buffer.from('poster')),
    });
    const renderService = {
      renderFromTemplate: jest
        .fn()
        .mockRejectedValue(new Error('sharp missing')),
    };

    const service = new OverlayProcessorService(
      makeProviderFactory(provider) as any,
      makeMediaServerFactory() as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      renderService as any,
      {} as any,
      { emit: jest.fn() } as any,
      createMockLogger(),
    );

    jest.spyOn(service as any, 'loadOriginalPoster').mockReturnValue(null);
    const saveOriginal = jest
      .spyOn(service as any, 'saveOriginalPoster')
      .mockResolvedValue('/backup.jpg');
    const deleteOriginal = jest
      .spyOn(service as any, 'deleteOriginalPoster')
      .mockImplementation(() => {});

    const applied = await service.applyTemplateOverlay(
      'media-1',
      1,
      new Date(),
      makeTemplate(),
      provider as any,
    );

    expect(applied).toBe(false);
    expect(saveOriginal).toHaveBeenCalled();
    expect(deleteOriginal).toHaveBeenCalledWith('media-1');
    expect(provider.uploadImage).not.toHaveBeenCalled();
  });

  it('restores a saved original that no state row claims during reset-all', async () => {
    const stateService = {
      getAllStates: jest
        .fn()
        .mockResolvedValue([{ collectionId: 1, mediaServerId: 'media-1' }]),
      removeState: jest.fn().mockResolvedValue(undefined),
    };
    const provider = makeProvider();
    const collectionRepos = makeCollectionRepos([]);

    const service = new OverlayProcessorService(
      makeProviderFactory(provider) as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
      {} as any,
      stateService as any,
      {} as any,
      {} as any,
      { emit: jest.fn() } as any,
      createMockLogger(),
    );

    // media-2 was uploaded but its state write failed: without this, nothing
    // ever takes it off the media server again (#3549).
    jest
      .spyOn(service as any, 'listBackedUpItemIds')
      .mockReturnValue(['media-1', 'media-2']);
    jest
      .spyOn(service as any, 'loadOriginalPoster')
      .mockReturnValue(Buffer.from('poster'));
    jest
      .spyOn(service as any, 'deleteOriginalPoster')
      .mockImplementation(() => {});

    await service.resetAllOverlays();

    expect(provider.uploadImage).toHaveBeenCalledTimes(2);
    expect(provider.uploadImage).toHaveBeenNthCalledWith(
      2,
      'media-2',
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(stateService.removeState).toHaveBeenCalledTimes(1);
    expect(stateService.removeState).toHaveBeenCalledWith(1, 'media-1');
  });

  it('leaves a run alone when reset is asked for while one is in progress', async () => {
    const stateService = { getAllStates: jest.fn() };
    const provider = makeProvider();

    const service = new OverlayProcessorService(
      makeProviderFactory(provider) as any,
      makeMediaServerFactory() as any,
      {} as any,
      {} as any,
      {} as any,
      stateService as any,
      {} as any,
      {} as any,
      { emit: jest.fn() } as any,
      createMockLogger(),
    );

    service.status = 'running';

    await service.resetAllOverlays();

    expect(stateService.getAllStates).not.toHaveBeenCalled();
    expect(service.status).toBe('running');
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
      makeMediaServerFactory() as any,
      {} as any,
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

    jest.spyOn(service as any, 'listBackedUpItemIds').mockReturnValue([]);

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
    const collectionRepos = makeCollectionRepos([{ id: 42, type: 'movie' }]);
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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

    jest.spyOn(service as any, 'listBackedUpItemIds').mockReturnValue([]);

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
    const collectionRepos = makeCollectionRepos([
      { id: 7, type: 'movie', title: 'Target collection' },
    ]);

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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
    const collectionRepos = makeCollectionRepos([
      { id: 42, type: 'movie', title: 'Flaky collection' },
    ]);

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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

    // Backup file must not be deleted on failure - we still need it for retry.
    expect(deleteSpy).not.toHaveBeenCalled();
    // State must not be cleared on failure - next run reattempts the revert.
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
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const mediaServer = makeMediaServer({
      itemExists: jest.fn().mockResolvedValue(false),
    });
    const eventEmitter = { emit: jest.fn() };
    const collectionRepos = makeCollectionRepos([{ id: 42, type: 'movie' }]);

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory(mediaServer) as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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

    expect(mediaServer.itemExists).toHaveBeenCalledWith('media-1');
    // Skip the upload - Plex would close the connection mid-stream (EPIPE)
    // for a deleted item.
    expect(provider.uploadImage).not.toHaveBeenCalled();
    // Stale state and the backup are no longer useful - clear them so we
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
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const mediaServer = makeMediaServer({
      itemExists: jest.fn().mockRejectedValue(new Error('network blip')),
    });
    const eventEmitter = { emit: jest.fn() };
    const collectionRepos = makeCollectionRepos([
      { id: 42, type: 'movie', title: 'Flaky collection' },
    ]);

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory(mediaServer) as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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
    const collectionRepos = makeCollectionRepos([collection]);
    const provider = makeProvider();
    const providerFactory = makeProviderFactory(provider);
    const mediaServer = makeMediaServer({
      itemExists: jest.fn().mockResolvedValue(false),
    });
    const eventEmitter = { emit: jest.fn() };

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory(mediaServer) as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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
    const collectionRepos = makeCollectionRepos([{ id: 42, type: 'movie' }]);

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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
    const collectionRepos = makeCollectionRepos([{ id: 42, type: 'movie' }]);

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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
    const collectionRepos = makeCollectionRepos([
      { id: 42, type: 'movie', title: 'Stored title' },
    ]);

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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

    expect(collectionRepos.collectionRepo.findOne).toHaveBeenCalledWith({
      where: { id: 42 },
    });
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
    const collectionRepos = makeCollectionRepos([{ id: 42, type: 'movie' }]);

    const service = new OverlayProcessorService(
      providerFactory as any,
      makeMediaServerFactory() as any,
      collectionRepos.collectionRepo as any,
      collectionRepos.collectionMediaRepo as any,
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
  describe('overlay inheritance', () => {
    const seasonCollection = (arrAction = ServarrAction.DELETE) => {
      const collection = createCollection({
        id: 1,
        title: 'Leaving seasons',
        type: 'season',
        arrAction,
        deleteAfterDays: 10,
        overlayTemplateId: null,
      });
      collection.collectionMedia = [
        createCollectionMedia(collection, {
          mediaServerId: 'season-1',
          addDate: new Date('2026-04-01T00:00:00.000Z'),
        }),
        createCollectionMedia(collection, {
          mediaServerId: 'season-2',
          addDate: new Date('2026-04-05T00:00:00.000Z'),
        }),
      ];
      return collection;
    };

    // Children keyed by parent id; anything unlisted has none.
    const childrenOf = (tree: Record<string, MediaItem[] | Error>) =>
      jest
        .fn()
        .mockImplementation((parentId: string) =>
          tree[parentId] instanceof Error
            ? Promise.reject(tree[parentId])
            : (tree[parentId] ?? []),
        );

    const buildService = (
      mediaServer: ReturnType<typeof makeMediaServer>,
      overrides: {
        stateService?: Record<string, jest.Mock>;
        collectionRepos?: ReturnType<typeof makeCollectionRepos>;
      } = {},
    ) => {
      const provider = makeProvider();
      const templateService = {
        resolveForCollection: jest
          .fn()
          .mockImplementation((_id: number | null, mode: OverlayTemplateMode) =>
            makeTemplate({ mode }),
          ),
      };
      const service = new OverlayProcessorService(
        makeProviderFactory(provider) as any,
        makeMediaServerFactory(mediaServer) as any,
        (overrides.collectionRepos?.collectionRepo ?? {}) as any,
        (overrides.collectionRepos?.collectionMediaRepo ?? {}) as any,
        { getSettings: jest.fn().mockResolvedValue({ enabled: true }) } as any,
        (overrides.stateService ?? {
          getItemState: jest.fn().mockResolvedValue(null),
        }) as any,
        {} as any,
        templateService as any,
        { emit: jest.fn() } as any,
        createMockLogger(),
      );
      const applySpy = jest
        .spyOn(service, 'applyTemplateOverlay')
        .mockResolvedValue(true);
      return { service, applySpy };
    };

    const drawn = (applySpy: jest.SpyInstance) =>
      applySpy.mock.calls.map((call) => [call[0], call[3]?.mode]);

    const dateFor = (applySpy: jest.SpyInstance, itemId: string) =>
      applySpy.mock.calls.find((call) => call[0] === itemId)?.[2];

    it('draws everything a deleted show takes with it', async () => {
      const collection = createCollection({
        id: 1,
        title: 'Leaving shows',
        type: 'show',
        arrAction: ServarrAction.DELETE,
        deleteAfterDays: 30,
        overlayTemplateId: null,
      });
      collection.collectionMedia = [
        createCollectionMedia(collection, {
          mediaServerId: 'show-1',
          addDate: new Date('2026-04-01T00:00:00.000Z'),
        }),
      ];
      const mediaServer = makeMediaServer({
        getMetadataBatch: jest
          .fn()
          .mockResolvedValue([makeItem('show-1', 'show')]),
        getChildrenMetadata: childrenOf({
          'show-1': [
            makeItem('season-1', 'season', { index: 1 }),
            makeItem('season-2', 'season', { index: 2 }),
          ],
          'season-1': [makeItem('episode-1', 'episode')],
          'season-2': [makeItem('episode-2', 'episode')],
        }),
      });
      const { service, applySpy } = buildService(mediaServer);

      await service.processCollection(collection as any);

      expect(drawn(applySpy)).toEqual([
        ['show-1', 'poster'],
        ['season-1', 'poster'],
        ['episode-1', 'titlecard'],
        ['season-2', 'poster'],
        ['episode-2', 'titlecard'],
      ]);
    });

    it('draws a show once no season of it is left outside, using the last to leave', async () => {
      const collection = seasonCollection();
      collection.collectionMedia.push(
        createCollectionMedia(collection, {
          mediaServerId: 'season-3',
          addDate: new Date('2026-04-01T00:00:00.000Z'),
        }),
      );
      const mediaServer = makeMediaServer({
        getMetadataBatch: jest
          .fn()
          .mockResolvedValue([
            makeItem('season-1', 'season', { parentId: 'show-1', index: 1 }),
            makeItem('season-2', 'season', { parentId: 'show-1', index: 2 }),
            makeItem('season-3', 'season', { parentId: 'show-2', index: 1 }),
          ]),
        getChildrenMetadata: childrenOf({
          'show-1': [
            makeItem('season-1', 'season', { index: 1 }),
            makeItem('season-2', 'season', { index: 2 }),
          ],
          // show-2 keeps season-4, so it is not emptying.
          'show-2': [
            makeItem('season-3', 'season', { index: 1 }),
            makeItem('season-4', 'season', { index: 2 }),
          ],
          'season-1': [makeItem('episode-1', 'episode')],
          'season-2': [makeItem('episode-2', 'episode')],
        }),
      });
      const { service, applySpy } = buildService(mediaServer);

      await service.processCollection(collection as any);

      expect(drawn(applySpy)).toEqual([
        ['season-1', 'poster'],
        ['season-2', 'poster'],
        ['season-3', 'poster'],
        ['episode-1', 'titlecard'],
        ['episode-2', 'titlecard'],
        ['show-1', 'poster'],
      ]);
      expect(dateFor(applySpy, 'show-1')).toEqual(
        dateFor(applySpy, 'season-2'),
      );
    });

    it('leaves the show alone when a Specials season stays behind', async () => {
      const collection = seasonCollection();
      const mediaServer = makeMediaServer({
        getMetadataBatch: jest
          .fn()
          .mockResolvedValue([
            makeItem('season-1', 'season', { parentId: 'show-1', index: 1 }),
            makeItem('season-2', 'season', { parentId: 'show-1', index: 2 }),
          ]),
        getChildrenMetadata: childrenOf({
          'show-1': [
            makeItem('season-0', 'season', { index: 0 }),
            makeItem('season-1', 'season', { index: 1 }),
            makeItem('season-2', 'season', { index: 2 }),
          ],
        }),
      });
      const { service, applySpy } = buildService(mediaServer);

      await service.processCollection(collection as any);

      expect(drawn(applySpy)).toEqual([
        ['season-1', 'poster'],
        ['season-2', 'poster'],
      ]);
    });

    it('walks emptied episodes up to their season and its show', async () => {
      const collection = createCollection({
        id: 1,
        title: 'Leaving episodes',
        type: 'episode',
        arrAction: ServarrAction.DELETE,
        deleteAfterDays: 5,
        overlayTemplateId: null,
      });
      collection.collectionMedia = [
        createCollectionMedia(collection, {
          mediaServerId: 'episode-1',
          addDate: new Date('2026-04-01T00:00:00.000Z'),
        }),
        createCollectionMedia(collection, {
          mediaServerId: 'episode-2',
          addDate: new Date('2026-04-01T00:00:00.000Z'),
        }),
      ];
      const parents = { parentId: 'season-1', grandparentId: 'show-1' };
      const mediaServer = makeMediaServer({
        getMetadataBatch: jest
          .fn()
          .mockResolvedValue([
            makeItem('episode-1', 'episode', parents),
            makeItem('episode-2', 'episode', parents),
          ]),
        getChildrenMetadata: childrenOf({
          'season-1': [
            makeItem('episode-1', 'episode'),
            makeItem('episode-2', 'episode'),
          ],
          'show-1': [makeItem('season-1', 'season', { index: 1 })],
        }),
      });
      const { service, applySpy } = buildService(mediaServer);

      await service.processCollection(collection as any);

      expect(drawn(applySpy)).toEqual([
        ['episode-1', 'titlecard'],
        ['episode-2', 'titlecard'],
        ['season-1', 'poster'],
        ['show-1', 'poster'],
      ]);
    });

    it('recovers the season through the show when episodes carry no season link (issue #3534)', async () => {
      const collection = createCollection({
        id: 1,
        title: 'Leaving episodes',
        type: 'episode',
        arrAction: ServarrAction.DELETE,
        deleteAfterDays: 5,
        overlayTemplateId: null,
      });
      collection.collectionMedia = [
        createCollectionMedia(collection, {
          mediaServerId: 'episode-1',
          addDate: new Date('2026-04-01T00:00:00.000Z'),
        }),
        createCollectionMedia(collection, {
          mediaServerId: 'episode-2',
          addDate: new Date('2026-04-01T00:00:00.000Z'),
        }),
      ];
      // Plex "Seasons: Hide" strips parentId from episodes; the show id and
      // the season number remain.
      const parents = { grandparentId: 'show-1', parentIndex: 1 };
      const mediaServer = makeMediaServer({
        getMetadataBatch: jest
          .fn()
          .mockResolvedValue([
            makeItem('episode-1', 'episode', parents),
            makeItem('episode-2', 'episode', parents),
          ]),
        getChildrenMetadata: childrenOf({
          'season-1': [
            makeItem('episode-1', 'episode'),
            makeItem('episode-2', 'episode'),
          ],
          'show-1': [makeItem('season-1', 'season', { index: 1 })],
        }),
      });
      const { service, applySpy } = buildService(mediaServer);

      await service.processCollection(collection as any);

      expect(drawn(applySpy)).toEqual([
        ['episode-1', 'titlecard'],
        ['episode-2', 'titlecard'],
        ['season-1', 'poster'],
        ['show-1', 'poster'],
      ]);
    });

    it('draws nothing for an action that keeps the files, and reverts what it drew before', async () => {
      const collection = seasonCollection(ServarrAction.UNMONITOR);
      const stateService = {
        getItemState: jest.fn().mockResolvedValue(null),
        // A member and an inherited parent, both drawn while the collection
        // still deleted.
        getAllStates: jest.fn().mockResolvedValue([
          { collectionId: 1, mediaServerId: 'season-1' },
          { collectionId: 1, mediaServerId: 'show-1' },
        ]),
        removeState: jest.fn().mockResolvedValue(undefined),
      };
      const getMetadataBatch = jest.fn();
      const mediaServer = makeMediaServer({ getMetadataBatch });
      const { service, applySpy } = buildService(mediaServer, {
        stateService,
        collectionRepos: makeCollectionRepos([collection]),
      });
      jest
        .spyOn(service as any, 'loadOriginalPoster')
        .mockReturnValue(Buffer.from('poster'));
      jest
        .spyOn(service as any, 'deleteOriginalPoster')
        .mockImplementation(() => {});

      const result = await service.processAllCollections();

      expect(getMetadataBatch).not.toHaveBeenCalled();
      expect(applySpy).not.toHaveBeenCalled();
      expect(stateService.removeState).toHaveBeenCalledWith(1, 'season-1');
      expect(stateService.removeState).toHaveBeenCalledWith(1, 'show-1');
      expect(result.reverted).toBe(2);
    });

    it('draws nothing when a single collection is processed on its own', async () => {
      const collection = seasonCollection(ServarrAction.DO_NOTHING);
      const mediaServer = makeMediaServer({ getMetadataBatch: jest.fn() });
      const { service, applySpy } = buildService(mediaServer);

      await service.processCollection(collection as any);

      expect(applySpy).not.toHaveBeenCalled();
    });

    it('leaves a show that is itself in an overlay collection to its own countdown', async () => {
      const seasons = seasonCollection();
      const shows = createCollection({
        id: 2,
        title: 'Leaving shows',
        type: 'show',
        arrAction: ServarrAction.DELETE,
        deleteAfterDays: 30,
        overlayTemplateId: null,
      });
      shows.collectionMedia = [
        createCollectionMedia(shows, {
          mediaServerId: 'show-1',
          addDate: new Date('2026-04-01T00:00:00.000Z'),
        }),
      ];
      // Both collections read presence now, so answer per id.
      const items: Record<string, MediaItem> = {
        'season-1': makeItem('season-1', 'season', {
          parentId: 'show-1',
          index: 1,
        }),
        'season-2': makeItem('season-2', 'season', {
          parentId: 'show-1',
          index: 2,
        }),
        'show-1': makeItem('show-1', 'show'),
      };
      const mediaServer = makeMediaServer({
        getMetadataBatch: jest
          .fn()
          .mockImplementation((ids: string[]) =>
            ids.map((id) => items[id]).filter(Boolean),
          ),
        getChildrenMetadata: childrenOf({
          'show-1': [
            makeItem('season-1', 'season', { index: 1 }),
            makeItem('season-2', 'season', { index: 2 }),
          ],
        }),
      });
      const { service, applySpy } = buildService(mediaServer, {
        stateService: {
          getItemState: jest.fn().mockResolvedValue(null),
          getAllStates: jest.fn().mockResolvedValue([]),
        },
        collectionRepos: makeCollectionRepos([seasons, shows]),
      });

      await service.processAllCollections();

      // itemId + collectionId: the show is drawn once, by its own collection.
      expect(applySpy.mock.calls.map((call) => [call[0], call[1]])).toEqual([
        ['season-1', 1],
        ['season-2', 1],
        ['show-1', 2],
      ]);
    });

    it('keeps drawing what it can read when one branch of the walk fails', async () => {
      const collection = seasonCollection();
      collection.collectionMedia.push(
        createCollectionMedia(collection, {
          mediaServerId: 'season-3',
          addDate: new Date('2026-04-01T00:00:00.000Z'),
        }),
      );
      const stateService = {
        getItemState: jest.fn().mockResolvedValue(null),
        // show-2 was drawn on a previous run; its hierarchy is unreadable now.
        getAllStates: jest
          .fn()
          .mockResolvedValue([{ collectionId: 1, mediaServerId: 'show-2' }]),
        getCollectionStates: jest
          .fn()
          .mockResolvedValue([{ collectionId: 1, mediaServerId: 'show-2' }]),
        removeState: jest.fn().mockResolvedValue(undefined),
      };
      const mediaServer = makeMediaServer({
        getMetadataBatch: jest
          .fn()
          .mockResolvedValue([
            makeItem('season-1', 'season', { parentId: 'show-1', index: 1 }),
            makeItem('season-2', 'season', { parentId: 'show-1', index: 2 }),
            makeItem('season-3', 'season', { parentId: 'show-2', index: 1 }),
          ]),
        getChildrenMetadata: childrenOf({
          'show-1': [
            makeItem('season-1', 'season', { index: 1 }),
            makeItem('season-2', 'season', { index: 2 }),
          ],
          'show-2': new Error('media server unreachable'),
        }),
      });
      const { service, applySpy } = buildService(mediaServer, {
        stateService,
        collectionRepos: makeCollectionRepos([collection]),
      });

      const result = await service.processAllCollections();

      expect(applySpy.mock.calls.map((call) => call[0])).toEqual([
        'season-1',
        'season-2',
        'season-3',
        'show-1',
      ]);
      expect(stateService.removeState).not.toHaveBeenCalled();
      expect(result.reverted).toBe(0);
    });
  });
});
