import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { QbittorrentApi } from './qbittorrent.helper';

// Minimal logger stub (the helper only calls setContext during construction).
const logger = {
  setContext: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
} as unknown as MaintainerrLogger;

const buildApi = () => {
  const api = new QbittorrentApi(
    { url: 'http://localhost:8080', username: 'admin', password: 'pw' },
    logger,
  );

  const axiosMock = {
    post: jest.fn(),
    get: jest.fn(),
    defaults: { headers: { common: {} as Record<string, string> } },
  };
  // Swap the real axios instance for a controllable stub.
  (api as unknown as { axios: typeof axiosMock }).axios = axiosMock;

  return { api, axiosMock };
};

describe('QbittorrentApi auth', () => {
  it('authenticates without requiring a cookie when the WebUI bypasses auth', async () => {
    // Bypass mode (e.g. localhost): "Ok." with no Set-Cookie header.
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockResolvedValue({ data: 'Ok.', headers: {} });
    axiosMock.get.mockResolvedValue({ data: 'v5.0.0' });

    await expect(api.getVersion()).resolves.toBe('v5.0.0');
    expect(axiosMock.post).toHaveBeenCalledTimes(1);
    expect(axiosMock.defaults.headers.common['Cookie']).toBeUndefined();
  });

  it.each([
    // qBittorrent 5.1 and older: HTTP 200 "Ok." plus a cookie named `SID`.
    {
      data: 'Ok.',
      setCookie: 'SID=abc123; HttpOnly; path=/',
      expected: 'SID=abc123',
    },
    // 5.2+: HTTP 204 with no body, and the cookie is named after qBittorrent's
    // OWN WebUI port - here 8090, deliberately not the configured URL's 8080,
    // because a Docker port mapping or reverse proxy hides it (#3437).
    {
      data: '',
      setCookie: 'QBT_SID_8090=Zk6xfR8Y+Vl6; HttpOnly; SameSite=Lax; path=/',
      expected: 'QBT_SID_8090=Zk6xfR8Y+Vl6',
    },
  ])(
    'captures the session cookie whatever qBittorrent names it ($expected)',
    async ({ data, setCookie, expected }) => {
      const { api, axiosMock } = buildApi();
      axiosMock.post.mockResolvedValue({
        data,
        headers: { 'set-cookie': [setCookie] },
      });
      axiosMock.get.mockResolvedValue({ data: 'v5.0.0' });

      await api.getVersion();

      expect(axiosMock.defaults.headers.common['Cookie']).toBe(expected);
    },
  );

  it('rejects invalid credentials (HTTP 200 body "Fails." on 5.1 and older)', async () => {
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockResolvedValue({ data: 'Fails.', headers: {} });

    await expect(api.getVersion()).rejects.toThrow(
      'Invalid username or password',
    );
    expect(axiosMock.get).not.toHaveBeenCalled();
  });

  it('rejects invalid credentials (HTTP 401 on 5.2+)', async () => {
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockRejectedValue(
      new AxiosError(
        'Request failed with status code 401',
        undefined,
        {
          headers: new AxiosHeaders(),
        },
        undefined,
        { status: 401 } as AxiosResponse,
      ),
    );

    await expect(api.getVersion()).rejects.toThrow(
      'Invalid username or password',
    );
    expect(axiosMock.get).not.toHaveBeenCalled();
  });

  it('logs in only once across multiple calls', async () => {
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockResolvedValue({ data: 'Ok.', headers: {} });
    axiosMock.get.mockResolvedValue({ data: [] });

    await api.getVersion();
    await api.getTorrentByHash('abc');

    expect(axiosMock.post).toHaveBeenCalledTimes(1);
  });

  // A raw qBittorrent torrent with the limit fields the mapper reads.
  const rawTorrent = (overrides = {}) => ({
    hash: 'abc',
    name: 'Sample',
    content_path: '/downloads/sample',
    ratio: 1,
    max_ratio: -1,
    seeding_time: 0,
    max_seeding_time: -1,
    ...overrides,
  });

  const getMappedTorrent = async (raw: Record<string, unknown>) => {
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockResolvedValue({ data: 'Ok.', headers: {} });
    axiosMock.get.mockResolvedValue({ data: [raw] });
    return api.getTorrentByHash('ABC');
  };

  it('normalizes qBittorrent\'s -1 "unbounded" ratio to Infinity and lowercases the hash lookup', async () => {
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockResolvedValue({ data: 'Ok.', headers: {} });
    axiosMock.get.mockResolvedValue({ data: [rawTorrent({ ratio: -1 })] });

    const single = await api.getTorrentByHash('ABC');
    const [fromList] = await api.getTorrents();

    expect(single?.ratio).toBe(Infinity);
    expect(fromList?.ratio).toBe(Infinity);
    expect(axiosMock.get).toHaveBeenCalledWith(
      '/torrents/info',
      expect.objectContaining({ params: { hashes: 'abc' } }),
    );
  });

  it('reports reachedSeedingGoal=null when qBittorrent enforces no limit', async () => {
    const t = await getMappedTorrent(
      rawTorrent({ max_ratio: -1, max_seeding_time: -1 }),
    );
    expect(t?.reachedSeedingGoal).toBeNull();
  });

  it('reports the ratio goal as met / not met against qBittorrent max_ratio', async () => {
    expect(
      (await getMappedTorrent(rawTorrent({ max_ratio: 2, ratio: 2.5 })))
        ?.reachedSeedingGoal,
    ).toBe(true);
    expect(
      (await getMappedTorrent(rawTorrent({ max_ratio: 2, ratio: 1.5 })))
        ?.reachedSeedingGoal,
    ).toBe(false);
  });

  it('treats the seed-time limit as met independently of ratio', async () => {
    const t = await getMappedTorrent(
      rawTorrent({
        max_ratio: -1,
        ratio: 0.1,
        max_seeding_time: 3600,
        seeding_time: 7200,
      }),
    );
    expect(t?.reachedSeedingGoal).toBe(true);
  });
});

describe('QbittorrentApi deleteTorrents', () => {
  const arrange = () => {
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockResolvedValue({ data: 'Ok.', headers: {} });
    return { api, axiosMock };
  };

  // qBittorrent documents `hashes=all` on /torrents/delete as "delete all
  // torrents", so it must never be forwarded as if it were one download.
  it.each(['all', 'ALL', '  all  '])(
    'refuses the whole-client magic value %j',
    async (hash) => {
      const { api, axiosMock } = arrange();

      await api.deleteTorrents([hash], true);

      expect(
        axiosMock.post.mock.calls.some(([url]) =>
          String(url).includes('/torrents/delete'),
        ),
      ).toBe(false);
    },
  );

  it('drops blank hashes rather than widening the joined list', async () => {
    const { api, axiosMock } = arrange();

    await api.deleteTorrents(['ABC123', '', '   ', 'def456'], false);

    const deleteCall = axiosMock.post.mock.calls.find(([url]) =>
      String(url).includes('/torrents/delete'),
    );
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall[1])).toContain('hashes=abc123%7Cdef456');
  });

  it('sends nothing when every hash was rejected', async () => {
    const { api, axiosMock } = arrange();

    await api.deleteTorrents(['', 'all'], true);

    expect(
      axiosMock.post.mock.calls.some(([url]) =>
        String(url).includes('/torrents/delete'),
      ),
    ).toBe(false);
  });
});
