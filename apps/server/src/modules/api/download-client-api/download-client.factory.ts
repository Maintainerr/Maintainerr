import { DownloadClientType } from '@maintainerr/contracts';
import { MaintainerrLogger } from '../../logging/logs.service';
import { DownloadClient } from './download-client.interface';
import { QbittorrentApi } from './helpers/qbittorrent.helper';
import { TransmissionApi } from './helpers/transmission.helper';

export interface DownloadClientConnection {
  type: DownloadClientType;
  url: string;
  username?: string;
  password?: string;
}

/**
 * Build the configured download client behind the backend-agnostic contract.
 */
export const createDownloadClient = (
  connection: DownloadClientConnection,
  logger: MaintainerrLogger,
): DownloadClient => {
  switch (connection.type) {
    case DownloadClientType.QBITTORRENT:
      return new QbittorrentApi(connection, logger);
    case DownloadClientType.TRANSMISSION:
      return new TransmissionApi(connection, logger);
  }
};
