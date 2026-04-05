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
import { CollectionsService } from './collections.service';
import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';

describe('CollectionsService', () => {
  let service: CollectionsService;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mediaServer: Mocked<IMediaServerService>;
  let dataSource: Mocked<DataSource>;
  let collectionRepo: Mocked<Repository<Collection>>;
  let collectionMediaRepo: Mocked<Repository<CollectionMedia>>;
  let metadataService: Mocked<MetadataService>;
  let tmdbIdService: {
    getTmdbIdFromMediaServerId: jest.Mock;
  };

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
    metadataService = unitRef.get(MetadataService);
    tmdbIdService = {
      getTmdbIdFromMediaServerId: jest.fn(),
    };

    metadataService.resolveIds.mockImplementation(async (mediaServerId) => {
      const tmdb =
        await tmdbIdService.getTmdbIdFromMediaServerId(mediaServerId);

      if (!tmdb) {
        return undefined;
      }

      return { tmdb: tmdb.id, type: tmdb.type } as any;
    });
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
      getCollectionChildren: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn().mockResolvedValue(undefined),
      removeFromCollection: jest.fn().mockResolvedValue(undefined),
      deleteCollection: jest.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<IMediaServerService>;

    mediaServerFactory.getService.mockResolvedValue(mediaServer);
    jest
      .spyOn(service, 'updateCollectionTotalSize')
      .mockResolvedValue(undefined);
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
    tmdbIdService.getTmdbIdFromMediaServerId.mockRejectedValue(
      new Error('tmdb lookup failed'),
    );

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
          isManual: 0,
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
          isManual: 0,
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
});
