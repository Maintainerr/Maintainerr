import { type MediaItem } from '@maintainerr/contracts';
import { Repository } from 'typeorm';
import { CollectionMedia } from '../../collections/entities/collection_media.entities';
import { Exclusion } from '../../rules/entities/exclusion.entities';
import { MediaItemEnrichmentService } from './media-item-enrichment.service';

describe('MediaItemEnrichmentService', () => {
  let service: MediaItemEnrichmentService;
  let exclusionRepo: jest.Mocked<Repository<Exclusion>>;
  let collectionMediaRepo: jest.Mocked<Repository<CollectionMedia>>;

  beforeEach(() => {
    exclusionRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Exclusion>>;

    collectionMediaRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<CollectionMedia>>;

    service = new MediaItemEnrichmentService(
      exclusionRepo,
      collectionMediaRepo,
    );
  });

  it('enriches items with exclusion and inclusion state from direct and parent relations', async () => {
    const movie = {
      id: 'movie-1',
      title: 'Movie',
      guid: 'movie-guid',
      type: 'movie',
      addedAt: new Date(),
      providerIds: {},
      mediaSources: [],
      library: { id: 'library-1', title: 'Movies' },
    } satisfies MediaItem;
    const episode = {
      id: 'episode-1',
      parentId: 'season-1',
      grandparentId: 'show-1',
      title: 'Episode',
      guid: 'episode-guid',
      type: 'episode',
      addedAt: new Date(),
      providerIds: {},
      mediaSources: [],
      library: { id: 'library-1', title: 'Shows' },
    } satisfies MediaItem;

    exclusionRepo.find.mockResolvedValue([
      {
        id: 11,
        mediaServerId: 'movie-1',
        ruleGroupId: null,
      },
      {
        id: 22,
        parent: 'show-1',
        ruleGroupId: 9,
      },
    ] as Exclusion[]);
    collectionMediaRepo.find.mockResolvedValue([
      {
        mediaServerId: 'movie-1',
        isManual: false,
      },
      {
        mediaServerId: 'episode-1',
        isManual: true,
      },
    ] as CollectionMedia[]);

    const result = await service.enrichItems([movie, episode]);

    expect(result).toEqual([
      {
        ...movie,
        maintainerrExclusionId: 11,
        maintainerrExclusionType: 'global',
        maintainerrIsIncluded: true,
        maintainerrIsManual: false,
      },
      {
        ...episode,
        maintainerrExclusionId: 22,
        maintainerrExclusionType: 'specific',
        maintainerrIsIncluded: true,
        maintainerrIsManual: true,
      },
    ]);
  });

  it('returns items unchanged when no maintainerr state exists', async () => {
    const movie = {
      id: 'movie-1',
      title: 'Movie',
      guid: 'movie-guid',
      type: 'movie',
      addedAt: new Date(),
      providerIds: {},
      mediaSources: [],
      library: { id: 'library-1', title: 'Movies' },
    } satisfies MediaItem;

    exclusionRepo.find.mockResolvedValue([]);
    collectionMediaRepo.find.mockResolvedValue([]);

    await expect(service.enrichItems([movie])).resolves.toEqual([movie]);
  });

  it('does not inherit included state from parent or grandparent relations', async () => {
    const episode = {
      id: 'episode-1',
      parentId: 'season-1',
      grandparentId: 'show-1',
      title: 'Episode',
      guid: 'episode-guid',
      type: 'episode',
      addedAt: new Date(),
      providerIds: {},
      mediaSources: [],
      library: { id: 'library-1', title: 'Shows' },
    } satisfies MediaItem;

    exclusionRepo.find.mockResolvedValue([]);
    collectionMediaRepo.find.mockResolvedValue([
      {
        mediaServerId: 'show-1',
        isManual: true,
      },
    ] as CollectionMedia[]);

    await expect(service.enrichItems([episode])).resolves.toEqual([episode]);
  });
});
