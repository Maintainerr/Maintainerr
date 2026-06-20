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

const membershipOf = (
  entries: Record<string, string[]>,
): StreamystatsWatchlistMembership => ({
  ownersByItemId: entries,
});

describe('StreamystatsGetterService', () => {
  const createService = (
    users: { id: string; name: string }[] = [],
    // Items resolvable by getMetadata — the `_including_parent` props look up
    // the item's parent chain through the media server's metadata path.
    items: ReturnType<typeof createMediaItem>[] = [],
  ) => {
    const streamystatsApi = {
      getWatchlistMembership: jest.fn(),
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
      // failure, not "nobody owns it" — must skip, never an empty list.
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
      // getMetadata returns undefined (item not registered) — the parent chain
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
      // The base prop is item-only — no parent resolution needed.
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

  it('returns null for an unknown property id', async () => {
    const { service, streamystatsApi } = createService();
    const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
    streamystatsApi.getWatchlistMembership.mockResolvedValue(membershipOf({}));

    expect(await service.get(999, libItem)).toBeNull();
  });
});
