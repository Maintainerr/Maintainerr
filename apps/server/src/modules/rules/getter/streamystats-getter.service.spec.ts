import { createMediaItem, createMockLogger } from '../../../../test/utils/data';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import {
  StreamystatsApiService,
  StreamystatsWatchlistMembership,
} from '../../api/streamystats-api/streamystats-api.service';
import { StreamystatsGetterService } from './streamystats-getter.service';

const IS_IN_WATCHLIST_PROP_ID = 0;
const WATCHLISTED_BY_USERS_PROP_ID = 1;
const IS_IN_WATCHLIST_INCLUDING_PARENT_PROP_ID = 2;
const WATCHLISTED_BY_USERS_INCLUDING_PARENT_PROP_ID = 3;
const VIEW_COUNT_BY_USER_PROP_ID = 4;
const WATCH_TIME_BY_USER_PROP_ID = 5;
const LAST_VIEWED_AT_BY_USER_PROP_ID = 6;
const LAST_PLAYED_AT_PROP_ID = 7;

const itemDetailsOf = (
  // Streamystats reports the Jellyfin user id; its copy of the name can lag a
  // rename or be null, which is why the getter matches on id.
  usersWatched: {
    id: string;
    name: string | null;
    watchCount: number;
    totalWatchTime: number;
    lastWatched: string | null;
  }[],
  lastWatched: string | null = null,
) =>
  ({
    item: { id: 'item-1' },
    totalViews: 0,
    totalWatchTime: 0,
    completionRate: 0,
    firstWatched: null,
    lastWatched,
    watchHistory: [],
    watchCountByMonth: [],
    usersWatched: usersWatched.map(
      ({ id, name, watchCount, totalWatchTime, lastWatched }) => ({
        user: { id, name },
        watchCount,
        totalWatchTime,
        completionRate: 0,
        firstWatched: null,
        lastWatched,
      }),
    ),
  }) as never;

const membershipOf = (
  entries: Record<string, string[]>,
): StreamystatsWatchlistMembership => ({
  ownersByItemId: entries,
});

