import { AxiosError, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import { MaintainerrLogger } from '../../logging/logs.service';
import { createMockLogger } from '../../../../test/utils/data';
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
  // endpoint (verified live) — not 401 — so 422 must count as invalid too.
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
