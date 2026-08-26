import { createMockLogger } from '../../../../test/utils/data';
import { SettingsDataService } from '../../settings/settings-data.service';
import cacheManager from '../lib/cache';
import { SportarrHubApiService } from './sportarr-hub.service';

const HUB = 'https://sportarr.net/api/metadata';
const INSTANCE = 'http://sportarr.local:1867/api/metadata';

describe('SportarrHubApiService', () => {
  // The client reads through the shared sportarrhub cache, so a league one
  // test fetched would answer the next test from memory.
  beforeEach(() => {
    cacheManager.getCache('sportarrhub').data.flushAll();
  });

  const createService = (instanceUrls: string[] = []) => {
    const settings = {
      getSportarrSettings: jest
        .fn()
        .mockResolvedValue(instanceUrls.map((url, id) => ({ id, url }))),
    } as unknown as SettingsDataService;
    const service = new SportarrHubApiService(settings, createMockLogger());

    // Answer per absolute URL so a test can say which source holds what. An
    // unregistered URL throws, standing in for an unreachable source.
    const bodies = new Map<string, unknown>();
    (service as unknown as { axios: unknown }).axios = {
      get: jest.fn(async (url: string) => {
        if (!bodies.has(url)) {
          throw new Error(`unexpected request: ${url}`);
        }
        return { data: bodies.get(url) };
      }),
    };

    return {
      service,
      answer: (url: string, body: unknown) => bodies.set(url, body),
    };
  };

  it('reads a league from the hub when no instance is configured', async () => {
    const { service, answer } = createService();
    answer(`${HUB}/agents/series/lg-000278`, { id: 'lg-000278' });

    await expect(service.getLeague('lg-000278')).resolves.toEqual({
      id: 'lg-000278',
    });
  });

  it('prefers a configured instance over the hub', async () => {
    const { service, answer } = createService(['http://sportarr.local:1867']);
    answer(`${INSTANCE}/agents/series/lg-000278`, { id: 'lg-000278' });

    await expect(service.getLeague('lg-000278')).resolves.toEqual({
      id: 'lg-000278',
    });
  });

  it('falls back to the hub for a league the instance does not monitor', async () => {
    // Trailing slash too: the stored url is normalised, but a source list that
    // did not strip it would ask for '...1867//api/metadata'.
    const { service, answer } = createService(['http://sportarr.local:1867/']);
    answer(`${INSTANCE}/agents/series/lg-000278`, {
      error: 'Series not found',
    });
    answer(`${HUB}/agents/series/lg-000278`, { id: 'lg-000278' });

    await expect(service.getLeague('lg-000278')).resolves.toEqual({
      id: 'lg-000278',
    });
  });

  it('answers with nothing when no source holds the league', async () => {
    const { service, answer } = createService(['http://sportarr.local:1867']);
    answer(`${INSTANCE}/agents/series/lg-999999`, {
      error: 'Series not found',
    });
    answer(`${HUB}/agents/series/lg-999999`, { error: 'Series not found' });

    await expect(service.getLeague('lg-999999')).resolves.toBeUndefined();
    await expect(service.getSeasons('lg-999999')).resolves.toEqual([]);
  });

  it('reads seasons and episodes from the source that holds the league', async () => {
    // The instance answers `{ episodes: [] }` for a league it does not
    // monitor, so a sub-route that picked its own source would read an empty
    // season as fact instead of falling through to the hub.
    const { service, answer } = createService(['http://sportarr.local:1867']);
    answer(`${INSTANCE}/agents/series/lg-000278`, {
      error: 'Series not found',
    });
    answer(`${INSTANCE}/agents/series/lg-000278/season/2026/episodes`, {
      episodes: [],
    });
    answer(`${HUB}/agents/series/lg-000278`, { id: 'lg-000278' });
    answer(`${HUB}/agents/series/lg-000278/seasons`, {
      seasons: [{ season_number: 2026 }],
    });
    answer(`${HUB}/agents/series/lg-000278/season/2026/episodes`, {
      episodes: [{ episode_number: 3 }],
    });

    await expect(service.getSeasons('lg-000278')).resolves.toEqual([
      { season_number: 2026 },
    ]);
    await expect(service.getSeasonEpisodes('lg-000278', 2026)).resolves.toEqual(
      [{ episode_number: 3 }],
    );
  });

  it('answers with nothing when a source cannot be reached', async () => {
    const { service } = createService();

    await expect(service.getLeague('lg-000278')).resolves.toBeUndefined();
    await expect(service.getSeasons('lg-000278')).resolves.toEqual([]);
  });
});
