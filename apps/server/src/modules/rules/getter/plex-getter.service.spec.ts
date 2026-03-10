import { MediaItem } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import {
  createMediaItem,
  createPlexMetadata,
  createRulesDto,
} from '../../../../test/utils/data';
import { PlexAdapterService } from '../../api/media-server/plex/plex-adapter.service';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { PlexMetadata } from '../../api/plex-api/interfaces/media.interface';
import { MaintainerrLogger } from '../../logging/logs.service';
import { PlexGetterService } from './plex-getter.service';

const VIEWCOUNT_PROP_ID = 5;
const ISWATCHED_PROP_ID = 43;

const makeMetadata = (overrides: Partial<PlexMetadata> = {}): PlexMetadata =>
  ({
    ratingKey: '12345',
    type: 'movie',
    ...overrides,
  }) as PlexMetadata;

describe('PlexGetterService', () => {
  let plexGetterService: PlexGetterService;
  let plexApi: Mocked<PlexApiService>;
  let plexAdapter: Mocked<PlexAdapterService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexGetterService).compile();

    plexGetterService = unit;
    plexApi = unitRef.get(PlexApiService);
    plexAdapter = unitRef.get(PlexAdapterService);
    logger = unitRef.get(MaintainerrLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('provider ratings', () => {
    const mediaItem: MediaItem = createMediaItem({
      id: 'movie-1',
      type: 'movie',
    });

    it.each([
      {
        id: 31,
        name: 'IMDb audience rating',
        metadata: createPlexMetadata({
          ratingKey: 'movie-1',
          type: 'movie',
          audienceRating: 8.2,
          audienceRatingImage: 'imdb://image.rating',
        }),
        expected: 8.2,
      },
      {
        id: 31,
        name: 'IMDb rating from top-level rating slot',
        metadata: createPlexMetadata({
          ratingKey: 'movie-1',
          type: 'movie',
          rating: 8.4,
          ratingImage: 'imdb://image.rating',
        }),
        expected: 8.4,
      },
      {
        id: 32,
        name: 'Rotten Tomatoes critic rating',
        metadata: createPlexMetadata({
          ratingKey: 'movie-1',
          type: 'movie',
          rating: 9.1,
          ratingImage: 'rottentomatoes://image.rating.ripe',
        }),
        expected: 9.1,
      },
      {
        id: 34,
        name: 'TMDB audience rating',
        metadata: createPlexMetadata({
          ratingKey: 'movie-1',
          type: 'movie',
          audienceRating: 7.7,
          audienceRatingImage: 'themoviedb://image.rating',
        }),
        expected: 7.7,
      },
      {
        id: 34,
        name: 'TMDB rating from top-level rating slot',
        metadata: createPlexMetadata({
          ratingKey: 'movie-1',
          type: 'movie',
          rating: 7.4,
          ratingImage: 'themoviedb://image.rating',
        }),
        expected: 7.4,
      },
    ])(
      'returns $expected from top-level metadata for $name',
      async ({ id, metadata, expected }) => {
        plexApi.getMetadata.mockResolvedValue(metadata);

        const result = await plexGetterService.get(
          id,
          mediaItem,
          'movie',
          createRulesDto({ dataType: 'movie' }),
        );

        expect(result).toBe(expected);
        expect(plexApi.getMetadata).toHaveBeenCalledWith('movie-1', {
          includeExternalMedia: true,
        });
      },
    );

    it('prefers provider-specific Rating values when available', async () => {
      plexApi.getMetadata.mockResolvedValue(
        createPlexMetadata({
          ratingKey: 'movie-1',
          type: 'movie',
          audienceRating: 8.2,
          audienceRatingImage: 'imdb://image.rating',
          Rating: [
            {
              image: 'imdb://image.rating',
              type: 'audience',
              value: 8.8,
            },
          ],
        }),
      );

      const result = await plexGetterService.get(
        31,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(result).toBe(8.8);
      expect(plexApi.getMetadata).toHaveBeenCalledWith('movie-1', {
        includeExternalMedia: true,
      });
    });

    it('resolves show ratings from grandparent metadata for episodes', async () => {
      const episode = createMediaItem({
        id: 'episode-1',
        type: 'episode',
      });

      plexApi.getMetadata
        .mockResolvedValueOnce(
          createPlexMetadata({
            ratingKey: 'episode-1',
            type: 'episode',
            grandparentRatingKey: 'show-1',
          }),
        )
        .mockResolvedValueOnce(
          createPlexMetadata({
            ratingKey: 'show-1',
            type: 'show',
            audienceRating: 8.6,
            audienceRatingImage: 'imdb://image.rating',
          }),
        );

      const result = await plexGetterService.get(
        35,
        episode,
        'episode',
        createRulesDto({ dataType: 'episode' }),
      );

      expect(result).toBe(8.6);
      expect(plexApi.getMetadata).toHaveBeenCalledTimes(2);
      expect(plexApi.getMetadata).toHaveBeenNthCalledWith(1, 'episode-1', {
        includeExternalMedia: true,
      });
      expect(plexApi.getMetadata).toHaveBeenNthCalledWith(2, 'show-1', {
        includeExternalMedia: true,
      });
    });
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

      const result = await plexGetterService.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(7);
      expect(plexAdapter.getWatchState).toHaveBeenCalledWith('12345');
    });

    it('should return the adapter watched state for the isWatched rule', async () => {
      plexAdapter.getWatchState.mockResolvedValue({
        viewCount: 0,
        isWatched: false,
      });

      const result = await plexGetterService.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(false);
      expect(plexAdapter.getWatchState).toHaveBeenCalledWith('12345');
    });
  });
});
