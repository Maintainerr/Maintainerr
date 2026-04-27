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
        id: 1,
        type: 'movie',
      },
      action: 1,
    });

    expect(
      collectionsService.MediaCollectionActionWithContext,
    ).toHaveBeenCalledWith(
      undefined,
      {
        id: 1,
        type: 'movie',
      },
      { mediaServerId: '10' },
      'remove',
    );
  });

  it('handles a collection item with the configured collection action', async () => {
    const collection = createCollection();
    const media = createCollectionMedia(collection);

    collectionsService.getCollectionRecord.mockResolvedValue(collection);
    collectionsService.getCollectionMediaRecord.mockResolvedValue(media);
    collectionHandler.handleMedia.mockResolvedValue(true);

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
    collectionHandler.handleMedia.mockResolvedValue(false);

    await expect(
      controller.handleCollectionMedia({
        collectionId: collection.id,
        mediaId: media.mediaServerId,
      }),
    ).rejects.toThrow(ConflictException);
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
});
