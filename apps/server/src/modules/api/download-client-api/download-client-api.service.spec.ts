import { Mocked, TestBed } from '@suites/unit';
import { DownloadClientType } from '@maintainerr/contracts';
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
// QbittorrentApi - mock that so the factory returns our stub.
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
  seedingTime: 48 * 3600,
  // null = the client enforces no limit, so the fallbacks apply.
  reachedSeedingGoal: null,
  ...overrides,
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
    it('clears the cached client when the URL is removed', () => {
      Object.assign(settings, {
        download_client_type: DownloadClientType.QBITTORRENT,
        download_client_url: 'http://localhost:8080',
      });
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
        type: DownloadClientType.QBITTORRENT,
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
        type: DownloadClientType.QBITTORRENT,
        url: 'http://localhost:8080',
      });

      expect(result.status).toBe('NOK');
    });
  });

  describe('removeDownloads', () => {
    beforeEach(() => {
      Object.assign(settings, {
        download_client_type: DownloadClientType.QBITTORRENT,
        download_client_url: 'http://localhost:8080',
        download_client_username: 'admin',
        download_client_password: 'pw',
        download_client_delete_data: true,
        download_client_fallback_ratio: 0.5,
      });
      service.init();
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

    it('applies the fallback ratio and hours only when the client enforces no limit', async () => {
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: null, ratio: 0.7 }),
      );

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).toHaveBeenCalledWith(['abc'], true);
    });

    it('keeps seeding when there is no client limit and the fallback hours are not seeded yet', async () => {
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: null, ratio: 9, seedingTime: 22 * 3600 }),
      );

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).not.toHaveBeenCalled();
    });

    it('keeps seeding when there is no client limit and ratio is below the fallback', async () => {
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: null, ratio: 0.3 }),
      );

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).not.toHaveBeenCalled();
    });

    it('passes deleteData=false when the toggle is off', async () => {
      Object.assign(settings, { download_client_delete_data: false });
      apiMock.getTorrentByHash.mockResolvedValue(
        torrent({ reachedSeedingGoal: true }),
      );

      await service.removeDownloads(['abc']);

      expect(apiMock.deleteTorrents).toHaveBeenCalledWith(['abc'], false);
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
  });
});
