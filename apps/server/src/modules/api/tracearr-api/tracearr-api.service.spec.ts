import { MediaServerType, TracearrHistoryItem } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { MediaServerFactory } from '../media-server/media-server.factory';
import { SettingsDataService } from '../../settings/settings-data.service';
import { TracearrApiService } from './tracearr-api.service';

jest.mock('./tracearr-api.constants', () => ({
  ...jest.requireActual('./tracearr-api.constants'),
  TRACEARR_HISTORY_MAX_RECORDS: 3,
}));

const apiMock = {
  getWithoutCache: jest.fn(),
  getRawWithoutCache: jest.fn(),
};

jest.mock('./helpers/tracearr-api.helper', () => ({
  TracearrApi: jest.fn().mockImplementation(() => apiMock),
}));

const SERVER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const historyRow = (id: string, ratingKey: string): TracearrHistoryItem => ({
  id,
  server_id: SERVER_ID,
  server_type: 'plex',
  media_type: 'movie',
  rating_key: ratingKey,
  parent_rating_key: null,
  grandparent_rating_key: null,
  season_number: null,
  episode_number: null,
  percent_complete: 100,
  watched: true,
  started_at: '2026-01-01T00:00:00.000Z',
  stopped_at: '2026-01-01T01:00:00.000Z',
  user: { id: USER_ID },
});

const CONFIRMING_LIBRARY = {
  data: Array.from({ length: 6 }, (_unused, i) => ({
    rating_key: `confirm-${i}`,
    title: 'Confirming Title',
    added_at: '2026-01-01T00:00:00.000Z',
  })),
};

const usersPage = {
  data: [
    {
      id: USER_ID,
      accounts: [
        {
          server_id: SERVER_ID,
          server_type: 'plex',
          external_user_id: 'account-1',
        },
      ],
    },
  ],
  meta: { nextCursor: null, pageSize: 100 },
};

