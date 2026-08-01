import axios from 'axios';
import PlexApi from './plexApi';

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn() },
}));

jest.mock('axios-retry', () => ({
  __esModule: true,
  default: jest.fn(),
  exponentialDelay: jest.fn(),
}));

// A Plex that never returns more than `serverCap` rows per page, whatever
// X-Plex-Container-Size asks for.
const cappedServer = (totalSize: number, serverCap: number) => {
  const calls: Array<{ start: number; asked: number }> = [];
  const request = jest.fn(async (config: any) => {
    const start = Number(config.headers['X-Plex-Container-Start']);
    const asked = Number(config.headers['X-Plex-Container-Size']);
    calls.push({ start, asked });
    const returned = Math.max(
      0,
      Math.min(Math.min(asked, serverCap), totalSize - start),
    );
    return {
      data: {
        MediaContainer: {
          totalSize,
          size: returned,
          Metadata: Array.from({ length: returned }, (v, i) => ({
            ratingKey: String(start + i),
          })),
        },
      },
    };
  });
  return { request, calls };
};

const api = () =>
  new PlexApi({ hostname: 'plex.local', port: 32400, token: 'token' });

describe('PlexApi.queryAll pagination', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches every row when Plex returns a shorter page than requested', async () => {
    // Plex caps pages at 50 while we ask for the default 120. Stepping the
    // offset by the requested size would skip 70 rows per page.
    const { request, calls } = cappedServer(500, 50);
    (axios.create as jest.Mock).mockReturnValue({ request });

    const result = await api().queryAll<any>(
      { uri: '/status/sessions/history/all' },
      false,
    );

    const keys = result.MediaContainer.Metadata.map((r: any) => r.ratingKey);
    expect(keys).toHaveLength(500);
    expect(new Set(keys).size).toBe(500);
    expect(calls.map((c) => c.start)).toEqual([
      0, 50, 100, 150, 200, 250, 300, 350, 400, 450,
    ]);
  });

  it('honours a caller-supplied page size', async () => {
    const { request, calls } = cappedServer(2500, 1000);
    (axios.create as jest.Mock).mockReturnValue({ request });

    const result = await api().queryAll<any>(
      { uri: '/status/sessions/history/all' },
      false,
      undefined,
      undefined,
      1000,
    );

    expect(result.MediaContainer.Metadata).toHaveLength(2500);
    expect(calls.map((c) => c.asked)).toEqual([1000, 1000, 1000]);
    expect(calls.map((c) => c.start)).toEqual([0, 1000, 2000]);
  });

  it('stops instead of looping when a page comes back empty', async () => {
    // totalSize claims more rows than the server will hand over.
    const request = jest.fn(async () => ({
      data: { MediaContainer: { totalSize: 5000, size: 0, Metadata: [] } },
    }));
    (axios.create as jest.Mock).mockReturnValue({ request });

    const result = await api().queryAll<any>({ uri: '/library/all' }, false);

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.MediaContainer.Metadata).toEqual([]);
  });

  it('stops after one page when Plex reports no totalSize', async () => {
    const request = jest.fn(async () => ({
      data: { MediaContainer: { Metadata: [{ ratingKey: '1' }] } },
    }));
    (axios.create as jest.Mock).mockReturnValue({ request });

    const result = await api().queryAll<any>({ uri: '/library/all' }, false);

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.MediaContainer.Metadata).toHaveLength(1);
  });
});
