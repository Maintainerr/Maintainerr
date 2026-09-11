import { AxiosError } from 'axios';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { TransmissionApi } from './transmission.helper';

const logger = {
  setContext: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
} as unknown as MaintainerrLogger;

const HASH = '0123456789abcdef0123456789abcdef01234567';

const session = (overrides: Record<string, unknown> = {}) => ({
  version: '4.1.3 (a1b2c3d4e5)',
  seedRatioLimited: false,
  'idle-seeding-limit-enabled': false,
  ...overrides,
});

const torrent = (overrides: Record<string, unknown> = {}) => ({
  hashString: HASH,
  name: 'Sample Download',
  downloadDir: '/downloads/complete/',
  uploadRatio: 0.75,
  secondsSeeding: 172800,
  seedRatioMode: 2,
  seedIdleMode: 2,
  isFinished: false,
  ...overrides,
});

const rpcSuccess = (args: unknown) => ({
  data: { result: 'success', arguments: args },
});

const httpError = (status: number) =>
  new AxiosError('', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data: undefined,
    headers: {},
    config: {} as never,
  });

const buildApi = () => {
  const api = new TransmissionApi(
    {
      url: 'http://localhost:9091/transmission/rpc',
      username: 'admin',
      password: 'pw',
    },
    logger,
  );
  const axiosMock = { post: jest.fn() };
  (api as unknown as { axios: typeof axiosMock }).axios = axiosMock;
  return { api, axiosMock };
};

describe('TransmissionApi RPC', () => {
  it('sends Basic auth and resends the first request with the 409 session id', async () => {
    const requests: {
      url?: string;
      authorization?: string;
      sessionId?: string;
      body: string;
    }[] = [];
    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        requests.push({
          url: request.url,
          authorization: request.headers.authorization,
          sessionId: request.headers['x-transmission-session-id'] as
            string | undefined,
          body,
        });

        if (!request.headers['x-transmission-session-id']) {
          response.writeHead(409, {
            'X-Transmission-Session-Id': 'live-session',
          });
          response.end();
          return;
        }

        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(rpcSuccess(session()).data));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address() as AddressInfo;

    try {
      const api = new TransmissionApi(
        {
          url: `http://127.0.0.1:${address.port}/transmission/rpc`,
          username: 'admin',
          password: 'pw',
        },
        logger,
      );

      await expect(api.getVersion()).resolves.toBe('4.1.3');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      url: '/transmission/rpc',
      authorization: `Basic ${Buffer.from('admin:pw').toString('base64')}`,
      sessionId: undefined,
    });
    expect(requests[1]).toMatchObject({ sessionId: 'live-session' });
    expect(JSON.parse(requests[1].body)).toEqual({
      method: 'session-get',
      arguments: {},
    });
  });

  it.each([
    [401, 'Invalid username or password'],
    [403, 'rpc-whitelist'],
    [421, 'rpc-host-whitelist'],
  ])('maps a %i to a Transmission-specific error', async (status, text) => {
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockRejectedValue(httpError(status));

    await expect(api.getVersion()).rejects.toThrow(text);
    expect(axiosMock.post).toHaveBeenCalledTimes(1);
  });

  it('rejects an RPC-level failure returned with HTTP 200', async () => {
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockResolvedValue({
      data: { result: 'invalid argument', arguments: {} },
    });

    await expect(api.getVersion()).rejects.toThrow(
      'Transmission RPC session-get failed: invalid argument',
    );
  });

  it('reads the session once across torrent reads', async () => {
    const { api, axiosMock } = buildApi();
    axiosMock.post
      .mockResolvedValueOnce(rpcSuccess(session()))
      .mockResolvedValueOnce(rpcSuccess({ torrents: [torrent()] }))
      .mockResolvedValueOnce(rpcSuccess({ torrents: [torrent()] }));

    await expect(api.getTorrents()).resolves.toHaveLength(1);
    await expect(api.getTorrentByHash(HASH)).resolves.not.toBeNull();
    expect(axiosMock.post).toHaveBeenCalledTimes(3);
    expect(axiosMock.post.mock.calls[2][1]).toMatchObject({
      method: 'torrent-get',
      arguments: { ids: [HASH] },
    });
  });
});

describe('TransmissionApi torrent mapping', () => {
  const getMappedTorrent = async (
    sessionOverrides: Record<string, unknown>,
    torrentOverrides: Record<string, unknown>,
  ) => {
    const { api, axiosMock } = buildApi();
    axiosMock.post
      .mockResolvedValueOnce(rpcSuccess(session(sessionOverrides)))
      .mockResolvedValueOnce(
        rpcSuccess({ torrents: [torrent(torrentOverrides)] }),
      );
    return api.getTorrentByHash(HASH.toUpperCase());
  };

  it('maps the content path and ratio, and looks the hash up case-insensitively', async () => {
    await expect(getMappedTorrent({}, {})).resolves.toEqual({
      hash: HASH,
      name: 'Sample Download',
      content_path: '/downloads/complete/Sample Download',
      ratio: 0.75,
      seedingTime: 172800,
      reachedSeedingGoal: null,
    });
  });

  it('reports the seeding goal as reached when Transmission marks it finished', async () => {
    const mapped = await getMappedTorrent(
      { seedRatioLimited: true },
      { seedRatioMode: 0, isFinished: true },
    );
    expect(mapped?.reachedSeedingGoal).toBe(true);
  });

  it.each([
    ['a per-torrent ratio', {}, { seedRatioMode: 1 }],
    [
      'an inherited idle',
      { 'idle-seeding-limit-enabled': true },
      { seedIdleMode: 0 },
    ],
  ])(
    'keeps seeding while %s goal is unmet',
    async (_, sessionOverrides, torrentOverrides) => {
      const mapped = await getMappedTorrent(sessionOverrides, torrentOverrides);
      expect(mapped?.reachedSeedingGoal).toBe(false);
    },
  );

  it('normalizes the ratio sentinels', async () => {
    expect((await getMappedTorrent({}, { uploadRatio: -2 }))?.ratio).toBe(
      Infinity,
    );
    expect((await getMappedTorrent({}, { uploadRatio: -1 }))?.ratio).toBe(0);
  });

  it('does not query Transmission for a non-hash download id', async () => {
    const { api, axiosMock } = buildApi();

    await expect(api.getTorrentByHash('recently-active')).resolves.toBeNull();
    expect(axiosMock.post).not.toHaveBeenCalled();
  });
});

describe('TransmissionApi deleteTorrents', () => {
  it('removes only 40-hex hashes and forwards the delete-data choice', async () => {
    const { api, axiosMock } = buildApi();
    axiosMock.post.mockResolvedValue(rpcSuccess({}));

    await api.deleteTorrents(
      [
        HASH.toUpperCase(),
        '',
        'recently-active',
        `${HASH}${HASH.slice(0, 24)}`,
      ],
      true,
    );

    expect(axiosMock.post).toHaveBeenCalledTimes(1);
    expect(axiosMock.post.mock.calls[0][1]).toEqual({
      method: 'torrent-remove',
      arguments: { ids: [HASH], 'delete-local-data': true },
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('sends nothing when every id is invalid', async () => {
    const { api, axiosMock } = buildApi();

    await api.deleteTorrents(['', 'recently-active'], true);

    expect(axiosMock.post).not.toHaveBeenCalled();
  });
});
