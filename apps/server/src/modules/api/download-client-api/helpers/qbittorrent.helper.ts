import { AxiosError, RawAxiosRequestConfig } from 'axios';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { ExternalApiService } from '../../external-api/external-api.service';
import {
  DownloadClient,
  DownloadClientTorrent,
} from '../download-client.interface';

/**
 * The qBittorrent `torrents/info` fields we read. `max_ratio` /
 * `max_seeding_time` are the EFFECTIVE limits qBittorrent enforces ("…until
 * torrent is stopped from seeding"), already resolving any global default; `-1`
 * means "no limit". `seeding_time` and `max_seeding_time` are in seconds.
 */
interface RawQbittorrentTorrent {
  hash: string;
  name: string;
  content_path: string;
  ratio: number;
  max_ratio: number;
  seeding_time: number;
  max_seeding_time: number;
}

/**
 * Map qBittorrent's raw torrent to the client-agnostic shape and decide, using
 * qBittorrent's own limits, whether its seeding goal is met. qBittorrent stops a
 * torrent once it hits EITHER its ratio or its seed-time limit, so we mirror
 * that. With no limit set (`-1`), the verdict is `null` and the caller applies
 * its fallback ratio. The `-1` "unbounded ratio" sentinel is normalized to
 * `Infinity` so the generic layer never sees a qBittorrent-specific value.
 */
const toDownloadClientTorrent = (
  raw: RawQbittorrentTorrent,
): DownloadClientTorrent => {
  const ratio = raw.ratio === -1 ? Infinity : raw.ratio;

  const hasRatioLimit = raw.max_ratio >= 0;
  const hasTimeLimit = raw.max_seeding_time >= 0;

  let reachedSeedingGoal: boolean | null;
  if (!hasRatioLimit && !hasTimeLimit) {
    reachedSeedingGoal = null;
  } else {
    reachedSeedingGoal =
      (hasRatioLimit && ratio >= raw.max_ratio) ||
      (hasTimeLimit && raw.seeding_time >= raw.max_seeding_time);
  }

  return {
    hash: raw.hash,
    name: raw.name,
    content_path: raw.content_path,
    ratio,
    reachedSeedingGoal,
  };
};

/**
 * Thin client for the qBittorrent WebUI API (v2, qBittorrent 4.1+) - the
 * qBittorrent implementation of the backend-agnostic `DownloadClient` contract.
 *
 * qBittorrent uses cookie/session auth: `POST /api/v2/auth/login` issues a `SID`
 * cookie that must accompany every subsequent request. `ExternalApiService` has
 * no cookie jar, so this helper manages the `SID` on its own axios instance and
 * re-logs in once on a 401/403. Calls go through `this.axios` directly (not the
 * cached `get`/`post` wrappers) so auth failures surface and reads stay fresh.
 */
export class QbittorrentApi
  extends ExternalApiService
  implements DownloadClient
{
  private readonly username?: string;
  private readonly password?: string;
  private authenticated = false;

  constructor(
    {
      url,
      username,
      password,
    }: { url: string; username?: string; password?: string },
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(QbittorrentApi.name);
    // qBittorrent's WebUI wants a `Referer` matching the host (its login is the
    // only CSRF-exempt endpoint). Deliberately do NOT send `Origin`: qBittorrent
    // treats a request whose Origin doesn't match its own as cross-site and
    // rejects it with 403 on every endpoint except login - which breaks
    // reverse-proxy / scheme-mismatch setups (the mature qbittorrent-api client
    // sends Referer only, for the same reason). The SID cookie carries the auth.
    super(`${url}/api/v2`, {}, logger, {
      headers: { Referer: url },
    });
    this.username = username;
    this.password = password;
  }

  public async getVersion(config?: RawAxiosRequestConfig): Promise<string> {
    return this.withAuth(async () => {
      const response = await this.axios.get<string>('/app/version', config);
      return response.data;
    });
  }

  public async getTorrents(): Promise<DownloadClientTorrent[]> {
    return this.withAuth(async () => {
      const response =
        await this.axios.get<RawQbittorrentTorrent[]>('/torrents/info');
      return Array.isArray(response.data)
        ? response.data.map(toDownloadClientTorrent)
        : [];
    });
  }

  public async getTorrentByHash(
    hash: string,
  ): Promise<DownloadClientTorrent | null> {
    const normalized = hash.toLowerCase();
    return this.withAuth(async () => {
      const response = await this.axios.get<RawQbittorrentTorrent[]>(
        '/torrents/info',
        { params: { hashes: normalized } },
      );
      const raw = response.data?.[0];
      return raw ? toDownloadClientTorrent(raw) : null;
    });
  }

  public async deleteTorrents(
    hashes: string[],
    deleteFiles: boolean,
  ): Promise<void> {
    if (hashes.length === 0) {
      return;
    }

    const body = new URLSearchParams();
    body.set('hashes', hashes.map((hash) => hash.toLowerCase()).join('|'));
    body.set('deleteFiles', deleteFiles ? 'true' : 'false');

    await this.withAuth(async () => {
      await this.axios.post('/torrents/delete', body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    });
  }

  private async login(): Promise<void> {
    const body = new URLSearchParams();
    body.set('username', this.username ?? '');
    body.set('password', this.password ?? '');

    const response = await this.axios.post<string>(
      '/auth/login',
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    // qBittorrent answers HTTP 200 with body "Fails." on invalid credentials.
    const responseBody =
      typeof response.data === 'string' ? response.data.trim() : '';
    if (responseBody === 'Fails.') {
      throw new Error('Invalid username or password');
    }

    // On a normal login qBittorrent issues an SID cookie to use on subsequent
    // requests. When the WebUI bypasses authentication (e.g. "Bypass
    // authentication for clients on localhost"/whitelisted subnets) it returns
    // "Ok." with no cookie - that is still a valid, authenticated session, so
    // capture the cookie when present but never require it.
    const sid = this.extractSid(response.headers['set-cookie']);
    if (sid) {
      this.axios.defaults.headers.common['Cookie'] = `SID=${sid}`;
    }
    this.authenticated = true;
  }

  private async ensureAuth(): Promise<void> {
    if (!this.authenticated) {
      await this.login();
    }
  }

  private async withAuth<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureAuth();
    try {
      return await fn();
    } catch (error) {
      // A stale/expired session returns 403 (or 401); re-login once and retry.
      if (
        error instanceof AxiosError &&
        (error.response?.status === 403 || error.response?.status === 401)
      ) {
        this.authenticated = false;
        delete this.axios.defaults.headers.common['Cookie'];
        await this.login();
        return await fn();
      }
      throw error;
    }
  }

  private extractSid(setCookie: string[] | undefined): string | undefined {
    if (!setCookie) {
      return undefined;
    }

    for (const cookie of setCookie) {
      const trimmed = cookie.trimStart();
      if (!trimmed.startsWith('SID=')) {
        continue;
      }

      const afterEquals = trimmed.slice('SID='.length);
      const end = afterEquals.indexOf(';');
      const value = end === -1 ? afterEquals : afterEquals.slice(0, end);
      if (value) {
        return value;
      }
    }

    return undefined;
  }
}
