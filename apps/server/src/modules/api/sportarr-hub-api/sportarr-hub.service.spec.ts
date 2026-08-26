import cacheManager from '../lib/cache';
import { SportarrHubApiService } from './sportarr-hub.service';

describe('SportarrHubApiService', () => {
  // The client reads through the shared sportarrhub cache, so a league one
  // test fetched would answer the next test from memory.
  beforeEach(() => {
    cacheManager.getCache('sportarrhub').data.flushAll();
  });

  const createLogger = () => ({
    setContext: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  });

  const createService = () => {
    const logger = createLogger();
    const service = new SportarrHubApiService(logger as any);
    const get = jest.fn();
    (service as any).axios = { get };
    return { service, get, logger };
  };

  it('reads a league by the id its agents stamp', async () => {
    const { service, get } = createService();
    get.mockResolvedValue({
      data: { id: 'lg-000278', title: 'Sample League' },
    });

    await expect(service.getLeague('lg-000278')).resolves.toEqual({
      id: 'lg-000278',
      title: 'Sample League',
    });
    expect(get).toHaveBeenCalledWith('/agents/series/lg-000278', undefined);
  });

  it('treats the hub error envelope as an unknown league', async () => {
    const { service, get } = createService();
    get.mockResolvedValue({ data: { error: 'Series not found' } });

    await expect(service.getLeague('lg-999999')).resolves.toBeUndefined();
  });

  it('reads seasons and season episodes from their agent routes', async () => {
    const { service, get } = createService();
    get
      .mockResolvedValueOnce({ data: { seasons: [{ season_number: 2026 }] } })
      .mockResolvedValueOnce({ data: { episodes: [{ episode_number: 3 }] } });

    await expect(service.getSeasons('lg-000278')).resolves.toEqual([
      { season_number: 2026 },
    ]);
    await expect(service.getSeasonEpisodes('lg-000278', 2026)).resolves.toEqual(
      [{ episode_number: 3 }],
    );
    expect(get).toHaveBeenNthCalledWith(
      1,
      '/agents/series/lg-000278/seasons',
      undefined,
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      '/agents/series/lg-000278/season/2026/episodes',
      undefined,
    );
  });

  it('answers with nothing when the hub cannot be reached', async () => {
    const { service, get } = createService();
    get.mockRejectedValue(new Error('connect ETIMEDOUT'));

    await expect(service.getLeague('lg-000278')).resolves.toBeUndefined();
    await expect(service.getSeasons('lg-000278')).resolves.toEqual([]);
  });
});