describe('StreamystatsGetterService', () => {
  const createService = (
    users: { id: string; name: string }[] = [],
    // Items resolvable by getMetadata - the `_including_parent` props look up
    // the item's parent chain through the media server's metadata path.
    items: ReturnType<typeof createMediaItem>[] = [],
  ) => {
    const streamystatsApi = {
      getWatchlistMembership: jest.fn(),
      getItemDetails: jest.fn(),
    } as unknown as jest.Mocked<StreamystatsApiService>;

    const getMetadata = jest.fn(async (id: string) =>
      items.find((item) => item.id === id),
    );
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue({
        getUsers: jest.fn().mockResolvedValue(users),
        getMetadata,
      }),
    } as unknown as jest.Mocked<MediaServerFactory>;

    const service = new StreamystatsGetterService(
      streamystatsApi,
      mediaServerFactory,
      createMockLogger(),
    );

    return { service, streamystatsApi, mediaServerFactory, getMetadata };
  };

  describe('isInWatchlist (property id=0)', () => {
    it('returns true when the item is in at least one public watchlist', async () => {
      const { service, streamystatsApi } = createService();
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({ 'item-1': ['user-a'] }),
      );

      expect(await service.get(IS_IN_WATCHLIST_PROP_ID, libItem)).toBe(true);
    });

    it('returns false when the item is in no watchlist', async () => {
      const { service, streamystatsApi } = createService();
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({ 'item-2': ['user-a'] }),
      );

      expect(await service.get(IS_IN_WATCHLIST_PROP_ID, libItem)).toBe(false);
    });

    it('returns undefined (transient skip) when membership cannot be determined', async () => {
      const { service, streamystatsApi } = createService();
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getWatchlistMembership.mockResolvedValue(null);

      expect(
        await service.get(IS_IN_WATCHLIST_PROP_ID, libItem),
      ).toBeUndefined();
    });
  });

  describe('watchlistedByUsers (property id=1)', () => {
    it('resolves owner user IDs to usernames via the media server', async () => {
      const { service, streamystatsApi } = createService([
        { id: 'user-a', name: 'alice' },
        { id: 'user-b', name: 'bob' },
        { id: 'user-c', name: 'carol' },
      ]);
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({ 'item-1': ['user-a', 'user-b'] }),
      );

      const result = (await service.get(
        WATCHLISTED_BY_USERS_PROP_ID,
        libItem,
      )) as string[];

      expect(result.sort()).toEqual(['alice', 'bob']);
    });

    it('omits owners that no longer resolve to a known user', async () => {
      const { service, streamystatsApi } = createService([
        { id: 'user-a', name: 'alice' },
      ]);
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({ 'item-1': ['user-a', 'user-gone'] }),
      );

      expect(await service.get(WATCHLISTED_BY_USERS_PROP_ID, libItem)).toEqual([
        'alice',
      ]);
    });

    it('returns undefined (transient skip) when the user lookup fails closed', async () => {
      // getUsers() returns [] on failure; with owners present that is a lookup
      // failure, not "nobody owns it" - must skip, never an empty list.
      const { service, streamystatsApi } = createService([]);
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({ 'item-1': ['user-a'] }),
      );

      expect(
        await service.get(WATCHLISTED_BY_USERS_PROP_ID, libItem),
      ).toBeUndefined();
    });

    it('returns an empty list when the item is in no watchlist', async () => {
      const { service, streamystatsApi, mediaServerFactory } = createService();
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({}),
      );

      expect(await service.get(WATCHLISTED_BY_USERS_PROP_ID, libItem)).toEqual(
        [],
      );
      // No need to hit the media server when there are no owners to resolve.
      expect(mediaServerFactory.getService).not.toHaveBeenCalled();
    });
  });

  describe('isInWatchlist_including_parent (property id=2)', () => {
    it('inherits the parent show when a season is not directly listed', async () => {
      const season = createMediaItem({
        type: 'season',
        id: 'season-1',
        parentId: 'show-1',
      });
      const { service, streamystatsApi } = createService([], [season]);
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({ 'show-1': ['user-a'] }),
      );

      expect(
        await service.get(IS_IN_WATCHLIST_INCLUDING_PARENT_PROP_ID, season),
      ).toBe(true);
    });

    it('inherits the grandparent show when an episode is not directly listed', async () => {
      const episode = createMediaItem({
        type: 'episode',
        id: 'ep-1',
        parentId: 'season-1',
        grandparentId: 'show-1',
      });
      const { service, streamystatsApi } = createService([], [episode]);
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({ 'show-1': ['user-a'] }),
      );

      expect(
        await service.get(IS_IN_WATCHLIST_INCLUDING_PARENT_PROP_ID, episode),
      ).toBe(true);
    });

    it('returns false when neither the item nor its parents are listed', async () => {
      const season = createMediaItem({
        type: 'season',
        id: 'season-1',
        parentId: 'show-1',
      });
      const { service, streamystatsApi } = createService([], [season]);
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({ 'show-2': ['user-a'] }),
      );

      expect(
        await service.get(IS_IN_WATCHLIST_INCLUDING_PARENT_PROP_ID, season),
      ).toBe(false);
    });

    it('skips (undefined) when the item metadata cannot be fetched', async () => {
      // getMetadata returns undefined (item not registered) - the parent chain
      // is unknown, so skip rather than fall back to an item-only check.
      const season = createMediaItem({
        type: 'season',
        id: 'season-1',
        parentId: 'show-1',
      });
      const { service, streamystatsApi } = createService([], []);
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({ 'show-1': ['user-a'] }),
      );

      expect(
        await service.get(IS_IN_WATCHLIST_INCLUDING_PARENT_PROP_ID, season),
      ).toBeUndefined();
    });

    it('does not roll up for the base property (item-only)', async () => {
      const season = createMediaItem({
        type: 'season',
        id: 'season-1',
        parentId: 'show-1',
      });
      const { service, streamystatsApi, getMetadata } = createService(
        [],
        [season],
      );
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({ 'show-1': ['user-a'] }),
      );

      expect(await service.get(IS_IN_WATCHLIST_PROP_ID, season)).toBe(false);
      // The base prop is item-only - no parent resolution needed.
      expect(getMetadata).not.toHaveBeenCalled();
    });
  });

  describe('watchlistedByUsers_including_parent (property id=3)', () => {
    it('unions and dedupes owners across the season and its parent show', async () => {
      const season = createMediaItem({
        type: 'season',
        id: 'season-1',
        parentId: 'show-1',
      });
      const { service, streamystatsApi } = createService(
        [
          { id: 'user-a', name: 'alice' },
          { id: 'user-b', name: 'bob' },
        ],
        [season],
      );
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({
          'season-1': ['user-a'],
          'show-1': ['user-a', 'user-b'],
        }),
      );

      const result = (await service.get(
        WATCHLISTED_BY_USERS_INCLUDING_PARENT_PROP_ID,
        season,
      )) as string[];

      expect(result.sort()).toEqual(['alice', 'bob']);
    });

    it('resolves the grandparent show owner for an episode not directly listed', async () => {
      const episode = createMediaItem({
        type: 'episode',
        id: 'ep-1',
        parentId: 'season-1',
        grandparentId: 'show-1',
      });
      const { service, streamystatsApi } = createService(
        [{ id: 'user-a', name: 'alice' }],
        [episode],
      );
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({ 'show-1': ['user-a'] }),
      );

      expect(
        await service.get(
          WATCHLISTED_BY_USERS_INCLUDING_PARENT_PROP_ID,
          episode,
        ),
      ).toEqual(['alice']);
    });

    it('returns an empty list when neither the item nor its parents are listed', async () => {
      const season = createMediaItem({
        type: 'season',
        id: 'season-1',
        parentId: 'show-1',
      });
      const { service, streamystatsApi } = createService([], [season]);
      streamystatsApi.getWatchlistMembership.mockResolvedValue(
        membershipOf({}),
      );

      expect(
        await service.get(
          WATCHLISTED_BY_USERS_INCLUDING_PARENT_PROP_ID,
          season,
        ),
      ).toEqual([]);
    });
  });

  describe('lastPlayedAt (property id=7)', () => {
    const libItem = createMediaItem({ type: 'movie', id: 'item-1' });

    it('returns the aggregate last-played date without a watchlist read', async () => {
      const { service, streamystatsApi } = createService();
      streamystatsApi.getItemDetails.mockResolvedValue(
        itemDetailsOf([], '2026-01-03T01:00:00.000Z'),
      );

      expect(await service.get(LAST_PLAYED_AT_PROP_ID, libItem)).toEqual(
        new Date('2026-01-03T01:00:00.000Z'),
      );
      expect(streamystatsApi.getWatchlistMembership).not.toHaveBeenCalled();
    });

    // Null covers an unsynced item and a failed read alike, so it must skip
    // rather than report a confirmed "never played".
    it('returns undefined when item details cannot be read', async () => {
      const { service, streamystatsApi } = createService();
      streamystatsApi.getItemDetails.mockResolvedValue(null);

      expect(
        await service.get(LAST_PLAYED_AT_PROP_ID, libItem),
      ).toBeUndefined();
    });
  });

  describe('per-user properties (ids 4-6)', () => {
    const alice = { id: 'user-a', name: 'alice' };
    const rule = { username: 'alice' } as never;

    it('reads the picked user out of the item statistics', async () => {
      const { service, streamystatsApi } = createService([alice]);
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getItemDetails.mockResolvedValue(
        itemDetailsOf([
          {
            id: 'user-a',
            name: 'alice',
            watchCount: 3,
            totalWatchTime: 5400,
            lastWatched: '2026-05-01T10:00:00.000Z',
          },
          {
            id: 'user-b',
            name: 'bob',
            watchCount: 9,
            totalWatchTime: 60,
            lastWatched: '2026-06-01T10:00:00.000Z',
          },
        ]),
      );

      expect(await service.get(VIEW_COUNT_BY_USER_PROP_ID, libItem, rule)).toBe(
        3,
      );
      // Streamystats reports seconds; the property is minutes.
      expect(await service.get(WATCH_TIME_BY_USER_PROP_ID, libItem, rule)).toBe(
        90,
      );
      expect(
        await service.get(LAST_VIEWED_AT_BY_USER_PROP_ID, libItem, rule),
      ).toEqual(new Date('2026-05-01T10:00:00.000Z'));
    });

    // Streamystats' copy of the name lags a Jellyfin rename (and is nullable),
    // so a name match would read this as "never watched" and let a delete rule
    // sweep the item.
    it('matches the statistics row by user id when the names disagree', async () => {
      const { service, streamystatsApi } = createService([alice]);
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getItemDetails.mockResolvedValue(
        itemDetailsOf([
          {
            id: 'user-a',
            name: null,
            watchCount: 3,
            totalWatchTime: 60,
            lastWatched: null,
          },
        ]),
      );

      expect(await service.get(VIEW_COUNT_BY_USER_PROP_ID, libItem, rule)).toBe(
        3,
      );
    });

    it('answers zero and no date for a known user who never watched the item', async () => {
      const { service, streamystatsApi } = createService([alice]);
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getItemDetails.mockResolvedValue(itemDetailsOf([]));

      expect(await service.get(VIEW_COUNT_BY_USER_PROP_ID, libItem, rule)).toBe(
        0,
      );
      expect(await service.get(WATCH_TIME_BY_USER_PROP_ID, libItem, rule)).toBe(
        0,
      );
      expect(
        await service.get(LAST_VIEWED_AT_BY_USER_PROP_ID, libItem, rule),
      ).toBeNull();
    });

    // Zero here would read as "this user never watched it" and let a rule that
    // protects rewatched media sweep it instead.
    it.each([
      { when: 'the rule has no user', users: [alice], ruleDto: {} as never },
      {
        when: 'the media server has no such user',
        users: [{ id: 'user-b', name: 'bob' }],
        ruleDto: rule,
      },
      { when: 'the media server user lookup failed', users: [], ruleDto: rule },
    ])('skips the item when $when', async ({ users, ruleDto }) => {
      const { service, streamystatsApi } = createService(users);
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getItemDetails.mockResolvedValue(
        itemDetailsOf([
          {
            id: 'user-a',
            name: 'alice',
            watchCount: 3,
            totalWatchTime: 60,
            lastWatched: null,
          },
        ]),
      );

      expect(
        await service.get(VIEW_COUNT_BY_USER_PROP_ID, libItem, ruleDto),
      ).toBeUndefined();
    });

    it('skips the item when Streamystats has no statistics for it', async () => {
      const { service, streamystatsApi } = createService([alice]);
      const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
      streamystatsApi.getItemDetails.mockResolvedValue(null);

      expect(
        await service.get(VIEW_COUNT_BY_USER_PROP_ID, libItem, rule),
      ).toBeUndefined();
    });

    it('answers null for a season without reading Streamystats', async () => {
      const { service, streamystatsApi } = createService([alice]);
      const season = createMediaItem({ type: 'season', id: 'season-1' });

      expect(
        await service.get(VIEW_COUNT_BY_USER_PROP_ID, season, rule),
      ).toBeNull();
      expect(streamystatsApi.getItemDetails).not.toHaveBeenCalled();
    });
  });

  it('returns null for an unknown property id', async () => {
    const { service, streamystatsApi } = createService();
    const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
    streamystatsApi.getWatchlistMembership.mockResolvedValue(membershipOf({}));

    expect(await service.get(999, libItem)).toBeNull();
  });
});
