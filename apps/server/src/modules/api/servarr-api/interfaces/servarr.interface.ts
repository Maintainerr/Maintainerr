import { ArrDiskspaceResource } from '@maintainerr/contracts';

export interface SystemStatus {
  version: string;
  buildTime: Date;
  isDebug: boolean;
  isProduction: boolean;
  isAdmin: boolean;
  isUserInteractive: boolean;
  startupPath: string;
  appData: string;
  osName: string;
  osVersion: string;
  isNetCore: boolean;
  isMono: boolean;
  isLinux: boolean;
  isOsx: boolean;
  isWindows: boolean;
  isDocker: boolean;
  mode: string;
  branch: string;
  authentication: string;
  sqliteVersion: string;
  migrationVersion: number;
  urlBase: string;
  runtimeVersion: string;
  runtimeName: string;
  startTime: Date;
  packageUpdateMechanism: string;
}

export interface RootFolder {
  id: number;
  path: string;
  freeSpace: number;
  // totalSpace is not exposed by Sonarr/Radarr's /rootfolder API
  // (the internal model computes it but the resource mapper omits it)
  totalSpace?: number;
  unmappedFolders: {
    name: string;
    path: string;
  }[];
}

export type DiskSpaceResource = ArrDiskspaceResource;

export interface QueueItem {
  size: number;
  title: string;
  sizeleft: number;
  timeleft: string;
  estimatedCompletionTime: string;
  status: string;
  trackedDownloadStatus: string;
  trackedDownloadState: string;
  downloadId: string;
  protocol: string;
  downloadClient: string;
  indexer: string;
  id: number;
}

export interface Tag {
  id: number;
  label: string;
}

/**
 * A Radarr/Sonarr history record. `downloadId` is the download-client item id -
 * for a torrent client (e.g. qBittorrent) this is the torrent infohash. Only
 * the fields we consume are typed.
 *
 * `episodeId` is always populated by Sonarr (independent of the includeEpisode
 * query flag) and is the reliable key for deciding which torrents a delete
 * fully covers. `data.torrentInfoHash` is a fallback infohash carried on some
 * grab/import events when `downloadId` itself is absent.
 */
export interface HistoryRecord {
  id: number;
  eventType?: string;
  downloadId?: string;
  episodeId?: number;
  data?: Record<string, string>;
}

export interface QueueResponse<QueueItemAppendT> {
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: string;
  totalRecords: number;
  records: (QueueItem & QueueItemAppendT)[];
}
