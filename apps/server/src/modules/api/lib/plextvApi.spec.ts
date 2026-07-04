import { AxiosError, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import { MaintainerrLogger } from '../../logging/logs.service';
import { createMockLogger } from '../../../../test/utils/data';
import cacheManager from './cache';
import { PlexTvApi } from './plextvApi';

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return {
    ...actual,
    __esModule: true,
    default: { ...actual.default, create: jest.fn() },
  };
});

jest.mock('axios-retry', () => ({
  __esModule: true,
  default: jest.fn(),
  exponentialDelay: jest.fn(),
}));

const axios = jest.requireMock('axios').default as { create: jest.Mock };

describe('PlexTvApi.validateToken', () => {
  const get = jest.fn();

  const createApi = () =>
    new PlexTvApi(
      'a-token',
      createMockLogger() as unknown as MaintainerrLogger,
    );

  const rejectWithStatus = (status: number) =>
    get.mockRejectedValue(
      new AxiosError('rejected', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
      } as AxiosResponse),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    axios.create.mockReturnValue({ get });
    (axiosRetry as unknown as jest.Mock).mockImplementation(() => undefined);
  });

  it('returns valid when plex.tv returns an account', async () => {
    get.mockResolvedValue({ data: { user: { id: 1 } } });

    await expect(createApi().validateToken()).resolves.toBe('valid');
  });

  // plex.tv returns 422 {"error":"Invalid token"} for a bad token on this
  // endpoint (verified live) - not 401 - so 422 must count as invalid too.
  it.each([422, 401, 403])(
    'returns invalid when plex.tv answers %i',
    async (status) => {
      rejectWithStatus(status);

      await expect(createApi().validateToken()).resolves.toBe('invalid');
    },
  );

  // Transient failures must not be mistaken for a bad token (429 = rate limit).
  it.each([429, 408, 503])(
    'returns unreachable on a transient %i',
    async (status) => {
      rejectWithStatus(status);

      await expect(createApi().validateToken()).resolves.toBe('unreachable');
    },
  );

  it('returns unreachable when plex.tv times out', async () => {
    get.mockRejectedValue(new AxiosError('timeout', 'ECONNABORTED'));

    await expect(createApi().validateToken()).resolves.toBe('unreachable');
  });
});

describe('PlexTvApi.getDevices', () => {
  const get = jest.fn();

  const createApi = () =>
    new PlexTvApi(
      'a-token',
      createMockLogger() as unknown as MaintainerrLogger,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    // Responses are cached by endpoint; flush so cases don't leak into each other.
    cacheManager.getCache('plextv').data.flushAll();
    axios.create.mockReturnValue({ get });
    (axiosRetry as unknown as jest.Mock).mockImplementation(() => undefined);
  });

  it('queries v2 with the client identifier and maps owned servers v1 omits', async () => {
    get.mockResolvedValue({
      data: [
        {
          name: 'plex',
          product: 'Plex Media Server',
          productVersion: '1.43.2',
          platform: 'Linux',
          platformVersion: '6.8',
          device: 'Docker Container (hotio)',
          clientIdentifier: 'owned-server-id',
          provides: 'server',
          owned: true,
          ownerId: null,
          createdAt: '2026-06-07T16:14:08Z',
          lastSeenAt: '2026-06-07T16:14:08Z',
          connections: [
            {
              protocol: 'https',
              address: 'plex.example.info',
              port: 443,
              uri: 'https://plex.example.info:443',
              local: false,
            },
          ],
        },
      ],
    });

    const devices = await createApi().getDevices('client-123');

    // v2 requires X-Plex-Client-Identifier; v1 did not.
    expect(get).toHaveBeenCalledWith(
      '/api/v2/resources?includeHttps=1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Plex-Client-Identifier': 'client-123',
        }),
      }),
    );
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      name: 'plex',
      clientIdentifier: 'owned-server-id',
      owned: true,
      provides: ['server'],
    });
    expect(devices[0].createdAt).toBeInstanceOf(Date);
    expect(devices[0].connection[0]).toMatchObject({
      port: 443,
      local: false,
      uri: 'https://plex.example.info:443',
    });
  });

  it('returns [] when plex.tv errors', async () => {
    get.mockRejectedValue(new AxiosError('boom', 'ERR_BAD_REQUEST'));

    await expect(createApi().getDevices('client-123')).resolves.toEqual([]);
  });
});
