import { MediaItem } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import {
  createMediaItem,
  createPlexMetadata,
  createRulesDto,
} from '../../../../test/utils/data';
import { PlexApiService } from '../../../modules/api/plex-api/plex-api.service';
import { PlexSeenBy } from '../../api/plex-api/interfaces/library.interfaces';
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

const makeSeenBy = (count: number): PlexSeenBy[] =>
  Array.from({ length: count }, (_, i) => ({
    accountID: i,
    historyKey: `/status/sessions/history/${i}`,
    key: `/library/metadata/${i}`,
    ratingKey: '12345',
    title: `View ${i}`,
    thumb: '',
  })) as unknown as PlexSeenBy[];

describe('PlexGetterService', () => {
  let plexGetterService: PlexGetterService;
  let plexApi: Mocked<PlexApiService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexGetterService).compile();

    plexGetterService = unit;
    plexApi = unitRef.get(PlexApiService);
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
      expect(plexApi.getMetadata).toHaveBeenNthCalledWith(1, 'episode-1');
      expect(plexApi.getMetadata).toHaveBeenNthCalledWith(2, 'show-1');
    });
  });

  describe('viewCount', () => {
    let libItem: MediaItem;

    beforeEach(() => {
      libItem = createMediaItem({ type: 'movie', viewCount: 0 });
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
    });

    it('should use watch history count when history returns entries', async () => {
      plexApi.getWatchHistory.mockResolvedValue(makeSeenBy(7));

      const result = await plexGetterService.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(7);
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('12345');
    });

    it('should fall back to libItem.viewCount when history is empty but viewCount > 0', async () => {
      libItem.viewCount = 3;
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await plexGetterService.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(3);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('viewCount fallback'),
      );
    });

    it('should return 0 when history is empty and libItem.viewCount is 0', async () => {
      libItem.viewCount = 0;
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await plexGetterService.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(0);
    });

    it('should fall back to libItem.viewCount when watch history API fails', async () => {
      libItem.viewCount = 5;
      plexApi.getWatchHistory.mockRejectedValue(new Error('API error'));

      const result = await plexGetterService.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(5);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('viewCount fallback'),
      );
    });

    it('should return 0 when watch history API fails and libItem.viewCount is 0', async () => {
      libItem.viewCount = 0;
      plexApi.getWatchHistory.mockRejectedValue(new Error('API error'));

      const result = await plexGetterService.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(0);
    });
  });

  describe('isWatched', () => {
    let libItem: MediaItem;

    beforeEach(() => {
      libItem = createMediaItem({ type: 'movie', viewCount: 0 });
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
    });

    it('should return true when watch history has entries', async () => {
      plexApi.getWatchHistory.mockResolvedValue(makeSeenBy(3));

      const result = await plexGetterService.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(true);
    });

    it('should return true when history is empty but libItem.viewCount > 0', async () => {
      libItem.viewCount = 2;
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await plexGetterService.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(true);
    });

    it('should return false when history is empty and libItem.viewCount is 0', async () => {
      libItem.viewCount = 0;
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await plexGetterService.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(false);
    });

    it('should return true when history API fails but libItem.viewCount > 0', async () => {
      libItem.viewCount = 1;
      plexApi.getWatchHistory.mockRejectedValue(new Error('API error'));

      const result = await plexGetterService.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(true);
    });

    it('should return false when history API fails and libItem.viewCount is 0', async () => {
      libItem.viewCount = 0;
      plexApi.getWatchHistory.mockRejectedValue(new Error('API error'));

      const result = await plexGetterService.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(false);
    });
  });
});
