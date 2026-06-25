import { MediaItemType, RequestMediaStatus } from '@maintainerr/contracts';
import { createMediaItem, createMockLogger } from '../../../../test/utils/data';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import {
  SeerrApiService,
  SeerrMovieResponse,
  SeerrRequest,
  SeerrRequestStatus,
  SeerrTVResponse,
} from '../../api/seerr-api/seerr-api.service';
import { MetadataService } from '../../metadata/metadata.service';
import { SeerrGetterService } from './seerr-getter.service';

describe('SeerrGetterService', () => {
  const ADD_USER_PROP_ID = 0;
  const REQUEST_DATE_PROP_ID = 1;
  const RELEASE_DATE_PROP_ID = 2;
  const APPROVAL_DATE_PROP_ID = 3;
  const MEDIA_ADDED_AT_PROP_ID = 4;
  const AMOUNT_REQUESTED_PROP_ID = 5;
  const IS_REQUESTED_PROP_ID = 6;

  const createService = () => {
    const seerrApi = {
      getMovie: jest.fn(),
      getShow: jest.fn(),
      getSeason: jest.fn(),
      getRequestsForMedia: jest.fn(),
    } as unknown as jest.Mocked<SeerrApiService>;

    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue({
        getMetadata: jest.fn(),
        getUsers: jest.fn().mockResolvedValue([]),
      }),
    } as unknown as jest.Mocked<MediaServerFactory>;

    const metadataService = {
      resolveIdsFromMediaItemForService: jest
        .fn()
        .mockResolvedValue({ tmdb: 12345, type: 'movie' }),
    } as unknown as jest.Mocked<MetadataService>;

    const logger = createMockLogger();

    const service = new SeerrGetterService(
      seerrApi,
      mediaServerFactory,
      metadataService,
      logger,
    );

    return {
      service,
      seerrApi,
      metadataService,
      mediaServerFactory,
      logger,
    };
  };

  const movieLibItem = createMediaItem({ type: 'movie' });
  const showLibItem = createMediaItem({ type: 'show' });
  const seasonLibItem = createMediaItem({
    type: 'season',
    parentId: showLibItem.id,
    index: 1,
  });

  // Minimal MediaInfo carried on every grouped request (the /request list
  // endpoint populates request.media; the getter rebuilds mediaInfo from it).
  const mediaInfo = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    tmdbId: 12345,
    tvdbId: 200,
    status: RequestMediaStatus.AVAILABLE,
    updatedAt: '2026-02-01',
    mediaAddedAt: '2026-02-02',
    ...overrides,
  });

  const movieRequest = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 1,
      type: 'movie',
      status: SeerrRequestStatus.APPROVED,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      requestedBy: { id: 10, userType: 1, plexUsername: 'PlexUser' },
      is4k: false,
      serverId: 1,
      profileId: 1,
      rootFolder: '/movies',
      media: mediaInfo(),
      ...overrides,
    }) as unknown as SeerrRequest;

  const tvRequest = (
    seasonNumbers: number[],
    overrides: Record<string, unknown> = {},
  ) =>
    ({
      id: 1,
      type: 'tv',
      status: SeerrRequestStatus.APPROVED,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      requestedBy: { id: 10, userType: 1, plexUsername: 'PlexUser' },
      is4k: false,
      serverId: 1,
      profileId: 1,
      rootFolder: '/tv',
      media: mediaInfo(),
      seasons: seasonNumbers.map((n) => ({
        id: n,
        name: `Season ${n}`,
        seasonNumber: n,
        status: SeerrRequestStatus.APPROVED,
      })),
      ...overrides,
    }) as unknown as SeerrRequest;

  describe('addUser (property id=0)', () => {
    it('should return Plex username using plexUsername field from Seerr', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          requestedBy: {
            id: 10,
            userType: 1, // Plex user
            username: 'plexuser_email',
            plexUsername: 'PlexDisplayName',
            plexId: 999999,
          },
        }),
      ]);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['PlexDisplayName']);
    });

    it('should return local username for local users (userType 2)', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          requestedBy: { id: 20, userType: 2, username: 'LocalUser' },
        }),
      ]);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['LocalUser']);
    });

    it('should return jellyfinUsername for Jellyfin users (userType 3)', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          requestedBy: {
            id: 30,
            userType: 3,
            username: 'jellyfin_email',
            jellyfinUsername: 'JellyfinUser',
          },
        }),
      ]);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['JellyfinUser']);
    });

    it('should return jellyfinUsername for Emby users (userType 4)', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          requestedBy: {
            id: 40,
            userType: 4,
            username: 'emby_email',
            jellyfinUsername: 'EmbyUser',
          },
        }),
      ]);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['EmbyUser']);
    });

    it('should fall back to username when plexUsername is not set', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          requestedBy: {
            id: 50,
            userType: 1,
            username: 'FallbackUser',
            plexUsername: '',
          },
        }),
      ]);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['FallbackUser']);
    });

    it('should handle mixed user types (Plex + Jellyfin + Local) in same request list', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          id: 1,
          requestedBy: { id: 10, userType: 1, plexUsername: 'PlexUser' },
        }),
        movieRequest({
          id: 2,
          requestedBy: {
            id: 20,
            userType: 3,
            jellyfinUsername: 'JellyfinUser',
          },
        }),
        movieRequest({
          id: 3,
          requestedBy: { id: 30, userType: 2, username: 'LocalUser' },
        }),
      ]);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['PlexUser', 'JellyfinUser', 'LocalUser']);
    });

    it('should return empty array when the title has no requests', async () => {
      const { service, seerrApi } = createService();

      // Index built, tmdbId absent from it → definitively no requesters.
      seerrApi.getRequestsForMedia.mockResolvedValue([]);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual([]);
    });

    it('should return deduplicated usernames when same user has multiple requests', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          id: 1,
          requestedBy: { id: 10, userType: 1, plexUsername: 'SameUser' },
        }),
        movieRequest({
          id: 2,
          is4k: true,
          requestedBy: { id: 10, userType: 1, plexUsername: 'SameUser' },
        }),
      ]);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['SameUser']);
    });

    it('should not need media server getUsers for Plex username resolution', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          requestedBy: {
            id: 10,
            userType: 1,
            plexUsername: 'PlexUser',
            plexId: 12345678,
          },
        }),
      ]);

      await service.get(ADD_USER_PROP_ID, movieLibItem, undefined);

      // getUsers should NOT be called since we use plexUsername directly
      const mediaServer = await mediaServerFactory.getService();
      expect((mediaServer as any).getUsers).not.toHaveBeenCalled();
    });

    it('should filter TV requests by season for season dataType', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();

      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      seerrApi.getRequestsForMedia.mockResolvedValue([
        tvRequest([1], {
          id: 1,
          requestedBy: {
            id: 10,
            userType: 1,
            plexUsername: 'UserWhoRequestedSeason1',
          },
        }),
        tvRequest([2], {
          id: 2,
          requestedBy: {
            id: 20,
            userType: 1,
            plexUsername: 'UserWhoRequestedSeason2',
          },
        }),
      ]);

      const result = await service.get(
        ADD_USER_PROP_ID,
        seasonLibItem,
        'season' as MediaItemType,
      );

      // Only the season 1 request's user should be returned.
      expect(result).toEqual(['UserWhoRequestedSeason1']);
    });

    it('should return undefined (transient) when the request sweep failed', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue(undefined);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toBeUndefined();
    });
  });

  describe('amountRequested (property id=5)', () => {
    it('should return the request count for movies', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({ id: 1 }),
        movieRequest({ id: 2 }),
      ]);

      await expect(
        service.get(AMOUNT_REQUESTED_PROP_ID, movieLibItem, undefined),
      ).resolves.toBe(2);
    });

    it('should return 0 when the title has no requests for movies', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([]);

      await expect(
        service.get(AMOUNT_REQUESTED_PROP_ID, movieLibItem, undefined),
      ).resolves.toBe(0);
    });

    it('should return undefined (transient) when the request sweep failed', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue(undefined);

      await expect(
        service.get(AMOUNT_REQUESTED_PROP_ID, movieLibItem, undefined),
      ).resolves.toBeUndefined();
    });

    it('should count only the matching season for seasons', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();
      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      seerrApi.getRequestsForMedia.mockResolvedValue([
        tvRequest([1], { id: 1 }),
        tvRequest([2], { id: 2 }),
      ]);

      await expect(
        service.get(
          AMOUNT_REQUESTED_PROP_ID,
          seasonLibItem,
          'season' as MediaItemType,
        ),
      ).resolves.toBe(1);
    });

    it('should return 0 when the title has no requests for seasons', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();
      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      seerrApi.getRequestsForMedia.mockResolvedValue([]);

      await expect(
        service.get(
          AMOUNT_REQUESTED_PROP_ID,
          seasonLibItem,
          'season' as MediaItemType,
        ),
      ).resolves.toBe(0);
    });
  });

  describe('isRequested (property id=6)', () => {
    it('should return 1 when the movie has a request', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([movieRequest()]);

      await expect(
        service.get(IS_REQUESTED_PROP_ID, movieLibItem, undefined),
      ).resolves.toBe(1);
    });

    it('should return 0 when the title has no requests for movies', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([]);

      await expect(
        service.get(IS_REQUESTED_PROP_ID, movieLibItem, undefined),
      ).resolves.toBe(0);
    });

    it('should return 1 for a season that has a matching request', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();
      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      seerrApi.getRequestsForMedia.mockResolvedValue([tvRequest([1])]);

      await expect(
        service.get(
          IS_REQUESTED_PROP_ID,
          seasonLibItem,
          'season' as MediaItemType,
        ),
      ).resolves.toBe(1);
    });

    it('should return 0 for a season with no matching request', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();
      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      // Only season 2 is requested; the season-1 item must not match.
      seerrApi.getRequestsForMedia.mockResolvedValue([tvRequest([2])]);

      await expect(
        service.get(
          IS_REQUESTED_PROP_ID,
          seasonLibItem,
          'season' as MediaItemType,
        ),
      ).resolves.toBe(0);
    });

    it('should resolve the season from parentIndex for episode dataType', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();
      const episodeLibItem = createMediaItem({
        type: 'episode',
        grandparentId: showLibItem.id,
        parentIndex: 2,
        index: 5,
      });
      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      // Episode is in season 2, which is requested; season 1 is not.
      seerrApi.getRequestsForMedia.mockResolvedValue([tvRequest([2])]);

      await expect(
        service.get(
          IS_REQUESTED_PROP_ID,
          episodeLibItem,
          'episode' as MediaItemType,
        ),
      ).resolves.toBe(1);
    });

    it('should return undefined (transient) when the request sweep failed', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue(undefined);

      await expect(
        service.get(IS_REQUESTED_PROP_ID, movieLibItem, undefined),
      ).resolves.toBeUndefined();
    });
  });

  describe('requestDate (property id=1)', () => {
    it('should return the first request createdAt for movies', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({ createdAt: '2026-03-01' }),
      ]);

      await expect(
        service.get(REQUEST_DATE_PROP_ID, movieLibItem, undefined),
      ).resolves.toEqual(new Date('2026-03-01'));
    });

    it('should return null when the title has no requests', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([]);

      await expect(
        service.get(REQUEST_DATE_PROP_ID, movieLibItem, undefined),
      ).resolves.toBeNull();
    });

    it('returns the OLDEST request createdAt for a multi-request movie', async () => {
      const { service, seerrApi } = createService();

      // SeerrApiService.buildRequestIndex normalises each title's list to
      // oldest-first, so requestDate is the first (earliest) request — matching
      // the pre-#3152 getMovie ordering, not the newest re-request (#3152).
      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({ id: 1, createdAt: '2026-04-01' }),
        movieRequest({ id: 2, createdAt: '2026-05-01' }),
      ]);

      await expect(
        service.get(REQUEST_DATE_PROP_ID, movieLibItem, undefined),
      ).resolves.toEqual(new Date('2026-04-01'));
    });

    it('should return the matching season request createdAt for seasons', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();
      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      seerrApi.getRequestsForMedia.mockResolvedValue([
        tvRequest([2], { id: 2, createdAt: '2026-05-01' }),
        tvRequest([1], { id: 1, createdAt: '2026-04-01' }),
      ]);

      await expect(
        service.get(
          REQUEST_DATE_PROP_ID,
          seasonLibItem,
          'season' as MediaItemType,
        ),
      ).resolves.toEqual(new Date('2026-04-01'));
    });
  });

  describe('approvalDate (property id=3)', () => {
    it('should return media updatedAt when available for movies', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          media: mediaInfo({
            status: RequestMediaStatus.AVAILABLE,
            updatedAt: '2026-06-01',
          }),
        }),
      ]);

      await expect(
        service.get(APPROVAL_DATE_PROP_ID, movieLibItem, undefined),
      ).resolves.toEqual(new Date('2026-06-01'));
    });

    it('should return null when the media is not yet available for movies', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          media: mediaInfo({ status: RequestMediaStatus.PENDING }),
        }),
      ]);

      await expect(
        service.get(APPROVAL_DATE_PROP_ID, movieLibItem, undefined),
      ).resolves.toBeNull();
    });

    it('should return the matching season media updatedAt for seasons', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();
      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      seerrApi.getRequestsForMedia.mockResolvedValue([
        tvRequest([1], {
          media: mediaInfo({
            status: RequestMediaStatus.AVAILABLE,
            updatedAt: '2026-07-01',
          }),
        }),
      ]);

      await expect(
        service.get(
          APPROVAL_DATE_PROP_ID,
          seasonLibItem,
          'season' as MediaItemType,
        ),
      ).resolves.toEqual(new Date('2026-07-01'));
    });
  });

  describe('mediaAddedAt (property id=4)', () => {
    it('should return media mediaAddedAt when available for movies', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          media: mediaInfo({
            status: RequestMediaStatus.AVAILABLE,
            mediaAddedAt: '2026-08-01',
          }),
        }),
      ]);

      await expect(
        service.get(MEDIA_ADDED_AT_PROP_ID, movieLibItem, undefined),
      ).resolves.toEqual(new Date('2026-08-01'));
    });

    it('should return null when the media is not yet available for movies', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getRequestsForMedia.mockResolvedValue([
        movieRequest({
          media: mediaInfo({ status: RequestMediaStatus.PROCESSING }),
        }),
      ]);

      await expect(
        service.get(MEDIA_ADDED_AT_PROP_ID, movieLibItem, undefined),
      ).resolves.toBeNull();
    });

    it('should return the matching season media mediaAddedAt for seasons', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();
      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      seerrApi.getRequestsForMedia.mockResolvedValue([
        tvRequest([1], {
          media: mediaInfo({
            status: RequestMediaStatus.AVAILABLE,
            mediaAddedAt: '2026-08-15',
          }),
        }),
      ]);

      await expect(
        service.get(
          MEDIA_ADDED_AT_PROP_ID,
          seasonLibItem,
          'season' as MediaItemType,
        ),
      ).resolves.toEqual(new Date('2026-08-15'));
    });
  });

  describe('releaseDate (property id=2) — per-item fallback', () => {
    it('should resolve movie releaseDate via getMovie, not the request index', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getMovie.mockResolvedValue({
        id: 1,
        mediaInfo: { requests: [] },
        releaseDate: '2026-01-15',
      } as unknown as SeerrMovieResponse);

      await expect(
        service.get(RELEASE_DATE_PROP_ID, movieLibItem, undefined),
      ).resolves.toEqual(new Date('2026-01-15'));
      expect(seerrApi.getRequestsForMedia).not.toHaveBeenCalled();
    });

    it('should resolve show firstAirDate via getShow', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getShow.mockResolvedValue({
        id: 1,
        mediaInfo: { requests: [] },
        firstAirDate: '2026-01-20',
      } as unknown as SeerrTVResponse);

      await expect(
        service.get(RELEASE_DATE_PROP_ID, showLibItem, undefined),
      ).resolves.toEqual(new Date('2026-01-20'));
    });

    it('should resolve season airDate via getSeason', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();
      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      seerrApi.getShow.mockResolvedValue({
        id: 1,
        mediaInfo: { requests: [] },
        firstAirDate: '2026-01-01',
      } as unknown as SeerrTVResponse);
      seerrApi.getSeason.mockResolvedValue({
        id: 1,
        name: 'Season 1',
        seasonNumber: 1,
        airDate: '2026-02-15',
        episodes: [],
      });

      await expect(
        service.get(
          RELEASE_DATE_PROP_ID,
          seasonLibItem,
          'season' as MediaItemType,
        ),
      ).resolves.toEqual(new Date('2026-02-15'));
    });

    it('should return undefined (transient) when getMovie reports a communication failure', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getMovie.mockResolvedValue(undefined);

      await expect(
        service.get(RELEASE_DATE_PROP_ID, movieLibItem, undefined),
      ).resolves.toBeUndefined();
    });

    it('should return null for episodes when season metadata could not be loaded', async () => {
      const { service, seerrApi, mediaServerFactory, logger } = createService();
      const episodeLibItem = createMediaItem({
        type: 'episode',
        grandparentId: showLibItem.id,
        parentIndex: 1,
        index: 2,
      });
      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      seerrApi.getShow.mockResolvedValue({
        id: 1,
        mediaInfo: {
          requests: [],
        },
        firstAirDate: '2026-01-01',
      } as unknown as SeerrTVResponse);
      seerrApi.getSeason.mockResolvedValue(undefined);

      await expect(
        service.get(
          RELEASE_DATE_PROP_ID,
          episodeLibItem,
          'episode' as MediaItemType,
        ),
      ).resolves.toBeNull();
      expect(logger.debug).toHaveBeenCalledWith(
        `Couldn't fetch season data for '${showLibItem.title}' season 1 from Seerr. As a result, unreliable results are expected.`,
      );
    });
  });

  describe('no resolvable tmdb id', () => {
    it('should return null without querying Seerr', async () => {
      const { service, seerrApi, metadataService } = createService();
      (
        metadataService.resolveIdsFromMediaItemForService as jest.Mock
      ).mockResolvedValue({ tmdb: undefined });

      await expect(
        service.get(IS_REQUESTED_PROP_ID, movieLibItem, undefined),
      ).resolves.toBeNull();
      expect(seerrApi.getRequestsForMedia).not.toHaveBeenCalled();
      expect(seerrApi.getMovie).not.toHaveBeenCalled();
    });
  });
});
