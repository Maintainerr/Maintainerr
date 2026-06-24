import {
  MaintainerrEvent,
  MediaCollection,
  MediaServerFeature,
  MediaServerType,
} from '@maintainerr/contracts';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Mocked, TestBed } from '@suites/unit';
import { DataSource, FindOperator, Repository } from 'typeorm';
import {
  createCollection,
  createCollectionMedia,
  createMediaItem,
} from '../../../test/utils/data';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { MetadataService } from '../metadata/metadata.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { SettingsDataService } from '../settings/settings-data.service';
import { CollectionPosterService } from './collection-poster.service';
import { CollectionsService } from './collections.service';
import { Collection } from './entities/collection.entities';
import { CollectionLog } from './entities/collection_log.entities';
import {
  CollectionMedia,
  CollectionMediaManualMembershipSource,
} from './entities/collection_media.entities';

describe('CollectionsService', () => {
  let service: CollectionsService;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mediaServer: Mocked<IMediaServerService>;
  let dataSource: Mocked<DataSource>;
  let collectionRepo: Mocked<Repository<Collection>>;
  let collectionMediaRepo: Mocked<Repository<CollectionMedia>>;
  let ruleGroupRepo: Mocked<Repository<RuleGroup>>;
  let exclusionRepo: Mocked<Repository<Exclusion>>;
  let collectionLogRepo: Mocked<Repository<CollectionLog>>;
  let metadataService: Mocked<MetadataService>;
  let settingsDataService: Mocked<SettingsDataService>;
  let collectionPosterService: Mocked<CollectionPosterService>;
  let eventEmitter: Mocked<EventEmitter2>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(CollectionsService).compile();

    service = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    dataSource = unitRef.get(DataSource);
    collectionRepo = unitRef.get(getRepositoryToken(Collection) as string);
    collectionMediaRepo = unitRef.get(
      getRepositoryToken(CollectionMedia) as string,
    );
    ruleGroupRepo = unitRef.get(getRepositoryToken(RuleGroup) as string);
    exclusionRepo = unitRef.get(getRepositoryToken(Exclusion) as string);
    collectionLogRepo = unitRef.get(getRepositoryToken(CollectionLog) as string);
    metadataService = unitRef.get(MetadataService);
    settingsDataService = unitRef.get(SettingsDataService);
    collectionPosterService = unitRef.get(CollectionPosterService);
    eventEmitter = unitRef.get(EventEmitter2);
    metadataService.resolveIds.mockResolvedValue({
      tmdb: 1,
      type: 'movie',
    } as any);
    metadataService.getDetails.mockResolvedValue({
      externalIds: { tmdb: 1 },
      posterUrl: undefined,
    } as any);

    mediaServer = {
      supportsFeature: jest.fn().mockReturnValue(false),
      createCollection: jest
        .fn()
        .mockResolvedValue({ id: 'remote-collection' }),
      addBatchToCollection: jest.fn().mockResolvedValue([]),
      removeBatchFromCollection: jest.fn().mockResolvedValue([]),
      getCollection: jest.fn().mockResolvedValue(undefined),
      getCollectionChildren: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn().mockResolvedValue(undefined),
      itemExists: jest.fn().mockResolvedValue(true),
      removeFromCollection: jest.fn().mockResolvedValue(undefined),
      deleteCollection: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<IMediaServerService>;

    collectionMediaRepo.create.mockImplementation((entityLike) =>
      Object.assign(new CollectionMedia(), entityLike),
    );

    mediaServerFactory.getService.mockResolvedValue(mediaServer);
    mediaServerFactory.getConfiguredServerType.mockResolvedValue(
      MediaServerType.PLEX,
    );
    settingsDataService.media_server_type = MediaServerType.PLEX;
    jest
      .spyOn(service, 'updateCollectionTotalSize')
      .mockResolvedValue(undefined);
  });

  describe('removeMediaFromOtherCollections', () => {
    it('prunes the item from sibling collections, deduped and excluding the source', async () => {
      collectionMediaRepo.find.mockResolvedValue([
        { collectionId: 1, mediaServerId: 'item-1' },
        { collectionId: 2, mediaServerId: 'item-1' },
        { collectionId: 2, mediaServerId: 'item-1' },
        { collectionId: 3, mediaServerId: 'item-1' },
      ] as CollectionMedia[]);
      collectionRepo.find.mockResolvedValue([
        createCollection({ id: 2, mediaServerId: 'remote-collection-2' }),
        createCollection({ id: 3, mediaServerId: 'remote-collection-3' }),
      ] as Collection[]);

      const removeSpy = jest
        .spyOn(service as never, 'removeFromCollectionInternal')
        .mockResolvedValue(createCollection() as never);

      const pruned = await service.removeMediaFromOtherCollections('item-1', 1);

      expect(collectionMediaRepo.find).toHaveBeenCalledWith({
        where: { mediaServerId: 'item-1' },
      });
      expect(collectionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: expect.anything(),
          }),
        }),
      );
      // Collection 1 is the source (excluded); 2 (deduped to one call) and 3
      // are the siblings that still listed the now-deleted item.
      expect(mediaServer.removeBatchFromCollection).toHaveBeenCalledTimes(2);
      expect(mediaServer.removeBatchFromCollection).toHaveBeenCalledWith(
        'remote-collection-2',
        ['item-1'],
      );
      expect(mediaServer.removeBatchFromCollection).toHaveBeenCalledWith(
        'remote-collection-3',
        ['item-1'],
      );
      expect(removeSpy).toHaveBeenCalledTimes(2);
      expect(removeSpy).toHaveBeenCalledWith(
        2,
        [{ mediaServerId: 'item-1' }],
        false,
        'all',
        true,
      );
      expect(removeSpy).toHaveBeenCalledWith(
        3,
        [{ mediaServerId: 'item-1' }],
        false,
        'all',
        true,
      );
      // Returns the pruned sibling ids so the caller can suppress re-adds.
      expect(pruned).toEqual([2, 3]);
    });

    it('removes a shared media-server collection only once before pruning each local sibling', async () => {
      collectionMediaRepo.find.mockResolvedValue([
        { collectionId: 1, mediaServerId: 'item-1' },
        { collectionId: 2, mediaServerId: 'item-1' },
        { collectionId: 3, mediaServerId: 'item-1' },
      ] as CollectionMedia[]);
      collectionRepo.find.mockResolvedValue([
        createCollection({ id: 2, mediaServerId: 'shared-remote-collection' }),
        createCollection({ id: 3, mediaServerId: 'shared-remote-collection' }),
      ] as Collection[]);

      const removeSpy = jest
        .spyOn(service as never, 'removeFromCollectionInternal')
        .mockResolvedValue(createCollection() as never);

      const pruned = await service.removeMediaFromOtherCollections('item-1', 1);

      expect(mediaServer.removeBatchFromCollection).toHaveBeenCalledTimes(1);
      expect(mediaServer.removeBatchFromCollection).toHaveBeenCalledWith(
        'shared-remote-collection',
        ['item-1'],
      );
      expect(removeSpy).toHaveBeenCalledTimes(2);
      expect(pruned).toEqual([2, 3]);
    });

    it('skips local pruning when the shared media-server removal fails', async () => {
      collectionMediaRepo.find.mockResolvedValue([
        { collectionId: 1, mediaServerId: 'item-1' },
        { collectionId: 2, mediaServerId: 'item-1' },
        { collectionId: 3, mediaServerId: 'item-1' },
      ] as CollectionMedia[]);
      collectionRepo.find.mockResolvedValue([
        createCollection({ id: 2, mediaServerId: 'shared-remote-collection' }),
        createCollection({ id: 3, mediaServerId: 'shared-remote-collection' }),
      ] as Collection[]);
      mediaServer.removeBatchFromCollection.mockResolvedValue(['item-1']);

      const removeSpy = jest
        .spyOn(service as never, 'removeFromCollectionInternal')
        .mockResolvedValue(createCollection() as never);

      await expect(
        service.removeMediaFromOtherCollections('item-1', 1),
      ).resolves.toEqual([]);

      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('does nothing when no other collection lists the item', async () => {
      collectionMediaRepo.find.mockResolvedValue([
        { collectionId: 1, mediaServerId: 'item-1' },
      ] as CollectionMedia[]);

      const removeSpy = jest
        .spyOn(service as never, 'removeFromCollectionInternal')
        .mockResolvedValue(createCollection() as never);

      await expect(
        service.removeMediaFromOtherCollections('item-1', 1),
      ).resolves.toEqual([]);

      expect(removeSpy).not.toHaveBeenCalled();
      expect(collectionRepo.find).not.toHaveBeenCalled();
    });
  });

  it('persists overlay settings when creating a collection', async () => {
    const queryBuilder = {
      insert: jest.fn(),
      into: jest.fn(),
      values: jest.fn(),
      execute: jest.fn().mockResolvedValue({ generatedMaps: [{ id: 42 }] }),
    };

    queryBuilder.insert.mockReturnValue(queryBuilder);
    queryBuilder.into.mockReturnValue(queryBuilder);
    queryBuilder.values.mockReturnValue(queryBuilder);
    dataSource.createQueryBuilder.mockReturnValue(queryBuilder as any);
    collectionPosterService.loadStoredPoster.mockResolvedValue(null);

    await service.createCollection(
      createCollection({
        overlayEnabled: true,
        overlayTemplateId: 7,
        mediaServerId: null,
      }),
    );

    expect(queryBuilder.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          overlayEnabled: true,
          overlayTemplateId: 7,
        }),
      ]),
    );
    expect(collectionPosterService.loadStoredPoster).toHaveBeenCalledWith(42);
    expect(collectionPosterService.pushToMediaServer).not.toHaveBeenCalled();
  });

  it('re-pushes a stored poster when creating a media-server collection', async () => {
    const queryBuilder = {
      insert: jest.fn(),
      into: jest.fn(),
      values: jest.fn(),
      execute: jest.fn().mockResolvedValue({ generatedMaps: [{ id: 42 }] }),
    };

    queryBuilder.insert.mockReturnValue(queryBuilder);
    queryBuilder.into.mockReturnValue(queryBuilder);
    queryBuilder.values.mockReturnValue(queryBuilder);
    dataSource.createQueryBuilder.mockReturnValue(queryBuilder as any);
    collectionPosterService.loadStoredPoster.mockResolvedValue({
      buffer: Buffer.from('jpeg-bytes'),
      contentType: 'image/jpeg',
    });

    await service.createCollection(
      createCollection({ mediaServerId: null }),
      false,
    );

    expect(collectionPosterService.pushToMediaServer).toHaveBeenCalledWith(
      'remote-collection',
      expect.any(Buffer),
      'image/jpeg',
    );
  });

  it('removes stored poster bytes when deleting a collection from the database', async () => {
    collectionRepo.delete.mockResolvedValue({} as any);

    await (service as any).RemoveCollectionFromDB(createCollection({ id: 77 }));

    expect(collectionPosterService.removeStoredPoster).toHaveBeenCalledWith(77);
  });

  it('still returns success when stored poster cleanup fails after the database row is deleted', async () => {
    collectionRepo.delete.mockResolvedValue({} as any);
    collectionPosterService.removeStoredPoster.mockImplementation(() => {
      throw new Error('EACCES');
    });

    await expect(
      (service as any).RemoveCollectionFromDB(createCollection({ id: 78 })),
    ).resolves.toEqual({ status: 'OK', code: 1, message: 'Success' });
  });

  it('does not delete a collection when some removals fail', async () => {
    const collection = createCollection({
      id: 1,
      mediaServerId: 'remote-collection',
      manualCollection: false,
    });
    const collectionMedia = [
      createCollectionMedia(collection, { mediaServerId: 'item-1' }),
      createCollectionMedia(collection, { mediaServerId: 'item-2' }),
    ];

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue(collectionMedia);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    jest
      .spyOn(service as any, 'removeChildrenFromCollection')
      .mockResolvedValue(['item-1']);

    await service.removeFromCollection(collection.id, [
      { mediaServerId: 'item-1' },
      { mediaServerId: 'item-2' },
    ]);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
  });

  it('treats a media server collection link as shared when another local collection points to it', async () => {
    collectionRepo.count.mockResolvedValue(1);

    await expect(
      service.isMediaServerCollectionShared(
        createCollection({
          id: 9,
          mediaServerId: 'remote-collection',
        }),
      ),
    ).resolves.toBe(true);

    expect(collectionRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mediaServerId: 'remote-collection',
        }),
      }),
    );
  });

  it('returns rule-owned media server ids from sibling collections sharing a media server collection', async () => {
    const collection = createCollection({
      id: 1,
      mediaServerId: 'remote-collection',
    });
    const sibling = createCollection({
      id: 2,
      mediaServerId: 'remote-collection',
    });
    collectionRepo.find.mockResolvedValue([sibling]);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(sibling, {
        mediaServerId: 'rule-owned',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(sibling, {
        mediaServerId: 'manual-only',
        includedByRule: false,
        manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
      }),
    ]);

    const result = await service.getSiblingRuleOwnedMediaServerIds(collection);

    expect(Array.from(result)).toEqual(['rule-owned']);
  });

  it('does not delete a shared media server collection when one rule empties locally', async () => {
    const collection = createCollection({
      id: 11,
      mediaServerId: 'remote-collection',
      manualCollection: false,
    });
    const collectionMedia = [
      createCollectionMedia(collection, { mediaServerId: 'item-1' }),
    ];

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find
      .mockResolvedValueOnce(collectionMedia)
      .mockResolvedValue([]);
    collectionRepo.save.mockImplementation(
      async (value) => value as Collection,
    );
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    jest
      .spyOn(service as any, 'removeChildrenFromCollection')
      .mockResolvedValue(['item-1']);
    jest
      .spyOn(service, 'isMediaServerCollectionShared')
      .mockResolvedValue(true);

    await service.removeFromCollection(collection.id, [
      { mediaServerId: 'item-1' },
    ]);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(collectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, mediaServerId: null }),
    );
  });

  it('keeps a shared empty automatic collection during link checks', async () => {
    const collection = createCollection({
      id: 12,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Shared Empty',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Shared Empty',
      childCount: 0,
    } as any);
    mediaServer.getCollectionChildren.mockResolvedValue([]);
    collectionMediaRepo.find.mockResolvedValue([]);
    jest
      .spyOn(service, 'isMediaServerCollectionShared')
      .mockResolvedValue(true);

    const result = await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(result.mediaServerId).toBe('remote-collection');
  });

  // Sibling recovery after a shared-collection heal depends on this
  // clearing: the surviving rule group must drop its dead link so the
  // next add pass recreates the collection.
  it('clears the automatic link when the collection is gone and no title match exists', async () => {
    const collection = createCollection({
      id: 28,
      mediaServerId: 'deleted-remote-collection',
      manualCollection: false,
      title: 'Healed Sibling',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue(undefined);
    collectionRepo.save.mockImplementation(async (c) => c as Collection);
    jest
      .spyOn(service as any, 'findMediaServerCollection')
      .mockResolvedValue(undefined);

    const result = await service.checkAutomaticMediaServerLink(collection);

    expect(result.mediaServerId).toBeNull();
    expect(collectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 28, mediaServerId: null }),
    );
    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
  });

  it('repopulates a shared empty automatic collection from local rule-owned items', async () => {
    const collection = createCollection({
      id: 13,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Shared Empty Repop',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Shared Empty Repop',
      childCount: 0,
    } as any);
    mediaServer.getCollectionChildren.mockResolvedValue([]);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-1',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-2',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'manual-only',
        includedByRule: false,
        manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
      }),
    ]);
    jest
      .spyOn(service, 'isMediaServerCollectionShared')
      .mockResolvedValue(true);

    const result = await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(result.mediaServerId).toBe('remote-collection');
    expect(mediaServer.addBatchToCollection).toHaveBeenCalledWith(
      'remote-collection',
      ['rule-owned-1', 'rule-owned-2'],
    );
  });

  it('does not call addBatchToCollection when a shared empty collection has no local rule-owned items', async () => {
    const collection = createCollection({
      id: 14,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Shared Empty NoLocal',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Shared Empty NoLocal',
      childCount: 0,
    } as any);
    mediaServer.getCollectionChildren.mockResolvedValue([]);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(collection, {
        mediaServerId: 'manual-only',
        includedByRule: false,
        manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
      }),
    ]);
    jest
      .spyOn(service, 'isMediaServerCollectionShared')
      .mockResolvedValue(true);

    const result = await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(result.mediaServerId).toBe('remote-collection');
    expect(mediaServer.addBatchToCollection).not.toHaveBeenCalled();
  });

  it('resyncs only items missing from a shared partially-drifted automatic collection', async () => {
    const collection = createCollection({
      id: 15,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Shared Partial Drift',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Shared Partial Drift',
      childCount: 1,
    } as any);
    // Plex still has one of our items but lost the other two.
    mediaServer.getCollectionChildren.mockResolvedValue([
      { id: 'rule-owned-still-present' },
    ] as any);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-still-present',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-missing-1',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-missing-2',
        includedByRule: true,
        manualMembershipSource: null,
      }),
    ]);
    jest
      .spyOn(service, 'isMediaServerCollectionShared')
      .mockResolvedValue(true);

    const result = await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(result.mediaServerId).toBe('remote-collection');
    expect(mediaServer.addBatchToCollection).toHaveBeenCalledWith(
      'remote-collection',
      ['rule-owned-missing-1', 'rule-owned-missing-2'],
    );
  });

  it('does not addBatch when a shared collection already contains all rule-owned items', async () => {
    const collection = createCollection({
      id: 16,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Shared In Sync',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Shared In Sync',
      childCount: 2,
    } as any);
    mediaServer.getCollectionChildren.mockResolvedValue([
      { id: 'rule-owned-1' },
      { id: 'rule-owned-2' },
      { id: 'sibling-owned' },
    ] as any);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-1',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-2',
        includedByRule: true,
        manualMembershipSource: null,
      }),
    ]);
    jest
      .spyOn(service, 'isMediaServerCollectionShared')
      .mockResolvedValue(true);

    await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(mediaServer.addBatchToCollection).not.toHaveBeenCalled();
  });

  it('deletes and unlinks a shared empty automatic collection that rejects every resynced item', async () => {
    const collection = createCollection({
      id: 17,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Shared Empty Rejecting',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Shared Empty Rejecting',
      childCount: 0,
    } as any);
    mediaServer.getCollectionChildren.mockResolvedValue([]);
    mediaServer.addBatchToCollection.mockResolvedValue([
      'rule-owned-1',
      'rule-owned-2',
    ]);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-1',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-2',
        includedByRule: true,
        manualMembershipSource: null,
      }),
    ]);
    collectionRepo.save.mockImplementation(async (c) => c as Collection);
    jest
      .spyOn(service, 'isMediaServerCollectionShared')
      .mockResolvedValue(true);

    const result = await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.deleteCollection).toHaveBeenCalledWith(
      'remote-collection',
    );
    expect(result.mediaServerId).toBeNull();
  });

  it('keeps a shared empty automatic collection when only some resynced items are rejected', async () => {
    const collection = createCollection({
      id: 18,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Shared Empty Partial Reject',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Shared Empty Partial Reject',
      childCount: 0,
    } as any);
    mediaServer.getCollectionChildren.mockResolvedValue([]);
    mediaServer.addBatchToCollection.mockResolvedValue(['rule-owned-2']);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-1',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-2',
        includedByRule: true,
        manualMembershipSource: null,
      }),
    ]);
    jest
      .spyOn(service, 'isMediaServerCollectionShared')
      .mockResolvedValue(true);

    const result = await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(result.mediaServerId).toBe('remote-collection');
  });

  it('keeps the shared collection when emptiness cannot be confirmed at heal time', async () => {
    const collection = createCollection({
      id: 19,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Shared Empty Unconfirmed',
      libraryId: 'library-1',
    });

    // Link check sees the collection; the heal's verification read fails
    // (e.g. the server went unreachable), so deletion must not proceed.
    mediaServer.getCollection
      .mockResolvedValueOnce({
        id: 'remote-collection',
        title: 'Shared Empty Unconfirmed',
        childCount: 0,
      } as any)
      .mockResolvedValue(undefined);
    mediaServer.getCollectionChildren.mockResolvedValue([]);
    mediaServer.addBatchToCollection.mockResolvedValue(['rule-owned-1']);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-1',
        includedByRule: true,
        manualMembershipSource: null,
      }),
    ]);
    jest
      .spyOn(service, 'isMediaServerCollectionShared')
      .mockResolvedValue(true);

    const result = await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(result.mediaServerId).toBe('remote-collection');
  });

  it('getSiblingRuleOwnedMediaServerIds excludes manual sibling collections', async () => {
    const collection = createCollection({
      id: 20,
      mediaServerId: 'remote-collection',
      manualCollection: false,
    });
    collectionRepo.find.mockResolvedValue([]);

    const result = await service.getSiblingRuleOwnedMediaServerIds(collection);

    expect(Array.from(result)).toEqual([]);
    expect(collectionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          manualCollection: false,
        }),
      }),
    );
  });

  it('getSiblingRuleOwnedMediaServerIds throws on repository failure', async () => {
    const collection = createCollection({
      id: 21,
      mediaServerId: 'remote-collection',
      manualCollection: false,
    });
    collectionRepo.find.mockRejectedValue(new Error('db down'));

    await expect(
      service.getSiblingRuleOwnedMediaServerIds(collection),
    ).rejects.toThrow('db down');
  });

  it('isMediaServerCollectionShared filters siblings by manualCollection', async () => {
    collectionRepo.count.mockResolvedValue(0);

    await service.isMediaServerCollectionShared(
      createCollection({
        id: 22,
        mediaServerId: 'remote-collection',
        manualCollection: false,
      }),
    );

    expect(collectionRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          manualCollection: false,
        }),
      }),
    );
  });

  it('trusts Plex metadata childCount before stale child enumeration when checking automatic links', async () => {
    const collection = createCollection({
      id: 9,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Plex Collection',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Plex Collection',
      childCount: 311,
    } as any);

    const result = await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.getCollectionChildren).not.toHaveBeenCalled();
    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(result.mediaServerId).toBe('remote-collection');
  });

  it('repopulates a drained Jellyfin automatic collection from local rule-owned items', async () => {
    settingsDataService.media_server_type = MediaServerType.JELLYFIN;
    const collection = createCollection({
      id: 40,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Jellyfin Drained',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Jellyfin Drained',
      childCount: 0,
    } as any);
    mediaServer.getCollectionChildren.mockResolvedValue([]);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-1',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-2',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'manual-only',
        includedByRule: false,
        manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
      }),
    ]);

    const result = await service.checkAutomaticMediaServerLink(collection);

    // Empty BoxSets are not auto-deleted; repopulate in place, never delete.
    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(result.mediaServerId).toBe('remote-collection');
    expect(mediaServer.addBatchToCollection).toHaveBeenCalledWith(
      'remote-collection',
      ['rule-owned-1', 'rule-owned-2'],
    );
  });

  it('re-adds only the items a partially-drained Jellyfin collection is missing', async () => {
    settingsDataService.media_server_type = MediaServerType.JELLYFIN;
    const collection = createCollection({
      id: 41,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Jellyfin Partial',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Jellyfin Partial',
      childCount: 1,
    } as any);
    mediaServer.getCollectionChildren.mockResolvedValue([
      { id: 'rule-owned-still-present' },
    ] as any);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-still-present',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-missing',
        includedByRule: true,
        manualMembershipSource: null,
      }),
    ]);

    await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(mediaServer.addBatchToCollection).toHaveBeenCalledWith(
      'remote-collection',
      ['rule-owned-missing'],
    );
  });

  it('does not re-add when a Jellyfin collection already holds all rule-owned items', async () => {
    settingsDataService.media_server_type = MediaServerType.JELLYFIN;
    const collection = createCollection({
      id: 42,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Jellyfin In Sync',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Jellyfin In Sync',
      childCount: 2,
    } as any);
    mediaServer.getCollectionChildren.mockResolvedValue([
      { id: 'rule-owned-1' },
      { id: 'rule-owned-2' },
    ] as any);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-1',
        includedByRule: true,
        manualMembershipSource: null,
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-2',
        includedByRule: true,
        manualMembershipSource: null,
      }),
    ]);

    await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.addBatchToCollection).not.toHaveBeenCalled();
    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
  });

  it.each([
    { serverType: MediaServerType.JELLYFIN, name: 'Jellyfin' },
    { serverType: MediaServerType.EMBY, name: 'Emby' },
  ])(
    'keeps an empty $name automatic collection with no rule-owned items',
    async ({ serverType, name }) => {
      settingsDataService.media_server_type = serverType;
      const collection = createCollection({
        id: 45,
        mediaServerId: 'remote-collection',
        manualCollection: false,
        title: `${name} Empty NoLocal`,
        libraryId: 'library-1',
      });

      mediaServer.getCollection.mockResolvedValue({
        id: 'remote-collection',
        title: `${name} Empty NoLocal`,
        childCount: 0,
      } as any);
      mediaServer.getCollectionChildren.mockResolvedValue([]);
      collectionMediaRepo.find.mockResolvedValue([]);

      const result = await service.checkAutomaticMediaServerLink(collection);

      expect(result.mediaServerId).toBe('remote-collection');
      expect(mediaServer.addBatchToCollection).not.toHaveBeenCalled();
      expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    },
  );

  it('does not resync a Jellyfin collection that was only just linked by title', async () => {
    settingsDataService.media_server_type = MediaServerType.JELLYFIN;
    // mediaServerId null on entry → freshly linked this run; the server may not
    // have finished indexing, so the resync must not fire yet.
    const collection = createCollection({
      id: 43,
      mediaServerId: null,
      manualCollection: false,
      title: 'Jellyfin Fresh Link',
      libraryId: 'library-1',
    });

    collectionRepo.save.mockImplementation(async (c) => c as Collection);
    jest.spyOn(service as any, 'findMediaServerCollection').mockResolvedValue({
      id: 'remote-collection',
      title: 'Jellyfin Fresh Link',
      childCount: 0,
    });

    const result = await service.checkAutomaticMediaServerLink(collection);

    expect(result.mediaServerId).toBe('remote-collection');
    expect(mediaServer.getCollectionChildren).not.toHaveBeenCalled();
    expect(mediaServer.addBatchToCollection).not.toHaveBeenCalled();
  });

  it('repopulates a drained Emby automatic collection from local rule-owned items', async () => {
    settingsDataService.media_server_type = MediaServerType.EMBY;
    const collection = createCollection({
      id: 44,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Emby Drained',
      libraryId: 'library-1',
    });

    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Emby Drained',
      childCount: 0,
    } as any);
    mediaServer.getCollectionChildren.mockResolvedValue([]);
    collectionMediaRepo.find.mockResolvedValue([
      createCollectionMedia(collection, {
        mediaServerId: 'rule-owned-1',
        includedByRule: true,
        manualMembershipSource: null,
      }),
    ]);

    await service.checkAutomaticMediaServerLink(collection);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
    expect(mediaServer.addBatchToCollection).toHaveBeenCalledWith(
      'remote-collection',
      ['rule-owned-1'],
    );
  });

  it('rolls back a remote add when local bookkeeping fails', async () => {
    const collection = createCollection({
      id: 2,
      mediaServerId: 'remote-collection',
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue([]);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    jest
      .spyOn(service as any, 'insertCollectionMediaMembership')
      .mockRejectedValue(new Error('local bookkeeping failed'));

    await service.addToCollection(collection.id, [{ mediaServerId: 'item-1' }]);

    expect(mediaServer.addBatchToCollection).toHaveBeenCalledWith(
      'remote-collection',
      ['item-1'],
    );
    expect(mediaServer.removeFromCollection).toHaveBeenCalledWith(
      'remote-collection',
      'item-1',
    );
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.CollectionMedia_Added,
      expect.anything(),
    );
    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
  });

  it('emits CollectionMedia_Added only for items the media server accepted', async () => {
    const collection = createCollection({
      id: 20,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Partial Add',
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue([]);
    mediaServer.addBatchToCollection.mockResolvedValue(['item-2']);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    jest
      .spyOn(service as any, 'insertCollectionMediaMembership')
      .mockResolvedValue(undefined);

    await service.addToCollection(collection.id, [
      { mediaServerId: 'item-1' },
      { mediaServerId: 'item-2' },
    ]);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      MaintainerrEvent.CollectionMedia_Added,
      expect.objectContaining({
        mediaItems: [expect.objectContaining({ mediaServerId: 'item-1' })],
      }),
    );
    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
  });

  it('heals an empty automatic collection when the media server rejects every add', async () => {
    const collection = createCollection({
      id: 21,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Rejecting Collection',
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue([]);
    collectionRepo.save.mockImplementation(async (c) => c as Collection);
    mediaServer.addBatchToCollection.mockResolvedValue(['item-1', 'item-2']);
    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Rejecting Collection',
      childCount: 0,
    } as any);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);

    await service.addToCollection(collection.id, [
      { mediaServerId: 'item-1' },
      { mediaServerId: 'item-2' },
    ]);

    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      MaintainerrEvent.CollectionMedia_Added,
      expect.anything(),
    );
    expect(mediaServer.deleteCollection).toHaveBeenCalledWith(
      'remote-collection',
    );
    expect(collectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 21, mediaServerId: null }),
    );
  });

  it('does not heal when the rejecting collection still has children', async () => {
    const collection = createCollection({
      id: 22,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Rejecting Populated Collection',
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue([]);
    mediaServer.addBatchToCollection.mockResolvedValue(['item-1']);
    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Rejecting Populated Collection',
      childCount: 3,
    } as any);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);

    await service.addToCollection(collection.id, [{ mediaServerId: 'item-1' }]);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
  });

  it('does not heal on Jellyfin even when an empty collection rejects every add', async () => {
    const collection = createCollection({
      id: 26,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Rejecting Jellyfin Collection',
    });

    mediaServerFactory.getConfiguredServerType.mockResolvedValue(
      MediaServerType.JELLYFIN,
    );
    settingsDataService.media_server_type = MediaServerType.JELLYFIN;
    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue([]);
    mediaServer.addBatchToCollection.mockResolvedValue(['item-1']);
    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Rejecting Jellyfin Collection',
      childCount: 0,
    } as any);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);

    await service.addToCollection(collection.id, [{ mediaServerId: 'item-1' }]);

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
  });

  it('does not heal a manual collection that rejects every add', async () => {
    const collection = createCollection({
      id: 27,
      mediaServerId: 'remote-collection',
      manualCollection: true,
      title: 'Rejecting Manual Collection',
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue([]);
    mediaServer.addBatchToCollection.mockResolvedValue(['item-1']);
    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Rejecting Manual Collection',
      childCount: 0,
    } as any);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);

    await service.addToCollection(
      collection.id,
      [{ mediaServerId: 'item-1' }],
      true,
    );

    expect(mediaServer.deleteCollection).not.toHaveBeenCalled();
  });

  it('does not heal the same collection twice without an accepted add in between', async () => {
    const collection = createCollection({
      id: 23,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Repeat Rejecting Collection',
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue([]);
    collectionRepo.save.mockImplementation(async (c) => c as Collection);
    mediaServer.addBatchToCollection.mockResolvedValue(['item-1']);
    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Repeat Rejecting Collection',
      childCount: 0,
    } as any);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);

    await service.addToCollection(collection.id, [{ mediaServerId: 'item-1' }]);
    expect(mediaServer.deleteCollection).toHaveBeenCalledTimes(1);

    // Relinked to a recreated collection that also rejects everything.
    collection.mediaServerId = 'remote-collection-2';
    await service.addToCollection(collection.id, [{ mediaServerId: 'item-1' }]);

    expect(mediaServer.deleteCollection).toHaveBeenCalledTimes(1);
  });

  it('heals again once the media server has accepted adds in between', async () => {
    const collection = createCollection({
      id: 24,
      mediaServerId: 'remote-collection',
      manualCollection: false,
      title: 'Recovering Collection',
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue([]);
    collectionRepo.save.mockImplementation(async (c) => c as Collection);
    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-collection',
      title: 'Recovering Collection',
      childCount: 0,
    } as any);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    jest
      .spyOn(service as any, 'insertCollectionMediaMembership')
      .mockResolvedValue(undefined);

    // First pass: everything rejected → heal.
    mediaServer.addBatchToCollection.mockResolvedValueOnce(['item-1']);
    await service.addToCollection(collection.id, [{ mediaServerId: 'item-1' }]);
    expect(mediaServer.deleteCollection).toHaveBeenCalledTimes(1);

    // Recreated collection accepts the add → guard resets.
    collection.mediaServerId = 'remote-collection-2';
    mediaServer.addBatchToCollection.mockResolvedValueOnce([]);
    await service.addToCollection(collection.id, [{ mediaServerId: 'item-1' }]);
    expect(mediaServer.deleteCollection).toHaveBeenCalledTimes(1);

    // A later total rejection may heal again.
    mediaServer.addBatchToCollection.mockResolvedValueOnce(['item-2']);
    await service.addToCollection(collection.id, [{ mediaServerId: 'item-2' }]);
    expect(mediaServer.deleteCollection).toHaveBeenCalledTimes(2);
  });

  it('recreates collections empty and resyncs existing items separately', async () => {
    const collection = createCollection({
      id: 3,
      mediaServerId: null,
      manualCollection: false,
      libraryId: 'library-1',
      title: 'Recreated Collection',
    });
    const collectionMedia = [
      createCollectionMedia(collection, { mediaServerId: 'item-1' }),
    ];

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue(collectionMedia);
    collectionRepo.save.mockResolvedValue({
      ...collection,
      mediaServerId: 'remote-collection',
    } as Collection);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    await service.addToCollection(collection.id, []);

    expect(mediaServer.createCollection).toHaveBeenCalledWith(
      expect.not.objectContaining({
        itemIds: expect.anything(),
      }),
    );
    expect(mediaServer.addBatchToCollection).toHaveBeenCalledWith(
      'remote-collection',
      ['item-1'],
    );
  });

  it('pushes a stored poster the first time a rule run creates the media-server collection', async () => {
    const collection = createCollection({
      id: 4,
      mediaServerId: null,
      manualCollection: false,
      libraryId: 'library-1',
      title: 'New Collection',
    });
    const collectionMedia = [
      createCollectionMedia(collection, { mediaServerId: 'item-1' }),
    ];

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue(collectionMedia);
    collectionRepo.save.mockResolvedValue({
      ...collection,
      mediaServerId: 'remote-collection',
    } as Collection);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    collectionPosterService.loadStoredPoster.mockResolvedValue({
      buffer: Buffer.from('jpeg-bytes'),
      contentType: 'image/jpeg',
    });

    await service.addToCollection(collection.id, []);

    expect(collectionPosterService.loadStoredPoster).toHaveBeenCalledWith(4);
    expect(collectionPosterService.pushToMediaServer).toHaveBeenCalledWith(
      'remote-collection',
      expect.any(Buffer),
      'image/jpeg',
    );
  });

  it('reuses an existing automatic media server collection before creating a new one', async () => {
    const collection = createCollection({
      id: 5,
      mediaServerId: null,
      manualCollection: false,
      libraryId: 'library-1',
      title: 'Existing Remote Collection',
    });
    const collectionMedia = [
      createCollectionMedia(collection, { mediaServerId: 'item-1' }),
    ];

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue(collectionMedia);
    collectionRepo.save.mockResolvedValue({
      ...collection,
      mediaServerId: 'remote-existing',
    } as Collection);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    jest
      .spyOn(service as any, 'findMediaServerCollection')
      .mockResolvedValue({ id: 'remote-existing' });

    await service.addToCollection(collection.id, []);

    expect(mediaServer.createCollection).not.toHaveBeenCalled();
    expect(collectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ mediaServerId: 'remote-existing' }),
    );
    expect(mediaServer.addBatchToCollection).toHaveBeenCalledWith(
      'remote-existing',
      ['item-1'],
    );
  });

  it('marks an existing manual item as rule-included without re-adding it to the media server', async () => {
    const collection = createCollection({
      id: 8,
      mediaServerId: 'remote-collection',
      manualCollection: false,
    });
    const existingManualItem = createCollectionMedia(collection, {
      id: 81,
      mediaServerId: 'item-1',
      includedByRule: false,
      manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue([existingManualItem]);
    collectionMediaRepo.save.mockImplementation(async (value) => value as any);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);

    await service.addToCollection(collection.id, [{ mediaServerId: 'item-1' }]);

    expect(mediaServer.addBatchToCollection).not.toHaveBeenCalled();
    expect(collectionMediaRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 81,
        mediaServerId: 'item-1',
        includedByRule: true,
        manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
      }),
    );
  });

  it('clears stale rule evaluation flags when refreshing manual membership', async () => {
    const collection = createCollection({
      id: 9,
      mediaServerId: 'remote-collection',
      manualCollection: false,
    });
    const flaggedManualItem = createCollectionMedia(collection, {
      id: 91,
      mediaServerId: 'item-1',
      includedByRule: false,
      manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
      ruleEvaluationFailed: true,
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue([flaggedManualItem]);
    collectionMediaRepo.save.mockImplementation(async (value) => value as any);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);

    await service.addToCollection(
      collection.id,
      [{ mediaServerId: 'item-1' }],
      true,
    );

    expect(mediaServer.addBatchToCollection).not.toHaveBeenCalled();
    expect(collectionMediaRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 91,
        mediaServerId: 'item-1',
        includedByRule: false,
        manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
        ruleEvaluationFailed: false,
      }),
    );
  });

  it('removes only the rule membership when an item is also manually included', async () => {
    const collection = createCollection({
      id: 10,
      mediaServerId: 'remote-collection',
      manualCollection: false,
    });
    const manualAndRuleItem = createCollectionMedia(collection, {
      id: 101,
      mediaServerId: 'item-1',
      includedByRule: true,
      manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue([manualAndRuleItem]);
    collectionMediaRepo.save.mockImplementation(async (value) => value as any);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    const removeChildrenFromCollectionSpy = jest
      .spyOn(service as any, 'removeChildrenFromCollection')
      .mockResolvedValue([]);

    await service.removeFromCollection(
      collection.id,
      [
        {
          mediaServerId: 'item-1',
          reason: {
            type: 'media_removed_by_rule',
            data: undefined as any,
          },
        },
      ],
      'rule',
    );

    expect(removeChildrenFromCollectionSpy).not.toHaveBeenCalled();
    expect(collectionMediaRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 101,
        mediaServerId: 'item-1',
        includedByRule: false,
        manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
      }),
    );
  });

  it('reconciles shared manual collections by removing bleed rows and importing true shared manual items', async () => {
    const firstCollection = createCollection({
      id: 20,
      mediaServerId: 'shared-collection',
      manualCollection: true,
      manualCollectionName: 'Shared Collection',
    });
    const secondCollection = createCollection({
      id: 21,
      mediaServerId: 'shared-collection',
      manualCollection: true,
      manualCollectionName: 'Shared Collection',
    });
    const bleedRow = createCollectionMedia(firstCollection, {
      id: 201,
      mediaServerId: 'item-owned-by-second',
      includedByRule: false,
      manualMembershipSource: CollectionMediaManualMembershipSource.LEGACY,
    });
    const secondRuleRow = createCollectionMedia(secondCollection, {
      id: 202,
      mediaServerId: 'item-owned-by-second',
      includedByRule: true,
      manualMembershipSource: null,
    });

    collectionRepo.find.mockResolvedValue([firstCollection, secondCollection]);
    collectionMediaRepo.find.mockResolvedValue([bleedRow, secondRuleRow]);
    ruleGroupRepo.find.mockResolvedValue([
      { id: 301, collectionId: 20 },
      { id: 302, collectionId: 21 },
    ] as any);
    exclusionRepo.find.mockResolvedValue([]);
    collectionMediaRepo.save.mockImplementation(async (value) => value as any);
    mediaServer.getCollectionChildren.mockResolvedValue([
      createMediaItem({ id: 'item-owned-by-second', type: 'movie' }),
      createMediaItem({ id: 'item-manual-shared', type: 'movie' }),
    ]);
    const insertCollectionMediaMembershipSpy = jest
      .spyOn(service as any, 'insertCollectionMediaMembership')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'resolveCollectionMediaArtwork')
      .mockResolvedValue({});

    await service.reconcileSharedManualCollectionState(firstCollection);

    expect(collectionMediaRepo.delete).toHaveBeenCalledWith({ id: 201 });
    expect(insertCollectionMediaMembershipSpy).toHaveBeenCalledTimes(2);
    expect(insertCollectionMediaMembershipSpy).toHaveBeenCalledWith(
      20,
      'item-manual-shared',
      {
        includedByRule: false,
        manualMembershipSource: CollectionMediaManualMembershipSource.SHARED,
      },
      { type: 'media_added_manually' },
    );
    expect(insertCollectionMediaMembershipSpy).toHaveBeenCalledWith(
      21,
      'item-manual-shared',
      {
        includedByRule: false,
        manualMembershipSource: CollectionMediaManualMembershipSource.SHARED,
      },
      { type: 'media_added_manually' },
    );
  });

  it('preserves local provenance for shared manual items while importing sibling shared rows', async () => {
    const collection = createCollection({
      id: 30,
      mediaServerId: 'shared-collection',
      manualCollection: true,
      manualCollectionName: 'Shared Collection',
    });
    const siblingCollection = createCollection({
      id: 31,
      mediaServerId: 'shared-collection',
      manualCollection: true,
      manualCollectionName: 'Shared Collection',
    });
    const localManualRow = createCollectionMedia(collection, {
      id: 301,
      mediaServerId: 'item-1',
      includedByRule: false,
      manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
    });

    collectionRepo.find.mockResolvedValue([collection, siblingCollection]);
    collectionMediaRepo.find.mockResolvedValue([localManualRow]);
    ruleGroupRepo.find.mockResolvedValue([]);
    exclusionRepo.find.mockResolvedValue([]);
    collectionMediaRepo.save.mockImplementation(async (value) => value as any);
    mediaServer.getCollectionChildren.mockResolvedValue([
      createMediaItem({ id: 'item-1', type: 'movie' }),
    ]);
    const insertCollectionMediaMembershipSpy = jest
      .spyOn(service as any, 'insertCollectionMediaMembership')
      .mockResolvedValue(undefined);

    await service.reconcileSharedManualCollectionState(collection);

    expect(collectionMediaRepo.save).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: 301,
        manualMembershipSource: CollectionMediaManualMembershipSource.SHARED,
      }),
    );
    expect(insertCollectionMediaMembershipSpy).toHaveBeenCalledWith(
      31,
      'item-1',
      {
        includedByRule: false,
        manualMembershipSource: CollectionMediaManualMembershipSource.SHARED,
      },
      { type: 'media_added_manually' },
    );
  });

  it('clears missing manual-only rows in shared collections instead of re-adding them to the media server', async () => {
    const collection = createCollection({
      id: 32,
      mediaServerId: 'shared-collection',
      manualCollection: true,
      manualCollectionName: 'Shared Collection',
    });
    const siblingCollection = createCollection({
      id: 33,
      mediaServerId: 'shared-collection',
      manualCollection: true,
      manualCollectionName: 'Shared Collection',
    });
    const localManualRow = createCollectionMedia(collection, {
      id: 321,
      mediaServerId: 'item-1',
      includedByRule: false,
      manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
    });

    collectionRepo.find.mockResolvedValue([collection, siblingCollection]);
    collectionMediaRepo.find.mockResolvedValue([localManualRow]);
    ruleGroupRepo.find.mockResolvedValue([]);
    exclusionRepo.find.mockResolvedValue([]);
    mediaServer.getCollectionChildren.mockResolvedValue([]);

    await service.reconcileSharedManualCollectionState(collection);

    expect(mediaServer.addBatchToCollection).not.toHaveBeenCalled();
    expect(collectionMediaRepo.delete).toHaveBeenCalledWith({ id: 321 });
  });

  it('preserves newly added local rows in shared collections when child enumeration is stale after add', async () => {
    const collection = createCollection({
      id: 34,
      mediaServerId: 'shared-collection',
      manualCollection: true,
      manualCollectionName: 'Shared Collection',
    });
    const siblingCollection = createCollection({
      id: 35,
      mediaServerId: 'shared-collection',
      manualCollection: true,
      manualCollectionName: 'Shared Collection',
    });
    const newlyAddedLocalRow = createCollectionMedia(collection, {
      id: 341,
      mediaServerId: 'item-1',
      includedByRule: false,
      manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionRepo.count.mockResolvedValue(1);
    collectionRepo.find.mockResolvedValue([collection, siblingCollection]);
    collectionMediaRepo.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([newlyAddedLocalRow])
      .mockResolvedValueOnce([newlyAddedLocalRow]);
    collectionMediaRepo.save.mockImplementation(async (value) => value as any);
    mediaServer.getCollectionChildren.mockResolvedValue([]);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    jest
      .spyOn(service as any, 'resolveCollectionMediaArtwork')
      .mockResolvedValue({});

    await service.addToCollection(
      collection.id,
      [{ mediaServerId: 'item-1' }],
      true,
    );

    expect(collectionMediaRepo.delete).not.toHaveBeenCalledWith({ id: 341 });
  });

  it('passes removed ids into shared manual reconciliation after collection removal', async () => {
    const collection = createCollection({
      id: 36,
      mediaServerId: 'shared-collection',
      manualCollection: true,
      manualCollectionName: 'Shared Collection',
    });
    const currentCollectionMedia = [
      createCollectionMedia(collection, {
        mediaServerId: 'item-1',
        includedByRule: false,
        manualMembershipSource: CollectionMediaManualMembershipSource.SHARED,
      }),
    ];

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionRepo.count.mockResolvedValue(1);
    collectionMediaRepo.find
      .mockResolvedValueOnce(currentCollectionMedia)
      .mockResolvedValueOnce([]);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    jest
      .spyOn(service as any, 'removeChildrenFromCollection')
      .mockResolvedValue(['item-1']);
    const reconcileSharedManualCollectionStateSpy = jest
      .spyOn(service, 'reconcileSharedManualCollectionState')
      .mockResolvedValue(undefined);

    await service.removeFromCollection(collection.id, [
      { mediaServerId: 'item-1' },
    ]);

    expect(reconcileSharedManualCollectionStateSpy).toHaveBeenCalledWith(
      collection,
      {
        removedMediaServerIds: new Set(['item-1']),
      },
    );
  });

  it('skips shared manual reconciliation for non-shared manual collections', async () => {
    const collection = createCollection({
      id: 31,
      mediaServerId: 'manual-collection',
      manualCollection: true,
      manualCollectionName: 'Manual Collection',
    });
    const collectionMedia = [
      createCollectionMedia(collection, { mediaServerId: 'item-1' }),
    ];

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionMediaRepo.find.mockResolvedValue(collectionMedia);
    collectionRepo.count.mockResolvedValue(0);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    jest
      .spyOn(service as any, 'removeChildrenFromCollection')
      .mockResolvedValue(['item-1']);
    const reconcileSharedManualCollectionStateSpy = jest
      .spyOn(service, 'reconcileSharedManualCollectionState')
      .mockResolvedValue(undefined);

    await service.removeFromCollection(collection.id, [
      { mediaServerId: 'item-1' },
    ]);

    expect(reconcileSharedManualCollectionStateSpy).not.toHaveBeenCalled();
  });

  it('creates collections with children by adding media after collection creation', async () => {
    const collection = createCollection({
      id: 4,
      mediaServerId: null,
      manualCollection: false,
      libraryId: 'library-1',
      title: 'Collection With Children',
    });
    const media = [{ mediaServerId: 'item-1' }];

    jest.spyOn(service as any, 'addCollectionToDB').mockResolvedValue({
      id: collection.id,
      mediaServerId: 'remote-collection',
    });
    const addChildrenToCollectionSpy = jest
      .spyOn(service as any, 'addChildrenToCollection')
      .mockResolvedValue(undefined);

    await service.createCollectionWithChildren(collection, media);

    // Seeded with the first item so Emby can create it (#3075); the full set is
    // still added via the batched path below.
    expect(mediaServer.createCollection).toHaveBeenCalledWith(
      expect.objectContaining({ initialItemId: 'item-1' }),
    );
    expect(addChildrenToCollectionSpy).toHaveBeenCalledWith(
      {
        mediaServerId: 'remote-collection',
        dbId: collection.id,
      },
      media,
      false,
      false,
    );
  });

  it('creates the DB row only (no remote collection) when no media is provided', async () => {
    // No items to seed → the remote collection would be empty (pointless
    // everywhere, a hard 500 on Emby, #3075), so defer it to the first add.
    const collection = createCollection({
      id: 41,
      mediaServerId: null,
      manualCollection: false,
      libraryId: 'library-1',
      title: 'Empty Collection',
    });

    jest.spyOn(service as any, 'addCollectionToDB').mockResolvedValue({
      id: collection.id,
      mediaServerId: null,
    });
    const addChildrenToCollectionSpy = jest
      .spyOn(service as any, 'addChildrenToCollection')
      .mockResolvedValue(undefined);

    await service.createCollectionWithChildren(collection, []);

    expect(mediaServer.createCollection).not.toHaveBeenCalled();
    expect(addChildrenToCollectionSpy).not.toHaveBeenCalled();
  });

  it('returns undefined without adding media when collection creation fails', async () => {
    const collection = createCollection({
      id: 5,
      libraryId: 'library-1',
      title: 'Failed Collection With Children',
    });
    const media = [{ mediaServerId: 'item-1' }];
    const addChildrenToCollectionSpy = jest
      .spyOn(service as any, 'addChildrenToCollection')
      .mockResolvedValue(undefined);

    jest.spyOn(service, 'createCollection').mockResolvedValue(undefined);

    await expect(
      service.createCollectionWithChildren(collection, media),
    ).resolves.toBeUndefined();
    expect(addChildrenToCollectionSpy).not.toHaveBeenCalled();
  });

  it('hydrates collection media from collection children and deduplicates parent lookups', async () => {
    const collection = createCollection({
      id: 6,
      mediaServerId: 'remote-collection',
      type: 'episode',
    });
    const items = [
      createCollectionMedia(collection, { mediaServerId: 'episode-1' }),
      createCollectionMedia(collection, { mediaServerId: 'episode-2' }),
    ];
    const showMetadata = createMediaItem({
      id: 'show-1',
      type: 'show',
      title: 'Shared Show',
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    mediaServer.getCollectionChildren.mockResolvedValue([
      createMediaItem({
        id: 'episode-1',
        type: 'episode',
        parentId: 'season-1',
        grandparentId: 'show-1',
        parentTitle: 'Season 1',
        grandparentTitle: undefined,
      }),
      createMediaItem({
        id: 'episode-2',
        type: 'episode',
        parentId: 'season-1',
        grandparentId: 'show-1',
        parentTitle: 'Season 1',
        grandparentTitle: undefined,
      }),
    ]);
    mediaServer.getMetadata.mockImplementation(async (itemId: string) => {
      if (itemId === 'show-1') {
        return showMetadata;
      }

      return undefined;
    });

    const result = await (service as any).hydrateCollectionMediaWithMetadata(
      items,
      mediaServer,
    );

    expect(mediaServer.getCollectionChildren).toHaveBeenCalledWith(
      'remote-collection',
    );
    expect(mediaServer.getMetadata).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result[0].mediaData?.parentItem?.id).toBe('show-1');
    expect(result[0].mediaData?.grandparentTitle).toBe('Shared Show');
  });

  it('hydrates only the requested page after sorting collection media', async () => {
    const collection = createCollection({
      id: 7,
      mediaServerId: 'remote-collection',
      type: 'episode',
    });
    const firstEntity = createCollectionMedia(collection, {
      mediaServerId: 'episode-1',
    });
    const secondEntity = createCollectionMedia(collection, {
      mediaServerId: 'episode-2',
    });
    const thirdEntity = createCollectionMedia(collection, {
      mediaServerId: 'episode-3',
    });
    const entities = [firstEntity, secondEntity, thirdEntity];
    const metadataByMediaServerId = new Map([
      ['episode-1', createMediaItem({ id: 'episode-1', title: 'Zulu' })],
      ['episode-2', createMediaItem({ id: 'episode-2', title: 'Alpha' })],
      ['episode-3', createMediaItem({ id: 'episode-3', title: 'Bravo' })],
    ]);
    const hydratedPage = [
      {
        ...secondEntity,
        mediaData: metadataByMediaServerId.get('episode-2')!,
      },
      {
        ...thirdEntity,
        mediaData: metadataByMediaServerId.get('episode-3')!,
      },
    ];
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(entities.length),
      clone: jest.fn(),
    };
    const cloneBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities }),
    };

    queryBuilder.clone.mockReturnValue(cloneBuilder);
    collectionMediaRepo.createQueryBuilder.mockReturnValue(queryBuilder as any);

    const metadataSpy = jest
      .spyOn(service as any, 'getCollectionMediaMetadata')
      .mockResolvedValue(metadataByMediaServerId);
    const hydrateSpy = jest
      .spyOn(service as any, 'hydrateCollectionMediaWithMetadata')
      .mockResolvedValue(hydratedPage);

    const result = await (
      service as any
    ).getCollectionMediaWithServerDataAndPaging(collection.id, {
      size: 2,
      sort: 'title',
      sortOrder: 'asc',
    });

    expect(metadataSpy).toHaveBeenCalledWith(entities, mediaServer);
    expect(hydrateSpy).toHaveBeenCalledWith(
      [secondEntity, thirdEntity],
      mediaServer,
      metadataByMediaServerId,
    );
    expect(result).toEqual({
      totalSize: entities.length,
      items: hydratedPage,
    });
  });

  it('paginates deleteSoonest at the SQL level by collection_media.addDate', async () => {
    // `deleteSoonest` is equivalent to ordering by `collection_media.addDate`
    // because `deleteAfterDays` is constant across a collection. SQL does the
    // pagination so we don't have to hydrate every row in the collection
    // before slicing — critical for collections with hundreds of items where
    // hydrating all rows would block the UI for minutes.
    const collection = createCollection({
      id: 9,
      mediaServerId: 'remote-collection',
      type: 'movie',
    });
    const leavesSoonest = createCollectionMedia(collection, {
      mediaServerId: 'leaves-soonest',
      addDate: new Date('2024-01-01T10:00:00Z'),
    });
    const leavesMiddle = createCollectionMedia(collection, {
      mediaServerId: 'leaves-middle',
      addDate: new Date('2024-01-15T10:00:00Z'),
    });
    const sqlPagedEntities = [leavesSoonest, leavesMiddle];
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(3),
      clone: jest.fn(),
    };
    const cloneBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest
        .fn()
        .mockResolvedValue({ entities: sqlPagedEntities }),
    };
    queryBuilder.clone.mockReturnValue(cloneBuilder);
    collectionMediaRepo.createQueryBuilder.mockReturnValue(queryBuilder as any);

    const hydrateSpy = jest
      .spyOn(service as any, 'hydrateCollectionMediaWithMetadata')
      .mockImplementation(async (page) => page as any);

    await service.getCollectionMediaWithServerDataAndPaging(collection.id, {
      sort: 'deleteSoonest',
      sortOrder: 'asc',
      offset: 0,
      size: 2,
    });

    expect(cloneBuilder.orderBy).toHaveBeenCalledWith(
      'collection_media.addDate',
      'ASC',
    );
    expect(cloneBuilder.addOrderBy).toHaveBeenCalledWith(
      'collection_media.id',
      'ASC',
    );
    expect(cloneBuilder.skip).toHaveBeenCalledWith(0);
    expect(cloneBuilder.take).toHaveBeenCalledWith(2);
    expect(hydrateSpy).toHaveBeenCalledWith(sqlPagedEntities, mediaServer);
  });

  it('paginates deleteSoonest desc by ordering addDate DESC', async () => {
    const collection = createCollection({
      id: 11,
      mediaServerId: 'remote-collection',
      type: 'movie',
    });
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      clone: jest.fn(),
    };
    const cloneBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [] }),
    };
    queryBuilder.clone.mockReturnValue(cloneBuilder);
    collectionMediaRepo.createQueryBuilder.mockReturnValue(queryBuilder as any);

    jest
      .spyOn(service as any, 'hydrateCollectionMediaWithMetadata')
      .mockResolvedValue([]);

    await service.getCollectionMediaWithServerDataAndPaging(collection.id, {
      sort: 'deleteSoonest',
      sortOrder: 'desc',
    });

    expect(cloneBuilder.orderBy).toHaveBeenCalledWith(
      'collection_media.addDate',
      'DESC',
    );
    expect(cloneBuilder.addOrderBy).toHaveBeenCalledWith(
      'collection_media.id',
      'DESC',
    );
  });

  it('uses the sortable entity count for sorted collection media totals', async () => {
    const collection = createCollection({
      id: 8,
      mediaServerId: 'remote-collection',
      type: 'episode',
    });
    const firstEntity = createCollectionMedia(collection, {
      mediaServerId: 'episode-1',
    });
    const secondEntity = createCollectionMedia(collection, {
      mediaServerId: 'episode-2',
    });
    const missingEntity = createCollectionMedia(collection, {
      mediaServerId: 'episode-missing',
    });
    const entities = [firstEntity, secondEntity, missingEntity];
    const metadataByMediaServerId = new Map([
      ['episode-1', createMediaItem({ id: 'episode-1', title: 'Zulu' })],
      ['episode-2', createMediaItem({ id: 'episode-2', title: 'Alpha' })],
    ]);
    const hydratedPage = [
      {
        ...secondEntity,
        mediaData: metadataByMediaServerId.get('episode-2')!,
      },
      {
        ...firstEntity,
        mediaData: metadataByMediaServerId.get('episode-1')!,
      },
    ];
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(entities.length),
      clone: jest.fn(),
    };
    const cloneBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities }),
    };

    queryBuilder.clone.mockReturnValue(cloneBuilder);
    collectionMediaRepo.createQueryBuilder.mockReturnValue(queryBuilder as any);

    jest
      .spyOn(service as any, 'getCollectionMediaMetadata')
      .mockResolvedValue(metadataByMediaServerId);
    jest
      .spyOn(service as any, 'hydrateCollectionMediaWithMetadata')
      .mockResolvedValue(hydratedPage);

    const result = await (
      service as any
    ).getCollectionMediaWithServerDataAndPaging(collection.id, {
      size: 2,
      sort: 'title',
      sortOrder: 'asc',
    });

    expect(result).toEqual({
      totalSize: 2,
      items: hydratedPage,
    });
  });

  it('uses hydrated exclusion count for sorted exclusion totals', async () => {
    const exclusions = [
      {
        id: 1,
        mediaServerId: 'show-1',
        ruleGroupId: 10,
        type: 'show',
        mediaData: createMediaItem({ id: 'show-1', title: 'Zulu' }),
      },
      {
        id: 2,
        mediaServerId: 'show-2',
        ruleGroupId: null,
        type: 'show',
        mediaData: createMediaItem({ id: 'show-2', title: 'Alpha' }),
      },
    ] as Exclusion[];
    const allEntities = [
      { id: 1, mediaServerId: 'show-1', ruleGroupId: 10, type: 'show' },
      { id: 2, mediaServerId: 'show-2', ruleGroupId: null, type: 'show' },
      {
        id: 3,
        mediaServerId: 'show-missing',
        ruleGroupId: 10,
        type: 'show',
      },
    ] as Exclusion[];
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(allEntities.length),
      clone: jest.fn(),
    };
    const cloneBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: allEntities }),
    };

    ruleGroupRepo.findOne.mockResolvedValue({
      id: 10,
      dataType: 'show',
    } as RuleGroup);
    queryBuilder.clone.mockReturnValue(cloneBuilder);
    exclusionRepo.createQueryBuilder.mockReturnValue(queryBuilder as any);
    jest
      .spyOn(service as any, 'hydrateExclusionsWithMetadata')
      .mockResolvedValue(exclusions);

    const result = await service.getCollectionExclusionsWithServerDataAndPaging(
      22,
      {
        size: 2,
        sort: 'title',
        sortOrder: 'asc',
      },
    );

    expect(result?.totalSize).toBe(exclusions.length);
    expect(result?.items.map((item) => item.mediaServerId)).toEqual([
      'show-2',
      'show-1',
    ]);
  });

  it('limits collection previews to two rows per collection for the list payload', async () => {
    const previewQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    dataSource.createQueryBuilder.mockReturnValue(previewQueryBuilder as any);

    const result = await (service as any).getCollectionPreviewMedia([1, 2]);

    expect(previewQueryBuilder.where).toHaveBeenCalledWith(
      'preview_media.rowNumber <= :previewLimit',
      { previewLimit: 2 },
    );
    expect(result).toEqual(new Map());
  });

  it('returns full collection media for the explicit overlay data endpoint', async () => {
    const firstCollection = createCollection({ id: 1, title: 'First' });
    const secondCollection = createCollection({ id: 2, title: 'Second' });
    const firstCollectionMedia = [
      createCollectionMedia(firstCollection, { mediaServerId: 'item-1' }),
      createCollectionMedia(firstCollection, { mediaServerId: 'item-2' }),
    ];
    const secondCollectionMedia = [
      createCollectionMedia(secondCollection, { mediaServerId: 'item-3' }),
    ];

    collectionRepo.find.mockResolvedValue([
      firstCollection as Collection,
      secondCollection as Collection,
    ]);
    collectionMediaRepo.find.mockResolvedValue([
      ...firstCollectionMedia,
      ...secondCollectionMedia,
    ]);

    const result = await service.getCollectionsForOverlayData(
      undefined,
      undefined,
    );

    expect(collectionMediaRepo.find).toHaveBeenCalledWith({
      where: { collectionId: expect.anything() },
      order: {
        collectionId: 'ASC',
        addDate: 'DESC',
        id: 'DESC',
      },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: firstCollection.id,
        media: firstCollectionMedia,
        mediaCount: firstCollectionMedia.length,
      }),
      expect.objectContaining({
        id: secondCollection.id,
        media: secondCollectionMedia,
        mediaCount: secondCollectionMedia.length,
      }),
    ]);
  });

  it('enriches collection previews with fallback artwork when stored poster data is missing', async () => {
    const previewQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: '10',
          collectionId: '1',
          mediaServerId: 'item-1',
          tmdbId: null,
          tvdbId: null,
          addDate: new Date().toISOString(),
          image_path: null,
          includedByRule: 1,
          manualMembershipSource: null,
          rowNumber: 1,
        },
      ]),
    };

    dataSource.createQueryBuilder.mockReturnValue(previewQueryBuilder as any);
    mediaServer.getMetadata.mockResolvedValue(
      createMediaItem({
        id: 'item-1',
        type: 'movie',
        providerIds: { tmdb: ['123'] },
      }),
    );
    metadataService.resolveIdsFromHierarchyMediaItem.mockResolvedValue({
      tmdb: 123,
      type: 'movie',
    } as any);
    metadataService.getDetails.mockResolvedValue({
      externalIds: { tmdb: 123 },
      posterUrl: 'https://image.example/poster.jpg',
    } as any);

    const result = await (service as any).getCollectionPreviewMedia([1]);

    expect(mediaServer.getMetadata).toHaveBeenCalledWith('item-1');
    expect(
      metadataService.resolveIdsFromHierarchyMediaItem,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1' }),
      undefined,
      'item-1',
    );
    expect(result.get(1)).toEqual([
      expect.objectContaining({
        mediaServerId: 'item-1',
        tmdbId: 123,
        image_path: 'https://image.example/poster.jpg',
      }),
    ]);
  });

  it('resolves fallback artwork from hierarchy metadata for child media items', async () => {
    const previewQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: '11',
          collectionId: '1',
          mediaServerId: 'episode-1',
          tmdbId: null,
          tvdbId: null,
          addDate: new Date().toISOString(),
          image_path: null,
          includedByRule: 1,
          manualMembershipSource: null,
          rowNumber: 1,
        },
      ]),
    };

    const episodeItem = createMediaItem({
      id: 'episode-1',
      type: 'episode',
      parentId: 'season-1',
      grandparentId: 'show-1',
      providerIds: {},
    });
    const showItem = createMediaItem({
      id: 'show-1',
      type: 'show',
      providerIds: { tmdb: ['456'] },
    });

    dataSource.createQueryBuilder.mockReturnValue(previewQueryBuilder as any);
    mediaServer.getMetadata.mockImplementation(async (id: string) => {
      if (id === 'episode-1') {
        return episodeItem;
      }

      if (id === 'show-1') {
        return showItem;
      }

      return undefined;
    });
    metadataService.resolveIdsFromHierarchyMediaItem.mockResolvedValue({
      tmdb: 456,
      type: 'tv',
    } as any);
    metadataService.getDetails.mockResolvedValue({
      externalIds: { tmdb: 456 },
      posterUrl: 'https://image.example/show-poster.jpg',
    } as any);

    const result = await (service as any).getCollectionPreviewMedia([1]);

    expect(mediaServer.getMetadata).toHaveBeenCalledTimes(1);
    expect(mediaServer.getMetadata).toHaveBeenCalledWith('episode-1');
    expect(
      metadataService.resolveIdsFromHierarchyMediaItem,
    ).toHaveBeenCalledWith(episodeItem, undefined, 'episode-1');
    expect(result.get(1)).toEqual([
      expect.objectContaining({
        mediaServerId: 'episode-1',
        tmdbId: 456,
        image_path: 'https://image.example/show-poster.jpg',
      }),
    ]);
  });

  it('clears stale mediaServerId when getCollectionChildren throws and getCollection confirms deletion', async () => {
    const collection = createCollection({
      id: 10,
      mediaServerId: 'deleted-jellyfin-collection',
      type: 'movie',
    });
    const items = [
      createCollectionMedia(collection, { mediaServerId: 'movie-1' }),
    ];

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionRepo.save.mockImplementation(async (c) => c as Collection);
    mediaServer.getCollectionChildren.mockRejectedValue(
      new Error('Request failed with status code 400'),
    );
    // getCollection confirms the collection is truly gone
    mediaServer.getCollection.mockResolvedValue(undefined);
    mediaServer.getMetadata.mockResolvedValue(
      createMediaItem({ id: 'movie-1', title: 'Fallback Movie' }),
    );

    const result = await (service as any).hydrateCollectionMediaWithMetadata(
      items,
      mediaServer,
    );

    expect(mediaServer.getCollection).toHaveBeenCalledWith(
      'deleted-jellyfin-collection',
      true,
    );
    expect(collectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ mediaServerId: null }),
    );
    // Fallback per-item lookup still works
    expect(mediaServer.getMetadata).toHaveBeenCalledWith('movie-1');
    expect(result).toHaveLength(1);
    expect(result[0].mediaData?.title).toBe('Fallback Movie');
  });

  it('keeps mediaServerId when getCollectionChildren throws but getCollection confirms collection exists', async () => {
    const collection = createCollection({
      id: 11,
      mediaServerId: 'existing-jellyfin-collection',
      type: 'movie',
    });
    const items = [
      createCollectionMedia(collection, { mediaServerId: 'movie-1' }),
    ];

    collectionRepo.findOne.mockResolvedValue(collection);
    mediaServer.getCollectionChildren.mockRejectedValue(
      new Error('Request failed with status code 400'),
    );
    // getCollection confirms the collection still exists
    mediaServer.getCollection.mockResolvedValue({
      id: 'existing-jellyfin-collection',
      title: 'My Collection',
      childCount: 1,
      smart: false,
    });
    mediaServer.getMetadata.mockResolvedValue(
      createMediaItem({ id: 'movie-1', title: 'Fallback Movie' }),
    );

    const result = await (service as any).hydrateCollectionMediaWithMetadata(
      items,
      mediaServer,
    );

    expect(mediaServer.getCollection).toHaveBeenCalledWith(
      'existing-jellyfin-collection',
      true,
    );
    // mediaServerId should NOT be cleared
    expect(collectionRepo.save).not.toHaveBeenCalled();
    expect(collection.mediaServerId).toBe('existing-jellyfin-collection');
    // Fallback per-item lookup still works
    expect(result).toHaveLength(1);
    expect(result[0].mediaData?.title).toBe('Fallback Movie');
  });

  it('keeps mediaServerId when collection verification fails transiently', async () => {
    const collection = createCollection({
      id: 12,
      mediaServerId: 'verification-failure-collection',
      type: 'movie',
    });
    const items = [
      createCollectionMedia(collection, { mediaServerId: 'movie-1' }),
    ];

    collectionRepo.findOne.mockResolvedValue(collection);
    mediaServer.getCollectionChildren.mockRejectedValue(
      new Error('Request failed with status code 400'),
    );
    mediaServer.getCollection.mockRejectedValue(new Error('status code 502'));
    mediaServer.getMetadata.mockResolvedValue(
      createMediaItem({ id: 'movie-1', title: 'Fallback Movie' }),
    );

    const result = await (service as any).hydrateCollectionMediaWithMetadata(
      items,
      mediaServer,
    );

    expect(mediaServer.getCollection).toHaveBeenCalledWith(
      'verification-failure-collection',
      true,
    );
    expect(collectionRepo.save).not.toHaveBeenCalled();
    expect(collection.mediaServerId).toBe('verification-failure-collection');
    expect(mediaServer.getMetadata).toHaveBeenCalledWith('movie-1');
    expect(result).toHaveLength(1);
    expect(result[0].mediaData?.title).toBe('Fallback Movie');
  });

  it('creates a new media server collection seeded with one item, then batch-adds the rest', async () => {
    // The create request carries a single item id (the first), not the whole set
    // (the full set in the query string → HTTP 414 at scale, #3001). One item is
    // required so Emby can create the collection at all (#3075); the full set is
    // then added via the batched path.
    const collection = createCollection({
      id: 21,
      mediaServerId: null,
      manualCollection: false,
      libraryId: 'library-1',
      type: 'show',
    });

    collectionRepo.findOne.mockResolvedValue(collection);
    collectionRepo.save.mockImplementation(async (entity) => entity as any);
    collectionMediaRepo.find.mockResolvedValue([]);
    collectionPosterService.loadStoredPoster.mockResolvedValue(null);
    jest
      .spyOn(service as any, 'checkAutomaticMediaServerLink')
      .mockResolvedValue(collection);
    const addChildrenToCollection = jest
      .spyOn(service as any, 'addChildrenToCollection')
      .mockResolvedValue(undefined);

    await service.addToCollection(collection.id, [
      { mediaServerId: 'episode-1' },
      { mediaServerId: 'episode-2' },
    ]);

    expect(mediaServer.createCollection).toHaveBeenCalledWith(
      expect.objectContaining({ initialItemId: 'episode-1' }),
    );
    // The full set is still added via the batched path (skipMediaServerAdd=false);
    // re-adding the seeded item there is an idempotent no-op.
    expect(addChildrenToCollection).toHaveBeenCalledWith(
      { mediaServerId: 'remote-collection', dbId: collection.id },
      [{ mediaServerId: 'episode-1' }, { mediaServerId: 'episode-2' }],
      false,
      false,
      CollectionMediaManualMembershipSource.LOCAL,
    );
  });

  it('reorders Plex collection items by collection_media.addDate, not media-server addedAt', async () => {
    // Regression for #2867: applyCollectionSort previously sorted by
    // MediaItem.addedAt (when the file was added to the Plex library).
    // The user-visible "Leaving in X days" overlay is driven by
    // collection_media.addDate, so the Plex order must follow that.
    const collection = createCollection({
      id: 99,
      mediaServerId: 'remote-99',
      mediaServerSort: 'deleteSoonest.asc',
      type: 'movie',
    });

    const libraryAddDate = new Date('2024-06-01T00:00:00Z');
    const rows = [
      createCollectionMedia(collection, {
        mediaServerId: 'leaves-latest',
        addDate: new Date('2024-02-01T10:00:00Z'),
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'leaves-soonest',
        addDate: new Date('2024-01-01T10:00:00Z'),
      }),
      createCollectionMedia(collection, {
        mediaServerId: 'leaves-middle',
        addDate: new Date('2024-01-15T10:00:00Z'),
      }),
    ];

    collectionMediaRepo.find.mockResolvedValue(rows);

    mediaServer.supportsFeature.mockImplementation(
      (feature) => feature === MediaServerFeature.COLLECTION_SORT,
    );
    mediaServer.getCollection.mockResolvedValue({
      id: 'remote-99',
      title: 'Test',
      smart: false,
      childCount: rows.length,
    } as any);

    // Hand back metadata where every item has the same library addedAt —
    // if the comparator falls through to MediaItem.addedAt (the bug) the
    // ordering becomes whatever Map iteration gives us; the assertion
    // below would fail.
    mediaServer.getMetadata.mockImplementation(async (id: string) =>
      createMediaItem({
        id,
        title: id,
        type: 'movie',
        addedAt: libraryAddDate,
      }),
    );

    mediaServer.reorderCollectionItems = jest.fn().mockResolvedValue(undefined);

    await service.applyCollectionSort(collection as Collection);

    expect(mediaServer.reorderCollectionItems).toHaveBeenCalledWith(
      'remote-99',
      ['leaves-soonest', 'leaves-middle', 'leaves-latest'],
    );
  });

  describe('removeStaleCollectionMedia', () => {
    const buildMedia = (id: number, mediaServerId: string) =>
      Object.assign(new CollectionMedia(), { id, mediaServerId });

    it('removes only the rows the server confirms are gone', async () => {
      collectionMediaRepo.find.mockResolvedValue([
        buildMedia(1, 'present'),
        buildMedia(2, 'gone'),
      ]);
      mediaServer.itemExists.mockImplementation(async (id) => id !== 'gone');

      await service.removeStaleCollectionMedia();

      expect(collectionMediaRepo.delete).toHaveBeenCalledTimes(1);
      expect(collectionMediaRepo.delete).toHaveBeenCalledWith(2);
    });

    it('keeps the row when the existence check is inconclusive (throws)', async () => {
      collectionMediaRepo.find.mockResolvedValue([buildMedia(1, 'maybe')]);
      // A transient failure must never be read as "gone".
      mediaServer.itemExists.mockRejectedValue(new Error('media server down'));

      await service.removeStaleCollectionMedia();

      expect(collectionMediaRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('findMediaServerCollection', () => {
    const boxset = (props: Partial<MediaCollection>): MediaCollection =>
      ({ id: 'box-1', title: 'Shared', smart: false, ...props }) as never;

    beforeEach(() => {
      mediaServer.getCollections = jest.fn().mockResolvedValue([]);
      mediaServer.getLibraries = jest.fn().mockResolvedValue([
        { id: 'movies', title: 'Movies', type: 'movie' },
        { id: 'shows', title: 'Shows', type: 'show' },
      ]);
    });

    it('returns a match from the requested library without searching others', async () => {
      mediaServer.getCollections.mockResolvedValue([
        boxset({ title: 'Shared' }),
      ]);

      const found = await service.findMediaServerCollection('Shared', 'shows');

      expect(found?.id).toBe('box-1');
      expect(mediaServer.getCollections).toHaveBeenCalledTimes(1);
      expect(mediaServer.getCollections).toHaveBeenCalledWith('shows');
      expect(mediaServer.getLibraries).not.toHaveBeenCalled();
    });

    it('ignores smart collections when matching by name', async () => {
      mediaServer.getCollections.mockResolvedValue([
        boxset({ title: 'Shared', smart: true }),
      ]);

      const found = await service.findMediaServerCollection('Shared', 'shows');

      expect(found).toBeUndefined();
    });

    it('falls back to other libraries for a cross-library server when opted in', async () => {
      // The shared boxset is only reported under the movie library (it holds
      // movies but no shows yet), mirroring the reported Emby/Jellyfin issue.
      mediaServer.supportsFeature.mockImplementation(
        (feature) => feature === MediaServerFeature.CROSS_LIBRARY_COLLECTIONS,
      );
      mediaServer.getCollections.mockImplementation(
        async (libraryId: string) =>
          libraryId === 'movies' ? [boxset({ title: 'Shared' })] : [],
      );

      const found = await service.findMediaServerCollection(
        'Shared',
        'shows',
        true,
      );

      expect(found?.id).toBe('box-1');
      // Own library searched first, then the other one — never re-searching it.
      expect(mediaServer.getCollections).toHaveBeenCalledWith('shows');
      expect(mediaServer.getCollections).toHaveBeenCalledWith('movies');
      expect(mediaServer.getCollections).toHaveBeenCalledTimes(2);
    });

    it('does not search other libraries when not opted in', async () => {
      mediaServer.supportsFeature.mockImplementation(
        (feature) => feature === MediaServerFeature.CROSS_LIBRARY_COLLECTIONS,
      );
      mediaServer.getCollections.mockImplementation(
        async (libraryId: string) =>
          libraryId === 'movies' ? [boxset({ title: 'Shared' })] : [],
      );

      const found = await service.findMediaServerCollection('Shared', 'shows');

      expect(found).toBeUndefined();
      expect(mediaServer.getLibraries).not.toHaveBeenCalled();
    });

    it('does not search other libraries when the server lacks cross-library collections (Plex)', async () => {
      mediaServer.supportsFeature.mockReturnValue(false);
      mediaServer.getCollections.mockImplementation(
        async (libraryId: string) =>
          libraryId === 'movies' ? [boxset({ title: 'Shared' })] : [],
      );

      const found = await service.findMediaServerCollection(
        'Shared',
        'shows',
        true,
      );

      expect(found).toBeUndefined();
      expect(mediaServer.getLibraries).not.toHaveBeenCalled();
    });
  });

  describe('removeOldCollectionLogs', () => {
    it('queries by the collection FK only, never the unloaded ruleGroup relation (#3147)', async () => {
      // getAllCollections() loads collections without relations, so ruleGroup is
      // an own `undefined` property under useDefineForClassFields. Passing the
      // whole entity into a where would serialize that undefined and throw.
      const collection = createCollection({ id: 42, keepLogsForMonths: 6 });
      expect('ruleGroup' in collection).toBe(true);
      collectionLogRepo.find.mockResolvedValue([]);

      await service.removeOldCollectionLogs(collection);

      expect(collectionLogRepo.find).toHaveBeenCalledTimes(1);
      const where = collectionLogRepo.find.mock.calls[0][0]?.where as Record<
        string,
        unknown
      >;
      expect(where.collection).toEqual({ id: 42 });
      expect(where).not.toHaveProperty('ruleGroup');
      expect(where.timestamp).toBeInstanceOf(FindOperator);
      // no undefined leaks into the criteria
      expect(Object.values(where.collection as object)).not.toContain(undefined);
    });

    it('keeps logs forever when keepLogsForMonths is 0', async () => {
      const collection = createCollection({ id: 7, keepLogsForMonths: 0 });

      await service.removeOldCollectionLogs(collection);

      expect(collectionLogRepo.find).not.toHaveBeenCalled();
      expect(collectionLogRepo.remove).not.toHaveBeenCalled();
    });
  });

  describe('removeAllCollectionLogs', () => {
    it('deletes by the collection FK without loading the entity', async () => {
      collectionLogRepo.delete.mockResolvedValue({} as any);

      await service.removeAllCollectionLogs(99);

      expect(collectionRepo.findOne).not.toHaveBeenCalled();
      expect(collectionLogRepo.delete).toHaveBeenCalledWith({
        collection: { id: 99 },
      });
    });
  });
});
