import { MediaServerType } from '@maintainerr/contracts';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Mocked, TestBed } from '@suites/unit';
import { DataSource, Repository } from 'typeorm';
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
import { SettingsService } from '../settings/settings.service';
import { CollectionPosterService } from './collection-poster.service';
import { CollectionsService } from './collections.service';
import { Collection } from './entities/collection.entities';
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
  let metadataService: Mocked<MetadataService>;
  let settingsService: Mocked<SettingsService>;
  let collectionPosterService: Mocked<CollectionPosterService>;

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
    metadataService = unitRef.get(MetadataService);
    settingsService = unitRef.get(SettingsService);
    collectionPosterService = unitRef.get(CollectionPosterService);
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
      getCollection: jest.fn().mockResolvedValue(undefined),
      getCollectionChildren: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn().mockResolvedValue(undefined),
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
    settingsService.media_server_type = MediaServerType.PLEX;
    jest
      .spyOn(service, 'updateCollectionTotalSize')
      .mockResolvedValue(undefined);
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

    expect(mediaServer.createCollection).toHaveBeenCalledWith(
      expect.not.objectContaining({
        itemIds: expect.anything(),
      }),
    );
    expect(addChildrenToCollectionSpy).toHaveBeenCalledWith(
      {
        mediaServerId: 'remote-collection',
        dbId: collection.id,
      },
      media,
      false,
    );
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
});
