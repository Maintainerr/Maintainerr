import { MediaItem } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { createMediaItem, createRulesDto } from '../../../../test/utils/data';
import { PlexAdapterService } from '../../api/media-server/plex/plex-adapter.service';
import { PlexMetadata } from '../../api/plex-api/interfaces/media.interface';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { PlexGetterService } from './plex-getter.service';

const SEEN_BY_PROP_ID = 1;
const VIEWCOUNT_PROP_ID = 5;
const ISWATCHED_PROP_ID = 43;
const PLEX_ITEM_ID = 'plex-item-123';

const makeMetadata = (overrides: Partial<PlexMetadata> = {}): PlexMetadata =>
  ({
    ratingKey: '12345',
    type: 'movie',
    ...overrides,
  }) as PlexMetadata;

describe('PlexGetterService', () => {
  let service: PlexGetterService;
  let plexApi: Mocked<PlexApiService>;
  let plexAdapter: Mocked<PlexAdapterService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexGetterService).compile();

    service = unit;
    plexApi = unitRef.get(PlexApiService);
    plexAdapter = unitRef.get(PlexAdapterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
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

      const result = await service.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(7);
      expect(plexAdapter.getWatchState).toHaveBeenCalledWith(
        '12345',
        0,
        libItem.title,
      );
    });

    it('should return the adapter watched state for the isWatched rule', async () => {
      plexAdapter.getWatchState.mockResolvedValue({
        viewCount: 0,
        isWatched: false,
      });

      const result = await service.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(false);
      expect(plexAdapter.getWatchState).toHaveBeenCalledWith(
        '12345',
        0,
        libItem.title,
      );
    });
  });

  it('requests external media metadata for IMDb ratings', async () => {
    const mediaItem = createMediaItem({ id: PLEX_ITEM_ID });

    plexApi.getMetadata.mockResolvedValue({
      ratingKey: PLEX_ITEM_ID,
      type: 'movie',
      title: 'Test Movie',
      Guid: [],
      index: 1,
      leafCount: 0,
      viewedLeafCount: 0,
      addedAt: 1,
      updatedAt: 1,
      guid: 'guid',
      Media: [],
      originallyAvailableAt: '2024-01-01',
      Rating: [{ image: 'imdb://image.rating', type: 'audience', value: 7.8 }],
    } as any);

    const result = await service.get(
      31,
      mediaItem,
      'movie',
      createRulesDto({ dataType: 'movie' }),
    );

    expect(result).toBe(7.8);
    expect(plexApi.getMetadata).toHaveBeenCalledWith(PLEX_ITEM_ID, {
      includeExternalMedia: true,
    });
  });

  it('requests external media metadata for show IMDb ratings', async () => {
    const mediaItem = createMediaItem({ id: PLEX_ITEM_ID, type: 'episode' });

    plexApi.getMetadata
      .mockResolvedValueOnce({
        ratingKey: PLEX_ITEM_ID,
        type: 'episode',
        title: 'Episode 1',
        Guid: [],
        index: 1,
        leafCount: 0,
        viewedLeafCount: 0,
        addedAt: 1,
        updatedAt: 1,
        guid: 'guid',
        Media: [],
        originallyAvailableAt: '2024-01-01',
        grandparentRatingKey: 'show-1',
      } as any)
      .mockResolvedValueOnce({
        ratingKey: 'show-1',
        type: 'show',
        title: 'Test Show',
        Guid: [],
        index: 1,
        leafCount: 0,
        viewedLeafCount: 0,
        addedAt: 1,
        updatedAt: 1,
        guid: 'guid-show',
        Media: [],
        originallyAvailableAt: '2024-01-01',
        Rating: [
          { image: 'imdb://image.rating', type: 'audience', value: 8.2 },
        ],
      } as any);

    const result = await service.get(
      35,
      mediaItem,
      'episode',
      createRulesDto({ dataType: 'show' }),
    );

    expect(result).toBe(8.2);
    expect(plexApi.getMetadata).toHaveBeenNthCalledWith(1, PLEX_ITEM_ID, {
      includeExternalMedia: true,
    });
    expect(plexApi.getMetadata).toHaveBeenNthCalledWith(2, 'show-1', {
      includeExternalMedia: true,
    });
  });

  describe('collection_siblings_lastViewedAt (id 44)', () => {
    const COLLECTION_SIBLINGS_PROP_ID = 44;

    it('returns the newest viewedAt across siblings, aggregating per-user history', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({
          Collection: [{ tag: 'Franchise A Collection' }],
        }),
      );
      plexApi.getCollections.mockResolvedValue([
        { ratingKey: 'coll-1', title: 'Franchise A Collection' } as any,
        { ratingKey: 'coll-2', title: 'Unrelated Collection' } as any,
      ]);
      plexApi.getCollectionChildren.mockResolvedValue([
        { ratingKey: '12345' } as any,
        { ratingKey: 'sibling-a' } as any,
        { ratingKey: 'sibling-b' } as any,
      ]);
      plexApi.getWatchHistory.mockImplementation(async (rk) => {
        if (rk === '12345') {
          return [{ viewedAt: 1_700_000_000, accountID: 1 } as any];
        }
        if (rk === 'sibling-a') {
          // A non-admin user watched this sibling — only visible via history.
          return [{ viewedAt: 1_710_000_000, accountID: 2 } as any];
        }
        return [];
      });

      const libItem = createMediaItem({ type: 'movie' });
      const ruleGroup = createRulesDto({
        dataType: 'movie',
        libraryId: 'lib-1',
        name: 'My cleanup group',
      });

      const result = await service.get(
        COLLECTION_SIBLINGS_PROP_ID,
        libItem,
        'movie',
        ruleGroup,
      );

      expect(result).toEqual(new Date(1_710_000_000 * 1000));
      expect(plexApi.getCollections).toHaveBeenCalledWith('lib-1', 'movie');
      expect(plexApi.getCollectionChildren).toHaveBeenCalledTimes(1);
      expect(plexApi.getCollectionChildren).toHaveBeenCalledWith('coll-1');
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('12345');
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('sibling-a');
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('sibling-b');
    });

    it('returns null when the movie is in no collections', async () => {
      plexApi.getMetadata.mockResolvedValue(makeMetadata({ Collection: [] }));

      const result = await service.get(
        COLLECTION_SIBLINGS_PROP_ID,
        createMediaItem({ type: 'movie' }),
        'movie',
        createRulesDto({ dataType: 'movie', libraryId: 'lib-1' }),
      );

      expect(result).toBeNull();
      expect(plexApi.getCollections).not.toHaveBeenCalled();
      expect(plexApi.getWatchHistory).not.toHaveBeenCalled();
    });

    it('returns null when no sibling has any watch history', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({ Collection: [{ tag: 'Franchise B Collection' }] }),
      );
      plexApi.getCollections.mockResolvedValue([
        { ratingKey: 'coll-fb', title: 'Franchise B Collection' } as any,
      ]);
      plexApi.getCollectionChildren.mockResolvedValue([
        { ratingKey: '12345' } as any,
        { ratingKey: 'sibling-a' } as any,
      ]);
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await service.get(
        COLLECTION_SIBLINGS_PROP_ID,
        createMediaItem({ type: 'movie' }),
        'movie',
        createRulesDto({ dataType: 'movie', libraryId: 'lib-1' }),
      );

      expect(result).toBeNull();
    });

    it("ignores the rule group's own managed collection", async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({
          Collection: [
            { tag: 'Franchise A Collection' },
            { tag: 'My cleanup group' },
          ],
        }),
      );
      plexApi.getCollections.mockResolvedValue([
        { ratingKey: 'coll-1', title: 'Franchise A Collection' } as any,
        { ratingKey: 'coll-own', title: 'My cleanup group' } as any,
      ]);
      plexApi.getCollectionChildren.mockResolvedValue([
        { ratingKey: '12345' } as any,
      ]);
      plexApi.getWatchHistory.mockResolvedValue([
        { viewedAt: 1_690_000_000, accountID: 1 } as any,
      ]);

      const result = await service.get(
        COLLECTION_SIBLINGS_PROP_ID,
        createMediaItem({ type: 'movie' }),
        'movie',
        createRulesDto({
          dataType: 'movie',
          libraryId: 'lib-1',
          name: 'My cleanup group',
        }),
      );

      expect(result).toEqual(new Date(1_690_000_000 * 1000));
      expect(plexApi.getCollectionChildren).toHaveBeenCalledTimes(1);
      expect(plexApi.getCollectionChildren).toHaveBeenCalledWith('coll-1');
    });
  });

  describe('seenBy (id 1)', () => {
    it('maps watch-history account ids to known Plex usernames', async () => {
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
      plexApi.getCorrectedUsers.mockResolvedValue([
        { plexId: 1, username: 'alice' },
        { plexId: 2, username: 'bob' },
      ] as never);
      plexApi.getWatchHistory.mockResolvedValue([
        { accountID: '1' },
        { accountID: '2' },
      ] as never);

      const result = await service.get(
        SEEN_BY_PROP_ID,
        createMediaItem({ type: 'movie' }),
      );

      expect(result).toEqual(['alice', 'bob']);
    });

    it('returns [] for confirmed-empty history (no one has watched the item)', async () => {
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
      plexApi.getCorrectedUsers.mockResolvedValue([
        { plexId: 1, username: 'alice' },
      ] as never);
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await service.get(
        SEEN_BY_PROP_ID,
        createMediaItem({ type: 'movie' }),
      );

      expect(result).toEqual([]);
    });

    it('returns undefined when watch-history lookup fails so the comparator skips the item rather than misclassifying it as "viewed by no one"', async () => {
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
      plexApi.getCorrectedUsers.mockResolvedValue([
        { plexId: 1, username: 'alice' },
      ] as never);
      plexApi.getWatchHistory.mockRejectedValue(new Error('plex unreachable'));

      const result = await service.get(
        SEEN_BY_PROP_ID,
        createMediaItem({ type: 'movie' }),
      );

      expect(result).toBeUndefined();
    });
  });
});
