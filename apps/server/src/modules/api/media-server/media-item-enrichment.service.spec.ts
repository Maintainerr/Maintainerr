import { type MediaItem } from '@maintainerr/contracts';
import { Repository } from 'typeorm';
import {
  CollectionMedia,
  CollectionMediaManualMembershipSource,
} from '../../collections/entities/collection_media.entities';
import { Exclusion } from '../../rules/entities/exclusion.entities';
import { RuleGroup } from '../../rules/entities/rule-group.entities';
import { MediaItemEnrichmentService } from './media-item-enrichment.service';

describe('MediaItemEnrichmentService', () => {
  let service: MediaItemEnrichmentService;
  let exclusionRepo: jest.Mocked<Repository<Exclusion>>;
  let collectionMediaRepo: jest.Mocked<Repository<CollectionMedia>>;
  let ruleGroupRepo: jest.Mocked<Repository<RuleGroup>>;

  beforeEach(() => {
    exclusionRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Exclusion>>;

    collectionMediaRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<CollectionMedia>>;

    ruleGroupRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<RuleGroup>>;

    service = new MediaItemEnrichmentService(
      exclusionRepo,
      collectionMediaRepo,
      ruleGroupRepo,
    );
  });

  it('enriches items with exclusion and manual state from direct and parent relations', async () => {
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
        mediaServerId: 'episode-1',
        manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
      },
    ] as CollectionMedia[]);

    const result = await service.enrichItems([movie, episode]);

    expect(result).toEqual([
      {
        ...movie,
        maintainerrExclusionId: 11,
        maintainerrExclusionType: 'global',
      },
      {
        ...episode,
        maintainerrExclusionId: 22,
        maintainerrExclusionType: 'specific',
        maintainerrIsManual: true,
      },
    ]);
  });

  it('marks an item as manual when any direct collection relation is manual', async () => {
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
    collectionMediaRepo.find.mockResolvedValue([
      {
        mediaServerId: 'movie-1',
        manualMembershipSource: null,
      },
      {
        mediaServerId: 'movie-1',
        manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
      },
    ] as CollectionMedia[]);

    await expect(service.enrichItems([movie])).resolves.toEqual([
      {
        ...movie,
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

  it('does not inherit manual state from parent or grandparent relations', async () => {
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
        manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
      },
    ] as CollectionMedia[]);

    await expect(service.enrichItems([episode])).resolves.toEqual([episode]);
  });

  it('returns modal status details for all exclusions and manual collections', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-04T00:00:00.000Z'));

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
        collectionId: 7,
        mediaServerId: 'movie-1',
        manualMembershipSource: CollectionMediaManualMembershipSource.LOCAL,
        addDate: new Date('2026-04-01T00:00:00.000Z'),
        collection: {
          id: 7,
          title: 'Testing',
          deleteAfterDays: 8,
        },
      },
    ] as CollectionMedia[]);
    ruleGroupRepo.find.mockResolvedValue([
      {
        id: 9,
        name: 'Rule Nine',
        collection: {
          id: 12,
          title: 'Testing1',
        },
      },
    ] as RuleGroup[]);

    await expect(
      service.getMaintainerrStatusDetails({
        id: 'movie-1',
        parentId: 'season-1',
        grandparentId: 'show-1',
      }),
    ).resolves.toEqual({
      excludedFrom: [
        { label: 'Global' },
        {
          label: 'Testing1',
          targetPath: '/collections/12/exclusions',
        },
      ],
      manuallyAddedTo: [
        {
          label: 'Testing (5d left)',
          targetPath: '/collections/7',
        },
      ],
    });

    expect(ruleGroupRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: { collection: true },
      }),
    );

    jest.useRealTimers();
  });
});
