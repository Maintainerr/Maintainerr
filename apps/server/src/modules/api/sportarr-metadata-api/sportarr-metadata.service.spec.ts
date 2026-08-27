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

  afterEach(() => {
    delete process.env.SPORTARR_NET;
  });

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
    settings.getSportarrSettings.mockResolvedValue([]);
    // Reading sportarr.net is opt-in, so most of these ask for it.
    process.env.SPORTARR_NET = 'on';

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

  it('stops at the connection unless sportarr.net is asked for', async () => {
    withConnections('http://sportarr.local:1867');
    delete process.env.SPORTARR_NET;
    answer(`${CONNECTION}/agents/series/lg-000278`, {
      error: 'Series not found',
    });

    await expect(service.getLeague('lg-000278')).resolves.toBeUndefined();
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      `${CONNECTION}/agents/series/lg-000278`,
    ]);
  });

  it('makes no request with no connection and sportarr.net not asked for', async () => {
    delete process.env.SPORTARR_NET;

    await expect(service.hasSource()).resolves.toBe(false);
    await expect(service.getLeague('lg-000278')).resolves.toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('stops asking a source that answered nothing at all', async () => {
    // A source that is down answers every league the same way, so a page of
    // cards would otherwise pay its connect timeout once per card.
    withConnections('http://sportarr.local:1867');
    answer(`${SPORTARR_NET}/agents/series/lg-000278`, {
      title: 'Sample League',
    });

    await expect(service.getLeague('lg-000278')).resolves.toEqual({
      title: 'Sample League',
    });
    await expect(service.getLeague('lg-000999')).resolves.toBeUndefined();

    const asked = get.mock.calls
      .map(([url]) => url)
      .filter((url: string) => url.startsWith(CONNECTION));
    expect(asked).toEqual([`${CONNECTION}/agents/series/lg-000278`]);
  });

  it('stands down once every source it knows is unreachable', async () => {
    // The provider claims the tvdb alias too, so a claim it cannot answer
    // would fail a resolution that TVDB could still have finished.
    withConnections('http://sportarr.local:1867');
    delete process.env.SPORTARR_NET;
    answer(`${CONNECTION}/agents/series/lg-000278`, {
      title: 'Sample League',
    });

    await expect(service.getLeague('lg-000278')).resolves.toEqual({
      title: 'Sample League',
    });
    expect(service.hasReachableSource()).toBe(true);

    await expect(service.getLeague('lg-000999')).resolves.toBeUndefined();
    await expect(service.getLeague('lg-000777')).resolves.toBeUndefined();
    expect(service.hasReachableSource()).toBe(false);
    // Still configured, which is what the connection test asks about.
    await expect(service.hasSource()).resolves.toBe(true);
  });

  it('opens again when the first connection is added after an empty boot', async () => {
    // The gate is what stops the walks, and the walks are what refresh the
    // source list, so a first run with nothing configured could otherwise
    // stay shut until a restart.
    delete process.env.SPORTARR_NET;
    withConnections();
    await service.onModuleInit();
    expect(service.hasReachableSource()).toBe(false);
    await new Promise((resolve) => setImmediate(resolve));

    // The user adds their first connection.
    withConnections('http://sportarr.local:1867');
    answer(`${CONNECTION}/agents/series/lg-000278`, {
      title: 'Sample League',
    });

    // The stand-down answer, and the read it kicks off behind it.
    expect(service.hasReachableSource()).toBe(false);
    await new Promise((resolve) => setImmediate(resolve));

    expect(service.hasReachableSource()).toBe(true);
    await expect(service.getLeague('lg-000278')).resolves.toEqual({
      title: 'Sample League',
    });
  });

  it('never touches sportarr.net unless the environment asks for it', async () => {
    // An install that has never heard of Sportarr must not make an outbound
    // request for a carried id it happens to hold.
    delete process.env.SPORTARR_NET;

    await expect(service.hasSource()).resolves.toBe(false);
    await expect(service.getLeague('lg-000278')).resolves.toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('asks an unreachable source again once its rest is over', async () => {
    // Standing down stops the walks, so an answer remembered from the last
    // walk would have no way back and one blip would last the whole process.
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    try {
      withConnections('http://sportarr.local:1867');
      delete process.env.SPORTARR_NET;

      await expect(service.getLeague('lg-000278')).resolves.toBeUndefined();
      expect(service.hasReachableSource()).toBe(false);

      jest.advanceTimersByTime(61_000);
      expect(service.hasReachableSource()).toBe(true);

      answer(`${CONNECTION}/agents/series/lg-000278`, {
        title: 'Sample League',
      });
      await expect(service.getLeague('lg-000278')).resolves.toEqual({
        title: 'Sample League',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('has a source with a connection alone', async () => {
    withConnections('http://sportarr.local:1867');
    delete process.env.SPORTARR_NET;

    await expect(service.hasSource()).resolves.toBe(true);
  });
});
