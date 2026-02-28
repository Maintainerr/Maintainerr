import { MediaItemType } from '@maintainerr/contracts';
import { createMediaItem, createMockLogger } from '../../../../test/utils/data';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import {
  SeerrApiService,
  SeerrMovieResponse,
  SeerrTVResponse,
} from '../../api/seerr-api/seerr-api.service';
import { TmdbIdService } from '../../api/tmdb-api/tmdb-id.service';
import { TmdbApiService } from '../../api/tmdb-api/tmdb.service';
import { SeerrGetterService } from './seerr-getter.service';

describe('SeerrGetterService', () => {
  const createService = () => {
    const seerrApi = {
      getMovie: jest.fn(),
      getShow: jest.fn(),
      getSeason: jest.fn(),
    } as unknown as jest.Mocked<SeerrApiService>;

    const tmdbApi = {} as jest.Mocked<TmdbApiService>;

    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue({
        getMetadata: jest.fn(),
        getUsers: jest.fn().mockResolvedValue([]),
      }),
    } as unknown as jest.Mocked<MediaServerFactory>;

    const tmdbIdHelper = {
      getTmdbIdFromMediaItem: jest
        .fn()
        .mockResolvedValue({ id: 12345, type: 'movie' }),
    } as unknown as jest.Mocked<TmdbIdService>;

    const logger = createMockLogger();

    const service = new SeerrGetterService(
      seerrApi,
      tmdbApi,
      mediaServerFactory,
      tmdbIdHelper,
      logger,
    );

    return { service, seerrApi, tmdbIdHelper, mediaServerFactory, logger };
  };

  const movieLibItem = createMediaItem({ type: 'movie' });
  const showLibItem = createMediaItem({ type: 'show' });
  const seasonLibItem = createMediaItem({
    type: 'season',
    parentId: showLibItem.id,
    index: 1,
  });

  describe('addUser (property id=0)', () => {
    const ADD_USER_PROP_ID = 0;

    it('should return Plex username using plexUsername field from Seerr', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getMovie.mockResolvedValue({
        id: 1,
        mediaInfo: {
          requests: [
            {
              id: 1,
              status: 2,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
              type: 'movie',
              requestedBy: {
                id: 10,
                userType: 1, // Plex user
                username: 'plexuser_email',
                plexUsername: 'PlexDisplayName',
                plexId: 999999,
              },
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/movies',
            },
          ],
        },
      } as unknown as SeerrMovieResponse);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['PlexDisplayName']);
    });

    it('should return local username for local users (userType 2)', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getMovie.mockResolvedValue({
        id: 1,
        mediaInfo: {
          requests: [
            {
              id: 1,
              status: 2,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
              type: 'movie',
              requestedBy: {
                id: 20,
                userType: 2, // Local user
                username: 'LocalUser',
                plexUsername: '',
              },
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/movies',
            },
          ],
        },
      } as unknown as SeerrMovieResponse);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['LocalUser']);
    });

    it('should return jellyfinUsername for Jellyfin users (userType 3)', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getMovie.mockResolvedValue({
        id: 1,
        mediaInfo: {
          requests: [
            {
              id: 1,
              status: 2,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
              type: 'movie',
              requestedBy: {
                id: 30,
                userType: 3, // Jellyfin user
                username: 'jellyfin_email',
                jellyfinUsername: 'JellyfinUser',
              },
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/movies',
            },
          ],
        },
      } as unknown as SeerrMovieResponse);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['JellyfinUser']);
    });

    it('should return jellyfinUsername for Emby users (userType 4)', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getMovie.mockResolvedValue({
        id: 1,
        mediaInfo: {
          requests: [
            {
              id: 1,
              status: 2,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
              type: 'movie',
              requestedBy: {
                id: 40,
                userType: 4, // Emby user
                username: 'emby_email',
                jellyfinUsername: 'EmbyUser',
              },
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/movies',
            },
          ],
        },
      } as unknown as SeerrMovieResponse);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['EmbyUser']);
    });

    it('should fall back to username when plexUsername is not set', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getMovie.mockResolvedValue({
        id: 1,
        mediaInfo: {
          requests: [
            {
              id: 1,
              status: 2,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
              type: 'movie',
              requestedBy: {
                id: 50,
                userType: 1,
                username: 'FallbackUser',
                plexUsername: '', // empty
              },
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/movies',
            },
          ],
        },
      } as unknown as SeerrMovieResponse);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['FallbackUser']);
    });

    it('should handle mixed user types (Plex + Jellyfin + Local) in same request list', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getMovie.mockResolvedValue({
        id: 1,
        mediaInfo: {
          requests: [
            {
              id: 1,
              status: 2,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
              type: 'movie',
              requestedBy: {
                id: 10,
                userType: 1, // Plex
                plexUsername: 'PlexUser',
              },
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/movies',
            },
            {
              id: 2,
              status: 2,
              createdAt: '2026-01-02',
              updatedAt: '2026-01-02',
              type: 'movie',
              requestedBy: {
                id: 20,
                userType: 3, // Jellyfin
                jellyfinUsername: 'JellyfinUser',
              },
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/movies',
            },
            {
              id: 3,
              status: 2,
              createdAt: '2026-01-03',
              updatedAt: '2026-01-03',
              type: 'movie',
              requestedBy: {
                id: 30,
                userType: 2, // Local
                username: 'LocalUser',
              },
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/movies',
            },
          ],
        },
      } as unknown as SeerrMovieResponse);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['PlexUser', 'JellyfinUser', 'LocalUser']);
    });

    it('should return empty array when no requests exist', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getMovie.mockResolvedValue({
        id: 1,
        mediaInfo: {
          requests: [],
        },
      } as unknown as SeerrMovieResponse);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual([]);
    });

    it('should return deduplicated usernames when same user has multiple requests', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getMovie.mockResolvedValue({
        id: 1,
        mediaInfo: {
          requests: [
            {
              id: 1,
              status: 2,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
              type: 'movie',
              requestedBy: {
                id: 10,
                userType: 1,
                username: 'user',
                plexUsername: 'SameUser',
              },
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/movies',
            },
            {
              id: 2,
              status: 2,
              createdAt: '2026-01-02',
              updatedAt: '2026-01-02',
              type: 'movie',
              requestedBy: {
                id: 10,
                userType: 1,
                username: 'user',
                plexUsername: 'SameUser',
              },
              is4k: true,
              serverId: 1,
              profileId: 1,
              rootFolder: '/movies',
            },
          ],
        },
      } as unknown as SeerrMovieResponse);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toEqual(['SameUser']);
    });

    it('should return null when no mediaInfo exists', async () => {
      const { service, seerrApi } = createService();

      seerrApi.getMovie.mockResolvedValue({
        id: 1,
        mediaInfo: undefined,
      } as unknown as SeerrMovieResponse);

      const result = await service.get(
        ADD_USER_PROP_ID,
        movieLibItem,
        undefined,
      );

      expect(result).toBeNull();
    });

    it('should not need media server getUsers for Plex username resolution', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();

      seerrApi.getMovie.mockResolvedValue({
        id: 1,
        mediaInfo: {
          requests: [
            {
              id: 1,
              status: 2,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
              type: 'movie',
              requestedBy: {
                id: 10,
                userType: 1,
                username: 'email',
                plexUsername: 'PlexUser',
                plexId: 12345678,
              },
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/movies',
            },
          ],
        },
      } as unknown as SeerrMovieResponse);

      await service.get(ADD_USER_PROP_ID, movieLibItem, undefined);

      // getUsers should NOT be called since we use plexUsername directly
      const mediaServer = await mediaServerFactory.getService();
      expect((mediaServer as any).getUsers).not.toHaveBeenCalled();
    });

    it('should filter TV requests by season for season dataType', async () => {
      const { service, seerrApi, mediaServerFactory } = createService();

      // Mock media server to return show metadata for season parent lookup
      const mockMediaServer = await mediaServerFactory.getService();
      (mockMediaServer as any).getMetadata = jest
        .fn()
        .mockResolvedValue(showLibItem);

      seerrApi.getShow.mockResolvedValue({
        id: 1,
        mediaInfo: {
          requests: [
            {
              id: 1,
              status: 2,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
              type: 'tv',
              requestedBy: {
                id: 10,
                userType: 1,
                plexUsername: 'UserWhoRequestedSeason1',
              },
              seasons: [{ id: 1, name: 'Season 1', seasonNumber: 1 }],
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/tv',
            },
            {
              id: 2,
              status: 2,
              createdAt: '2026-01-02',
              updatedAt: '2026-01-02',
              type: 'tv',
              requestedBy: {
                id: 20,
                userType: 1,
                plexUsername: 'UserWhoRequestedSeason2',
              },
              seasons: [{ id: 2, name: 'Season 2', seasonNumber: 2 }],
              is4k: false,
              serverId: 1,
              profileId: 1,
              rootFolder: '/tv',
            },
          ],
        },
      } as unknown as SeerrTVResponse);

      const result = await service.get(
        ADD_USER_PROP_ID,
        seasonLibItem,
        'season' as MediaItemType,
      );

      // Only season 1 request user should be returned
      expect(result).toEqual(['UserWhoRequestedSeason1']);
    });
  });
});
