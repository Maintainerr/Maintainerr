import { RawAxiosRequestConfig } from 'axios';

/**
 * The fields of a download-client "download" (a torrent, for qBittorrent) that
 * Maintainerr consumes. Kept to exactly what the generic layer uses so a new
 * client only has to supply these.
 */
export interface DownloadClientTorrent {
  /** The download-client identifier; a torrent infohash for qBittorrent. */
  hash: string;
  /** Display name, used for logging. */
  name: string;
  /** Absolute content path, used for cross-seed detection. */
  content_path: string;
  /**
   * Current share ratio, with an effectively-unbounded ratio normalized to
   * `Infinity` (qBittorrent reports it as -1). Only used for the caller's
   * fallback when the client enforces no seeding goal of its own.
   */
  ratio: number;
  /**
   * Whether the client's OWN seeding goal (its ratio / seed-time limit) is met,
   * decided entirely by the client:
   *   - `true`  - goal reached, safe to remove
   *   - `false` - a limit exists but isn't reached yet, keep seeding
   *   - `null`  - the client enforces no limit, so the caller applies its
   *               fallback ratio instead
   */
  reachedSeedingGoal: boolean | null;
}

/**
 * Backend-agnostic contract every download client implements. qBittorrent is the
 * only implementation today (see `helpers/qbittorrent.helper.ts`); additional
 * clients plug in via `download-client.factory.ts` without touching the service.
 */
export interface DownloadClient {
  /** Version string, used as the connectivity/credentials probe. */
  getVersion(config?: RawAxiosRequestConfig): Promise<string>;
  /** All downloads currently in the client. Used for cross-seed detection. */
  getTorrents(): Promise<DownloadClientTorrent[]>;
  /** A single download by its hash/id, or null if the client doesn't have it. */
  getTorrentByHash(hash: string): Promise<DownloadClientTorrent | null>;
  /** Remove downloads by hash, optionally deleting their data from disk. */
  deleteTorrents(hashes: string[], deleteData: boolean): Promise<void>;
}
