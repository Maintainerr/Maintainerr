import { MediaServerType } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { RuleUsersService } from './rule-users.service';

describe('RuleUsersService', () => {
  let service: RuleUsersService;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let plexApi: Mocked<PlexApiService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(RuleUsersService).compile();
    service = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    plexApi = unitRef.get(PlexApiService);
  });

  const withServer = (serverType: MediaServerType, users: unknown[] = []) => {
    mediaServerFactory.getConfiguredServerType.mockResolvedValue(serverType);
    mediaServerFactory.getService.mockResolvedValue({
      getUsers: jest.fn().mockResolvedValue(users),
    } as never);
  };

  it('names Jellyfin users as the media server does, sorted and deduplicated', async () => {
    withServer(MediaServerType.JELLYFIN, [
      { id: '2', name: 'bob' },
      { id: '1', name: 'alice' },
      { id: '3', name: 'alice' },
      { id: '4', name: '' },
    ]);

    await expect(service.getUsernames()).resolves.toEqual(['alice', 'bob']);
  });

  // The Tautulli getter maps history rows to plex.tv-corrected usernames, so
  // offering the server's local account names would hand out names that then
  // match nothing.
  it('names Plex users as plex.tv does', async () => {
    withServer(MediaServerType.PLEX, [{ id: '1', name: 'local-name' }]);
    plexApi.getCorrectedUsers.mockResolvedValue([
      { plexId: 1, username: 'alice' },
    ]);

    await expect(service.getUsernames()).resolves.toEqual(['alice']);
  });

  it('offers no user at all when plex.tv cannot be reached', async () => {
    withServer(MediaServerType.PLEX, [{ id: '1', name: 'local-name' }]);
    plexApi.getCorrectedUsers.mockRejectedValue(
      new Error('plex.tv user data unavailable'),
    );

    await expect(service.getUsernames()).resolves.toEqual([]);
  });
});
