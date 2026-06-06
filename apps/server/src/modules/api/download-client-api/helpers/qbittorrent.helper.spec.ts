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

  it('captures the SID cookie when one is issued', async () => {
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockResolvedValue({
      data: 'Ok.',
      headers: { 'set-cookie': ['SID=abc123; HttpOnly; path=/'] },
    });
    axiosMock.get.mockResolvedValue({ data: 'v5.0.0' });

    await api.getVersion();

    expect(axiosMock.defaults.headers.common['Cookie']).toBe('SID=abc123');
  });

  it('rejects invalid credentials (HTTP 200 body "Fails.")', async () => {
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockResolvedValue({ data: 'Fails.', headers: {} });

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
