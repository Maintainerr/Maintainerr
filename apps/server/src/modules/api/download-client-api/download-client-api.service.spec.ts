import { Mocked, TestBed } from '@suites/unit';
import { AxiosError } from 'axios';
import { SettingsDataService } from '../../settings/settings-data.service';
import { DownloadClientTorrent } from './download-client.interface';
import { DownloadClientApiService } from './download-client-api.service';

const apiMock = {
  getVersion: jest.fn(),
  getTorrents: jest.fn(),
  getTorrentByHash: jest.fn(),
  deleteTorrents: jest.fn(),
};

// The service builds its client through the factory, which constructs a
// QbittorrentApi — mock that so the factory returns our stub.
jest.mock('./helpers/qbittorrent.helper', () => ({
  QbittorrentApi: jest.fn().mockImplementation(() => apiMock),
}));

const torrent = (
  overrides: Partial<DownloadClientTorrent> = {},
): DownloadClientTorrent => ({
  hash: 'abc',
  name: 'Sample Download',
  content_path: '/downloads/sample',
  ratio: 1,
  // null = the client enforces no limit, so the fallback ratio applies.
  reachedSeedingGoal: null,
  ...overrides,
});

const forbiddenError = () =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 403,
    statusText: 'Forbidden',
    data: undefined,
    headers: {},
    config: {} as never,
  });