describe('TracearrApiService', () => {
  let service: TracearrApiService;
  let settings: Mocked<SettingsDataService>;
  let mediaServerFactory: Mocked<MediaServerFactory>;

  beforeEach(async () => {
    apiMock.getWithoutCache.mockReset();
    apiMock.getRawWithoutCache.mockReset();

    const { unit, unitRef } =
      await TestBed.solitary(TracearrApiService).compile();
    service = unit;
    settings = unitRef.get(
      SettingsDataService,
    ) as unknown as Mocked<SettingsDataService>;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    mediaServerFactory.getService.mockResolvedValue({
      getUsers: jest
        .fn()
        .mockResolvedValue([{ id: 'account-1', name: 'alice' }]),
      getChildrenMetadata: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn(async () => ({
        title: 'Confirming Title',
        addedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
      itemExists: jest.fn().mockResolvedValue(true),
    } as never);
    Object.assign(settings, {
      media_server_type: MediaServerType.PLEX,
      tracearr_url: 'http://tracearr.local',
      tracearr_api_key: 'trr_pub_token',
      tracearr_server_id: SERVER_ID,
    });
    service.init();
  });

  it('builds a complete paged history index and user-account mapping', async () => {
    const first = historyRow('33333333-3333-4333-8333-333333333333', 'movie-1');
    const second = historyRow(
      '44444444-4444-4444-8444-444444444444',
      'movie-2',
    );
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      if (endpoint === '/history') {
        const calls = apiMock.getWithoutCache.mock.calls.filter(
          (call) => call[0] === '/history',
        );
        return calls.length === 1
          ? { data: [first], meta: { nextCursor: 'page-2', pageSize: 100 } }
          : { data: [second], meta: { nextCursor: null, pageSize: 100 } };
      }
      return usersPage;
    });

    await service.prefetchHistory();

    expect(service.getHistoryIndex()?.rowsByRatingKey.get('movie-1')).toEqual([
      first,
    ]);
    expect(service.getHistoryIndex()?.rowsByRatingKey.get('movie-2')).toEqual([
      second,
    ]);
    // The fixture account carries no username, so the live media-server
    // account list fills in.
    expect(service.getUsernamesByTracearrUserId()?.get(USER_ID)).toEqual([
      'alice',
    ]);
  });

  // A username that maps to no Tracearr user means "unknown user" to the
  // per-user properties, so users without history must still be mapped. One
  // name per account: Tracearr re-reads the media server's username on every
  // sync (plex.tv on Plex), so its copy is authoritative and emitting the
  // local spelling too would count one viewer twice in the watcher lists.
  it('maps every Tracearr user to the username Tracearr read off the media server', async () => {
    const OTHER_USER_ID = '55555555-5555-4555-8555-555555555555';
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      if (endpoint === '/history') {
        return {
          data: [historyRow('33333333-3333-4333-8333-333333333333', 'movie-1')],
          meta: { nextCursor: null, pageSize: 100 },
        };
      }
      return {
        data: [
          {
            id: USER_ID,
            accounts: [
              {
                server_id: SERVER_ID,
                server_type: 'plex',
                external_user_id: 'account-1',
                username: 'alice.on.plex.tv',
              },
            ],
          },
          {
            id: OTHER_USER_ID,
            accounts: [
              {
                server_id: SERVER_ID,
                server_type: 'plex',
                external_user_id: 'account-2',
                username: 'bob',
              },
            ],
          },
        ],
        meta: { nextCursor: null, pageSize: 100 },
      };
    });

    await service.prefetchHistory();

    expect(service.getUsernamesByTracearrUserId()?.get(USER_ID)).toEqual([
      'alice.on.plex.tv',
    ]);
    expect(service.getUsernamesByTracearrUserId()?.get(OTHER_USER_ID)).toEqual([
      'bob',
    ]);
  });

  // Tracearr keeps a departed account in the identity, flagged with removed_at.
  // Resolving it would let a per-user rule read "watched nothing" for someone
  // the server no longer has, instead of skipping the item.
  it('does not resolve an account Tracearr marks as removed', async () => {
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      if (endpoint === '/history') {
        return {
          data: [historyRow('33333333-3333-4333-8333-333333333333', 'movie-1')],
          meta: { nextCursor: null, pageSize: 100 },
        };
      }
      return {
        data: [
          {
            id: USER_ID,
            accounts: [
              {
                server_id: SERVER_ID,
                server_type: 'plex',
                external_user_id: 'account-1',
                username: 'alice',
                removed_at: '2026-08-01T00:00:00.000Z',
              },
            ],
          },
        ],
        meta: { nextCursor: null, pageSize: 100 },
      };
    });

    await service.prefetchHistory();

    expect(service.getUsernamesByTracearrUserId()?.has(USER_ID)).toBe(false);
  });

  it('keeps mapping real users when an account has no external user id', async () => {
    const UNKNOWN_USER_ID = '66666666-6666-4666-8666-666666666666';
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      if (endpoint === '/history') {
        return {
          data: [historyRow('33333333-3333-4333-8333-333333333333', 'movie-1')],
          meta: { nextCursor: null, pageSize: 100 },
        };
      }
      return {
        data: [
          {
            id: UNKNOWN_USER_ID,
            accounts: [
              {
                server_id: SERVER_ID,
                server_type: 'plex',
                external_user_id: '',
                username: 'Unknown',
              },
            ],
          },
          {
            id: USER_ID,
            accounts: [
              {
                server_id: SERVER_ID,
                server_type: 'plex',
                external_user_id: 'account-1',
                username: 'alice',
              },
            ],
          },
        ],
        meta: { nextCursor: null, pageSize: 100 },
      };
    });

    await service.prefetchHistory();

    expect(service.getUsernamesByTracearrUserId()?.get(USER_ID)).toEqual([
      'alice',
    ]);
    expect(
      service.getUsernamesByTracearrUserId()?.get(UNKNOWN_USER_ID),
    ).toEqual(['Unknown']);
  });

  it('invalidates a prefetched history snapshot', async () => {
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      if (endpoint === '/history') {
        return {
          data: [historyRow('33333333-3333-4333-8333-333333333333', 'movie-1')],
          meta: { nextCursor: null, pageSize: 100 },
        };
      }
      return usersPage;
    });

    await service.prefetchHistory();
    service.invalidateHistory();

    expect(service.getHistoryIndex()).toBeUndefined();
    expect(service.getUsernamesByTracearrUserId()).toBeUndefined();
  });

  it('stops an incremental sweep after it reaches a previously indexed chain', async () => {
    const known = historyRow('33333333-3333-4333-8333-333333333333', 'movie-1');
    const newer = historyRow('44444444-4444-4444-8444-444444444444', 'movie-2');
    let sweep = 0;
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/users') {
        return usersPage;
      }
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      sweep += 1;
      if (sweep === 1) {
        return { data: [known], meta: { nextCursor: null, pageSize: 100 } };
      }
      return {
        data: [newer, known],
        meta: { nextCursor: 'older-page', pageSize: 100 },
      };
    });

    await service.prefetchHistory();
    await service.prefetchHistory();

    expect(
      apiMock.getWithoutCache.mock.calls.filter(
        (call) => call[0] === '/history',
      ),
    ).toHaveLength(2);
    expect(service.getHistoryIndex()?.rowsByRatingKey.get('movie-2')).toEqual([
      newer,
    ]);
  });

  it('refreshes unfinished chains beyond the first known chain', async () => {
    const known = historyRow('33333333-3333-4333-8333-333333333333', 'movie-1');
    const unfinished = {
      ...historyRow('44444444-4444-4444-8444-444444444444', 'movie-2'),
      stopped_at: null,
    };
    const refreshed = {
      ...unfinished,
      stopped_at: '2026-01-02T01:00:00.000Z',
    };
    let sweep = 0;
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/users') {
        return usersPage;
      }
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      sweep += 1;
      if (sweep === 1) {
        return {
          data: [known, unfinished],
          meta: { nextCursor: null, pageSize: 100 },
        };
      }
      if (sweep === 2) {
        return {
          data: [
            historyRow('55555555-5555-4555-8555-555555555555', 'movie-3'),
            known,
          ],
          meta: { nextCursor: 'page-2', pageSize: 100 },
        };
      }
      return {
        data: [refreshed],
        meta: { nextCursor: null, pageSize: 100 },
      };
    });

    await service.prefetchHistory();
    await service.prefetchHistory();

    expect(
      service.getHistoryIndex()?.rowsById.get(unfinished.id)?.stopped_at,
    ).toBe('2026-01-02T01:00:00.000Z');
  });

  it('drops unfinished chains missing from a completed sweep', async () => {
    const known = historyRow('33333333-3333-4333-8333-333333333333', 'movie-1');
    const unfinished = {
      ...historyRow('44444444-4444-4444-8444-444444444444', 'movie-2'),
      stopped_at: null,
    };
    let sweep = 0;
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/users') {
        return usersPage;
      }
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      sweep += 1;
      if (sweep === 1) {
        return {
          data: [known, unfinished],
          meta: { nextCursor: null, pageSize: 100 },
        };
      }
      if (sweep === 2) {
        return {
          data: [known],
          meta: { nextCursor: 'page-2', pageSize: 100 },
        };
      }
      return { data: [], meta: { nextCursor: null, pageSize: 100 } };
    });

    await service.prefetchHistory();
    await service.prefetchHistory();

    expect(service.getHistoryIndex()?.rowsById.has(unfinished.id)).toBe(false);
  });

  it('memoizes each show episode catalog for a run', async () => {
    const mediaServer = {
      getUsers: jest
        .fn()
        .mockResolvedValue([{ id: 'account-1', name: 'alice' }]),
      getChildrenMetadata: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'season-1' }])
        .mockResolvedValueOnce([{ id: 'episode-1' }]),
    };
    mediaServerFactory.getService.mockResolvedValue(mediaServer as never);
    const show = { id: 'show-1', type: 'show' } as never;

    await expect(service.getEpisodeIds(show)).resolves.toEqual(['episode-1']);
    await expect(service.getEpisodeIds(show)).resolves.toEqual(['episode-1']);

    expect(mediaServer.getChildrenMetadata).toHaveBeenCalledTimes(2);
  });

  it('does not expose an index after a later cursor page fails', async () => {
    const first = historyRow('33333333-3333-4333-8333-333333333333', 'movie-1');
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      if (endpoint === '/history') {
        const calls = apiMock.getWithoutCache.mock.calls.filter(
          (call) => call[0] === '/history',
        );
        return calls.length === 1
          ? { data: [first], meta: { nextCursor: 'page-2', pageSize: 100 } }
          : undefined;
      }
      return usersPage;
    });

    await service.prefetchHistory();

    expect(service.getHistoryIndex()).toBeUndefined();
  });

  it('does not expose an empty history index', async () => {
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      if (endpoint === '/history') {
        return { data: [], meta: { nextCursor: null, pageSize: 100 } };
      }
      return usersPage;
    });

    await service.prefetchHistory();

    expect(service.getHistoryIndex()).toBeUndefined();
  });

  it('abandons an oversized Tracearr history snapshot', async () => {
    apiMock.getWithoutCache.mockResolvedValue({
      data: [
        historyRow('33333333-3333-4333-8333-333333333333', 'movie-1'),
        historyRow('44444444-4444-4444-8444-444444444444', 'movie-2'),
        historyRow('55555555-5555-4555-8555-555555555555', 'movie-3'),
        historyRow('66666666-6666-4666-8666-666666666666', 'movie-4'),
      ],
      meta: { nextCursor: null, pageSize: 100 },
    });

    await service.prefetchHistory();

    expect(service.getHistoryIndex()).toBeUndefined();
  });

  it('tests a Tracearr v2 OpenAPI document', async () => {
    apiMock.getRawWithoutCache.mockResolvedValue({
      data: {
        openapi: '3.1.0',
        info: { title: 'Tracearr Public API', version: '2.0.0-beta.1' },
      },
    });

    await expect(
      service.testConnection({
        url: 'http://tracearr.local',
        apiKey: 'trr_pub_token',
      }),
    ).resolves.toEqual({ status: 'OK', code: 1, message: '2.0.0-beta.1' });
  });

  it('reads Tracearr servers from the public API document', async () => {
    apiMock.getRawWithoutCache.mockResolvedValue({
      data: {
        paths: {
          '/api/v2/public/history': {
            get: {
              parameters: [
                {
                  name: 'server_id',
                  in: 'query',
                  schema: {
                    enum: [SERVER_ID],
                  },
                  description: `Available servers: **Dev Plex**: \`${SERVER_ID}\``,
                },
              ],
            },
          },
        },
      },
    });

    await expect(
      service.getServers({
        url: 'http://tracearr.local',
        apiKey: 'trr_pub_token',
      }),
    ).resolves.toEqual([{ id: SERVER_ID, name: 'Dev Plex' }]);
  });

  it('offers only the Tracearr server matching the configured media server', async () => {
    const jellyfinServerId = '66666666-6666-4666-8666-666666666666';
    Object.assign(settings, { media_server_type: MediaServerType.PLEX });
    apiMock.getRawWithoutCache.mockResolvedValue({
      data: {
        paths: {
          '/api/v2/public/history': {
            get: {
              parameters: [
                {
                  name: 'server_id',
                  in: 'query',
                  schema: { enum: [SERVER_ID, jellyfinServerId] },
                  description: `Available servers: **Dev Plex**: \`${SERVER_ID}\` **Dev Jellyfin**: \`${jellyfinServerId}\``,
                },
              ],
            },
          },
        },
      },
    });
    apiMock.getWithoutCache.mockResolvedValue({
      data: [
        { server_id: SERVER_ID, server_type: 'plex' },
        { server_id: jellyfinServerId, server_type: 'jellyfin' },
      ],
    });

    await expect(
      service.getServers({
        url: 'http://tracearr.local',
        apiKey: 'trr_pub_token',
      }),
    ).resolves.toEqual([{ id: SERVER_ID, name: 'Dev Plex' }]);
  });

  it('resolves the server itself when a media server switch cleared it', async () => {
    Object.assign(settings, { tracearr_server_id: undefined });
    service.init();
    apiMock.getRawWithoutCache.mockResolvedValue({
      data: {
        paths: {
          '/api/v2/public/history': {
            get: {
              parameters: [
                {
                  name: 'server_id',
                  in: 'query',
                  schema: { enum: [SERVER_ID] },
                  description: `Available servers: **Dev Plex**: \`${SERVER_ID}\``,
                },
              ],
            },
          },
        },
      },
    });
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/libraries') {
        return { data: [{ server_id: SERVER_ID, server_type: 'plex' }] };
      }
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      if (endpoint === '/history') {
        return {
          data: [historyRow('33333333-3333-4333-8333-333333333333', 'movie-1')],
          meta: { nextCursor: null, pageSize: 100 },
        };
      }
      return usersPage;
    });

    await service.prefetchHistory();

    expect(service.getHistoryIndex()?.rowsByRatingKey.has('movie-1')).toBe(
      true,
    );
  });

  it('picks the server whose library the media server actually has', async () => {
    const otherPlexId = '77777777-7777-4777-8777-777777777777';
    Object.assign(settings, { media_server_type: MediaServerType.PLEX });
    mediaServerFactory.getService.mockResolvedValue({
      getUsers: jest.fn().mockResolvedValue([{ id: 'account-1', name: 'a' }]),
      getChildrenMetadata: jest.fn().mockResolvedValue([]),
      // Both servers number items the same way, so only the titles separate
      // them: 'ours' resolves, the other server's keys resolve to something
      // else entirely.
      getMetadata: jest.fn(async (id: string) =>
        id === 'ours-1'
          ? {
              title: 'Real Movie',
              addedAt: new Date('2026-01-01T00:00:00.000Z'),
            }
          : id === 'ours-2'
            ? {
                title: 'Other Real Movie',
                addedAt: new Date('2026-01-01T00:00:00.000Z'),
              }
            : {
                title: 'Something Else',
                addedAt: new Date('1999-01-01T00:00:00.000Z'),
              },
      ),
    } as never);
    apiMock.getRawWithoutCache.mockResolvedValue({
      data: {
        paths: {
          '/api/v2/public/history': {
            get: {
              parameters: [
                {
                  name: 'server_id',
                  in: 'query',
                  schema: { enum: [SERVER_ID, otherPlexId] },
                  description: `Available servers: **Ours**: \`${SERVER_ID}\` **Theirs**: \`${otherPlexId}\``,
                },
              ],
            },
          },
        },
      },
    });
    apiMock.getWithoutCache.mockImplementation(
      async (endpoint: string, config: { params: { server_id: string } }) => {
        if (endpoint === '/libraries') {
          return {
            data: [
              { server_id: SERVER_ID, server_type: 'plex' },
              { server_id: otherPlexId, server_type: 'plex' },
            ],
          };
        }
        return config.params.server_id === SERVER_ID
          ? {
              data: [
                {
                  rating_key: 'ours-1',
                  title: 'Real Movie',
                  added_at: '2026-01-01T00:00:00.000Z',
                },
                {
                  rating_key: 'ours-2',
                  title: 'Other Real Movie',
                  added_at: '2026-01-01T00:00:00.000Z',
                },
              ],
            }
          : {
              data: [
                {
                  rating_key: 'theirs-1',
                  title: 'Real Movie',
                  added_at: '2026-01-01T00:00:00.000Z',
                },
                {
                  rating_key: 'theirs-2',
                  title: 'Other Real Movie',
                  year: 2021,
                },
              ],
            };
      },
    );

    await expect(
      service.resolveServerId({
        url: 'http://tracearr.local',
        apiKey: 'trr_pub_token',
      }),
    ).resolves.toBe(SERVER_ID);
  });

  // Jellyfin ids are per-server GUIDs, so a foreign server's keys resolve to
  // nothing rather than to the wrong title. Skipping unresolvable keys made
  // such a server look merely unreadable, and it was accepted.
  it('rejects a server whose items do not exist on the media server at all', async () => {
    const foreignId = '88888888-8888-4888-8888-888888888888';
    Object.assign(settings, { media_server_type: MediaServerType.JELLYFIN });
    mediaServerFactory.getService.mockResolvedValue({
      getUsers: jest.fn().mockResolvedValue([{ id: 'account-1', name: 'a' }]),
      getChildrenMetadata: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn(async (id: string) =>
        id.startsWith('ours-')
          ? {
              title: `Real ${id}`,
              addedAt: new Date('2026-01-01T00:00:00.000Z'),
            }
          : undefined,
      ),
      // The foreign server's GUIDs are genuinely absent. getMetadata alone
      // cannot tell that from a failed read, which is what itemExists answers.
      itemExists: jest.fn(async (id: string) => id.startsWith('ours-')),
    } as never);
    apiMock.getWithoutCache.mockImplementation(
      async (endpoint: string, config: { params: { server_id: string } }) => {
        if (endpoint === '/libraries') {
          return {
            data: [
              { server_id: SERVER_ID, server_type: 'jellyfin' },
              { server_id: foreignId, server_type: 'jellyfin' },
            ],
          };
        }
        const own = config.params.server_id === SERVER_ID;
        return {
          data: Array.from({ length: 6 }, (_unused, i) => ({
            rating_key: own ? `ours-${i}` : `theirs-${i}`,
            title: own ? `Real ours-${i}` : `Foreign ${i}`,
            added_at: '2026-01-01T00:00:00.000Z',
          })),
        };
      },
    );

    await expect(
      service.serverSharesLibrary(
        { url: 'http://tracearr.local', apiKey: 'trr_pub_token' },
        foreignId,
      ),
    ).resolves.toBe(false);
  });

  // Plex and Emby number items from a shared range and generic titles like
  // "Season 1" repeat everywhere, so a foreign server's keys can resolve to
  // same-titled items. The added date is then the only thing separating them.
  it('rejects a same-titled server whose items were added at other times', async () => {
    const foreignId = '66666666-6666-4666-8666-666666666666';
    Object.assign(settings, { media_server_type: MediaServerType.PLEX });
    mediaServerFactory.getService.mockResolvedValue({
      getUsers: jest.fn().mockResolvedValue([{ id: 'account-1', name: 'a' }]),
      getChildrenMetadata: jest.fn().mockResolvedValue([]),
      // Same key, same title, different copy: added months earlier.
      getMetadata: jest.fn(async () => ({
        title: 'Season 1',
        addedAt: new Date('2025-03-04T10:00:00.000Z'),
      })),
      itemExists: jest.fn().mockResolvedValue(true),
    } as never);
    apiMock.getWithoutCache.mockResolvedValue({
      data: Array.from({ length: 6 }, (_unused, i) => ({
        rating_key: `${100 + i}`,
        title: 'Season 1',
        added_at: '2026-01-01T00:00:00.000Z',
      })),
    });

    await expect(
      service.serverSharesLibrary(
        { url: 'http://tracearr.local', apiKey: 'trr_pub_token' },
        foreignId,
      ),
    ).resolves.toBe(false);
  });

  // getMetadata cannot tell an absent item from a failed read, so a timeout
  // must not be read as proof that the server is foreign.
  it('does not condemn a server when the media server cannot be read', async () => {
    const otherId = '99999999-9999-4999-8999-999999999999';
    Object.assign(settings, { media_server_type: MediaServerType.JELLYFIN });
    mediaServerFactory.getService.mockResolvedValue({
      getUsers: jest.fn().mockResolvedValue([{ id: 'account-1', name: 'a' }]),
      getChildrenMetadata: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn().mockResolvedValue(undefined),
      itemExists: jest.fn().mockRejectedValue(new Error('gateway timeout')),
    } as never);
    apiMock.getWithoutCache.mockResolvedValue({
      data: Array.from({ length: 8 }, (_unused, i) => ({
        rating_key: `key-${i}`,
        title: `Title ${i}`,
        added_at: '2026-01-01T00:00:00.000Z',
      })),
    });

    await expect(
      service.serverSharesLibrary(
        { url: 'http://tracearr.local', apiKey: 'trr_pub_token' },
        otherId,
      ),
    ).resolves.toBeUndefined();
  });

  // Live recently-added rows are full of seasons and episodes with no year, so
  // a title on its own must not confirm a server.
  it('does not confirm a server from title-only agreement', async () => {
    Object.assign(settings, { media_server_type: MediaServerType.PLEX });
    mediaServerFactory.getService.mockResolvedValue({
      getUsers: jest.fn().mockResolvedValue([{ id: 'account-1', name: 'a' }]),
      getChildrenMetadata: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn(async () => ({ title: 'Season 1', year: null })),
      itemExists: jest.fn().mockResolvedValue(true),
    } as never);
    apiMock.getWithoutCache.mockResolvedValue({
      data: Array.from({ length: 8 }, (_unused, i) => ({
        rating_key: `${i}`,
        title: 'Season 1',
        added_at: '2026-01-01T00:00:00.000Z',
      })),
    });

    await expect(
      service.serverSharesLibrary(
        { url: 'http://tracearr.local', apiKey: 'trr_pub_token' },
        SERVER_ID,
      ),
    ).resolves.toBeUndefined();
  });

  it('refuses history from a server that is not the configured media server', async () => {
    Object.assign(settings, { media_server_type: MediaServerType.JELLYFIN });
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/recently-added') {
        return CONFIRMING_LIBRARY;
      }
      if (endpoint === '/history') {
        return {
          data: [historyRow('33333333-3333-4333-8333-333333333333', 'movie-1')],
          meta: { nextCursor: null, pageSize: 100 },
        };
      }
      return usersPage;
    });

    await service.prefetchHistory();

    expect(service.getHistoryIndex()).toBeUndefined();
  });

  // The wrong server's history is readable, so its rows answer "watched
  // nothing" for every item it does not cover instead of failing.
  it('refuses a populated history from a server that stopped matching', async () => {
    Object.assign(settings, { media_server_type: MediaServerType.PLEX });
    mediaServerFactory.getService.mockResolvedValue({
      getUsers: jest.fn().mockResolvedValue([{ id: 'account-1', name: 'a' }]),
      getChildrenMetadata: jest.fn().mockResolvedValue([]),
      getMetadata: jest.fn(async () => ({
        title: 'Season 1',
        addedAt: new Date('2025-03-04T10:00:00.000Z'),
      })),
      itemExists: jest.fn().mockResolvedValue(true),
    } as never);
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/history') {
        return {
          data: [historyRow('33333333-3333-4333-8333-333333333333', 'movie-1')],
          meta: { nextCursor: null, pageSize: 100 },
        };
      }
      if (endpoint === '/recently-added') {
        return {
          data: Array.from({ length: 6 }, (_unused, i) => ({
            rating_key: `${100 + i}`,
            title: 'Season 1',
            added_at: '2026-01-01T00:00:00.000Z',
          })),
        };
      }
      return usersPage;
    });

    await service.prefetchHistory();

    expect(service.getHistoryIndex()).toBeUndefined();
  });

  // A re-point invalidates the snapshot, so the next run probes again. The
  // probe cannot always decide, and history it cannot vouch for must not be
  // read as "watched nothing".
  it('refuses history from a server it cannot confirm', async () => {
    apiMock.getWithoutCache.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/history') {
        return {
          data: [historyRow('33333333-3333-4333-8333-333333333333', 'movie-1')],
          meta: { nextCursor: null, pageSize: 100 },
        };
      }
      if (endpoint === '/recently-added') {
        return { data: [] };
      }
      return usersPage;
    });

    await service.prefetchHistory();

    expect(service.getHistoryIndex()).toBeUndefined();
  });

  it('reports a failed Tracearr server discovery', async () => {
    apiMock.getRawWithoutCache.mockRejectedValue(new Error('Unauthorized'));

    await expect(
      service.getServers({
        url: 'http://tracearr.local',
        apiKey: 'trr_pub_token',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects Tracearr versions below 2.0.0-beta.1', async () => {
    apiMock.getRawWithoutCache.mockResolvedValue({
      data: {
        openapi: '3.1.0',
        info: { title: 'Tracearr Public API', version: '2.0.0-beta.0' },
      },
    });

    await expect(
      service.testConnection({
        url: 'http://tracearr.local',
        apiKey: 'trr_pub_token',
      }),
    ).resolves.toEqual({
      status: 'NOK',
      code: 0,
      message:
        'Tracearr 2.0.0-beta.0 is below the minimum supported version 2.0.0-beta.1. Please update Tracearr.',
    });
  });

  it('accepts the stable release after 2.0.0-beta.1', async () => {
    apiMock.getRawWithoutCache.mockResolvedValue({
      data: {
        openapi: '3.1.0',
        info: { title: 'Tracearr Public API', version: '2.0.0' },
      },
    });

    await expect(
      service.testConnection({
        url: 'http://tracearr.local',
        apiKey: 'trr_pub_token',
      }),
    ).resolves.toEqual({ status: 'OK', code: 1, message: '2.0.0' });
  });
});
