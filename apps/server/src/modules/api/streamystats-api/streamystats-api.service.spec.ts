import { Mocked, TestBed } from '@suites/unit';
import { SettingsService } from '../../settings/settings.service';
import { StreamystatsApi } from './helpers/streamystats-api.helper';
import { StreamystatsApiService } from './streamystats-api.service';

const apiMock = {
  get: jest.fn(),
  getWithoutCache: jest.fn(),
  getRawWithoutCache: jest.fn(),
};

jest.mock('./helpers/streamystats-api.helper', () => ({
  StreamystatsApi: jest.fn().mockImplementation(() => apiMock),
}));

describe('StreamystatsApiService', () => {
  let service: StreamystatsApiService;
  let settings: Mocked<SettingsService>;

  beforeEach(async () => {
    apiMock.get.mockReset();
    apiMock.getWithoutCache.mockReset();
    apiMock.getRawWithoutCache.mockReset();

    const { unit, unitRef } = await TestBed.solitary(
      StreamystatsApiService,
    ).compile();

    service = unit;
    settings = unitRef.get(
      SettingsService,
    ) as unknown as Mocked<SettingsService>;
  });

  describe('init', () => {
    it('is a no-op when Streamystats URL is not configured', () => {
      Object.assign(settings, {
        streamystats_url: undefined,
        jellyfin_api_key: 'jellyfin-key',
      });

      service.init();

      expect(service.api).toBeUndefined();
    });

    it('is a no-op when Jellyfin API key is missing', () => {
      Object.assign(settings, {
        streamystats_url: 'http://streamystats',
        jellyfin_api_key: undefined,
      });

      service.init();

      expect(service.api).toBeUndefined();
    });

    it('constructs the API client when both settings are present', () => {
      Object.assign(settings, {
        streamystats_url: 'http://streamystats',
        jellyfin_api_key: 'jellyfin-key',
      });

      service.init();

      expect(service.api).toBeDefined();
    });

    it('clears the cached client and serverId when settings are removed', async () => {
      Object.assign(settings, {
        streamystats_url: 'http://streamystats',
        jellyfin_api_key: 'jellyfin-key',
        jellyfin_server_name: 'My Server',
      });
      service.init();
      apiMock.getWithoutCache.mockResolvedValueOnce([
        { id: 7, url: null, name: 'My Server' },
      ]);
      apiMock.get.mockResolvedValueOnce({
        item: { id: 'item-1', type: 'Movie' },
        totalViews: 1,
        totalWatchTime: 0,
        completionRate: 0,
        firstWatched: null,
        lastWatched: null,
        usersWatched: [],
        watchHistory: [],
        watchCountByMonth: [],
      });
      await service.getItemDetails('item-1');
      expect(service.api).toBeDefined();

      // Streamystats URL removed
      Object.assign(settings, { streamystats_url: undefined });
      service.init();

      expect(service.api).toBeUndefined();
    });
  });

  describe('getItemDetails', () => {
    beforeEach(() => {
      Object.assign(settings, {
        streamystats_url: 'http://streamystats',
        jellyfin_api_key: 'jellyfin-key',
        jellyfin_server_name: 'My Server',
        jellyfin_url: 'http://jellyfin.local',
      });
      service.init();
      // /api/servers resolution returns a matching server for "My Server"
      apiMock.getWithoutCache.mockResolvedValue([
        { id: 7, url: 'http://jellyfin.local', name: 'My Server' },
      ]);
    });

    it('returns null when no Streamystats server matches the configured Jellyfin', async () => {
      apiMock.getWithoutCache.mockResolvedValueOnce([
        { id: 99, url: 'http://other.local', name: 'Other Server' },
      ]);

      const result = await service.getItemDetails('item-1');
      expect(result).toBeNull();
      expect(apiMock.get).not.toHaveBeenCalled();
    });

    it('returns null when the upstream payload fails schema validation', async () => {
      apiMock.get.mockResolvedValue({ bogus: true });

      const result = await service.getItemDetails('item-1');
      expect(result).toBeNull();
    });

    it('returns parsed details and passes the resolved serverId', async () => {
      apiMock.get.mockResolvedValue({
        item: { id: 'item-1', name: 'Item One', type: 'Movie' },
        totalViews: 3,
        totalWatchTime: 5400,
        completionRate: 87.5,
        firstWatched: '2026-01-01T00:00:00Z',
        lastWatched: '2026-05-01T00:00:00Z',
        usersWatched: [],
        watchHistory: [],
        watchCountByMonth: [],
      });

      const result = await service.getItemDetails('item-1');
      expect(result?.totalViews).toBe(3);
      expect(result?.completionRate).toBeCloseTo(87.5);
      expect(apiMock.get).toHaveBeenCalledWith(
        '/api/get-item-details/item-1',
        expect.objectContaining({ params: { serverId: '7' } }),
      );
    });

    it('coerces string-encoded aggregation numbers to real numbers', async () => {
      apiMock.get.mockResolvedValue({
        item: { id: 'item-1', type: 'Series' },
        totalViews: '18',
        totalWatchTime: '14400',
        completionRate: '36.5',
        firstWatched: '2026-05-17T13:38:00Z',
        lastWatched: '2026-05-18T21:56:00Z',
        usersWatched: [
          {
            user: { id: 'u1', name: 'beate' },
            watchCount: '5',
            totalWatchTime: '14400',
            completionRate: '36.5',
            firstWatched: '2026-05-17T13:38:00Z',
            lastWatched: '2026-05-18T21:56:00Z',
          },
        ],
        watchHistory: [],
        watchCountByMonth: [
          {
            month: '5',
            year: '2026',
            watchCount: '18',
            uniqueUsers: '2',
            totalWatchTime: '14400',
          },
        ],
        episodeStats: {
          totalSeasons: '2',
          totalEpisodes: '18',
          watchedEpisodes: '8',
          watchedSeasons: '1',
        },
      });

      const result = await service.getItemDetails('item-1');
      expect(result?.totalViews).toBe(18);
      expect(result?.usersWatched[0].watchCount).toBe(5);
      expect(result?.watchCountByMonth[0].month).toBe(5);
      expect(result?.episodeStats?.watchedEpisodes).toBe(8);
    });

    it('matches by URL first and falls back to name only when no URL match exists', async () => {
      // Two servers share the name "Jellyfin" but only one matches the URL.
      apiMock.getWithoutCache.mockResolvedValueOnce([
        { id: 99, url: 'http://other.local', name: 'Jellyfin' },
        { id: 42, url: 'http://jellyfin.local', name: 'Jellyfin' },
      ]);
      Object.assign(settings, {
        jellyfin_server_name: 'Jellyfin',
        jellyfin_url: 'http://jellyfin.local',
      });
      service.init();
      apiMock.get.mockResolvedValue({
        item: { id: 'item-1', type: 'Movie' },
        totalViews: 1,
        totalWatchTime: 0,
        completionRate: 0,
        firstWatched: null,
        lastWatched: null,
        usersWatched: [],
        watchHistory: [],
        watchCountByMonth: [],
      });

      await service.getItemDetails('item-1');

      expect(apiMock.get).toHaveBeenCalledWith(
        '/api/get-item-details/item-1',
        expect.objectContaining({ params: { serverId: '42' } }),
      );
    });

    it('caches the resolved serverId across calls', async () => {
      apiMock.get.mockResolvedValue({
        item: { id: 'item-1', type: 'Movie' },
        totalViews: 1,
        totalWatchTime: 100,
        completionRate: 100,
        firstWatched: null,
        lastWatched: null,
        usersWatched: [],
        watchHistory: [],
        watchCountByMonth: [],
      });

      await service.getItemDetails('item-1');
      await service.getItemDetails('item-2');

      expect(apiMock.getWithoutCache).toHaveBeenCalledTimes(1);
    });
  });

  describe('testConnection', () => {
    it('returns OK with the reported version on a healthy probe', async () => {
      apiMock.getRawWithoutCache.mockResolvedValue({
        data: {
          currentVersion: '2.18.0',
          latestVersion: '2.18.0',
          hasUpdate: false,
          buildTime: 0,
        },
      });

      const result = await service.testConnection({
        url: 'http://streamystats',
        apiKey: 'jellyfin-key',
      });

      expect(result.status).toBe('OK');
      expect(result.message).toBe('2.18.0');
    });

    it('returns NOK when the probe fails', async () => {
      apiMock.getRawWithoutCache.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.testConnection({
        url: 'http://streamystats',
        apiKey: 'jellyfin-key',
      });

      expect(result.status).toBe('NOK');
    });

    it('supports being called without an apiKey (no Authorization header)', async () => {
      const StreamystatsApiMock = StreamystatsApi as unknown as jest.Mock;
      StreamystatsApiMock.mockClear();
      apiMock.getRawWithoutCache.mockResolvedValue({
        data: {
          currentVersion: '2.18.0',
          latestVersion: '2.18.0',
          hasUpdate: false,
          buildTime: 0,
        },
      });

      const result = await service.testConnection({
        url: 'http://streamystats',
      });

      expect(result.status).toBe('OK');
      // The helper is constructed with url only — no apiKey leaks to a
      // user-supplied URL via /api/settings/test/streamystats.
      const callArgs = StreamystatsApiMock.mock.calls.at(-1)?.[0];
      expect(callArgs?.url).toBe('http://streamystats');
      expect(callArgs?.apiKey).toBeUndefined();
    });
  });
});
