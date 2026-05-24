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
import { EmbyAdapterService } from '../../api/media-server/emby/emby-adapter.service';
import { EmbyGetterService } from './emby-getter.service';

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

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      EmbyGetterService,
    ).compile();

    embyGetterService = unit;
    embyAdapter = unitRef.get(EmbyAdapterService);
    embyAdapter.isSetup.mockReturnValue(true);
  });

  afterEach(() => {
    cacheManager.getCache('emby')?.flush();
    jest.clearAllMocks();
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
        createRulesDto({ dataType: 'movie' }),
      );

      expect(response).toEqual(['blank-user', 'missing-user', 'Alice']);
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

      const ruleGroup = createRulesDto({
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
});
