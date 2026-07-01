import { MaintainerrLogger } from '../../logging/logs.service';
import { DownloadClient } from './download-client.interface';
import { QbittorrentApi } from './helpers/qbittorrent.helper';

export interface DownloadClientConnection {
  url: string;
  username?: string;
  password?: string;
}

/**
 * Build the configured download client. qBittorrent is the only backend today.
 *
 * To add another client (Deluge, Transmission, …):
 *   1. Implement the `DownloadClient` interface in a new
 *      `helpers/<client>.helper.ts`.
 *   2. Add a `download_client_type` setting and switch on it here.
 *   3. For the settings UI, model the multi-client layout on the **Metadata**
 *      settings section (`apps/ui/src/components/Settings/Metadata`): a single
 *      "client/provider" selector plus the selected backend's fields. That
 *      section is the clean reference for "pick one of several backends".
 */
export const createDownloadClient = (
  connection: DownloadClientConnection,
  logger: MaintainerrLogger,
): DownloadClient => {
  return new QbittorrentApi(connection, logger);
};
