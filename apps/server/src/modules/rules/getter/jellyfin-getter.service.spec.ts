import {
  MediaItem,
  MediaItemType,
  MediaUser,
  WatchRecord,
} from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { createRulesDto } from '../../../../test/utils/data';

import { JellyfinAdapterService } from '../../api/media-server/jellyfin/jellyfin-adapter.service';
import { JellyfinGetterService } from './jellyfin-getter.service';

// Helper to create mock MediaItem
const createMediaItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: 'jellyfin-item-123',
  title: 'Test Movie',
  type: 'movie' as MediaItemType,
  guid: 'jellyfin-guid-123',
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
  genres: [{ name: 'Action' }, { name: 'Adventure' }],
  actors: [{ name: 'Actor One' }, { name: 'Actor Two' }],
  labels: ['tag1', 'tag2'],
  originallyAvailableAt: new Date('2024-01-01'),
  ratings: [
    { source: 'critic', value: 75, type: 'critic' },
    { source: 'audience', value: 8.5, type: 'audience' },
  ],
  userRating: 9,
  ...overrides,
});

// Helper to create mock MediaUser
const createMediaUser = (overrides: Partial<MediaUser> = {}): MediaUser => ({
  id: 'user-1',
  name: 'TestUser',
  ...overrides,
});

// Helper to create mock WatchRecord
const createWatchRecord = (
  overrides: Partial<WatchRecord> = {},
): WatchRecord => ({
  userId: 'user-1',
  itemId: 'jellyfin-item-123',
  watchedAt: new Date('2024-06-15'),
  ...overrides,
});