describe('DownloadClientApiService', () => {
  let service: DownloadClientApiService;
  let settings: Mocked<SettingsDataService>;

  beforeEach(async () => {
    apiMock.getVersion.mockReset();
    apiMock.getTorrents.mockReset();
    apiMock.getTorrentByHash.mockReset();
    apiMock.deleteTorrents.mockReset();

    const { unit, unitRef } = await TestBed.solitary(
      DownloadClientApiService,
    ).compile();

    service = unit;
    settings = unitRef.get(
      SettingsDataService,
    ) as unknown as Mocked<SettingsDataService>;
  });

  describe('init', () => {
    it('is a no-op when the download client URL is not configured', () => {
      Object.assign(settings, { download_client_url: undefined });

      service.init();

      expect(service.api).toBeUndefined();
    });

    it('constructs the API client when a URL is configured', () => {
      Object.assign(settings, {
        download_client_url: 'http://localhost:8080',
        download_client_username: 'admin',
        download_client_password: 'pw',
      });

      service.init();

      expect(service.api).toBeDefined();
    });

    it('clears the cached client when the URL is removed', () => {
      Object.assign(settings, { download_client_url: 'http://localhost:8080' });
      service.init();
      expect(service.api).toBeDefined();

      Object.assign(settings, { download_client_url: undefined });
      service.init();

      expect(service.api).toBeUndefined();
    });
  });

  describe('testConnection', () => {
    it('returns OK with the reported version on a healthy probe', async () => {
      apiMock.getVersion.mockResolvedValue('v4.6.0');

      const result = await service.testConnection({
        url: 'http://localhost:8080',
        username: 'admin',
        password: 'pw',
      });

      expect(result.status).toBe('OK');
      expect(result.message).toBe('v4.6.0');
    });

    it('returns NOK when the probe fails', async () => {
      apiMock.getVersion.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.testConnection({
        url: 'http://localhost:8080',
      });

      expect(result.status).toBe('NOK');
    });

    it('returns NOK when no version is reported', async () => {
      apiMock.getVersion.mockResolvedValue('');

      const result = await service.testConnection({
        url: 'http://localhost:8080',
      });

      expect(result.status).toBe('NOK');
    });

    it('gives an actionable message on a 403 (Web UI security block, not bad creds)', async () => {
      apiMock.getVersion.mockRejectedValue(forbiddenError());

      const result = await service.testConnection({
        url: 'http://localhost:8080',
      });

      expect(result.status).toBe('NOK');
      expect(result.message).toContain('403 Forbidden');
      expect(result.message).toContain('whitelisted IP subnets');
      // It must NOT claim "Invalid API key" (qBittorrent has no API key).
      expect(result.message).not.toContain('Invalid API key');
    });
  });

  describe('removeDownloads', () => {
    beforeEach(() => {
      Object.assign(settings, {
        download_client_url: 'http://localhost:8080',
        download_client_username: 'admin',
        download_client_password: 'pw',
        download_client_delete_data: true,
        download_client_fallback_ratio: 0.5,
      });
      service.init();
    });

    it('is a no-op when no download client is configured', async () => {
      Object.assign(settings, { download_client_url: undefined });
      service.init();

      await service.removeDownloads(['abc']);

      expect(apiMock.getTorrentByHash).not.toHaveBeenCalled();
    });

    it('removes when the client reports its seeding goal is met (regardless of the fallback)', async () => {
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: true, ratio: 0.1 }),
      );

      await service.removeDownloads(['ABC']);

      expect(apiMock.getTorrentByHash).toHaveBeenCalledWith('abc');
      expect(apiMock.deleteTorrents).toHaveBeenCalledWith(['abc'], true);
    });

    it('keeps seeding when the client has a limit that is not met yet', async () => {
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: false, ratio: 9 }),
      );

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).not.toHaveBeenCalled();
    });

    it('applies the fallback ratio only when the client enforces no limit', async () => {
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: null, ratio: 0.7 }),
      );

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).toHaveBeenCalledWith(['abc'], true);
    });

    it('keeps seeding when there is no client limit and ratio is below the fallback', async () => {
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: null, ratio: 0.3 }),
      );

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).not.toHaveBeenCalled();
    });

    it('treats an unbounded ratio (Infinity) as satisfying any fallback', async () => {
      Object.assign(settings, { download_client_fallback_ratio: 2 });
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: null, ratio: Infinity }),
      );

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).toHaveBeenCalled();
    });

    it('passes deleteData=false when the toggle is off', async () => {
      Object.assign(settings, { download_client_delete_data: false });
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: true }),
      );

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).toHaveBeenCalledWith(['abc'], false);
    });

    it('skips ids with no matching download', async () => {
      apiMock.getTorrentByHash.mockResolvedValue(null);

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).not.toHaveBeenCalled();
    });

    it('dedupes ids case-insensitively', async () => {
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: true }),
      );

      await service.removeDownloads(['abc', 'ABC', '  abc  ']);

      expect(apiMock.getTorrentByHash).toHaveBeenCalledTimes(1);
    });

    it('is best-effort: a per-download failure never throws', async () => {
      apiMock.getTorrentByHash.mockRejectedValue(new Error('boom'));

      await expect(service.removeDownloads(['abc'])).resolves.toBeUndefined();
    });

    it('keeps data (entry-only) when another download shares the content path (cross-seed)', async () => {
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({
          hash: 'abc',
          content_path: '/downloads/shared',
          reachedSeedingGoal: true,
        }),
      );
      apiMock.getTorrents.mockResolvedValue([
        torrent({
          hash: 'abc',
          content_path: '/downloads/shared',
          reachedSeedingGoal: true,
        }),
        torrent({
          hash: 'def',
          content_path: '/downloads/shared',
          reachedSeedingGoal: true,
        }),
      ]);

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).toHaveBeenCalledWith(['abc'], false);
    });

    it('deletes data when the content path is unique (no cross-seed)', async () => {
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({
          hash: 'abc',
          content_path: '/downloads/solo',
          reachedSeedingGoal: true,
        }),
      );
      apiMock.getTorrents.mockResolvedValue([
        torrent({
          hash: 'abc',
          content_path: '/downloads/solo',
          reachedSeedingGoal: true,
        }),
      ]);

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).toHaveBeenCalledWith(['abc'], true);
    });

    it('does not read the download list for cross-seed when delete-data is off', async () => {
      Object.assign(settings, { download_client_delete_data: false });
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: true }),
      );

      await service.removeDownloads(['abc']);

      expect(apiMock.getTorrents).not.toHaveBeenCalled();
      expect(apiMock.deleteTorrents).toHaveBeenCalledWith(['abc'], false);
    });
  });
});
