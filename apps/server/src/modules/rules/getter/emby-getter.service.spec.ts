import {
  MediaCollection,
  MediaItem,
  MediaItemType,
  MediaUser,
  ServarrAction,
  WatchRecord,
} from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { createRuleGroupDto } from '../../../../test/utils/data';

import cacheManager from '../../api/lib/cache';
import { EmbyAdapterService } from '../../api/media-server/emby/emby-adapter.service';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';
import { EmbyGetterService } from './emby-getter.service';
import { MetadataRuleValueService } from './metadata-rule-value.service';

const createMediaItem = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: 'emby-item-123',
  title: 'Test Movie',
  type: 'movie' as MediaItemType,
  guid: 'emby-guid-123',
  addedAt: new Date('2024-01-15'),
  providerIds: { tmdb: ['12345'], imdb: ['tt1234567'] },
  mediaSources: [],
  library: { id: 'lib-1', title: 'Movies' },
  ...overrides,
});

const createMediaUser = (overrides: Partial<MediaUser> = {}): MediaUser => ({
  id: 'user-1',
  name: 'TestUser',
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
  userId: 'user-1',
  itemId: 'emby-item-123',
  watchedAt: new Date('2024-06-15'),
  ...overrides,
});

describe('EmbyGetterService', () => {
  let embyGetterService: EmbyGetterService;
  let embyAdapter: Mocked<EmbyAdapterService>;
  let metadataRuleValueService: Mocked<MetadataRuleValueService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(EmbyGetterService).compile();

    embyGetterService = unit;
    embyAdapter = unitRef.get(EmbyAdapterService);
    metadataRuleValueService = unitRef.get(MetadataRuleValueService);
    embyAdapter.isSetup.mockReturnValue(true);
  });

  afterEach(() => {
    cacheManager.getCache('emby')?.flush();
    jest.clearAllMocks();
  });

  describe('studios (id 46)', () => {
    const STUDIOS_PROP_ID = 46;

    it('delegates to the shared metadata resolution with the run cache', async () => {
      const mediaItem = createMediaItem();
      const cache = new ArrLookupCache();
      metadataRuleValueService.getStudios.mockResolvedValue(['Studio One']);

      await expect(
        embyGetterService.get(
          STUDIOS_PROP_ID,
          mediaItem,
          'movie',
          createRuleGroupDto({ dataType: 'movie' }),
          cache,
        ),
      ).resolves.toEqual(['Studio One']);
      expect(metadataRuleValueService.getStudios).toHaveBeenCalledWith(
        mediaItem,
        cache,
      );
      expect(embyAdapter.getMetadata).not.toHaveBeenCalled();
    });

    it('preserves undefined so a failed lookup stays transient', async () => {
      metadataRuleValueService.getStudios.mockResolvedValue(undefined);

      await expect(
        embyGetterService.get(STUDIOS_PROP_ID, createMediaItem(), 'movie'),
      ).resolves.toBeUndefined();
    });
  });

  describe('user-backed rules', () => {
    it('maps Emby user ids to names while preserving unknown and blank-name fallbacks', async () => {
      const mediaItem = createMediaItem();

      embyAdapter.getMetadata.mockResolvedValue(mediaItem);
      embyAdapter.getItemSeenBy.mockResolvedValue([
        'blank-user',
        'missing-user',
        'named-user',
      ]);
      embyAdapter.getUsers.mockResolvedValue([
        createMediaUser({ id: 'blank-user', name: '  ' }),
        createMediaUser({ id: 'named-user', name: 'Alice' }),
      ]);

      const response = await embyGetterService.get(
        1,
        mediaItem,
        'movie',
        createRuleGroupDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(['blank-user', 'missing-user', 'Alice']);
    });
  });

  describe('error handling', () => {
    it('returns undefined when metadata cannot be read', async () => {
      // getMetadata answers undefined for a failed read as well as a missing
      // item, so this must stay the transient signal - null would let
      // NOT_EXISTS match on a blip.
      embyAdapter.getMetadata.mockResolvedValue(undefined);

      const response = await embyGetterService.get(
        0,
        createMediaItem(),
        'movie',
        createRuleGroupDto({ dataType: 'movie' }),
      );

      expect(response).toBeUndefined();
    });
  });

  describe('collection rules', () => {
    it('trims collection names and excludes the rule and manual collections', async () => {
      const mediaItem = createMediaItem({
        id: 'movie-collections-1',
        type: 'movie',
      });
      const ruleGroup = createRuleGroupDto({
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

      embyAdapter.getMetadata.mockResolvedValue(mediaItem);
      embyAdapter.getCollections.mockResolvedValue([
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
      embyAdapter.getCollectionChildren.mockResolvedValue([mediaItem]);

      const names = await embyGetterService.get(
        19,
        mediaItem,
        'movie',
        ruleGroup,
      );
      const count = await embyGetterService.get(
        6,
        mediaItem,
        'movie',
        ruleGroup,
      );

      expect(names).toEqual(['Existing Collection', 'Saga', 'saga']);
      expect(count).toBe(3);
      expect(embyAdapter.getCollections).toHaveBeenCalledTimes(1);
    });

    it('dedupes parent-backed collection names case-sensitively after trimming', async () => {
      const episodeItem = createMediaItem({
        id: 'episode-collections-1',
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

      embyAdapter.getMetadata.mockImplementation(async (itemId: string) => {
        if (itemId === 'episode-collections-1') return episodeItem;
        if (itemId === 'season-1') return seasonItem;
        if (itemId === 'show-1') return showItem;
        return undefined;
      });
      embyAdapter.getCollections.mockResolvedValue([
        createMediaCollection({ id: 'collection-episode', title: ' Episode ' }),
        createMediaCollection({ id: 'collection-season-a', title: 'Season' }),
        createMediaCollection({ id: 'collection-season-b', title: ' season ' }),
        createMediaCollection({
          id: 'collection-season-c',
          title: 'Season ',
        }),
        createMediaCollection({ id: 'collection-show', title: 'Show' }),
        createMediaCollection({
          id: 'collection-own',
          title: ' Show Cleanup ',
        }),
      ]);
      embyAdapter.getCollectionChildren.mockImplementation(
        async (collectionId: string) => {
          if (collectionId === 'collection-episode') return [episodeItem];
          if (collectionId === 'collection-season-a') return [seasonItem];
          if (collectionId === 'collection-season-b') return [seasonItem];
          if (collectionId === 'collection-season-c') return [seasonItem];
          if (collectionId === 'collection-show') return [showItem];
          if (collectionId === 'collection-own') return [episodeItem];
          return [];
        },
      );

      const ruleGroup = createRuleGroupDto({
        dataType: 'episode',
        libraryId: episodeItem.library.id,
        name: ' show cleanup ',
      });

      const names = await embyGetterService.get(
        26,
        episodeItem,
        'episode',
        ruleGroup,
      );
      const count = await embyGetterService.get(
        25,
        episodeItem,
        'episode',
        ruleGroup,
      );

      expect(names).toEqual(['Episode', 'Season', 'season', 'Show']);
      expect(count).toBe(4);
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
      const ruleGroup = createRuleGroupDto({
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

      embyAdapter.getMetadata.mockResolvedValue(mediaItem);
      embyAdapter.getCollections.mockResolvedValue([
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
      embyAdapter.getCollectionChildren.mockImplementation(
        async (collectionId: string) => {
          if (collectionId === 'collection-keep') {
            return [mediaItem, siblingItem];
          }
          return [excludedSibling];
        },
      );
      embyAdapter.getWatchHistory.mockImplementation(async (itemId: string) => {
        if (itemId === 'movie-sibling') {
          return [createWatchRecord({ watchedAt: new Date('2024-04-01') })];
        }
        return [createWatchRecord({ watchedAt: new Date('2024-01-01') })];
      });

      const response = await embyGetterService.get(
        45,
        mediaItem,
        'movie',
        ruleGroup,
      );

      expect(response).toEqual(new Date('2024-04-01'));
      expect(embyAdapter.getCollectionChildren).toHaveBeenCalledTimes(1);
      expect(embyAdapter.getCollectionChildren).toHaveBeenCalledWith(
        'collection-keep',
      );
      expect(embyAdapter.getWatchHistory).not.toHaveBeenCalledWith(
        'movie-excluded-sibling',
      );
    });
  });

  describe('lastPlayedAt (id 47)', () => {
    it('returns a movie playback attempt date', async () => {
      const mediaItem = createMediaItem({ id: 'movie-1', type: 'movie' });
      embyAdapter.getMetadata.mockResolvedValue(mediaItem);
      embyAdapter.getLastPlayedAt.mockResolvedValue(
        new Date('2024-06-01T00:00:00.000Z'),
      );

      await expect(
        embyGetterService.get(47, mediaItem, 'movie'),
      ).resolves.toEqual(new Date('2024-06-01T00:00:00.000Z'));
    });

    it('aggregates the newest episode playback attempt for a show', async () => {
      const show = createMediaItem({ id: 'show-1', type: 'show' });
      const season = createMediaItem({ id: 'season-1', type: 'season' });
      const firstEpisode = createMediaItem({
        id: 'episode-1',
        type: 'episode',
      });
      const secondEpisode = createMediaItem({
        id: 'episode-2',
        type: 'episode',
      });
      embyAdapter.getMetadata.mockResolvedValue(show);
      embyAdapter.getChildrenMetadata.mockImplementation(
        async (itemId: string) =>
          itemId === 'show-1' ? [season] : [firstEpisode, secondEpisode],
      );
      embyAdapter.getLastPlayedAt.mockImplementation(async (itemId: string) =>
        itemId === 'episode-1'
          ? new Date('2024-06-03T00:00:00.000Z')
          : new Date('2024-06-02T00:00:00.000Z'),
      );

      await expect(embyGetterService.get(47, show, 'show')).resolves.toEqual(
        new Date('2024-06-03T00:00:00.000Z'),
      );
      expect(embyAdapter.getChildrenMetadata).toHaveBeenCalledWith(
        'show-1',
        'season',
        true,
      );
    });

    it('returns null for a season with no playback history', async () => {
      const season = createMediaItem({ id: 'season-1', type: 'season' });
      embyAdapter.getMetadata.mockResolvedValue(season);
      embyAdapter.getChildrenMetadata.mockResolvedValue([
        createMediaItem({ id: 'episode-1', type: 'episode' }),
      ]);
      embyAdapter.getLastPlayedAt.mockResolvedValue(null);

      await expect(
        embyGetterService.get(47, season, 'season'),
      ).resolves.toBeNull();
    });

    it('returns undefined when a playback lookup fails', async () => {
      const mediaItem = createMediaItem({ id: 'movie-1', type: 'movie' });
      embyAdapter.getMetadata.mockResolvedValue(mediaItem);
      embyAdapter.getLastPlayedAt.mockRejectedValue(new Error('lookup failed'));

      await expect(
        embyGetterService.get(47, mediaItem, 'movie'),
      ).resolves.toBeUndefined();
    });
  });
});
