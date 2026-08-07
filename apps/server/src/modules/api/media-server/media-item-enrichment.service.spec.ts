import { type MediaItem } from '@maintainerr/contracts';
import { FindOperator, Repository } from 'typeorm';
import {
  CollectionMedia,
  CollectionMediaManualMembershipSource,
} from '../../collections/entities/collection_media.entities';
import { Exclusion } from '../../rules/entities/exclusion.entities';
import { RuleGroup } from '../../rules/entities/rule-group.entities';
import {
  ENRICHMENT_ID_CHUNK,
  MediaItemEnrichmentService,
} from './media-item-enrichment.service';

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

  it('names the collections an item is in, once each and sorted', async () => {
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
      { mediaServerId: 'movie-1', collection: { title: 'Watched movies' } },
      { mediaServerId: 'movie-1', collection: { title: 'Stale movies' } },
      // a second membership of the same collection, and one with no title
      { mediaServerId: 'movie-1', collection: { title: 'Stale movies' } },
      { mediaServerId: 'movie-1', collection: { title: '  ' } },
    ] as CollectionMedia[]);

    await expect(service.enrichItems([movie])).resolves.toEqual([
      {
        ...movie,
        maintainerrCollections: ['Stale movies', 'Watched movies'],
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

  // One IN list for every id would pass SQLite's 32766 parameter ceiling.
  it('reads long id lists in chunks and merges what each returns', async () => {
    const lastIndex = ENRICHMENT_ID_CHUNK * 2;
    const items = Array.from(
      { length: lastIndex + 1 },
      (unused, index) =>
        ({
          id: `movie-${index}`,
          title: `Movie ${index}`,
          guid: `movie-guid-${index}`,
          type: 'movie',
          addedAt: new Date(),
          providerIds: {},
          mediaSources: [],
          library: { id: 'library-1', title: 'Movies' },
        }) satisfies MediaItem,
    );

    exclusionRepo.find.mockResolvedValue([]);
    collectionMediaRepo.find.mockImplementation(async (options) => {
      const ids = (
        (options?.where as { mediaServerId: unknown })
          .mediaServerId as FindOperator<string>
      ).value as unknown as string[];
      expect(ids.length).toBeLessThanOrEqual(ENRICHMENT_ID_CHUNK);
      // Only the last chunk answers, so a dropped chunk shows up as a failure.
      return ids.includes(`movie-${lastIndex}`)
        ? ([
            {
              mediaServerId: `movie-${lastIndex}`,
              manualMembershipSource:
                CollectionMediaManualMembershipSource.LOCAL,
            },
          ] as CollectionMedia[])
        : [];
    });

    const enriched = await service.enrichItems(items);

    expect(collectionMediaRepo.find).toHaveBeenCalledTimes(3);
    expect(exclusionRepo.find).toHaveBeenCalledTimes(3);
    expect(enriched[lastIndex].maintainerrIsManual).toBe(true);
    expect(enriched[0].maintainerrIsManual).toBeUndefined();
  });

  // One exclusion row can match one batch on mediaServerId and another on
  // parent, so it comes back twice. Both of its ids still have to resolve.
  it('resolves an exclusion whose two ids fall in different batches', async () => {
    const item = (id: string, type: 'movie' | 'show') =>
      ({
        id,
        title: id,
        guid: `${id}-guid`,
        type,
        addedAt: new Date(),
        providerIds: {},
        mediaSources: [],
        library: { id: 'library-1', title: 'Library' },
      }) satisfies MediaItem;
    // Enough items between them that 'first' and 'last' cannot share a batch.
    const items = [
      item('first', 'movie'),
      ...Array.from({ length: ENRICHMENT_ID_CHUNK }, (unused, index) =>
        item(`filler-${index}`, 'movie'),
      ),
      item('last', 'show'),
    ];

    collectionMediaRepo.find.mockResolvedValue([]);
    exclusionRepo.find.mockImplementation(async (options) => {
      const ids = (
        (options?.where as [{ mediaServerId: unknown }])[0]
          .mediaServerId as FindOperator<string>
      ).value as unknown as string[];
      // The one row Plex-side ids straddle: matched by mediaServerId in one
      // batch and by parent in the other, so it is returned by both.
      return ids.includes('first') || ids.includes('last')
        ? ([
            {
              id: 7,
              mediaServerId: 'first',
              parent: 'last',
              ruleGroupId: null,
            },
          ] as Exclusion[])
        : [];
    });

    const enriched = await service.enrichItems(items);

    expect(exclusionRepo.find.mock.calls.length).toBeGreaterThan(1);
    expect(enriched[0].maintainerrExclusionId).toBe(7);
    expect(enriched[enriched.length - 1].maintainerrExclusionId).toBe(7);
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
