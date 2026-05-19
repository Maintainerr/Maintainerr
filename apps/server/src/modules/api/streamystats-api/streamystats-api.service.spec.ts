import { Mocked, TestBed } from '@suites/unit';
import { SettingsService } from '../../settings/settings.service';
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
  });

  describe('getItemDetails', () => {
    beforeEach(() => {
      Object.assign(settings, {
        streamystats_url: 'http://streamystats',
        jellyfin_api_key: 'jellyfin-key',
        jellyfin_server_name: 'My Server',
      });
      service.init();
    });

    it('returns null when no server identifier is available', async () => {
      Object.assign(settings, {
        jellyfin_server_name: undefined,
        jellyfin_url: undefined,
      });

      const result = await service.getItemDetails('item-1');
      expect(result).toBeNull();
      expect(apiMock.get).not.toHaveBeenCalled();
    });

    it('returns null when the upstream payload fails schema validation', async () => {
      apiMock.get.mockResolvedValue({ bogus: true });

      const result = await service.getItemDetails('item-1');
      expect(result).toBeNull();
    });

    it('returns parsed details on a valid response', async () => {
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
        expect.objectContaining({ params: { serverName: 'My Server' } }),
      );
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
  });
});
