import { stripTrailingSlashes } from '@maintainerr/contracts';
import { AxiosResponse, RawAxiosRequestConfig, isAxiosError } from 'axios';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { ExternalApiService } from '../../external-api/external-api.service';
import {
  DownloadClient,
  DownloadClientTorrent,
} from '../download-client.interface';

interface TransmissionRpcResponse<T> {
  arguments: T;
  result: string;
}

/** The `session-get` fields we read: the version and the global seeding limits. */
interface TransmissionSession {
  version: string;
  seedRatioLimited: boolean;
  'idle-seeding-limit-enabled': boolean;
}

/**
 * The `torrent-get` fields we read. `seedRatioMode` / `seedIdleMode` are 0
 * (follow the session limit), 1 (the torrent's own limit) or 2 (unlimited).
 */
interface RawTransmissionTorrent {
  hashString: string;
  name: string;
  downloadDir: string;
  uploadRatio: number;
  secondsSeeding: number;
  seedRatioMode: number;
  seedIdleMode: number;
  isFinished: boolean;
}

interface TransmissionTorrentsResponse {
  torrents: RawTransmissionTorrent[];
}

const SESSION_HEADER = 'x-transmission-session-id';
const SESSION_TTL_MS = 60_000;
// `uploadRatio` sentinels: -2 uploaded with nothing downloaded, -1 no transfer.
const RATIO_INF = -2;
const LIMIT_GLOBAL = 0;
const LIMIT_TORRENT = 1;

// Auth and the two whitelists are checked before the CSRF session id, so these
// statuses are final. The shared 401/403 text names an API key Transmission
// does not have.
const STATUS_MESSAGES: Record<number, string> = {
  401: 'Invalid username or password',
  403: 'Transmission rejected the request: its rpc-whitelist does not allow the IP address Maintainerr connects from. Add that IP to rpc-whitelist or disable rpc-whitelist-enabled.',
  421: 'Transmission rejected the request: the hostname in the URL is not in its rpc-host-whitelist. Use the IP address, add the hostname to rpc-host-whitelist, or enable RPC authentication.',
};

const torrentFields: (keyof RawTransmissionTorrent)[] = [
  'hashString',
  'name',
  'downloadDir',
  'uploadRatio',
  'secondsSeeding',
  'seedRatioMode',
  'seedIdleMode',
  'isFinished',
];

// Radarr/Sonarr record the 40-hex info hash. Anything else Transmission would
// read as a magnet link or as the `recently-active` selector.
const isInfoHash = (value: string): boolean => {
  if (value.length !== 40) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) {
      return false;
    }
  }
  return true;
};

const hasSeedingGoal = (
  raw: RawTransmissionTorrent,
  session: TransmissionSession,
): boolean =>
  raw.seedRatioMode === LIMIT_TORRENT ||
  (raw.seedRatioMode === LIMIT_GLOBAL && session.seedRatioLimited) ||
  raw.seedIdleMode === LIMIT_TORRENT ||
  (raw.seedIdleMode === LIMIT_GLOBAL && session['idle-seeding-limit-enabled']);

/**
 * `isFinished` is Transmission's own verdict: set once the effective ratio
 * goal is met, or when the idle limit stops the torrent. The idle half is not
 * persisted, so a torrent the idle limit stopped before a daemon restart reads
 * as unfinished again.
 */
const toDownloadClientTorrent = (
  raw: RawTransmissionTorrent,
  session: TransmissionSession,
): DownloadClientTorrent => ({
  hash: raw.hashString.toLowerCase(),
  name: raw.name,
  // Transmission has no content-path field; the data lives at downloadDir/name.
  content_path: `${stripTrailingSlashes(raw.downloadDir)}/${raw.name}`,
  ratio:
    raw.uploadRatio === RATIO_INF
      ? Infinity
      : raw.uploadRatio < 0
        ? 0
        : raw.uploadRatio,
  seedingTime: raw.secondsSeeding,
  reachedSeedingGoal: raw.isFinished
    ? true
    : hasSeedingGoal(raw, session)
      ? false
      : null,
});

