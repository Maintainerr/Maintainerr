import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import {
  createCollection,
  createCollectionMedia,
} from '../../../test/utils/data';
import { MaintainerrLogger } from '../logging/logs.service';
import { RuleExecutorJobManagerService } from '../rules/tasks/rule-executor-job-manager.service';
import {
  ExecutionLockService,
  RULES_COLLECTIONS_EXECUTION_LOCK_KEY,
} from '../tasks/execution-lock.service';
import { CollectionHandler } from './collection-handler';
import { CollectionWorkerService } from './collection-worker.service';
import {
  addToCollectionBodySchema,
  collectionBodySchema,
  CollectionsController,
  createCollectionBodySchema,
  manualCollectionActionBodySchema,
  removeCollectionBodySchema,
  removeFromCollectionBodySchema,
  updateScheduleBodySchema,
} from './collections.controller';
import {
  CollectionPosterService,
  InvalidCollectionPosterError,
} from './collection-poster.service';
import { CollectionsService } from './collections.service';

describe('CollectionsController', () => {
  let controller: CollectionsController;

  const collectionsService = {
    getCollectionRecord: jest.fn(),
    getCollectionMediaRecord: jest.fn(),
    MediaCollectionActionWithContext: jest.fn(),
    postponeCollectionMedia: jest.fn(),
  } as unknown as jest.Mocked<CollectionsService>;

  const collectionWorkerService = {
    isRunning: jest.fn(),
    execute: jest.fn(),
  } as unknown as jest.Mocked<CollectionWorkerService>;

  const ruleExecutorJobManagerService = {
    isProcessing: jest.fn(),
  } as unknown as jest.Mocked<RuleExecutorJobManagerService>;

  const executionLock = {
    tryAcquire: jest.fn(),
  } as unknown as jest.Mocked<ExecutionLockService>;

  const collectionHandler = {
    handleMedia: jest.fn(),
  } as unknown as jest.Mocked<CollectionHandler>;

  const collectionPosterService = {
    loadStoredPoster: jest.fn(),
    storePoster: jest.fn(),
    removeStoredPoster: jest.fn(),
    pushToMediaServer: jest.fn(),
    refreshCollectionOnMediaServer: jest.fn(),
  } as unknown as jest.Mocked<CollectionPosterService>;

  const logger = {
    setContext: jest.fn(),
  } as unknown as jest.Mocked<MaintainerrLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CollectionsController(
      collectionsService,
      collectionWorkerService,
      ruleExecutorJobManagerService,
      executionLock,
      collectionHandler,
      collectionPosterService,
      logger,
    );

    collectionWorkerService.isRunning.mockReturnValue(false);
    ruleExecutorJobManagerService.isProcessing.mockReturnValue(false);
    executionLock.tryAcquire.mockReturnValue(jest.fn());
    collectionPosterService.pushToMediaServer.mockResolvedValue({
      attempted: true,
      pushed: true,
    });
    collectionPosterService.refreshCollectionOnMediaServer.mockResolvedValue({
      requested: true,
    });
  });

  it('validates the item action request body with Zod', () => {
    const pipe = new ZodValidationPipe(
      z.object({
        collectionId: z.number().int(),
        mediaId: z.string().min(1),
      }),
    );

    expect(() =>
      pipe.transform(
        {
          collectionId: '7',
          mediaId: '',
        },
        {
          type: 'body',
          metatype: Object,
          data: '',
        },
      ),
    ).toThrow('Validation failed');
  });

  it.each([
    [
      'create collection body',
      createCollectionBodySchema,
      {
        collection: {
          ...createCollection(),
          title: '',
        },
      },
    ],
    [
      'add to collection body',
      addToCollectionBodySchema,
      {
        collectionId: 'not-a-number',
        media: [{ mediaServerId: '123' }],
      },
    ],
    [
      'remove from collection body',
      removeFromCollectionBodySchema,
      {
        collectionId: 7,
        media: [{ mediaServerId: '' }],
      },
    ],
    [
      'remove collection body',
      removeCollectionBodySchema,
      {
        collectionId: 'not-a-number',
      },
    ],
    [
      'update collection body',
      collectionBodySchema,
      {
        ...createCollection(),
        title: '',
      },
    ],
    [
      'update schedule body',
      updateScheduleBodySchema,
      {
        schedule: '',
      },
    ],
    [
      'manual collection action body',
      manualCollectionActionBodySchema,
      {
        collectionId: 1,
        mediaId: '10',
        context: {
          id: 1,
          type: 'movie',
        },
        action: 2,
      },
    ],
    [
      'manual collection add action without collectionId',
      manualCollectionActionBodySchema,
      {
        mediaId: '10',
        context: {
          id: 1,
          type: 'movie',
        },
        action: 0,
      },
    ],
    [
      'manual collection action body with an empty context id',
      manualCollectionActionBodySchema,
      {
        collectionId: 1,
        mediaId: '10',
        context: {
          id: '',
          type: 'season',
        },
        action: 0,
      },
    ],
  ])('rejects invalid %s payloads', (_name, schema, payload) => {
    const pipe = new ZodValidationPipe(schema);

    expect(() =>
      pipe.transform(payload, {
        type: 'body',
        metatype: Object,
        data: '',
      }),
    ).toThrow('Validation failed');
  });

  it('allows manual removal actions without a collection id', async () => {
    collectionsService.MediaCollectionActionWithContext.mockResolvedValue(
      createCollection(),
    );

    await controller.ManualActionOnCollection({
      mediaId: '10',
      context: {
        id: '1',
        type: 'movie',
      },
      action: 1,
    });

    expect(
      collectionsService.MediaCollectionActionWithContext,
    ).toHaveBeenCalledWith(
      undefined,
      {
        id: '1',
        type: 'movie',
      },
      { mediaServerId: '10' },
      'remove',
    );
  });

  it('accepts a hex-GUID context.id for manual season/episode actions (Jellyfin/Emby, #3185)', () => {
    const pipe = new ZodValidationPipe(manualCollectionActionBodySchema);

    // Jellyfin/Emby item ids are 32-char hex GUIDs, not numeric Plex
    // ratingKeys. Coercing them to a number yields NaN, which previously
    // failed validation and 400'd the manual add/remove request.
    const seasonAction = pipe.transform(
      {
        mediaId: '1815bdf1952bd0c75d37a59662895df8',
        action: 0,
        collectionId: 7,
        context: { id: 'cdc55c8c59d63f58697e499aeb6ca210', type: 'season' },
      },
      { type: 'body', metatype: Object, data: '' },
    );
    expect(seasonAction.context.id).toBe('cdc55c8c59d63f58697e499aeb6ca210');

    // Numeric Plex ratingKeys continue to validate unchanged.
    const movieAction = pipe.transform(
      {
        mediaId: '10',
        action: 1,
        context: { id: 12345, type: 'movie' },
      },
      { type: 'body', metatype: Object, data: '' },
    );
    expect(Number(movieAction.context.id)).toBe(12345);
  });

  it('handles a collection item with the configured collection action', async () => {
    const collection = createCollection();
    const media = createCollectionMedia(collection);

    collectionsService.getCollectionRecord.mockResolvedValue(collection);
    collectionsService.getCollectionMediaRecord.mockResolvedValue(media);
    collectionHandler.handleMedia.mockResolvedValue('handled');

    await expect(
      controller.handleCollectionMedia({
        collectionId: collection.id,
        mediaId: media.mediaServerId,
      }),
    ).resolves.toBeUndefined();

    expect(collectionsService.getCollectionRecord).toHaveBeenCalledWith(
      collection.id,
    );
    expect(collectionsService.getCollectionMediaRecord).toHaveBeenCalledWith(
      collection.id,
      media.mediaServerId,
    );
    expect(collectionHandler.handleMedia).toHaveBeenCalledWith(
      collection,
      media,
    );
    expect(executionLock.tryAcquire).toHaveBeenCalledWith(
      RULES_COLLECTIONS_EXECUTION_LOCK_KEY,
    );
  });

  it('rejects item handling when the shared execution lock is already held', async () => {
    const collection = createCollection();
    const media = createCollectionMedia(collection);

    collectionsService.getCollectionRecord.mockResolvedValue(collection);
    collectionsService.getCollectionMediaRecord.mockResolvedValue(media);
    executionLock.tryAcquire.mockReturnValue(null);

    await expect(
      controller.handleCollectionMedia({
        collectionId: collection.id,
        mediaId: media.mediaServerId,
      }),
    ).rejects.toThrow(ConflictException);

    expect(collectionHandler.handleMedia).not.toHaveBeenCalled();
  });

  it('rejects item handling while the collection worker is running', async () => {
    collectionWorkerService.isRunning.mockReturnValue(true);

    await expect(
      controller.handleCollectionMedia({
        collectionId: 42,
        mediaId: 'media-1',
      }),
    ).rejects.toThrow(ConflictException);

    expect(collectionsService.getCollectionRecord).not.toHaveBeenCalled();
  });

  it('rejects item handling while the rule executor is running', async () => {
    ruleExecutorJobManagerService.isProcessing.mockReturnValue(true);

    await expect(
      controller.handleCollectionMedia({
        collectionId: 42,
        mediaId: 'media-1',
      }),
    ).rejects.toThrow(ConflictException);

    expect(collectionsService.getCollectionRecord).not.toHaveBeenCalled();
  });

  it('throws when the collection does not exist', async () => {
    collectionsService.getCollectionRecord.mockResolvedValue(undefined);

    await expect(
      controller.handleCollectionMedia({
        collectionId: 42,
        mediaId: 'media-1',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(collectionHandler.handleMedia).not.toHaveBeenCalled();
  });

  it('throws when the media is not in the collection', async () => {
    const collection = createCollection();

    collectionsService.getCollectionRecord.mockResolvedValue(collection);
    collectionsService.getCollectionMediaRecord.mockResolvedValue(undefined);

    await expect(
      controller.handleCollectionMedia({
        collectionId: collection.id,
        mediaId: 'missing-media',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(collectionHandler.handleMedia).not.toHaveBeenCalled();
  });

  it('throws when the collection action cannot be executed', async () => {
    const collection = createCollection();
    const media = createCollectionMedia(collection);

    collectionsService.getCollectionRecord.mockResolvedValue(collection);
    collectionsService.getCollectionMediaRecord.mockResolvedValue(media);
    collectionHandler.handleMedia.mockResolvedValue('failed');

    await expect(
      controller.handleCollectionMedia({
        collectionId: collection.id,
        mediaId: media.mediaServerId,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('does not throw when the item was pruned because it no longer exists', async () => {
    const collection = createCollection();
    const media = createCollectionMedia(collection);

    collectionsService.getCollectionRecord.mockResolvedValue(collection);
    collectionsService.getCollectionMediaRecord.mockResolvedValue(media);
    collectionHandler.handleMedia.mockResolvedValue('removed-missing');

    await expect(
      controller.handleCollectionMedia({
        collectionId: collection.id,
        mediaId: media.mediaServerId,
      }),
    ).resolves.not.toThrow();
  });

  describe('postponeCollectionMedia', () => {
    const body = { collectionId: 3, mediaId: '5', days: 14 };

    it('postpones under the execution lock and returns the result', async () => {
      const release = jest.fn();
      executionLock.tryAcquire.mockReturnValue(release);
      const result = {
        collectionId: 3,
        mediaServerId: '5',
        addDate: new Date(2026, 6, 8),
        deleteAfterDays: 30,
        deletionDate: new Date(2026, 7, 7),
      };
      (
        collectionsService.postponeCollectionMedia as jest.Mock
      ).mockResolvedValue(result);

      await expect(controller.postponeCollectionMedia(body)).resolves.toBe(
        result,
      );
      expect(collectionsService.postponeCollectionMedia).toHaveBeenCalledWith(
        3,
        '5',
        14,
      );
      expect(release).toHaveBeenCalled();
    });

    it('throws ConflictException when the execution lock is held', async () => {
      executionLock.tryAcquire.mockReturnValue(null);

      await expect(controller.postponeCollectionMedia(body)).rejects.toThrow(
        ConflictException,
      );
      expect(collectionsService.postponeCollectionMedia).not.toHaveBeenCalled();
    });

    it('throws NotFoundException and releases the lock when the item is missing', async () => {
      const release = jest.fn();
      executionLock.tryAcquire.mockReturnValue(release);
      (
        collectionsService.postponeCollectionMedia as jest.Mock
      ).mockResolvedValue(undefined);

      await expect(controller.postponeCollectionMedia(body)).rejects.toThrow(
        NotFoundException,
      );
      expect(release).toHaveBeenCalled();
    });
  });

  describe('uploadCollectionPoster', () => {
    it('returns the poster push status details', async () => {
      const collection = createCollection();
      const file = {
        originalname: 'poster.png',
        buffer: Buffer.from('image-bytes'),
      };

      collectionsService.getCollectionRecord.mockResolvedValue(collection);
      collectionPosterService.storePoster.mockResolvedValue({
        buffer: Buffer.from('jpeg-bytes'),
        contentType: 'image/jpeg',
      });
      collectionPosterService.pushToMediaServer.mockResolvedValue({
        attempted: false,
        pushed: false,
      });

      await expect(
        controller.uploadCollectionPoster(collection.id, file),
      ).resolves.toEqual({
        pushed: false,
        attempted: false,
      });
    });

    it('maps invalid images to BadRequestException', async () => {
      const collection = createCollection();
      const file = {
        originalname: 'poster.png',
        buffer: Buffer.from('image-bytes'),
      };

      collectionsService.getCollectionRecord.mockResolvedValue(collection);
      collectionPosterService.storePoster.mockRejectedValueOnce(
        new InvalidCollectionPosterError('Uploaded file is not a valid image'),
      );

      await expect(
        controller.uploadCollectionPoster(collection.id, file),
      ).rejects.toThrow(BadRequestException);
    });

    it('preserves storage failures as server errors', async () => {
      const collection = createCollection();
      const file = {
        originalname: 'poster.png',
        buffer: Buffer.from('image-bytes'),
      };

      collectionsService.getCollectionRecord.mockResolvedValue(collection);
      collectionPosterService.storePoster.mockRejectedValueOnce(
        new Error('disk full'),
      );

      await expect(
        controller.uploadCollectionPoster(collection.id, file),
      ).rejects.toThrow('disk full');
    });
  });

  describe('deleteCollectionPoster', () => {
    it('removes the stored poster and asks the media server to refresh metadata', async () => {
      const collection = createCollection({ mediaServerId: 'remote-id' });
      collectionsService.getCollectionRecord.mockResolvedValue(collection);

      await expect(
        controller.deleteCollectionPoster(collection.id),
      ).resolves.toEqual({ cleared: true, refreshRequested: true });

      expect(collectionPosterService.removeStoredPoster).toHaveBeenCalledWith(
        collection.id,
      );
      expect(
        collectionPosterService.refreshCollectionOnMediaServer,
      ).toHaveBeenCalledWith('remote-id');
    });

    it('reports refreshRequested=false when the media server refresh fails', async () => {
      const collection = createCollection({ mediaServerId: 'remote-id' });
      collectionsService.getCollectionRecord.mockResolvedValue(collection);
      collectionPosterService.refreshCollectionOnMediaServer.mockResolvedValueOnce(
        { requested: false },
      );

      await expect(
        controller.deleteCollectionPoster(collection.id),
      ).resolves.toEqual({ cleared: true, refreshRequested: false });
    });
  });
});
