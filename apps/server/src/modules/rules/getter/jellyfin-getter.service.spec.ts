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

  describe('addDate (id: 0)', () => {
    it('should return the addedAt date', async () => {
      const mediaItem = createMediaItem({
        addedAt: new Date('2024-03-15'),
      });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        0,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(new Date('2024-03-15'));
    });

    it('should return null when addedAt is missing', async () => {
      const mediaItem = createMediaItem({
        addedAt: undefined as unknown as Date,
      });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        0,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBeNull();
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

  describe('releaseDate (id: 2)', () => {
    it('should return the originallyAvailableAt date', async () => {
      const mediaItem = createMediaItem({
        originallyAvailableAt: new Date('2024-01-01'),
      });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        2,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(new Date('2024-01-01'));
    });
  });

  describe('rating_user (id: 3)', () => {
    it('should return user rating', async () => {
      const mediaItem = createMediaItem({ userRating: 8 });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        3,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(8);
    });

    it('should return 0 when no user rating exists', async () => {
      const mediaItem = createMediaItem({ userRating: undefined });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        3,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(0);
    });
  });

  describe('people (id: 4)', () => {
    it('should return list of actor names', async () => {
      const mediaItem = createMediaItem({
        actors: [{ name: 'Actor One' }, { name: 'Actor Two' }],
      });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        4,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(['Actor One', 'Actor Two']);
    });

    it('should return null when no actors exist', async () => {
      const mediaItem = createMediaItem({ actors: undefined });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        4,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBeNull();
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

  describe('fileVideoResolution (id: 8)', () => {
    it('should return video resolution from media sources', async () => {
      const mediaItem = createMediaItem();
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        8,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe('1080p');
    });

    it('should return null when no media sources', async () => {
      const mediaItem = createMediaItem({ mediaSources: [] });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        8,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBeNull();
    });
  });

  describe('fileBitrate (id: 9)', () => {
    it('should return bitrate from media sources', async () => {
      const mediaItem = createMediaItem();
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        9,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(8000000);
    });
  });

  describe('fileVideoCodec (id: 10)', () => {
    it('should return video codec from media sources', async () => {
      const mediaItem = createMediaItem();
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        10,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe('h264');
    });
  });

  describe('genre (id: 11)', () => {
    it('should return list of genre names', async () => {
      const mediaItem = createMediaItem({
        genres: [{ name: 'Action' }, { name: 'Comedy' }],
      });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        11,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(['Action', 'Comedy']);
    });
  });

  describe('labels (id: 24)', () => {
    it('should return tags as labels', async () => {
      const mediaItem = createMediaItem({ labels: ['tag1', 'tag2'] });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        24,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(['tag1', 'tag2']);
    });
  });

  describe('rating_critics (id: 22)', () => {
    it('should return normalized critic rating (0-10 scale)', async () => {
      const mediaItem = createMediaItem({
        ratings: [{ source: 'critic', value: 75, type: 'critic' }],
      });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        22,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(7.5);
    });

    it('should return 0 when no critic rating', async () => {
      const mediaItem = createMediaItem({ ratings: [] });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        22,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(0);
    });
  });

  describe('rating_audience (id: 23)', () => {
    it('should return audience rating', async () => {
      const mediaItem = createMediaItem({
        ratings: [{ source: 'audience', value: 8.5, type: 'audience' }],
      });
      jellyfinAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        23,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(8.5);
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
