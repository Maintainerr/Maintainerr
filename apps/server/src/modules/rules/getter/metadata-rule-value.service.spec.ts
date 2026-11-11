import { MediaItem } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { MetadataService } from '../../metadata/metadata.service';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';
import { MetadataRuleValueService } from './metadata-rule-value.service';

const createMediaItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: 'movie-1',
  title: 'Sample Movie',
  guid: 'media://movie-1',
  type: 'movie',
  addedAt: new Date('2024-01-01'),
  providerIds: { tmdb: ['1'] },
  mediaSources: [],
  library: { id: 'library-1', title: 'Movies' },
  ...overrides,
});

describe('MetadataRuleValueService', () => {
  let service: MetadataRuleValueService;
  let metadataService: Mocked<MetadataService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      MetadataRuleValueService,
    ).compile();

    service = unit;
    metadataService = unitRef.get(MetadataService);
  });

  it('returns merged studio names for a movie', async () => {
    const item = createMediaItem();
    metadataService.resolveIdsFromHierarchyMediaItem.mockResolvedValue({
      tmdb: 1,
      type: 'movie',
    });
    metadataService.getDetails.mockResolvedValue({
      studios: ['Company One'],
    } as never);

    await expect(service.getStudios(item)).resolves.toEqual(['Company One']);
    expect(
      metadataService.resolveIdsFromHierarchyMediaItem,
    ).toHaveBeenCalledWith(item);
    expect(metadataService.getDetails).toHaveBeenCalledWith(
      { tmdb: 1, type: 'movie' },
      'movie',
      { merge: true },
    );
  });

  it('returns undefined when metadata resolution or lookup is incomplete', async () => {
    metadataService.resolveIdsFromHierarchyMediaItem.mockResolvedValue(
      undefined,
    );

    await expect(
      service.getStudios(createMediaItem()),
    ).resolves.toBeUndefined();
    expect(metadataService.getDetails).not.toHaveBeenCalled();
  });

  describe('franchise properties', () => {
    // Release dates of the other parts relative to 2026-06-01. The provider
    // has already dropped the movie's own entry.
    const otherPartReleaseDates = [
      '2020-05-01',
      undefined,
      '2027-03-01',
      '2026-09-15',
    ];

    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-06-01T12:00:00Z') });
      metadataService.resolveIdsFromHierarchyMediaItem.mockResolvedValue({
        tmdb: 1,
        type: 'movie',
      });
    });

    afterEach(() => jest.useRealTimers());

    const inFranchise = (dates: (string | undefined)[]) =>
      metadataService.getFranchise.mockResolvedValue({
        name: 'Franchise A Collection',
        otherPartReleaseDates: dates,
      });

    it.each([
      ['franchise_name', 'Franchise A Collection'],
      ['franchise_nextReleaseDate', new Date('2026-09-15')],
    ] as const)(
      'resolves %s for a movie in a franchise',
      async (property, expected) => {
        inFranchise(otherPartReleaseDates);

        await expect(
          service.getFranchiseValue(property, createMediaItem()),
        ).resolves.toEqual(expected);
        expect(metadataService.getFranchise).toHaveBeenCalledWith({
          tmdb: 1,
          type: 'movie',
        });
      },
    );

    it('ignores undated and released parts for the next release date', async () => {
      inFranchise(['2020-05-01', undefined]);

      await expect(
        service.getFranchiseValue(
          'franchise_nextReleaseDate',
          createMediaItem(),
        ),
      ).resolves.toBeNull();
    });

    it.each(['franchise_name', 'franchise_nextReleaseDate'] as const)(
      'resolves %s to null for a movie in no franchise',
      async (property) => {
        metadataService.getFranchise.mockResolvedValue(null);

        await expect(
          service.getFranchiseValue(property, createMediaItem()),
        ).resolves.toBeNull();
      },
    );

    it.each(['franchise_name', 'franchise_nextReleaseDate'] as const)(
      'returns undefined for %s when the franchise lookup fails',
      async (property) => {
        metadataService.getFranchise.mockResolvedValue(undefined);

        await expect(
          service.getFranchiseValue(property, createMediaItem()),
        ).resolves.toBeUndefined();
      },
    );

    // A tv id must never be read as a movie id.
    it.each([
      ['no id can be resolved', undefined],
      ['the ids belong to a show', { tmdb: 1, type: 'tv' as const }],
    ])('returns undefined when %s', async (_case, ids) => {
      metadataService.resolveIdsFromHierarchyMediaItem.mockResolvedValue(ids);

      await expect(
        service.getFranchiseValue('franchise_name', createMediaItem()),
      ).resolves.toBeUndefined();
      expect(metadataService.getFranchise).not.toHaveBeenCalled();
    });

    it('retries a failed lookup within a run instead of caching it', async () => {
      const cache = new ArrLookupCache();
      inFranchise(otherPartReleaseDates);
      metadataService.getFranchise.mockResolvedValueOnce(undefined);

      await expect(
        service.getFranchiseValue('franchise_name', createMediaItem(), cache),
      ).resolves.toBeUndefined();
      await expect(
        service.getFranchiseValue('franchise_name', createMediaItem(), cache),
      ).resolves.toBe('Franchise A Collection');
    });
  });
});
