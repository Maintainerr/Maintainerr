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

  it('dedupes show-level metadata for episodes through the run cache', async () => {
    const cache = new ArrLookupCache();
    const firstEpisode = createMediaItem({
      id: 'episode-1',
      type: 'episode',
      parentId: 'season-1',
      grandparentId: 'show-1',
    });
    const secondEpisode = createMediaItem({
      id: 'episode-2',
      type: 'episode',
      parentId: 'season-1',
      grandparentId: 'show-1',
    });
    metadataService.resolveIdsFromHierarchyMediaItem.mockResolvedValue({
      tmdb: 1,
      type: 'tv',
    });
    metadataService.getDetails.mockResolvedValue({
      studios: ['Network One'],
    } as never);

    await expect(
      Promise.all([
        service.getStudios(firstEpisode, cache),
        service.getStudios(secondEpisode, cache),
      ]),
    ).resolves.toEqual([['Network One'], ['Network One']]);

    expect(
      metadataService.resolveIdsFromHierarchyMediaItem,
    ).toHaveBeenCalledTimes(1);
    expect(metadataService.getDetails).toHaveBeenCalledTimes(1);
  });
});
