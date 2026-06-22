import {
  MediaCollection,
  MediaItem,
  MediaItemType,
  MediaUser,
  ServarrAction,
  WatchRecord,
} from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { createRulesDto } from '../../../../test/utils/data';

import cacheManager from '../../api/lib/cache';
import { KodiAdapterService } from '../../api/media-server/kodi/kodi-adapter.service';
import { KodiGetterService } from './kodi-getter.service';

// Kodi is single-user: the adapter projects everything onto one synthetic user.
const KODI_USER: MediaUser = { id: 'kodi', name: 'Kodi' };

const createMediaItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: 'kodi-item-123',
  title: 'Invented Film',
  type: 'movie' as MediaItemType,
  guid: 'kodi-guid-123',
  addedAt: new Date('2024-01-15'),
  providerIds: { tmdb: ['12345'], imdb: ['tt1234567'] },
  mediaSources: [],
  library: { id: 'movies', title: 'Movies' },
  ...overrides,
});

const createMediaCollection = (
  overrides: Partial<MediaCollection> = {},
): MediaCollection => ({
  id: 'collection-1',
  title: 'Collection One',
  childCount: 1,
  ...overrides,
});

const createWatchRecord = (
  overrides: Partial<WatchRecord> = {},
): WatchRecord => ({
  userId: 'kodi',
  itemId: 'kodi-item-123',
  watchedAt: new Date('2024-06-15'),
  ...overrides,
});

// Property IDs are inherited verbatim from the Jellyfin prop list.
const PROP = {
  addDate: 0,
  seenBy: 1,
  viewCount: 5,
  collections: 6,
  genre: 11,
  sw_lastWatched: 13,
  collection_names: 19,
  isWatched: 42,
} as const;

