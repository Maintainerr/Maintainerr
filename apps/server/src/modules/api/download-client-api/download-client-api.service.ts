import { BasicResponseDto } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { SettingsDataService } from '../../../modules/settings/settings-data.service';
import {
  CONNECTION_TEST_TIMEOUT_MS,
  formatConnectionFailureMessage,
  logConnectionTestError,
} from '../../../utils/connection-error';

// qBittorrent rejects an authenticated request with 403 when its Web UI security
// blocks the caller. Bad credentials are NOT this case (they return HTTP 200
// "Fails." and are handled at login), so "Invalid API key" (the shared util's
// 401/403 message) is misleading. The reliable fix is whitelisting Maintainerr's
// IP — it and qBittorrent commonly run on different (Docker) IPs — so lead with
// that and only mention proxy/host validation as a secondary cause.
const DOWNLOAD_CLIENT_FORBIDDEN_MESSAGE =
  'The download client accepted the login but returned 403 Forbidden — a ' +
  'qBittorrent Web UI security restriction, not a wrong username or password. ' +
  'In qBittorrent → Options → Web UI → Security, add Maintainerr’s IP or ' +
  'subnet to “Bypass authentication for clients in whitelisted IP subnets” ' +
  '(Maintainerr and qBittorrent often run on different Docker IPs). A reverse ' +
  'proxy or host-header validation can also cause this.';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import {
  createDownloadClient,
  DownloadClientConnection,
} from './download-client.factory';
import {
  DownloadClient,
  DownloadClientTorrent,
} from './download-client.interface';

/**
 * Talks to the configured download client to clean up completed downloads for
 * media Radarr/Sonarr removes. qBittorrent is currently the only supported
 * backend; the qBittorrent specifics live in the helper so additional backends
 * can be added behind this service later.
 */
@Injectable()
export class DownloadClientApiService {
  api: DownloadClient | undefined;

  constructor(
    private readonly settings: SettingsDataService,
    private readonly logger: MaintainerrLogger,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {
    logger.setContext(DownloadClientApiService.name);
  }

  public init() {
    // Clear the cached client on every settings change so we never act against
    // a stale URL or stale credentials.
    this.api = undefined;

    if (!this.settings.download_client_url) {
      return;
    }

    this.api = createDownloadClient(
      {
        url: this.settings.download_client_url,
        username: this.settings.download_client_username,
        password: this.settings.download_client_password,
      },
      this.loggerFactory.createLogger(),
    );
  }

  public async testConnection(
    params: DownloadClientConnection,
  ): Promise<BasicResponseDto> {
    const api = createDownloadClient(params, this.loggerFactory.createLogger());

    try {
      const version = await api.getVersion({
        signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
      });

      if (!version) {
        return {
          status: 'NOK',
          code: 0,
          message:
            'Unexpected response from the download client. Verify the URL points to a qBittorrent WebUI.',
        };
      }

      return { status: 'OK', code: 1, message: version };
    } catch (error) {
      logConnectionTestError(this.logger, 'Download client');

      if (error instanceof AxiosError && error.response?.status === 403) {
        // Make this common, hard-to-diagnose case obvious in the logs.
        this.logger.warn(DOWNLOAD_CLIENT_FORBIDDEN_MESSAGE);
        this.logger.debug(error);
        return {
          status: 'NOK',
          code: 0,
          message: DOWNLOAD_CLIENT_FORBIDDEN_MESSAGE,
        };
      }

      this.logger.debug(error);

      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to the download client. Verify URL and credentials.',
        ),
      };
    }
  }

  /**
   * Remove the completed downloads identified by the given download-client ids
   * (Radarr/Sonarr `downloadId`s — for a torrent client these are infohashes).
   * No-op when no download client is configured. Best-effort: each download is
   * handled independently and a failure never throws into the caller — the
   * media has already been deleted from the *arr at this point, so this cleanup
   * is a side effect.
   *
   * Whether a download has finished seeding is decided by the download client's
   * own ratio / seed-time limits. Only when the client enforces no limit does
   * Maintainerr's fallback ratio apply.
   *
   * Cross-seed protection (inspired by qbit_manage): when deleting data, a
   * download whose content path is shared by another download is removed
   * entry-only (data kept), so cross-seeded downloads keep working.
   */
  public async removeDownloads(downloadIds: string[]): Promise<void> {
    if (!this.api || downloadIds.length === 0) {
      return;
    }

    const fallbackRatio = this.settings.download_client_fallback_ratio ?? 0.5;
    const deleteData = this.settings.download_client_delete_data ?? true;

    // Only needed when we'd delete data; one list read, reused for every hash.
    const contentPathCounts = deleteData
      ? await this.getContentPathCounts()
      : null;

    const seen = new Set<string>();
    for (const downloadId of downloadIds) {
      const hash = downloadId?.trim().toLowerCase();
      if (!hash || seen.has(hash)) {
        continue;
      }
      seen.add(hash);

      try {
        const torrent = await this.api.getTorrentByHash(hash);
        if (!torrent) {
          // Not in the download client (already removed, a different client, or
          // a manual import that never had a download) — nothing to clean up.
          continue;
        }

        if (!this.shouldRemove(torrent, fallbackRatio)) {
          this.logger.log(
            torrent.reachedSeedingGoal === false
              ? `Keeping download '${torrent.name}' seeding: its download-client seeding goal isn't met yet`
              : `Keeping download '${torrent.name}' seeding: the download client enforces no limit and ratio ${torrent.ratio} is below the fallback minimum of ${fallbackRatio}`,
          );
          continue;
        }

        const isCrossSeeded =
          deleteData &&
          !!torrent.content_path &&
          (contentPathCounts?.get(torrent.content_path) ?? 0) > 1;
        const deleteDataForThis = deleteData && !isCrossSeeded;

        await this.api.deleteTorrents([hash], deleteDataForThis);

        if (isCrossSeeded) {
          this.logger.log(
            `Removed download '${torrent.name}' but kept its data: another download is cross-seeding the same files (${torrent.content_path})`,
          );
        } else {
          this.logger.log(
            `Removed download '${torrent.name}' from the download client${
              deleteDataForThis ? ' (including downloaded data)' : ''
            }`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to remove download with hash ${hash} from the download client`,
        );
        this.logger.debug(error);
      }
    }
  }

  /**
   * Count how many downloads share each content path, so cross-seeded data is
   * never deleted out from under another download. Best-effort: on failure we
   * return an empty map and fall back to the user's delete-data setting.
   */
  private async getContentPathCounts(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    try {
      const torrents = (await this.api?.getTorrents()) ?? [];
      for (const torrent of torrents) {
        const path = torrent.content_path?.trim();
        if (!path) {
          continue;
        }
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
    } catch (error) {
      this.logger.warn(
        'Could not read the download list for cross-seed detection; proceeding with the configured delete-data setting',
      );
      this.logger.debug(error);
    }
    return counts;
  }

  /**
   * Defer to the download client's own seeding goal; only when it enforces no
   * limit (`reachedSeedingGoal === null`) apply Maintainerr's fallback ratio.
   * The client normalizes an unbounded ratio to Infinity, so a plain `>=`
   * covers that case too.
   */
  private shouldRemove(
    torrent: DownloadClientTorrent,
    fallbackRatio: number,
  ): boolean {
    if (torrent.reachedSeedingGoal !== null) {
      return torrent.reachedSeedingGoal;
    }
    return torrent.ratio >= fallbackRatio;
  }
}
