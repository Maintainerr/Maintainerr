import { DownloadClientType } from '@maintainerr/contracts';
import { MaintainerrLogger } from '../../logging/logs.service';
import { createDownloadClient } from './download-client.factory';
import { QbittorrentApi } from './helpers/qbittorrent.helper';
import { TransmissionApi } from './helpers/transmission.helper';

const logger = {
  setContext: jest.fn(),
} as unknown as MaintainerrLogger;

describe('createDownloadClient', () => {
  it.each([
    [DownloadClientType.QBITTORRENT, QbittorrentApi],
    [DownloadClientType.TRANSMISSION, TransmissionApi],
  ])('builds the %s client', (type, expected) => {
    expect(
      createDownloadClient({ type, url: 'http://localhost:8080' }, logger),
    ).toBeInstanceOf(expected);
  });
});
