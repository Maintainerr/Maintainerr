import axios from 'axios';
import axiosRetry from 'axios-retry';
import PlexApi from './plexApi';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
  },
}));

jest.mock('axios-retry', () => ({
  __esModule: true,
  default: jest.fn(),
  exponentialDelay: jest.fn(),
}));

describe('PlexApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (axios.create as jest.Mock).mockReturnValue({
      request: jest.fn(),
    });
  });

  it('uses token-only default Plex headers until richer identity headers are proven safe', () => {
    new PlexApi({
      hostname: 'plex.local',
      port: 32400,
      token: 'token',
    });

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://plex.local:32400',
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': 'token',
        },
      }),
    );

    const headers = (axios.create as jest.Mock).mock.calls[0][0].headers;
    expect(headers['X-Plex-Product']).toBeUndefined();
    expect(headers['X-Plex-Version']).toBeUndefined();
    expect(headers['X-Plex-Client-Identifier']).toBeUndefined();
    expect(axiosRetry).toHaveBeenCalledTimes(1);
  });

  it('forwards the configured timeout to axios so wedged Plex sockets cannot stall callers indefinitely', () => {
    new PlexApi({
      hostname: 'plex.local',
      port: 32400,
      token: 'token',
      timeout: 30000,
    });

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 30000 }),
    );
  });

  it('paginates queryAll and reports fetched/totalSize progress after each page', async () => {
    const request = jest.fn();
    (axios.create as jest.Mock).mockReturnValue({ request });

    const api = new PlexApi({
      hostname: 'plex.local',
      port: 32400,
      token: 'token',
    });

    const totalSize = 250;
    const page = (start: number, count: number) => ({
      data: {
        MediaContainer: {
          totalSize,
          Metadata: Array.from({ length: count }, (_v, i) => ({
            ratingKey: String(start + i),
          })),
        },
      },
    });
    // Two full 120-record pages then a short final page.
    request
      .mockResolvedValueOnce(page(0, 120))
      .mockResolvedValueOnce(page(120, 120))
      .mockResolvedValueOnce(page(240, 10));

    const progress: Array<{ fetched: number; totalSize: number }> = [];
    const result = await api.queryAll<{
      MediaContainer: { Metadata: unknown[] };
    }>({ uri: '/status/sessions/history/all' }, false, undefined, (p) =>
      progress.push(p),
    );

    expect(request).toHaveBeenCalledTimes(3);
    expect(result.MediaContainer.Metadata).toHaveLength(totalSize);
    expect(progress).toEqual([
      { fetched: 120, totalSize },
      { fetched: 240, totalSize },
      { fetched: 250, totalSize },
    ]);
  });
});
