import { Mocked, TestBed } from '@suites/unit';
import { EMediaDataType, MediaItem, MediaUser, WatchRecord } from '@maintainerr/contracts';
import {
  createCollection,
  createPlexLibraryItem,
  createRulesDto,
} from '../../../../test/utils/data';

import { PlexLibraryItem } from '../../api/plex-api/interfaces/library.interfaces';
import { JellyfinService } from '../../api/media-server/jellyfin/jellyfin.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import { JellyfinGetterService } from './jellyfin-getter.service';

// Helper to create mock MediaItem
const createMediaItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: 'jellyfin-item-123',
  title: 'Test Movie',
  type: EMediaDataType.MOVIES,
  guid: 'jellyfin-guid-123',
  addedAt: new Date('2024-01-15'),
  providerIds: { tmdb: '12345', imdb: 'tt1234567' },
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
const createWatchRecord = (overrides: Partial<WatchRecord> = {}): WatchRecord => ({
  userId: 'user-1',
  itemId: 'jellyfin-item-123',
  watchedAt: new Date('2024-06-15'),
  ...overrides,
});

describe('JellyfinGetterService', () => {
  let jellyfinGetterService: JellyfinGetterService;
  let jellyfinService: Mocked<JellyfinService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(JellyfinGetterService).compile();

    jellyfinGetterService = unit;
    jellyfinService = unitRef.get(JellyfinService);
    logger = unitRef.get(MaintainerrLogger);

    // Default: Jellyfin is set up
    jellyfinService.isSetup.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when Jellyfin is not configured', () => {
    it('should return null when Jellyfin service is not set up', async () => {
      jellyfinService.isSetup.mockReturnValue(false);

      const plexLibraryItem = createPlexLibraryItem('movie');
      const response = await jellyfinGetterService.get(
        0, // addDate
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBeNull();
    });
  });

  describe('addDate (id: 0)', () => {
    it('should return the addedAt date', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({
        addedAt: new Date('2024-03-15'),
      });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        0,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toEqual(new Date('2024-03-15'));
    });

    it('should return null when addedAt is missing', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({ addedAt: undefined as unknown as Date });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        0,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBeNull();
    });
  });

  describe('seenBy (id: 1)', () => {
    it('should return list of usernames who watched the item', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem();
      const users: MediaUser[] = [
        createMediaUser({ id: 'user-1', name: 'Alice' }),
        createMediaUser({ id: 'user-2', name: 'Bob' }),
      ];

      jellyfinService.getMetadata.mockResolvedValue(mediaItem);
      jellyfinService.getItemSeenBy.mockResolvedValue(['user-1', 'user-2']);
      jellyfinService.getUsers.mockResolvedValue(users);

      const response = await jellyfinGetterService.get(
        1,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toEqual(['Alice', 'Bob']);
    });

    it('should return empty array when no one has watched', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem();

      jellyfinService.getMetadata.mockResolvedValue(mediaItem);
      jellyfinService.getItemSeenBy.mockResolvedValue([]);
      jellyfinService.getUsers.mockResolvedValue([]);

      const response = await jellyfinGetterService.get(
        1,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toEqual([]);
    });
  });

  describe('releaseDate (id: 2)', () => {
    it('should return the originallyAvailableAt date', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({
        originallyAvailableAt: new Date('2024-01-01'),
      });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        2,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toEqual(new Date('2024-01-01'));
    });
  });

  describe('rating_user (id: 3)', () => {
    it('should return user rating', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({ userRating: 8 });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        3,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBe(8);
    });

    it('should return 0 when no user rating exists', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({ userRating: undefined });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        3,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBe(0);
    });
  });

  describe('people (id: 4)', () => {
    it('should return list of actor names', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({
        actors: [{ name: 'Actor One' }, { name: 'Actor Two' }],
      });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        4,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toEqual(['Actor One', 'Actor Two']);
    });

    it('should return null when no actors exist', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({ actors: undefined });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        4,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBeNull();
    });
  });

  describe('viewCount (id: 5)', () => {
    it('should return total view count from watch history', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem();
      const watchHistory: WatchRecord[] = [
        createWatchRecord({ userId: 'user-1' }),
        createWatchRecord({ userId: 'user-2' }),
        createWatchRecord({ userId: 'user-1' }),
      ];

      jellyfinService.getMetadata.mockResolvedValue(mediaItem);
      jellyfinService.getWatchHistory.mockResolvedValue(watchHistory);

      const response = await jellyfinGetterService.get(
        5,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBe(3);
    });
  });

  describe('lastViewedAt (id: 7)', () => {
    it('should return the most recent watch date', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem();
      const watchHistory: WatchRecord[] = [
        createWatchRecord({ watchedAt: new Date('2024-01-15') }),
        createWatchRecord({ watchedAt: new Date('2024-06-15') }),
        createWatchRecord({ watchedAt: new Date('2024-03-15') }),
      ];

      jellyfinService.getMetadata.mockResolvedValue(mediaItem);
      jellyfinService.getWatchHistory.mockResolvedValue(watchHistory);

      const response = await jellyfinGetterService.get(
        7,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toEqual(new Date('2024-06-15'));
    });

    it('should return null when no watch history', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem();

      jellyfinService.getMetadata.mockResolvedValue(mediaItem);
      jellyfinService.getWatchHistory.mockResolvedValue([]);

      const response = await jellyfinGetterService.get(
        7,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBeNull();
    });
  });

  describe('fileVideoResolution (id: 8)', () => {
    it('should return video resolution from media sources', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem();
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        8,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBe('1080p');
    });

    it('should return null when no media sources', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({ mediaSources: [] });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        8,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBeNull();
    });
  });

  describe('fileBitrate (id: 9)', () => {
    it('should return bitrate from media sources', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem();
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        9,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBe(8000000);
    });
  });

  describe('fileVideoCodec (id: 10)', () => {
    it('should return video codec from media sources', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem();
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        10,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBe('h264');
    });
  });

  describe('genre (id: 11)', () => {
    it('should return list of genre names', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({
        genres: [{ name: 'Action' }, { name: 'Comedy' }],
      });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        11,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toEqual(['Action', 'Comedy']);
    });
  });

  describe('labels (id: 24)', () => {
    it('should return tags as labels', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({ labels: ['tag1', 'tag2'] });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        24,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toEqual(['tag1', 'tag2']);
    });
  });

  describe('rating_critics (id: 22)', () => {
    it('should return normalized critic rating (0-10 scale)', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({
        ratings: [{ source: 'critic', value: 75, type: 'critic' }],
      });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        22,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBe(7.5);
    });

    it('should return 0 when no critic rating', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({ ratings: [] });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        22,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBe(0);
    });
  });

  describe('rating_audience (id: 23)', () => {
    it('should return audience rating', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem({
        ratings: [{ source: 'audience', value: 8.5, type: 'audience' }],
      });
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        23,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBe(8.5);
    });
  });

  describe('unsupported properties', () => {
    it('should return null for unknown property IDs', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      const mediaItem = createMediaItem();
      jellyfinService.getMetadata.mockResolvedValue(mediaItem);

      const response = await jellyfinGetterService.get(
        999, // Unknown property ID
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should return undefined when an error occurs', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      jellyfinService.getMetadata.mockRejectedValue(new Error('API Error'));

      const response = await jellyfinGetterService.get(
        0,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBeUndefined();
    });

    it('should return null when metadata is not found', async () => {
      const plexLibraryItem = createPlexLibraryItem('movie');
      jellyfinService.getMetadata.mockResolvedValue(undefined);

      const response = await jellyfinGetterService.get(
        0,
        plexLibraryItem,
        EMediaDataType.MOVIES,
        createRulesDto({ dataType: EMediaDataType.MOVIES }),
      );

      expect(response).toBeNull();
    });
  });
});