describe('KodiGetterService', () => {
  let kodiGetterService: KodiGetterService;
  let kodiAdapter: Mocked<KodiAdapterService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(KodiGetterService).compile();

    kodiGetterService = unit;
    kodiAdapter = unitRef.get(KodiAdapterService);
    kodiAdapter.isSetup.mockReturnValue(true);
    // Single synthetic user for every user-backed property.
    kodiAdapter.getUsers.mockResolvedValue([KODI_USER]);
  });

  afterEach(() => {
    cacheManager.getCache('kodi')?.flush();
    jest.clearAllMocks();
  });

  describe('addDate', () => {
    it('returns the item added date as a Date', async () => {
      const mediaItem = createMediaItem({ addedAt: new Date('2024-03-10') });
      kodiAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await kodiGetterService.get(
        PROP.addDate,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(new Date('2024-03-10'));
    });
  });

  describe('watch state', () => {
    it('returns the view count from the adapter watch state', async () => {
      const mediaItem = createMediaItem();
      kodiAdapter.getMetadata.mockResolvedValue(mediaItem);
      kodiAdapter.getWatchState.mockResolvedValue({
        viewCount: 3,
        isWatched: true,
      });

      const response = await kodiGetterService.get(
        PROP.viewCount,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(3);
      expect(kodiAdapter.getWatchState).toHaveBeenCalledWith(mediaItem.id);
    });

    it('returns the watched flag from the adapter watch state', async () => {
      const mediaItem = createMediaItem();
      kodiAdapter.getMetadata.mockResolvedValue(mediaItem);
      kodiAdapter.getWatchState.mockResolvedValue({
        viewCount: 0,
        isWatched: false,
      });

      const response = await kodiGetterService.get(
        PROP.isWatched,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBe(false);
    });
  });

  describe('user-backed rules', () => {
    it('resolves seenBy to the single Kodi user', async () => {
      const mediaItem = createMediaItem();
      kodiAdapter.getMetadata.mockResolvedValue(mediaItem);
      kodiAdapter.getItemSeenBy.mockResolvedValue(['kodi']);

      const response = await kodiGetterService.get(
        PROP.seenBy,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(['Kodi']);
    });

    it('returns an empty seenBy list when nobody has watched', async () => {
      const mediaItem = createMediaItem();
      kodiAdapter.getMetadata.mockResolvedValue(mediaItem);
      kodiAdapter.getItemSeenBy.mockResolvedValue([]);

      const response = await kodiGetterService.get(
        PROP.seenBy,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual([]);
    });

  });

  describe('genre', () => {
    it('returns the genre names of a movie', async () => {
      const mediaItem = createMediaItem({
        genres: [{ name: 'Drama' }, { name: 'Mystery' }],
      });
      kodiAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await kodiGetterService.get(
        PROP.genre,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(['Drama', 'Mystery']);
    });

    it('returns an empty list when the movie has no genres', async () => {
      const mediaItem = createMediaItem({ genres: undefined });
      kodiAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await kodiGetterService.get(
        PROP.genre,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual([]);
    });

    it('resolves episode genres from the grandparent show', async () => {
      const episodeItem = createMediaItem({
        id: 'episode-1',
        type: 'episode' as MediaItemType,
        parentId: 'season-1',
        grandparentId: 'show-1',
      });
      const showItem = createMediaItem({
        id: 'show-1',
        type: 'show' as MediaItemType,
        genres: [{ name: 'Sci-Fi' }],
      });

      kodiAdapter.getMetadata.mockImplementation(async (itemId: string) => {
        if (itemId === 'episode-1') return episodeItem;
        if (itemId === 'show-1') return showItem;
        return undefined;
      });

      const response = await kodiGetterService.get(
        PROP.genre,
        episodeItem,
        'episode',
        createRulesDto({ dataType: 'episode' }),
      );

      expect(response).toEqual(['Sci-Fi']);
    });
  });

  describe('collection rules', () => {
    it('trims collection names and excludes the rule and manual collections', async () => {
      const mediaItem = createMediaItem({
        id: 'movie-collections-1',
        type: 'movie',
      });
      const ruleGroup = createRulesDto({
        dataType: 'movie',
        libraryId: mediaItem.library.id,
        name: ' movie cleanup ',
        collection: {
          type: 'movie',
          libraryId: mediaItem.library.id,
          title: 'Movie Cleanup',
          isActive: true,
          arrAction: ServarrAction.DELETE,
          manualCollectionName: ' manual picks ',
        },
      });

      kodiAdapter.getMetadata.mockResolvedValue(mediaItem);
      kodiAdapter.getCollections.mockResolvedValue([
        createMediaCollection({
          id: 'collection-existing',
          title: ' Existing Collection ',
        }),
        createMediaCollection({ id: 'collection-duplicate-a', title: 'Saga' }),
        createMediaCollection({
          id: 'collection-duplicate-b',
          title: ' saga ',
        }),
        createMediaCollection({
          id: 'collection-own',
          title: ' Movie Cleanup ',
        }),
        createMediaCollection({
          id: 'collection-manual',
          title: ' Manual Picks ',
        }),
      ]);
      kodiAdapter.getCollectionChildren.mockResolvedValue([mediaItem]);

      const names = await kodiGetterService.get(
        PROP.collection_names,
        mediaItem,
        'movie',
        ruleGroup,
      );
      const count = await kodiGetterService.get(
        PROP.collections,
        mediaItem,
        'movie',
        ruleGroup,
      );

      expect(names).toEqual(['Existing Collection', 'Saga', 'saga']);
      expect(count).toBe(3);
      expect(kodiAdapter.getCollections).toHaveBeenCalledTimes(1);
    });

    it('ignores excluded collections when computing sibling watch dates', async () => {
      const mediaItem = createMediaItem({
        id: 'movie-siblings-1',
        type: 'movie',
      });
      const siblingItem = createMediaItem({
        id: 'movie-sibling',
        type: 'movie',
      });
      const excludedSibling = createMediaItem({
        id: 'movie-excluded-sibling',
        type: 'movie',
      });
      const ruleGroup = createRulesDto({
        dataType: 'movie',
        libraryId: mediaItem.library.id,
        name: ' sibling cleanup ',
        collection: {
          type: 'movie',
          libraryId: mediaItem.library.id,
          title: 'Sibling Cleanup',
          isActive: true,
          arrAction: ServarrAction.DELETE,
          manualCollectionName: ' manual siblings ',
        },
      });

      kodiAdapter.getMetadata.mockResolvedValue(mediaItem);
      kodiAdapter.getCollections.mockResolvedValue([
        createMediaCollection({ id: 'collection-keep', title: 'Keepers' }),
        createMediaCollection({
          id: 'collection-own',
          title: ' Sibling Cleanup ',
        }),
        createMediaCollection({
          id: 'collection-manual',
          title: ' Manual Siblings ',
        }),
      ]);
      kodiAdapter.getCollectionChildren.mockImplementation(
        async (collectionId: string) => {
          if (collectionId === 'collection-keep') {
            return [mediaItem, siblingItem];
          }
          return [excludedSibling];
        },
      );
      kodiAdapter.getWatchHistory.mockImplementation(async (itemId: string) => {
        if (itemId === 'movie-sibling') {
          return [createWatchRecord({ watchedAt: new Date('2024-04-01') })];
        }
        return [createWatchRecord({ watchedAt: new Date('2024-01-01') })];
      });

      const response = await kodiGetterService.get(
        45, // collection_siblings_lastViewedAt
        mediaItem,
        'movie',
        ruleGroup,
      );

      expect(response).toEqual(new Date('2024-04-01'));
      expect(kodiAdapter.getCollectionChildren).toHaveBeenCalledTimes(1);
      expect(kodiAdapter.getCollectionChildren).toHaveBeenCalledWith(
        'collection-keep',
      );
      expect(kodiAdapter.getWatchHistory).not.toHaveBeenCalledWith(
        'movie-excluded-sibling',
      );
    });
  });

  describe('sw_lastWatched', () => {
    it('returns the view date of the newest watched episode', async () => {
      const showItem = createMediaItem({
        id: 'show-1',
        type: 'show' as MediaItemType,
      });
      const seasonItem = { id: 'season-1' };
      const olderEpisode = createMediaItem({
        id: 'episode-1',
        type: 'episode' as MediaItemType,
        parentIndex: 1,
        index: 1,
      });
      const newerEpisode = createMediaItem({
        id: 'episode-2',
        type: 'episode' as MediaItemType,
        parentIndex: 1,
        index: 2,
      });

      kodiAdapter.getMetadata.mockResolvedValue(showItem);
      kodiAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, type: MediaItemType) => {
          if (parentId === 'show-1' && type === 'season') {
            return [seasonItem as MediaItem];
          }
          if (parentId === 'season-1' && type === 'episode') {
            return [olderEpisode, newerEpisode];
          }
          return [];
        },
      );
      kodiAdapter.getWatchHistory.mockImplementation(async (itemId: string) => {
        if (itemId === 'episode-1') {
          return [createWatchRecord({ watchedAt: new Date('2024-05-01') })];
        }
        if (itemId === 'episode-2') {
          return [createWatchRecord({ watchedAt: new Date('2024-02-01') })];
        }
        return [];
      });

      const response = await kodiGetterService.get(
        PROP.sw_lastWatched,
        showItem,
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      // Highest-numbered watched episode is episode 2, so its view date wins
      // even though it was watched earlier.
      expect(response).toEqual(new Date('2024-02-01'));
    });

    it('returns null when no episode has been watched', async () => {
      const showItem = createMediaItem({
        id: 'show-empty',
        type: 'show' as MediaItemType,
      });

      kodiAdapter.getMetadata.mockResolvedValue(showItem);
      kodiAdapter.getChildrenMetadata.mockResolvedValue([]);

      const response = await kodiGetterService.get(
        PROP.sw_lastWatched,
        showItem,
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(response).toBeNull();
    });
  });

  describe('unsupported watchlist properties', () => {
    // Kodi has no watchlist API; the property surface (inherited from
    // Jellyfin) does not expose watchlist IDs, so an unknown property ID
    // resolves to null rather than a value.
    it('returns null for an unknown / unsupported property id', async () => {
      const mediaItem = createMediaItem();
      kodiAdapter.getMetadata.mockResolvedValue(mediaItem);

      const response = await kodiGetterService.get(
        9999,
        mediaItem,
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toBeNull();
    });
  });
});
