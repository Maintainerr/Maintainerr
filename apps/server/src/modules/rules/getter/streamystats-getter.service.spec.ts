import { createMediaItem, createMockLogger } from '../../../../test/utils/data';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import {
  StreamystatsApiService,
  StreamystatsWatchlistMembership,
} from '../../api/streamystats-api/streamystats-api.service';
import { StreamystatsGetterService } from './streamystats-getter.service';

const IS_IN_WATCHLIST_PROP_ID = 0;
const WATCHLISTED_BY_USERS_PROP_ID = 1;

const membershipOf = (
  entries: Record<string, string[]>,
): StreamystatsWatchlistMembership => ({
  ownersByItemId: entries,
});

describe('StreamystatsGetterService', () => {
  const createService = (users: { id: string; name: string }[] = []) => {
    const streamystatsApi = {
      getWatchlistMembership: jest.fn(),
    } as unknown as jest.Mocked<StreamystatsApiService>;

    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue({
        getUsers: jest.fn().mockResolvedValue(users),
      }),
    } as unknown as jest.Mocked<MediaServerFactory>;

    const service = new StreamystatsGetterService(
      streamystatsApi,
      mediaServerFactory,
      createMockLogger(),
    );

    return { service, streamystatsApi, mediaServerFactory };
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

  it('returns null for an unknown property id', async () => {
    const { service, streamystatsApi } = createService();
    const libItem = createMediaItem({ type: 'movie', id: 'item-1' });
    streamystatsApi.getWatchlistMembership.mockResolvedValue(membershipOf({}));

    expect(await service.get(999, libItem)).toBeNull();
  });
});
