import { Mocked, TestBed } from '@suites/unit';
import { SettingsDataService } from '../../settings/settings-data.service';
import cacheManager from '../lib/cache';
import { SportarrMetadataApiService } from './sportarr-metadata.service';

const SPORTARR_NET = 'https://sportarr.net/api/metadata';
const CONNECTION = 'http://sportarr.local:1867/api/metadata';

describe('SportarrMetadataApiService', () => {
  let service: SportarrMetadataApiService;
  let settings: Mocked<SettingsDataService>;
  let get: jest.Mock;

  // Answer per absolute URL so a test can say which source holds what. An
  // unregistered URL throws, standing in for an unreachable source.
  const bodies = new Map<string, unknown>();
  const answer = (url: string, body: unknown) => bodies.set(url, body);

  beforeEach(async () => {
    // The service reads through the shared cache, so a league one test
    // fetched would answer the next test from memory.
    cacheManager.getCache('sportarrmetadata').data.flushAll();
    bodies.clear();

    const { unit, unitRef } = await TestBed.solitary(
      SportarrMetadataApiService,
    ).compile();
    service = unit;
    settings = unitRef.get(SettingsDataService);
    settings.sportarr_net_fallback = true;
    settings.getSportarrSettings.mockResolvedValue([]);

    get = jest.fn(async (url: string) => {
      if (!bodies.has(url)) {
        throw new Error(`unexpected request: ${url}`);
      }
      return { data: bodies.get(url) };
    });
    (service as unknown as { axios: unknown }).axios = { get };
  });

  const withConnections = (...urls: string[]) =>
    settings.getSportarrSettings.mockResolvedValue(
      urls.map((url, id) => ({ id, url })) as never,
    );

  it('reads a league from sportarr.net when no connection is configured', async () => {
    answer(`${SPORTARR_NET}/agents/series/lg-000278`, {
      title: 'Sample League',
    });

    await expect(service.getLeague('lg-000278')).resolves.toEqual({
      title: 'Sample League',
    });
  });

  it('prefers a configured connection over sportarr.net', async () => {
    withConnections('http://sportarr.local:1867');
    answer(`${CONNECTION}/agents/series/lg-000278`, { title: 'Sample League' });

    await expect(service.getLeague('lg-000278')).resolves.toEqual({
      title: 'Sample League',
    });
  });

  it('falls through to sportarr.net for a league the connection does not track', async () => {
    // Trailing slash too: a source list that did not strip it would ask for
    // '...1867//api/metadata'.
    withConnections('http://sportarr.local:1867/');
    answer(`${CONNECTION}/agents/series/lg-000278`, {
      error: 'Series not found',
    });
    answer(`${SPORTARR_NET}/agents/series/lg-000278`, {
      title: 'Sample League',
    });

    await expect(service.getLeague('lg-000278')).resolves.toEqual({
      title: 'Sample League',
    });
  });

  it('answers with nothing when no source holds the league', async () => {
    withConnections('http://sportarr.local:1867');
    answer(`${CONNECTION}/agents/series/lg-999999`, {
      error: 'Series not found',
    });
    answer(`${SPORTARR_NET}/agents/series/lg-999999`, {
      error: 'Series not found',
    });

    await expect(service.getLeague('lg-999999')).resolves.toBeUndefined();
    await expect(service.getSeasons('lg-999999')).resolves.toEqual([]);
  });

  it('reads seasons and episodes from the source that holds the league', async () => {
    // The connection answers `{ episodes: [] }` for a league it does not
    // track, so a sub-route that picked its own source would read an empty
    // season as fact instead of falling through to sportarr.net.
    withConnections('http://sportarr.local:1867');
    answer(`${CONNECTION}/agents/series/lg-000278`, {
      error: 'Series not found',
    });
    answer(`${SPORTARR_NET}/agents/series/lg-000278`, {
      title: 'Sample League',
    });
    answer(`${SPORTARR_NET}/agents/series/lg-000278/seasons`, {
      seasons: [{ season_number: 2026 }],
    });
    answer(`${SPORTARR_NET}/agents/series/lg-000278/season/2026/episodes`, {
      episodes: [{ episode_number: 3 }],
    });

    await expect(service.getSeasons('lg-000278')).resolves.toEqual([
      { season_number: 2026 },
    ]);
    await expect(service.getSeasonEpisodes('lg-000278', 2026)).resolves.toEqual(
      [{ episode_number: 3 }],
    );
  });

  it('stops at the connection when sportarr.net is turned off', async () => {
    withConnections('http://sportarr.local:1867');
    settings.sportarr_net_fallback = false;
    answer(`${CONNECTION}/agents/series/lg-000278`, {
      error: 'Series not found',
    });

    await expect(service.getLeague('lg-000278')).resolves.toBeUndefined();
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      `${CONNECTION}/agents/series/lg-000278`,
    ]);
  });

  it('makes no request with no connection and sportarr.net turned off', async () => {
    settings.sportarr_net_fallback = false;

    await expect(service.hasSource()).resolves.toBe(false);
    await expect(service.getLeague('lg-000278')).resolves.toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('has a source with a connection alone', async () => {
    withConnections('http://sportarr.local:1867');
    settings.sportarr_net_fallback = false;

    await expect(service.hasSource()).resolves.toBe(true);
  });
});
