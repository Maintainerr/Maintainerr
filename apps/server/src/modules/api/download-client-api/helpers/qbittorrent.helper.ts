import { AxiosError, AxiosResponse, RawAxiosRequestConfig } from 'axios';
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
 * Thin client for the qBittorrent WebUI API (v2) - the qBittorrent
 * implementation of the backend-agnostic `DownloadClient` contract. The v2 API
 * itself dates from 4.1, but the oldest usable version is 4.3.4: `content_path`
 * (cross-seed detection) only arrived in 4.3.1 and `seeding_time` in 4.3.4.
 *
 * qBittorrent uses cookie/session auth: `POST /api/v2/auth/login` issues a
 * session cookie that must accompany every subsequent request.
 * `ExternalApiService` has no cookie jar, so this helper keeps that cookie on
 * its own axios instance and re-logs in once on a 401/403. Calls go through
 * `this.axios` directly (not the cached `get`/`post` wrappers) so auth failures
 * surface and reads stay fresh.
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
    // qBittorrent documents `hashes=all` on this endpoint as "delete all
    // torrents", so a hash that arrives as the literal string would wipe the
    // client rather than remove one download. Blanks are dropped for the same
    // reason: they contribute nothing but widen the list they are joined into.
    const validHashes = hashes
      .map((hash) => hash?.trim().toLowerCase())
      .filter((hash) => !!hash && hash !== 'all');

    if (validHashes.length < hashes.length) {
      this.logger.warn(
        `Refused ${hashes.length - validHashes.length} download id(s) that do not name a single torrent`,
      );
    }

    if (validHashes.length === 0) {
      return;
    }

    const body = new URLSearchParams();
    body.set('hashes', validHashes.join('|'));
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

    let response: AxiosResponse<string>;
    try {
      response = await this.axios.post<string>('/auth/login', body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (error) {
      // qBittorrent 5.2+ rejects invalid credentials with HTTP 401 instead of
      // the older HTTP 200 body "Fails." handled below.
      if (error instanceof AxiosError && error.response?.status === 401) {
        throw new Error('Invalid username or password');
      }
      throw error;
    }

    // qBittorrent 5.1 and older answer HTTP 200 with body "Fails." instead.
    const responseBody =
      typeof response.data === 'string' ? response.data.trim() : '';
    if (responseBody === 'Fails.') {
      throw new Error('Invalid username or password');
    }

    // On a normal login qBittorrent issues a session cookie to send back on
    // every subsequent request. When the WebUI bypasses authentication (e.g.
    // "Bypass authentication for clients on localhost"/whitelisted subnets) it
    // can answer without one - that is still a valid, authenticated session, so
    // capture the cookie when present but never require it.
    const cookie = this.extractSessionCookie(response.headers['set-cookie']);
    if (cookie) {
      this.axios.defaults.headers.common['Cookie'] = cookie;
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

  /**
   * Echo back whatever cookie the login response set, name included. The name
   * is deliberately not matched: qBittorrent 5.1 and older call it `SID` (and
   * let the user rename it), while 5.2+ call it `QBT_SID_<WebUI port>` - and
   * that is qBittorrent's own port, which a Docker port mapping or reverse
   * proxy hides, so it cannot be derived from the configured URL either.
   */
  private extractSessionCookie(
    setCookie: string[] | undefined,
  ): string | undefined {
    const cookies: string[] = [];

    for (const cookie of setCookie ?? []) {
      const end = cookie.indexOf(';');
      const pair = (end === -1 ? cookie : cookie.slice(0, end)).trim();
      // Keep only `name=value`; a cookie without a value is a deletion.
      const separator = pair.indexOf('=');
      if (separator > 0 && separator < pair.length - 1) {
        cookies.push(pair);
      }
    }

    return cookies.length > 0 ? cookies.join('; ') : undefined;
  }
}
