import { Mocked, TestBed } from '@suites/unit';
import { MaintainerrLoggerFactory } from '../../logging/logs.service';
import { SettingsDataService } from '../../settings/settings-data.service';
import cacheManager from '../lib/cache';
import { OMBI_REQUESTS_CACHE_ID } from './ombi-api.constants';
import {
  OmbiApiService,
  OmbiChildRequest,
  OmbiMovieRequest,
  OmbiTvRequest,
} from './ombi-api.service';

describe('OmbiApiService', () => {
  let service: OmbiApiService;
  let settings: Mocked<SettingsDataService>;
  let loggerFactory: Mocked<MaintainerrLoggerFactory>;
  let api: { getWithoutCache: jest.Mock; delete: jest.Mock };

  const movie = (
    overrides: Partial<OmbiMovieRequest> = {},
  ): OmbiMovieRequest => ({
    id: 1,
    theMovieDbId: 100,
    title: 'Sample Movie',
    approved: true,
    markedAsApproved: '2026-01-02T00:00:00Z',
    requestedDate: '2026-01-01T00:00:00Z',
    available: true,
    markedAsAvailable: '2026-01-03T00:00:00Z',
    denied: false,
    releaseDate: '2020-01-01T00:00:00Z',
    has4KRequest: false,
    requestedDate4k: '0001-01-01T00:00:00Z',
    approved4K: false,
    markedAsApproved4K: '0001-01-01T00:00:00Z',
    available4K: false,
    markedAsAvailable4K: null,
    requestedByAlias: null,
    requestedUser: { userName: 'alice' },
    ...overrides,
  });

  const child = (
    seasons: number[],
    overrides: Partial<OmbiChildRequest> = {},
  ): OmbiChildRequest => ({
    id: 10,
    parentRequestId: 5,
    approved: true,
    markedAsApproved: '0001-01-01T00:00:00Z',
    requestedDate: '2026-01-01T00:00:00Z',
    available: false,
    markedAsAvailable: null,
    denied: null,
    requestedByAlias: null,
    requestedUser: { userName: 'bob' },
    seasonRequests: seasons.map((seasonNumber) => ({
      seasonNumber,
      episodes: [
        { episodeNumber: 1, airDate: '2020-01-01T00:00:00Z', available: false },
      ],
    })),
    ...overrides,
  });

  const show = (childRequests: OmbiChildRequest[]): OmbiTvRequest => ({
    id: 5,
    tvDbId: 1,
    externalProviderId: 200,
    title: 'Sample Series',
    releaseDate: '2019-01-01T00:00:00Z',
    childRequests,
  });

  // Answers the list sweeps and the per-title lookups by path.
  const answer = (routes: Record<string, unknown>) =>
    api.getWithoutCache.mockImplementation(
      async (path: string) => routes[path],
    );

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(OmbiApiService).compile();

    service = unit;
    settings = unitRef.get(
      SettingsDataService,
    ) as unknown as Mocked<SettingsDataService>;
    loggerFactory = unitRef.get(MaintainerrLoggerFactory);
    settings.ombiConfigured.mockReturnValue(true);
    api = { getWithoutCache: jest.fn(), delete: jest.fn() };
    service.api = api as never;
    cacheManager.getCache(OMBI_REQUESTS_CACHE_ID).data.flushAll();
  });

  describe('request index', () => {
    it('serves movies and shows from one sweep of both lists', async () => {
      answer({
        '/v1/Request/movie': [movie()],
        '/v1/Request/tv': [show([child([1])])],
      });

      const [found, series, none] = await Promise.all([
        service.getMovieRequest(100),
        service.getShowRequest(200),
        service.getMovieRequest(999),
      ]);

      expect(found?.theMovieDbId).toBe(100);
      expect(series?.id).toBe(5);
      expect(none).toBeNull();
      expect(api.getWithoutCache).toHaveBeenCalledTimes(2);
    });

    it('reports a failed sweep as unknown and retries it', async () => {
      answer({ '/v1/Request/movie': [movie()], '/v1/Request/tv': undefined });
      expect(await service.getMovieRequest(100)).toBeUndefined();

      answer({ '/v1/Request/movie': [movie()], '/v1/Request/tv': [] });
      expect(await service.getMovieRequest(100)).not.toBeNull();
    });
  });

  describe('getRequestedByUsernames', () => {
    it('prefers the API alias and credits only the season requesters', async () => {
      answer({
        '/v1/Request/movie': [
          movie({
            requestedByAlias: 'discord-dave',
            requestedUser: { userName: 'Api' },
          }),
        ],
        '/v1/Request/tv': [
          show([
            child([1], { requestedUser: { userName: 'alice' } }),
            child([2], { id: 11, requestedUser: { userName: 'bob' } }),
          ]),
        ],
      });

      expect(await service.getRequestedByUsernames(100, 'movie')).toEqual([
        'discord-dave',
      ]);
      expect(await service.getRequestedByUsernames(200, 'tv', 2)).toEqual([
        'bob',
      ]);
      expect(await service.getRequestedByUsernames(200, 'tv')).toEqual([
        'alice',
        'bob',
      ]);
      expect(await service.getRequestedByUsernames(200, 'tv', 1, 1)).toEqual([
        'alice',
      ]);
      expect(await service.getRequestedByUsernames(200, 'tv', 1, 9)).toEqual(
        [],
      );
    });

    it('returns [] when Ombi is unreachable or not configured', async () => {
      answer({});
      expect(await service.getRequestedByUsernames(100, 'movie')).toEqual([]);

      settings.ombiConfigured.mockReturnValue(false);
      expect(await service.getRequestedByUsernames(100, 'movie')).toEqual([]);
      expect(api.getWithoutCache).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeMediaByTmdbId', () => {
    it('deletes the request the search view names', async () => {
      answer({ '/v2/Search/movie/100': { requestId: 7 } });
      api.delete.mockResolvedValue({ result: true, isError: false });

      expect(await service.removeMediaByTmdbId(100, 'movie')).toBe(true);
      expect(api.delete).toHaveBeenCalledWith(
        '/v1/Request/movie/7',
        undefined,
        { rethrow: true },
      );
    });

    it('reports an unrequested title as nothing to remove', async () => {
      answer({ '/v2/Search/tv/moviedb/200': { requestId: 0 } });

      expect(await service.removeMediaByTmdbId(200, 'tv')).toBe(false);
      expect(api.delete).not.toHaveBeenCalled();
    });

    it('reports a refused or unanswered removal as unknown', async () => {
      answer({ '/v2/Search/movie/100': { requestId: 7 } });
      api.delete.mockResolvedValue({
        result: false,
        isError: true,
        errorMessage: 'refused',
      });
      expect(await service.removeMediaByTmdbId(100, 'movie')).toBeUndefined();

      answer({});
      expect(await service.removeMediaByTmdbId(100, 'movie')).toBeUndefined();
    });
  });

  describe('removeSeasonRequest', () => {
    it('deletes only the child requests that cover nothing but the season', async () => {
      answer({
        '/v2/Search/tv/moviedb/200': { requestId: 5 },
        '/v1/Request/tv/5/child': [
          child([1]),
          child([2], { id: 11 }),
          child([2, 3], { id: 12 }),
        ],
      });
      api.delete.mockResolvedValue({ result: true, isError: false });

      expect(await service.removeSeasonRequest(200, 2)).toBe(true);
      expect(api.delete).toHaveBeenCalledTimes(1);
      expect(api.delete).toHaveBeenCalledWith(
        '/v1/Request/tv/child/11',
        undefined,
        { rethrow: true },
      );
    });

    it('keeps a request that would take other seasons down with it', async () => {
      answer({
        '/v2/Search/tv/moviedb/200': { requestId: 5 },
        '/v1/Request/tv/5/child': [child([1, 2])],
      });

      expect(await service.removeSeasonRequest(200, 1)).toBe(false);
      expect(api.delete).not.toHaveBeenCalled();
    });

    it('leaves the other seasons alone when none covers it', async () => {
      answer({
        '/v2/Search/tv/moviedb/200': { requestId: 5 },
        '/v1/Request/tv/5/child': [child([1])],
      });

      expect(await service.removeSeasonRequest(200, 3)).toBe(false);
      expect(api.delete).not.toHaveBeenCalled();
    });
  });

  describe('hasRemainingSeasonRequests', () => {
    it('is true only while another season still has episodes to arrive', async () => {
      answer({
        '/v2/Search/tv/moviedb/200': { requestId: 5 },
        '/v1/Request/tv/5/child': [child([1]), child([2], { id: 11 })],
      });
      expect(await service.hasRemainingSeasonRequests(200, 1)).toBe(true);

      const arrived = child([2], { id: 11 });
      arrived.seasonRequests[0].episodes[0].available = true;
      answer({
        '/v2/Search/tv/moviedb/200': { requestId: 5 },
        '/v1/Request/tv/5/child': [child([1]), arrived],
      });
      expect(await service.hasRemainingSeasonRequests(200, 1)).toBe(false);
    });

    it('is unknown when Ombi cannot be asked', async () => {
      answer({});
      expect(await service.hasRemainingSeasonRequests(200, 1)).toBeUndefined();

      settings.ombiConfigured.mockReturnValue(false);
      expect(await service.hasRemainingSeasonRequests(200, 1)).toBeUndefined();
    });
  });

  it('drops the client when the settings are removed', () => {
    loggerFactory.createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as never);
    settings.ombi_url = 'http://ombi.local';
    settings.ombi_api_key = 'key';
    service.init();
    expect(service.api).toBeDefined();

    settings.ombi_url = null;
    settings.ombi_api_key = null;
    service.init();

    expect(service.api).toBeUndefined();
  });
});
