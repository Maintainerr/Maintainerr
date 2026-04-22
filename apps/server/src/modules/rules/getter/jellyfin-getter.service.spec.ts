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

  const JELLYFIN_IS_WATCHED_PROP_ID = 42;

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
          ratings: [{ source: 'critic', value: 7.5, type: 'critic' as const }],
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

  describe('IMDb rating semantics', () => {
    it('falls back to Jellyfin CommunityRating for rating_imdb', async () => {
      const mediaItem = createMediaItem({
        type: 'movie',
        ratings: [
          { source: 'community', value: 6.9, type: 'audience' },
          { source: 'audience', value: 8.8, type: 'audience' },
        ],
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        44,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(6.9);
    });
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

  describe('favoritedBy rules', () => {
    it('sw_favoritedBy (id: 40) should only check favorites on the current item', async () => {
      const episodeItem = createMediaItem({
        id: 'ep-1',
        type: 'episode' as MediaItemType,
        parentId: 'season-1',
        grandparentId: 'show-1',
      });
      const users: MediaUser[] = [
        createMediaUser({ id: 'user-1', name: 'Alice' }),
        createMediaUser({ id: 'user-2', name: 'Bob' }),
      ];

      jellyfinAdapter.getMetadata.mockResolvedValue(episodeItem);
      jellyfinAdapter.getItemFavoritedBy.mockImplementation(
        async (itemId: string) => {
          if (itemId === 'ep-1') return ['user-2'];
          if (itemId === 'season-1') return ['user-1'];
          if (itemId === 'show-1') return ['user-1'];
          return [];
        },
      );
      jellyfinAdapter.getUsers.mockResolvedValue(users);

      const response = await jellyfinGetterService.get(
        40, // sw_favoritedBy
        episodeItem,
        'episode',
        createRulesDto({ dataType: 'episode' }),
      );

      expect(response).toEqual(['Bob']);
      expect(jellyfinAdapter.getItemFavoritedBy).toHaveBeenCalledTimes(1);
      expect(jellyfinAdapter.getItemFavoritedBy).toHaveBeenCalledWith('ep-1');
    });

    it('sw_favoritedBy_including_parent (id: 41) should include favorites from item, parent and grandparent', async () => {
      const episodeItem = createMediaItem({
        id: 'ep-1',
        type: 'episode' as MediaItemType,
        parentId: 'season-1',
        grandparentId: 'show-1',
      });
      const seasonItem = createMediaItem({
        id: 'season-1',
        type: 'season' as MediaItemType,
        parentId: 'show-1',
      });
      const showItem = createMediaItem({
        id: 'show-1',
        type: 'show' as MediaItemType,
      });
      const users: MediaUser[] = [
        createMediaUser({ id: 'user-1', name: 'Alice' }),
        createMediaUser({ id: 'user-2', name: 'Bob' }),
        createMediaUser({ id: 'user-3', name: 'Carol' }),
        createMediaUser({ id: 'user-4', name: 'Dave' }),
      ];

      jellyfinAdapter.getMetadata.mockImplementation(async (itemId: string) => {
        if (itemId === 'ep-1') return episodeItem;
        if (itemId === 'season-1') return seasonItem;
        if (itemId === 'show-1') return showItem;
        return undefined;
      });
      jellyfinAdapter.getItemFavoritedBy.mockImplementation(
        async (itemId: string) => {
          if (itemId === 'ep-1') return ['user-1', 'user-2'];
          if (itemId === 'season-1') return ['user-2', 'user-3'];
          if (itemId === 'show-1') return ['user-4'];
          return [];
        },
      );
      jellyfinAdapter.getUsers.mockResolvedValue(users);

      const response = await jellyfinGetterService.get(
        41, // sw_favoritedBy_including_parent
        episodeItem,
        'episode',
        createRulesDto({ dataType: 'episode' }),
      );

      expect(response).toEqual(['Alice', 'Bob', 'Carol', 'Dave']);
      expect(jellyfinAdapter.getItemFavoritedBy).toHaveBeenCalledTimes(3);
      expect(jellyfinAdapter.getItemFavoritedBy).toHaveBeenNthCalledWith(
        1,
        'ep-1',
      );
      expect(jellyfinAdapter.getItemFavoritedBy).toHaveBeenNthCalledWith(
        2,
        'season-1',
      );
      expect(jellyfinAdapter.getItemFavoritedBy).toHaveBeenNthCalledWith(
        3,
        'show-1',
      );
    });
  });

  describe('viewCount (id: 5)', () => {
    it('should return total view count from shared watch state', async () => {
      const mediaItem = createMediaItem();

      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);
      jellyfinAdapter.getWatchState.mockResolvedValue({
        viewCount: 3,
        isWatched: true,
      });

      const response = await jellyfinGetterService.get(
        5,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(3);
    });
  });

  describe('isWatched', () => {
    it('should return true when shared watch state reports the item as watched', async () => {
      const mediaItem = createMediaItem();

      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);
      jellyfinAdapter.getWatchState.mockResolvedValue({
        viewCount: 1,
        isWatched: true,
      });

      const response = await jellyfinGetterService.get(
        JELLYFIN_IS_WATCHED_PROP_ID,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(true);
    });

    it('should return false when shared watch state reports the item as unwatched', async () => {
      const mediaItem = createMediaItem();

      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);
      jellyfinAdapter.getWatchState.mockResolvedValue({
        viewCount: 0,
        isWatched: false,
      });

      const response = await jellyfinGetterService.get(
        JELLYFIN_IS_WATCHED_PROP_ID,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(false);
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

    it('should return undefined when watch history lookup fails', async () => {
      const mediaItem = createMediaItem();

      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);
      jellyfinAdapter.getWatchHistory.mockRejectedValue(
        new Error('Jellyfin unavailable'),
      );

      const response = await jellyfinGetterService.get(
        7,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBeUndefined();
    });

    it('should aggregate the latest watched episode date for a show', async () => {
      const showItem = createMediaItem({
        id: 'show-1',
        type: 'show' as MediaItemType,
      });
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

      jellyfinAdapter.getMetadata.mockResolvedValue(showItem);
      jellyfinAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (parentId === 'show-1' && childType === 'season') {
            return [season1, season2];
          }
          if (parentId === 'season-1' && childType === 'episode') {
            return [episode1];
          }
          if (parentId === 'season-2' && childType === 'episode') {
            return [episode2];
          }
          return [];
        },
      );
      jellyfinAdapter.getWatchHistory.mockImplementation(
        async (itemId: string) => {
          if (itemId === 'ep-1') {
            return [
              createWatchRecord({ itemId, watchedAt: new Date('2026-03-01') }),
            ];
          }
          if (itemId === 'ep-2') {
            return [
              createWatchRecord({ itemId, watchedAt: new Date('2026-03-06') }),
            ];
          }
          return [];
        },
      );

      const response = await jellyfinGetterService.get(
        7,
        showItem,
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toEqual(new Date('2026-03-06'));
    });

    it('should aggregate the latest watched episode date for a season', async () => {
      const seasonItem = createMediaItem({
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

      jellyfinAdapter.getMetadata.mockResolvedValue(seasonItem);
      jellyfinAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (parentId === 'season-1' && childType === 'episode') {
            return [episode1, episode2];
          }
          return [];
        },
      );
      jellyfinAdapter.getWatchHistory.mockImplementation(
        async (itemId: string) => {
          if (itemId === 'ep-1') {
            return [
              createWatchRecord({ itemId, watchedAt: new Date('2026-03-01') }),
            ];
          }
          if (itemId === 'ep-2') {
            return [
              createWatchRecord({ itemId, watchedAt: new Date('2026-03-04') }),
            ];
          }
          return [];
        },
      );

      const response = await jellyfinGetterService.get(
        7,
        seasonItem,
        'season',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toEqual(new Date('2026-03-04'));
    });
  });

  describe('sw_lastWatched (id: 13) - Newest episode view date', () => {
    it('should return the view date of the highest-numbered watched episode for a show', async () => {
      const showItem = createMediaItem({
        id: 'show-1',
        type: 'show' as MediaItemType,
      });
      const season1 = createMediaItem({
        id: 'season-1',
        type: 'season' as MediaItemType,
        index: 1,
      });
      const season2 = createMediaItem({
        id: 'season-2',
        type: 'season' as MediaItemType,
        index: 2,
      });
      const s2e1 = createMediaItem({
        id: 'ep-s2e1',
        type: 'episode' as MediaItemType,
        index: 1,
        parentIndex: 2,
      });
      const s2e2 = createMediaItem({
        id: 'ep-s2e2',
        type: 'episode' as MediaItemType,
        index: 2,
        parentIndex: 2,
      });
      const s1e1 = createMediaItem({
        id: 'ep-s1e1',
        type: 'episode' as MediaItemType,
        index: 1,
        parentIndex: 1,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(showItem);
      jellyfinAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (parentId === 'show-1' && childType === 'season') {
            return [season1, season2];
          }
          if (parentId === 'season-1' && childType === 'episode') {
            return [s1e1];
          }
          if (parentId === 'season-2' && childType === 'episode') {
            return [s2e1, s2e2];
          }
          return [];
        },
      );
      jellyfinAdapter.getWatchHistory.mockImplementation(
        async (itemId: string) => {
          // S1E1 rewatched most recently, but we should still prefer S2E2
          if (itemId === 'ep-s1e1') {
            return [
              createWatchRecord({ itemId, watchedAt: new Date('2026-04-20') }),
            ];
          }
          if (itemId === 'ep-s2e1') {
            return [
              createWatchRecord({ itemId, watchedAt: new Date('2026-03-01') }),
            ];
          }
          if (itemId === 'ep-s2e2') {
            return [
              createWatchRecord({ itemId, watchedAt: new Date('2026-03-06') }),
            ];
          }
          return [];
        },
      );

      const response = await jellyfinGetterService.get(
        13,
        showItem,
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toEqual(new Date('2026-03-06'));
    });

    it('should return the view date of the highest-numbered watched episode for a season', async () => {
      const seasonItem = createMediaItem({
        id: 'season-1',
        type: 'season' as MediaItemType,
        index: 1,
      });
      const ep1 = createMediaItem({
        id: 'ep-1',
        type: 'episode' as MediaItemType,
        index: 1,
        parentIndex: 1,
      });
      const ep2 = createMediaItem({
        id: 'ep-2',
        type: 'episode' as MediaItemType,
        index: 2,
        parentIndex: 1,
      });
      const ep3 = createMediaItem({
        id: 'ep-3',
        type: 'episode' as MediaItemType,
        index: 3,
        parentIndex: 1,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(seasonItem);
      jellyfinAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (parentId === 'season-1' && childType === 'episode') {
            return [ep1, ep2, ep3];
          }
          return [];
        },
      );
      jellyfinAdapter.getWatchHistory.mockImplementation(
        async (itemId: string) => {
          if (itemId === 'ep-1') {
            return [
              createWatchRecord({ itemId, watchedAt: new Date('2026-04-10') }),
            ];
          }
          if (itemId === 'ep-2') {
            return [
              createWatchRecord({ itemId, watchedAt: new Date('2026-03-01') }),
            ];
          }
          // ep-3 (the latest episode) has never been watched
          return [];
        },
      );

      const response = await jellyfinGetterService.get(
        13,
        seasonItem,
        'season',
        createRulesDto({ dataType: 'show' }),
      );

      // ep-2 is the highest-numbered watched episode; its rewatch wins.
      expect(response).toEqual(new Date('2026-03-01'));
    });

    it('should return null when no episode has been watched', async () => {
      const seasonItem = createMediaItem({
        id: 'season-1',
        type: 'season' as MediaItemType,
        index: 1,
      });
      const ep1 = createMediaItem({
        id: 'ep-1',
        type: 'episode' as MediaItemType,
        index: 1,
        parentIndex: 1,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(seasonItem);
      jellyfinAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (parentId === 'season-1' && childType === 'episode') {
            return [ep1];
          }
          return [];
        },
      );
      jellyfinAdapter.getWatchHistory.mockResolvedValue([]);

      const response = await jellyfinGetterService.get(
        13,
        seasonItem,
        'season',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toBeNull();
    });

    it('should keep watched specials in season 0 eligible for newest episode selection', async () => {
      const seasonItem = createMediaItem({
        id: 'season-specials',
        type: 'season' as MediaItemType,
        index: 0,
      });
      const special = createMediaItem({
        id: 'ep-special-1',
        type: 'episode' as MediaItemType,
        index: 1,
        parentIndex: 0,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(seasonItem);
      jellyfinAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (parentId === 'season-specials' && childType === 'episode') {
            return [special];
          }
          return [];
        },
      );
      jellyfinAdapter.getWatchHistory.mockResolvedValue([
        createWatchRecord({
          itemId: 'ep-special-1',
          watchedAt: new Date('2026-02-01'),
        }),
      ]);

      const response = await jellyfinGetterService.get(
        13,
        seasonItem,
        'season',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toEqual(new Date('2026-02-01'));
    });

    it('should rank multi-episode items by their ending episode number', async () => {
      const seasonItem = createMediaItem({
        id: 'season-1',
        type: 'season' as MediaItemType,
        index: 1,
      });
      const ep1 = createMediaItem({
        id: 'ep-1',
        type: 'episode' as MediaItemType,
        index: 1,
        parentIndex: 1,
      });
      const ep1e2 = createMediaItem({
        id: 'ep-1-2',
        type: 'episode' as MediaItemType,
        index: 1,
        indexEnd: 2,
        parentIndex: 1,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(seasonItem);
      jellyfinAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (parentId === 'season-1' && childType === 'episode') {
            return [ep1, ep1e2];
          }
          return [];
        },
      );
      jellyfinAdapter.getWatchHistory.mockImplementation(
        async (itemId: string) => {
          if (itemId === 'ep-1') {
            return [
              createWatchRecord({ itemId, watchedAt: new Date('2026-04-10') }),
            ];
          }
          if (itemId === 'ep-1-2') {
            return [
              createWatchRecord({ itemId, watchedAt: new Date('2026-03-01') }),
            ];
          }
          return [];
        },
      );

      const response = await jellyfinGetterService.get(
        13,
        seasonItem,
        'season',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toEqual(new Date('2026-03-01'));
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

  describe('sw_watchers (id: 18) - Users that watched the show/season/episode', () => {
    const SW_WATCHERS_PROP_ID = 18;

    it('returns the union of users that watched at least one episode', async () => {
      // Regression test for #2559: sw_watchers must include partial show
      // watchers (users who have seen any episode), not only users who
      // finished every episode (which is sw_allEpisodesSeenBy's semantic).
      const showItem = createMediaItem({
        id: 'show-1',
        type: 'show' as MediaItemType,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(showItem);
      jellyfinAdapter.getDescendantEpisodeWatchers.mockResolvedValue([
        'user-1',
        'user-2',
      ]);
      jellyfinAdapter.getUsers.mockResolvedValue([
        createMediaUser({ id: 'user-1', name: 'Alice' }),
        createMediaUser({ id: 'user-2', name: 'Bob' }),
        createMediaUser({ id: 'user-3', name: 'Carol' }),
      ]);

      const response = await jellyfinGetterService.get(
        SW_WATCHERS_PROP_ID,
        showItem,
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toEqual(['Alice', 'Bob']);
      expect(jellyfinAdapter.getDescendantEpisodeWatchers).toHaveBeenCalledWith(
        'show-1',
      );
    });

    it('returns an empty list when no user has watched any episode', async () => {
      const showItem = createMediaItem({
        id: 'show-2',
        type: 'show' as MediaItemType,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(showItem);
      jellyfinAdapter.getDescendantEpisodeWatchers.mockResolvedValue([]);
      jellyfinAdapter.getUsers.mockResolvedValue([
        createMediaUser({ id: 'user-1', name: 'Alice' }),
      ]);

      const response = await jellyfinGetterService.get(
        SW_WATCHERS_PROP_ID,
        showItem,
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toEqual([]);
    });

    it('works for seasons (recursive episode descendants)', async () => {
      const seasonItem = createMediaItem({
        id: 'season-1',
        type: 'season' as MediaItemType,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(seasonItem);
      jellyfinAdapter.getDescendantEpisodeWatchers.mockResolvedValue([
        'user-2',
      ]);
      jellyfinAdapter.getUsers.mockResolvedValue([
        createMediaUser({ id: 'user-1', name: 'Alice' }),
        createMediaUser({ id: 'user-2', name: 'Bob' }),
      ]);

      const response = await jellyfinGetterService.get(
        SW_WATCHERS_PROP_ID,
        seasonItem,
        'season',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toEqual(['Bob']);
      expect(jellyfinAdapter.getDescendantEpisodeWatchers).toHaveBeenCalledWith(
        'season-1',
      );
    });

    it('keeps episode watcher lookups on direct watch history', async () => {
      const episodeItem = createMediaItem({
        id: 'episode-1',
        type: 'episode' as MediaItemType,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(episodeItem);
      jellyfinAdapter.getItemSeenBy.mockResolvedValue(['user-2']);
      jellyfinAdapter.getUsers.mockResolvedValue([
        createMediaUser({ id: 'user-1', name: 'Alice' }),
        createMediaUser({ id: 'user-2', name: 'Bob' }),
      ]);

      const response = await jellyfinGetterService.get(
        SW_WATCHERS_PROP_ID,
        episodeItem,
        'episode',
        createRulesDto({ dataType: 'episode' }),
      );

      expect(response).toEqual(['Bob']);
      expect(jellyfinAdapter.getItemSeenBy).toHaveBeenCalledWith('episode-1');
      expect(
        jellyfinAdapter.getDescendantEpisodeWatchers,
      ).not.toHaveBeenCalled();
    });

    it('falls back to the user id when a name is not resolvable', async () => {
      const showItem = createMediaItem({
        id: 'show-3',
        type: 'show' as MediaItemType,
      });

      jellyfinAdapter.getMetadata.mockResolvedValue(showItem);
      jellyfinAdapter.getDescendantEpisodeWatchers.mockResolvedValue([
        'user-ghost',
      ]);
      jellyfinAdapter.getUsers.mockResolvedValue([
        createMediaUser({ id: 'user-1', name: 'Alice' }),
      ]);

      const response = await jellyfinGetterService.get(
        SW_WATCHERS_PROP_ID,
        showItem,
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toEqual(['user-ghost']);
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

  describe('collection_siblings_lastViewedAt (id 45)', () => {
    const COLLECTION_SIBLINGS_PROP_ID = 45;
    const ITEM_ID = 'jellyfin-item-123';

    const makeChild = (id: string): MediaItem =>
      createMediaItem({ id, type: 'movie' });

    it('returns the newest watched date across siblings in a shared collection', async () => {
      const libItem = createMediaItem({ id: ITEM_ID, type: 'movie' });
      jellyfinAdapter.getMetadata.mockResolvedValue(libItem);

      jellyfinAdapter.getCollections.mockResolvedValue([
        {
          id: 'coll-franchise-a',
          title: 'Franchise A Collection',
          childCount: 8,
        },
        { id: 'coll-other', title: 'Unrelated', childCount: 2 },
      ]);

      jellyfinAdapter.getCollectionChildren.mockImplementation(async (cid) => {
        if (cid === 'coll-franchise-a') {
          return [makeChild(ITEM_ID), makeChild('sibling-a')];
        }
        return [makeChild('other-1'), makeChild('other-2')];
      });

      jellyfinAdapter.getWatchHistory.mockImplementation(async (itemId) => {
        if (itemId === ITEM_ID) {
          return [
            {
              userId: 'u1',
              itemId,
              watchedAt: new Date('2026-01-01T00:00:00Z'),
            },
          ];
        }
        if (itemId === 'sibling-a') {
          return [
            {
              userId: 'u2',
              itemId,
              watchedAt: new Date('2026-03-01T00:00:00Z'),
            },
          ];
        }
        return [];
      });

      const result = await jellyfinGetterService.get(
        COLLECTION_SIBLINGS_PROP_ID,
        libItem,
        'movie',
        createRulesDto({
          dataType: 'movie',
          libraryId: libItem.library.id,
          name: 'Movie cleanup',
        }),
      );

      expect(result).toEqual(new Date('2026-03-01T00:00:00Z'));
      // Membership is discovered by walking every non-excluded collection
      // (Jellyfin has no reverse lookup), but only the matching collection's
      // siblings contribute to the watch-history aggregation.
      expect(jellyfinAdapter.getCollectionChildren).toHaveBeenCalledWith(
        'coll-franchise-a',
      );
      expect(jellyfinAdapter.getWatchHistory).toHaveBeenCalledWith(ITEM_ID);
      expect(jellyfinAdapter.getWatchHistory).toHaveBeenCalledWith('sibling-a');
      expect(jellyfinAdapter.getWatchHistory).not.toHaveBeenCalledWith(
        'other-1',
      );
      expect(jellyfinAdapter.getWatchHistory).not.toHaveBeenCalledWith(
        'other-2',
      );
    });

    it('returns null when no collection contains the item', async () => {
      const libItem = createMediaItem({ id: ITEM_ID, type: 'movie' });
      jellyfinAdapter.getMetadata.mockResolvedValue(libItem);

      jellyfinAdapter.getCollections.mockResolvedValue([
        { id: 'coll-x', title: 'Something Else', childCount: 1 },
      ]);
      jellyfinAdapter.getCollectionChildren.mockResolvedValue([
        makeChild('not-me'),
      ]);

      const result = await jellyfinGetterService.get(
        COLLECTION_SIBLINGS_PROP_ID,
        libItem,
        'movie',
        createRulesDto({ dataType: 'movie', libraryId: libItem.library.id }),
      );

      expect(result).toBeNull();
      expect(jellyfinAdapter.getWatchHistory).not.toHaveBeenCalled();
    });

    it("ignores the rule group's own managed collection", async () => {
      const libItem = createMediaItem({ id: ITEM_ID, type: 'movie' });
      jellyfinAdapter.getMetadata.mockResolvedValue(libItem);

      jellyfinAdapter.getCollections.mockResolvedValue([
        { id: 'coll-own', title: 'Movie cleanup', childCount: 5 },
        {
          id: 'coll-franchise-a',
          title: 'Franchise A Collection',
          childCount: 8,
        },
      ]);
      jellyfinAdapter.getCollectionChildren.mockImplementation(async (cid) => {
        if (cid === 'coll-franchise-a') {
          return [makeChild(ITEM_ID), makeChild('sibling-a')];
        }
        if (cid === 'coll-own') {
          // own-collection also contains the item, but must be skipped
          return [makeChild(ITEM_ID)];
        }
        return [];
      });
      jellyfinAdapter.getWatchHistory.mockImplementation(async (itemId) =>
        itemId === 'sibling-a'
          ? [
              {
                userId: 'u1',
                itemId,
                watchedAt: new Date('2026-02-14T00:00:00Z'),
              },
            ]
          : [],
      );

      const result = await jellyfinGetterService.get(
        COLLECTION_SIBLINGS_PROP_ID,
        libItem,
        'movie',
        createRulesDto({
          dataType: 'movie',
          libraryId: libItem.library.id,
          name: 'Movie cleanup',
        }),
      );

      expect(result).toEqual(new Date('2026-02-14T00:00:00Z'));
      expect(jellyfinAdapter.getCollectionChildren).not.toHaveBeenCalledWith(
        'coll-own',
      );
    });
  });
});
