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
import { MaintainerrLogger } from '../../logging/logs.service';
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
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(EmbyGetterService).compile();

    embyGetterService = unit;
    embyAdapter = unitRef.get(EmbyAdapterService);
    metadataRuleValueService = unitRef.get(MetadataRuleValueService);
    logger = unitRef.get(MaintainerrLogger);
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

  describe('sw_lastViewedAtThroughSeason (id 48)', () => {
    const getSeasonViewDate = (
      seasonIndex: number | undefined,
      arrLookupCache?: ArrLookupCache,
    ) => {
      const season = createMediaItem({
        id: `season-${seasonIndex}`,
        type: 'season',
        index: seasonIndex,
        parentId: 'show-1',
      });
      embyAdapter.getMetadata.mockResolvedValue(season);

      return embyGetterService.get(
        48,
        season,
        'season',
        undefined,
        arrLookupCache,
      );
    };

    it('holds an unnumbered season without reporting a read failure', async () => {
      const season = createMediaItem({
        id: 'season-unknown',
        type: 'season',
        index: undefined,
        parentId: 'show-1',
      });
      embyAdapter.getMetadata.mockResolvedValue(season);

      await expect(
        embyGetterService.get(48, season, 'season'),
      ).resolves.toBeUndefined();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(embyAdapter.getChildrenMetadata).not.toHaveBeenCalled();
    });

    it('returns null when applied to a non-season item', async () => {
      const show = createMediaItem({ id: 'show-1', type: 'show' });
      embyAdapter.getMetadata.mockResolvedValue(show);

      await expect(embyGetterService.get(48, show, 'show')).resolves.toBeNull();
    });

    const mockShow = (
      seasons: MediaItem[],
      histories: Record<string, WatchRecord[]>,
    ) => {
      embyAdapter.getChildrenMetadata.mockImplementation(
        async (parentId: string, childType?: MediaItemType) => {
          if (parentId === 'show-1' && childType === 'season') return seasons;
          return Object.keys(histories)
            .filter((itemId) => itemId.startsWith(`${parentId}-episode`))
            .map((itemId) => createMediaItem({ id: itemId, type: 'episode' }));
        },
      );
      embyAdapter.getWatchHistory.mockImplementation(
        async (itemId: string) => histories[itemId] ?? [],
      );
    };

    it('reads only current episodes in numbered regular seasons through the target', async () => {
      mockShow(
        [
          createMediaItem({ id: 'specials', type: 'season', index: 0 }),
          createMediaItem({ id: 'season-1', type: 'season', index: 1 }),
          createMediaItem({ id: 'season-2', type: 'season', index: 2 }),
          createMediaItem({ id: 'season-3', type: 'season', index: 3 }),
          createMediaItem({
            id: 'season-unknown',
            type: 'season',
            index: undefined,
          }),
        ],
        {
          'deleted-episode': [
            createWatchRecord({ watchedAt: new Date('2026-08-01') }),
          ],
          'specials-episode': [
            createWatchRecord({ watchedAt: new Date('2026-06-01') }),
          ],
          'season-1-episode': [
            createWatchRecord({ watchedAt: new Date('2026-04-20') }),
          ],
          'season-2-episode': [
            createWatchRecord({ watchedAt: new Date('2026-03-01') }),
          ],
          'season-3-episode': [
            createWatchRecord({ watchedAt: new Date('2026-07-01') }),
          ],
        },
      );

      await expect(getSeasonViewDate(2)).resolves.toEqual(
        new Date('2026-04-20'),
      );
      expect(embyAdapter.getChildrenMetadata).toHaveBeenCalledWith(
        'show-1',
        'season',
        true,
      );
      for (const seasonId of ['season-1', 'season-2']) {
        expect(embyAdapter.getChildrenMetadata).toHaveBeenCalledWith(
          seasonId,
          'episode',
          true,
        );
      }
      for (const seasonId of ['specials', 'season-3', 'season-unknown']) {
        expect(embyAdapter.getChildrenMetadata).not.toHaveBeenCalledWith(
          seasonId,
          'episode',
          true,
        );
      }
    });

    it.each(['season', 'episode'] as const)(
      'returns undefined for a qualifying %s with no id',
      async (missingIdOn) => {
        const seasonId = missingIdOn === 'season' ? '' : 'season-1';
        const episodeId = missingIdOn === 'episode' ? '' : 'episode-1';
        embyAdapter.getChildrenMetadata.mockImplementation(
          async (parentId: string, childType?: MediaItemType) =>
            parentId === 'show-1' && childType === 'season'
              ? [createMediaItem({ id: seasonId, type: 'season', index: 1 })]
              : [createMediaItem({ id: episodeId, type: 'episode' })],
        );
        embyAdapter.getWatchHistory.mockImplementation(
          async (itemId: string) =>
            itemId === episodeId
              ? [
                  createWatchRecord({
                    itemId,
                    watchedAt: new Date('2026-04-20'),
                  }),
                ]
              : [],
        );

        await expect(getSeasonViewDate(1)).resolves.toBeUndefined();
      },
    );

    it('uses only specials for Season 0', async () => {
      mockShow(
        [
          createMediaItem({ id: 'specials', type: 'season', index: 0 }),
          createMediaItem({ id: 'season-1', type: 'season', index: 1 }),
        ],
        {
          'specials-episode': [
            createWatchRecord({ watchedAt: new Date('2026-02-01') }),
          ],
          'season-1-episode': [
            createWatchRecord({ watchedAt: new Date('2026-03-01') }),
          ],
        },
      );

      await expect(getSeasonViewDate(0)).resolves.toEqual(
        new Date('2026-02-01'),
      );
      expect(embyAdapter.getChildrenMetadata).not.toHaveBeenCalledWith(
        'season-1',
        'episode',
        true,
      );
    });

    it('reuses show and prior season walks across concurrent targets', async () => {
      const cache = new ArrLookupCache();
      mockShow(
        [
          createMediaItem({ id: 'season-1', type: 'season', index: 1 }),
          createMediaItem({ id: 'season-2', type: 'season', index: 2 }),
        ],
        {
          'season-1-episode': [],
          'season-2-episode': [],
        },
      );

      await Promise.all([
        getSeasonViewDate(1, cache),
        getSeasonViewDate(2, cache),
      ]);

      expect(
        embyAdapter.getChildrenMetadata.mock.calls.filter(
          ([itemId, childType]) =>
            itemId === 'show-1' && childType === 'season',
        ),
      ).toHaveLength(1);
      expect(
        embyAdapter.getChildrenMetadata.mock.calls.filter(
          ([itemId, childType]) =>
            itemId === 'season-1' && childType === 'episode',
        ),
      ).toHaveLength(1);
      expect(embyAdapter.getWatchHistory).toHaveBeenCalledTimes(2);
    });

    it('returns null when completed views have no dates', async () => {
      mockShow(
        [createMediaItem({ id: 'season-1', type: 'season', index: 1 })],
        {
          'season-1-episode': [createWatchRecord({ watchedAt: undefined })],
        },
      );

      await expect(getSeasonViewDate(1)).resolves.toBeNull();
    });

    it('returns undefined when a later qualifying episode has an invalid watch date', async () => {
      mockShow(
        [createMediaItem({ id: 'season-1', type: 'season', index: 1 })],
        {
          'season-1-episode-1': [
            createWatchRecord({ watchedAt: new Date('2026-01-01') }),
          ],
          'season-1-episode-2': [
            createWatchRecord({ watchedAt: new Date('invalid') }),
          ],
        },
      );

      await expect(getSeasonViewDate(1)).resolves.toBeUndefined();
    });
  });
});
