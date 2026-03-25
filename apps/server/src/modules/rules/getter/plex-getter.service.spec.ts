import { MediaItem, MediaItemType } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { createRulesDto } from '../../../../test/utils/data';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { PlexGetterService } from './plex-getter.service';

const createMediaItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: 'plex-item-123',
  title: 'Test Movie',
  type: 'movie' as MediaItemType,
  guid: 'plex-guid-123',
  addedAt: new Date('2024-01-15'),
  providerIds: { tmdb: ['12345'], imdb: ['tt1234567'] },
  mediaSources: [
    {
      id: 'source-1',
      duration: 7200000,
      bitrate: 8000000,
      videoCodec: 'h264',
      videoResolution: '1080p',
      width: 1920,
      height: 1080,
    },
  ],
  library: { id: 'lib-1', title: 'Movies' },
  genres: [{ name: 'Action' }],
  actors: [{ name: 'Actor One' }],
  labels: ['tag1'],
  originallyAvailableAt: new Date('2024-01-01'),
  ratings: [],
  ...overrides,
});

describe('PlexGetterService', () => {
  let plexGetterService: PlexGetterService;
  let plexApi: Mocked<PlexApiService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexGetterService).compile();

    plexGetterService = unit;
    plexApi = unitRef.get(PlexApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('requests external media metadata for IMDb ratings', async () => {
    const mediaItem = createMediaItem();

    plexApi.getMetadata.mockResolvedValue({
      ratingKey: 'plex-item-123',
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

    const result = await plexGetterService.get(
      31,
      mediaItem,
      'movie',
      createRulesDto({ dataType: 'movie' }),
    );

    expect(result).toBe(7.8);
    expect(plexApi.getMetadata).toHaveBeenCalledWith('plex-item-123', {
      includeExternalMedia: true,
    });
  });

  it('requests external media metadata for show IMDb ratings', async () => {
    const mediaItem = createMediaItem({ type: 'episode' });

    plexApi.getMetadata
      .mockResolvedValueOnce({
        ratingKey: 'plex-item-123',
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

    const result = await plexGetterService.get(
      35,
      mediaItem,
      'episode',
      createRulesDto({ dataType: 'show' }),
    );

    expect(result).toBe(8.2);
    expect(plexApi.getMetadata).toHaveBeenNthCalledWith(1, 'plex-item-123', {
      includeExternalMedia: true,
    });
    expect(plexApi.getMetadata).toHaveBeenNthCalledWith(2, 'show-1', {
      includeExternalMedia: true,
    });
  });
});
