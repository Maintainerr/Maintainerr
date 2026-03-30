import { MediaItem } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { createMediaItem, createRulesDto } from '../../../../test/utils/data';
import { PlexAdapterService } from '../../api/media-server/plex/plex-adapter.service';
import { PlexMetadata } from '../../api/plex-api/interfaces/media.interface';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { PlexGetterService } from './plex-getter.service';

const VIEWCOUNT_PROP_ID = 5;
const ISWATCHED_PROP_ID = 43;
const PLEX_ITEM_ID = 'plex-item-123';

const makeMetadata = (overrides: Partial<PlexMetadata> = {}): PlexMetadata =>
  ({
    ratingKey: '12345',
    type: 'movie',
    ...overrides,
  }) as PlexMetadata;

describe('PlexGetterService', () => {
  let service: PlexGetterService;
  let plexApi: Mocked<PlexApiService>;
  let plexAdapter: Mocked<PlexAdapterService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexGetterService).compile();

    service = unit;
    plexApi = unitRef.get(PlexApiService);
    plexAdapter = unitRef.get(PlexAdapterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('watch state rules', () => {
    let libItem: MediaItem;

    beforeEach(() => {
      libItem = createMediaItem({ type: 'movie', viewCount: 0 });
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
    });

    it('should return the adapter view count for the viewCount rule', async () => {
      plexAdapter.getWatchState.mockResolvedValue({
        viewCount: 7,
        isWatched: true,
      });

      const result = await service.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(7);
      expect(plexAdapter.getWatchState).toHaveBeenCalledWith('12345', 0);
    });

    it('should return the adapter watched state for the isWatched rule', async () => {
      plexAdapter.getWatchState.mockResolvedValue({
        viewCount: 0,
        isWatched: false,
      });

      const result = await service.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(false);
      expect(plexAdapter.getWatchState).toHaveBeenCalledWith('12345', 0);
    });
  });

  it('requests external media metadata for IMDb ratings', async () => {
    const mediaItem = createMediaItem({ id: PLEX_ITEM_ID });

    plexApi.getMetadata.mockResolvedValue({
      ratingKey: PLEX_ITEM_ID,
      type: 'movie',
      title: 'Test Movie',
      Guid: [],
      index: 1,
      leafCount: 0,
      viewedLeafCount: 0,
      addedAt: 1,
      updatedAt: 1,
      guid: 'guid',
      Media: [],
      originallyAvailableAt: '2024-01-01',
      Rating: [{ image: 'imdb://image.rating', type: 'audience', value: 7.8 }],
    } as any);

    const result = await service.get(
      31,
      mediaItem,
      'movie',
      createRulesDto({ dataType: 'movie' }),
    );

    expect(result).toBe(7.8);
    expect(plexApi.getMetadata).toHaveBeenCalledWith(PLEX_ITEM_ID, {
      includeExternalMedia: true,
    });
  });

  it('requests external media metadata for show IMDb ratings', async () => {
    const mediaItem = createMediaItem({ id: PLEX_ITEM_ID, type: 'episode' });

    plexApi.getMetadata
      .mockResolvedValueOnce({
        ratingKey: PLEX_ITEM_ID,
        type: 'episode',
        title: 'Episode 1',
        Guid: [],
        index: 1,
        leafCount: 0,
        viewedLeafCount: 0,
        addedAt: 1,
        updatedAt: 1,
        guid: 'guid',
        Media: [],
        originallyAvailableAt: '2024-01-01',
        grandparentRatingKey: 'show-1',
      } as any)
      .mockResolvedValueOnce({
        ratingKey: 'show-1',
        type: 'show',
        title: 'Test Show',
        Guid: [],
        index: 1,
        leafCount: 0,
        viewedLeafCount: 0,
        addedAt: 1,
        updatedAt: 1,
        guid: 'guid-show',
        Media: [],
        originallyAvailableAt: '2024-01-01',
        Rating: [
          { image: 'imdb://image.rating', type: 'audience', value: 8.2 },
        ],
      } as any);

    const result = await service.get(
      35,
      mediaItem,
      'episode',
      createRulesDto({ dataType: 'show' }),
    );

    expect(result).toBe(8.2);
    expect(plexApi.getMetadata).toHaveBeenNthCalledWith(1, PLEX_ITEM_ID, {
      includeExternalMedia: true,
    });
    expect(plexApi.getMetadata).toHaveBeenNthCalledWith(2, 'show-1', {
      includeExternalMedia: true,
    });
  });
});