describe('JellyfinGetterService', () => {
  let jellyfinGetterService: JellyfinGetterService;
  let jellyfinAdapter: Mocked<JellyfinAdapterService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      JellyfinGetterService,
    ).compile();

    jellyfinGetterService = unit;
    jellyfinAdapter = unitRef.get(JellyfinAdapterService);

    // Default: Jellyfin is set up
    jellyfinAdapter.isSetup.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when Jellyfin is not configured', () => {
    it('should return null when Jellyfin service is not set up', async () => {
      jellyfinAdapter.isSetup.mockReturnValue(false);
      const mediaItem = createMediaItem({ type: 'movie' });

      const response = await jellyfinGetterService.get(
        0, // addDate
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBeNull();
    });
  });

  describe('simple property getters', () => {
    it.each([
      {
        id: 0,
        name: 'addDate',
        overrides: { addedAt: new Date('2024-03-15') },
        expected: new Date('2024-03-15'),
      },
      {
        id: 0,
        name: 'addDate (missing)',
        overrides: { addedAt: undefined as unknown as Date },
        expected: null,
      },
      {
        id: 2,
        name: 'releaseDate',
        overrides: { originallyAvailableAt: new Date('2024-01-01') },
        expected: new Date('2024-01-01'),
      },
      {
        id: 3,
        name: 'rating_user',
        overrides: { userRating: 8 },
        expected: 8,
      },
      {
        id: 3,
        name: 'rating_user (missing)',
        overrides: { userRating: undefined },
        expected: 0,
      },
      {
        id: 4,
        name: 'people',
        overrides: {
          actors: [{ name: 'Actor One' }, { name: 'Actor Two' }],
        },
        expected: ['Actor One', 'Actor Two'],
      },
      {
        id: 4,
        name: 'people (missing)',
        overrides: { actors: undefined },
        expected: null,
      },
      {
        id: 8,
        name: 'fileVideoResolution',
        overrides: {},
        expected: '1080p',
      },
      {
        id: 8,
        name: 'fileVideoResolution (no sources)',
        overrides: { mediaSources: [] },
        expected: null,
      },
      {
        id: 9,
        name: 'fileBitrate',
        overrides: {},
        expected: 8000000,
      },
      {
        id: 10,
        name: 'fileVideoCodec',
        overrides: {},
        expected: 'h264',
      },
      {
        id: 11,
        name: 'genre',
        overrides: { genres: [{ name: 'Action' }, { name: 'Comedy' }] },
        expected: ['Action', 'Comedy'],
      },
      {
        id: 22,
        name: 'rating_critics',
        overrides: {
          ratings: [{ source: 'critic', value: 75, type: 'critic' as const }],
        },
        expected: 7.5,
      },
      {
        id: 22,
        name: 'rating_critics (missing)',
        overrides: { ratings: [] },
        expected: 0,
      },
      {
        id: 23,
        name: 'rating_audience',
        overrides: {
          ratings: [
            { source: 'audience', value: 8.5, type: 'audience' as const },
          ],
        },
        expected: 8.5,
      },
      {
        id: 24,
        name: 'labels',
        overrides: { labels: ['tag1', 'tag2'] },
        expected: ['tag1', 'tag2'],
      },
    ])(
      'returns $expected for $name (id: $id)',
      async ({ id, overrides, expected }) => {
        const mediaItem = createMediaItem({ type: 'movie', ...overrides });
        jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

        const response = await jellyfinGetterService.get(
          id,
          mediaItem,
          'movie',
          createRulesDto({ dataType: 'movie' }),
        );

        expect(response).toEqual(expected);
      },
    );
  });

  describe('seenBy (id: 1)', () => {
    it('should return list of usernames who watched the item', async () => {
      const mediaItem = createMediaItem();
      const users: MediaUser[] = [
        createMediaUser({ id: 'user-1', name: 'Alice' }),
        createMediaUser({ id: 'user-2', name: 'Bob' }),
      ];

      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);
      jellyfinAdapter.getItemSeenBy.mockResolvedValue(['user-1', 'user-2']);
      jellyfinAdapter.getUsers.mockResolvedValue(users);

      const response = await jellyfinGetterService.get(
        1,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(['Alice', 'Bob']);
    });

    it('should return empty array when no one has watched', async () => {
      const mediaItem = createMediaItem();

      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);
      jellyfinAdapter.getItemSeenBy.mockResolvedValue([]);
      jellyfinAdapter.getUsers.mockResolvedValue([]);

      const response = await jellyfinGetterService.get(
        1,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual([]);
    });
  });

  describe('viewCount (id: 5)', () => {
    it('should return total view count from watch history', async () => {
      const mediaItem = createMediaItem();
      const watchHistory: WatchRecord[] = [
        createWatchRecord({ userId: 'user-1' }),
        createWatchRecord({ userId: 'user-2' }),
        createWatchRecord({ userId: 'user-1' }),
      ];

      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);
      jellyfinAdapter.getWatchHistory.mockResolvedValue(watchHistory);

      const response = await jellyfinGetterService.get(
        5,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(3);
    });
  });

  describe('lastViewedAt (id: 7)', () => {
    it('should return the most recent watch date', async () => {
      const mediaItem = createMediaItem();
      const watchHistory: WatchRecord[] = [
        createWatchRecord({ watchedAt: new Date('2024-01-15') }),
        createWatchRecord({ watchedAt: new Date('2024-06-15') }),
        createWatchRecord({ watchedAt: new Date('2024-03-15') }),
      ];

      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);
      jellyfinAdapter.getWatchHistory.mockResolvedValue(watchHistory);

      const response = await jellyfinGetterService.get(
        7,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(new Date('2024-06-15'));
    });

    it('should return null when no watch history', async () => {
      const mediaItem = createMediaItem();

      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);
      jellyfinAdapter.getWatchHistory.mockResolvedValue([]);

      const response = await jellyfinGetterService.get(
        7,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBeNull();
    });
  });

  describe('sw_viewedEpisodes (id: 15) - Amount of watched episodes', () => {
    it('should return count of episodes that have been watched by any user for a show', async () => {
      const showItem = createMediaItem({ type: 'show' as MediaItemType });
      const season1 = createMediaItem({
        id: 'season-1',
        type: 'season' as MediaItemType,
      });
      const season2 = createMediaItem({
        id: 'season-2',
        type: 'season' as MediaItemType,
      });
      const episode1 = createMediaItem({
        id: 'ep-1',
        type: 'episode' as MediaItemType,
      });
      const episode2 = createMediaItem({
        id: 'ep-2',
        type: 'episode' as MediaItemType,
      });
      const episode3 = createMediaItem({
        id: 'ep-3',
        type: 'episode' as MediaItemType,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(showItem);
      // Show returns 2 seasons
      jellyfinAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (childType === 'season') return [season1, season2];
          if (parentId === 'season-1') return [episode1, episode2];
          if (parentId === 'season-2') return [episode3];
          return [];
        },
      );
      // ep-1 and ep-3 are watched, ep-2 is not
      jellyfinAdapter.getItemSeenBy.mockImplementation(
        async (itemId: string) => {
          if (itemId === 'ep-1') return ['user-1'];
          if (itemId === 'ep-3') return ['user-2', 'user-3'];
          return [];
        },
      );

      const response = await jellyfinGetterService.get(
        15, // sw_viewedEpisodes
        showItem,
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toBe(2); // 2 episodes have been watched
    });

    it('should return 0 when no episodes have been watched', async () => {
      const showItem = createMediaItem({ type: 'show' as MediaItemType });
      const season1 = createMediaItem({
        id: 'season-1',
        type: 'season' as MediaItemType,
      });
      const episode1 = createMediaItem({
        id: 'ep-1',
        type: 'episode' as MediaItemType,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(showItem);
      jellyfinAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (childType === 'season') return [season1];
          if (parentId === 'season-1') return [episode1];
          return [];
        },
      );
      jellyfinAdapter.getItemSeenBy.mockResolvedValue([]);

      const response = await jellyfinGetterService.get(
        15,
        showItem,
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toBe(0);
    });
  });

  describe('sw_amountOfViews (id: 17) - Total views', () => {
    it('should return total view count across all episodes for a show', async () => {
      const showItem = createMediaItem({ type: 'show' as MediaItemType });
      const season1 = createMediaItem({
        id: 'season-1',
        type: 'season' as MediaItemType,
      });
      const episode1 = createMediaItem({
        id: 'ep-1',
        type: 'episode' as MediaItemType,
      });
      const episode2 = createMediaItem({
        id: 'ep-2',
        type: 'episode' as MediaItemType,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(showItem);
      jellyfinAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (childType === 'season') return [season1];
          if (parentId === 'season-1') return [episode1, episode2];
          return [];
        },
      );
      // ep-1 watched 3 times, ep-2 watched 2 times
      jellyfinAdapter.getWatchHistory.mockImplementation(
        async (itemId: string) => {
          if (itemId === 'ep-1')
            return [
              createWatchRecord({ userId: 'user-1', itemId: 'ep-1' }),
              createWatchRecord({ userId: 'user-2', itemId: 'ep-1' }),
              createWatchRecord({ userId: 'user-1', itemId: 'ep-1' }), // re-watch
            ];
          if (itemId === 'ep-2')
            return [
              createWatchRecord({ userId: 'user-1', itemId: 'ep-2' }),
              createWatchRecord({ userId: 'user-3', itemId: 'ep-2' }),
            ];
          return [];
        },
      );

      const response = await jellyfinGetterService.get(
        17, // sw_amountOfViews
        showItem,
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toBe(5); // 3 + 2 = 5 total views
    });

    it('should return 0 when no episodes have been viewed', async () => {
      const showItem = createMediaItem({ type: 'show' as MediaItemType });
      const season1 = createMediaItem({
        id: 'season-1',
        type: 'season' as MediaItemType,
      });
      const episode1 = createMediaItem({
        id: 'ep-1',
        type: 'episode' as MediaItemType,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(showItem);
      jellyfinAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (childType === 'season') return [season1];
          if (parentId === 'season-1') return [episode1];
          return [];
        },
      );
      jellyfinAdapter.getWatchHistory.mockResolvedValue([]);

      const response = await jellyfinGetterService.get(
        17,
        showItem,
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toBe(0);
    });
  });

  describe('unsupported properties', () => {
    it('should return null for unknown property IDs', async () => {
      const mediaItem = createMediaItem();
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        999, // Unknown property ID
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should return undefined when an error occurs', async () => {
      const mediaItem = createMediaItem({ type: 'movie' });
      jellyfinAdapter.getMetadata.mockRejectedValue(new Error('API Error'));

      const response = await jellyfinGetterService.get(
        0,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBeUndefined();
    });

    it('should return null when metadata is not found', async () => {
      const mediaItem = createMediaItem({ type: 'movie' });
      jellyfinAdapter.getMetadata.mockResolvedValue(undefined);

      const response = await jellyfinGetterService.get(
        0,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBeNull();
    });
  });
});
