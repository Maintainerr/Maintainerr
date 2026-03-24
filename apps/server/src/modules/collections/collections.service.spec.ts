import { getRepositoryToken } from '@nestjs/typeorm';
import { Mocked, TestBed } from '@suites/unit';
import { Repository } from 'typeorm';
import {
  createCollection,
  createCollectionMedia,
} from '../../../test/utils/data';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { TmdbIdService } from '../api/tmdb-api/tmdb-id.service';
import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';
import { CollectionsService } from './collections.service';

describe('CollectionsService', () => {
  let service: CollectionsService;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mediaServer: Mocked<IMediaServerService>;
  let collectionRepo: Mocked<Repository<Collection>>;
  let collectionMediaRepo: Mocked<Repository<CollectionMedia>>;
  let tmdbIdService: Mocked<TmdbIdService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(CollectionsService).compile();

    service = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    collectionRepo = unitRef.get(getRepositoryToken(Collection) as string);
    collectionMediaRepo = unitRef.get(
      getRepositoryToken(CollectionMedia) as string,
    );
    tmdbIdService = unitRef.get(TmdbIdService);

    mediaServer = {
      addBatchToCollection: jest.fn().mockResolvedValue([]),
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
});