/**
 * Thin client for Transmission's RPC API. The configured URL is the complete
 * RPC endpoint, normally `http://host:9091/transmission/rpc`. Transmission
 * uses HTTP Basic auth and a CSRF session id that arrives in a 409 on the
 * first request; requests speak the pre-4.1 protocol, which 4.1+ still accepts.
 */
export class TransmissionApi
  extends ExternalApiService
  implements DownloadClient
{
  private sessionId?: string;
  private session?: { value: TransmissionSession; expiresAt: number };

  constructor(
    {
      url,
      username,
      password,
    }: { url: string; username?: string; password?: string },
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TransmissionApi.name);
    super(url, {}, logger);

    if (username || password) {
      this.axios.defaults.auth = {
        username: username ?? '',
        password: password ?? '',
      };
    }
  }

  public async getVersion(config?: RawAxiosRequestConfig): Promise<string> {
    const { version } = await this.rpc<TransmissionSession>(
      'session-get',
      {},
      config,
    );
    // "4.1.3 (a1b2c3d4e5)": the revision only clutters the settings page.
    const revision = version.indexOf(' (');
    return revision === -1 ? version : version.slice(0, revision);
  }

  public async getTorrents(): Promise<DownloadClientTorrent[]> {
    const session = await this.getSession();
    const { torrents } = await this.rpc<TransmissionTorrentsResponse>(
      'torrent-get',
      { fields: torrentFields },
    );
    return Array.isArray(torrents)
      ? torrents.map((raw) => toDownloadClientTorrent(raw, session))
      : [];
  }

  public async getTorrentByHash(
    hash: string,
  ): Promise<DownloadClientTorrent | null> {
    const normalized = hash.trim().toLowerCase();
    if (!isInfoHash(normalized)) {
      return null;
    }

    const session = await this.getSession();
    const { torrents } = await this.rpc<TransmissionTorrentsResponse>(
      'torrent-get',
      { fields: torrentFields, ids: [normalized] },
    );
    return torrents?.[0] ? toDownloadClientTorrent(torrents[0], session) : null;
  }

  public async deleteTorrents(
    hashes: string[],
    deleteData: boolean,
  ): Promise<void> {
    const validHashes = hashes
      .map((hash) => (hash ?? '').trim().toLowerCase())
      .filter(isInfoHash);

    if (validHashes.length < hashes.length) {
      this.logger.warn(
        `Refused ${hashes.length - validHashes.length} download id(s) that do not name a single torrent`,
      );
    }

    if (validHashes.length === 0) {
      return;
    }

    await this.rpc('torrent-remove', {
      ids: validHashes,
      'delete-local-data': deleteData,
    });
  }

  // The session limits are read once per minute, not once per hash.
  private async getSession(): Promise<TransmissionSession> {
    if (!this.session || this.session.expiresAt <= Date.now()) {
      this.session = {
        value: await this.rpc<TransmissionSession>('session-get'),
        expiresAt: Date.now() + SESSION_TTL_MS,
      };
    }
    return this.session.value;
  }

  private async rpc<T>(
    method: string,
    args: Record<string, unknown> = {},
    config?: RawAxiosRequestConfig,
  ): Promise<T> {
    const post = () =>
      this.axios.post<TransmissionRpcResponse<T>>(
        '',
        { method, arguments: args },
        {
          ...config,
          headers: {
            ...config?.headers,
            ...(this.sessionId ? { [SESSION_HEADER]: this.sessionId } : {}),
          },
        },
      );

    let response: AxiosResponse<TransmissionRpcResponse<T>>;
    try {
      response = await post();
    } catch (error) {
      if (!isAxiosError(error)) {
        throw error;
      }
      const message = STATUS_MESSAGES[error.response?.status];
      if (message) {
        throw new Error(message);
      }
      // A 409 carries the session id to resend the same request with.
      const sessionId =
        error.response?.status === 409
          ? error.response.headers[SESSION_HEADER]
          : undefined;
      if (typeof sessionId !== 'string') {
        throw error;
      }
      this.sessionId = sessionId;
      response = await post();
    }

    if (response.data?.result !== 'success') {
      throw new Error(
        `Transmission RPC ${method} failed: ${response.data?.result || 'unexpected response'}`,
      );
    }
    return response.data.arguments;
  }
}
