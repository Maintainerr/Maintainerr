import {
  BasicResponseDto,
  StreamystatsItemDetails,
  streamystatsItemDetailsSchema,
  streamystatsWatchlistItemIdsResponseSchema,
  streamystatsWatchlistsResponseSchema,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { SettingsDataService } from '../../../modules/settings/settings-data.service';
import {
  CONNECTION_TEST_TIMEOUT_MS,
  formatConnectionFailureMessage,
  logConnectionTestError,
} from '../../../utils/connection-error';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import cacheManager from '../lib/cache';
import {
  STREAMYSTATS_CACHE_ID,
  WATCHLIST_HTTP_TTL_S,
  WATCHLIST_MEMBERSHIP_CACHE_KEY,
} from './streamystats-api.constants';
import { StreamystatsApi } from './helpers/streamystats-api.helper';

interface StreamystatsVersionInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  buildTime: number;
}

interface StreamystatsServer {
  id: number;
  url?: string | null;
  name?: string | null;
}

/**
 * Public-watchlist membership for the configured Jellyfin server: for each
 * Jellyfin item ID, the owner Jellyfin user IDs whose public lists contain it.
 */
export interface StreamystatsWatchlistMembership {
  ownersByItemId: Record<string, string[]>;
}

@Injectable()
export class StreamystatsApiService {
  api: StreamystatsApi | undefined;
  private resolvedServerId: number | null = null;

  constructor(
    private readonly settings: SettingsDataService,
    private readonly logger: MaintainerrLogger,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {
    logger.setContext(StreamystatsApiService.name);
  }

  public init() {
    // Always clear cached client + resolved serverId so consumers don't
    // operate against stale Streamystats URL or stale Jellyfin credentials
    // after any settings change.
    this.api = undefined;
    this.resolvedServerId = null;
    cacheManager
      .getCache(STREAMYSTATS_CACHE_ID)
      ?.data.del(WATCHLIST_MEMBERSHIP_CACHE_KEY);

    if (!this.settings.streamystats_url || !this.settings.jellyfin_api_key) {
      return;
    }

    this.api = new StreamystatsApi(
      {
        url: this.settings.streamystats_url,
        apiKey: this.settings.jellyfin_api_key,
      },
      this.loggerFactory.createLogger(),
    );
  }

  public async info(): Promise<StreamystatsVersionInfo | null> {
    try {
      return await this.api.getWithoutCache<StreamystatsVersionInfo>(
        '/api/version',
        {
          signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      this.logger.log("Couldn't fetch Streamystats info");
      this.logger.debug(error);
      return null;
    }
  }

  public async getItemDetails(
    itemId: string,
  ): Promise<StreamystatsItemDetails | null> {
    // /api/get-item-details/[itemId] only accepts the internal Streamystats
    // serverId (not serverName/serverUrl). Resolve it via /api/servers once
    // and cache for subsequent calls.
    const serverId = await this.resolveServerId();
    if (serverId == null) {
      this.logger.warn(
        'Skipping Streamystats item details: could not resolve Streamystats serverId for the configured Jellyfin server.',
      );
      return null;
    }

    try {
      const raw = await this.api.get<unknown>(
        `/api/get-item-details/${itemId}`,
        {
          params: { serverId: String(serverId) },
        },
      );
      if (raw == null) {
        return null;
      }

      const parsed = streamystatsItemDetailsSchema.safeParse(raw);
      if (!parsed.success) {
        this.logger.warn(
          'Streamystats item details payload did not match expected schema',
        );
        this.logger.debug(parsed.error);
        return null;
      }
      return parsed.data;
    } catch (error) {
      this.logger.log("Couldn't fetch Streamystats item details");
      this.logger.debug(error);
      return null;
    }
  }

  /**
   * Resolve which public Streamystats watchlists each Jellyfin item belongs to.
   * Returns null when it can't be determined (not configured or unreachable)
   * so callers can skip rather than treat absence as "not watchlisted".
   *
   * The watchlist endpoints authenticate via Jellyfin's MediaBrowser token
   * scheme - unlike the item-details endpoint, the `Bearer` header is rejected
   * - so each call overrides the Authorization header accordingly.
   */
  public async getWatchlistMembership(): Promise<StreamystatsWatchlistMembership | null> {
    if (!this.api || !this.settings.jellyfin_api_key) {
      return null;
    }

    // Reuse the snapshot built earlier in this rule-group run. The shared
    // Streamystats cache is flushed between runs, so this is rebuilt each run.
    const cache = cacheManager.getCache(STREAMYSTATS_CACHE_ID)?.data;
    const cached = cache?.get<StreamystatsWatchlistMembership>(
      WATCHLIST_MEMBERSHIP_CACHE_KEY,
    );
    if (cached) {
      return cached;
    }

    const config = {
      headers: { Authorization: this.mediaBrowserAuthHeader() },
    };

    try {
      const watchlists = await this.api.get<unknown>(
        '/api/watchlists',
        config,
        WATCHLIST_HTTP_TTL_S,
      );
      // The HTTP helper swallows request failures and returns undefined; treat
      // that as transient (skip) rather than a schema mismatch.
      if (watchlists == null) {
        return null;
      }

      const parsed = streamystatsWatchlistsResponseSchema.safeParse(watchlists);
      if (!parsed.success) {
        this.logger.warn(
          'Streamystats watchlists payload did not match expected schema',
        );
        this.logger.debug(parsed.error);
        return null;
      }

      const ownersByItemId: Record<string, string[]> = {};
      for (const watchlist of parsed.data.data) {
        const detail = await this.api.get<unknown>(
          `/api/watchlists/${watchlist.id}`,
          { ...config, params: { format: 'ids' } },
          WATCHLIST_HTTP_TTL_S,
        );
        const detailParsed =
          streamystatsWatchlistItemIdsResponseSchema.safeParse(detail);
        if (!detailParsed.success) {
          this.logger.debug(
            `Skipping Streamystats watchlist "${watchlist.name ?? watchlist.id}": unexpected item payload`,
          );
          continue;
        }

        for (const itemId of detailParsed.data.data.items) {
          const owners = (ownersByItemId[itemId] ??= []);
          if (!owners.includes(watchlist.userId)) {
            owners.push(watchlist.userId);
          }
        }
      }

      const value: StreamystatsWatchlistMembership = { ownersByItemId };
      cache?.set(WATCHLIST_MEMBERSHIP_CACHE_KEY, value);
      return value;
    } catch (error) {
      this.logger.log("Couldn't fetch Streamystats watchlists");
      this.logger.debug(error);
      return null;
    }
  }

  private mediaBrowserAuthHeader(): string {
    return `MediaBrowser Token="${this.settings.jellyfin_api_key}"`;
  }

  public async testConnection(
    params: ConstructorParameters<typeof StreamystatsApi>[0],
  ): Promise<BasicResponseDto> {
    const api = new StreamystatsApi(params, this.loggerFactory.createLogger());

    try {
      const response = await api.getRawWithoutCache<StreamystatsVersionInfo>(
        '/api/version',
        {
          signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
        },
      );

      const version = response?.data?.currentVersion;
      if (!version) {
        return {
          status: 'NOK',
          code: 0,
          message:
            'Unexpected response from Streamystats. Verify the URL points to a Streamystats instance.',
        };
      }

      return {
        status: 'OK',
        code: 1,
        message: version,
      };
    } catch (error) {
      logConnectionTestError(this.logger, 'Streamystats');
      this.logger.debug(error);

      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to Streamystats. Verify URL and that the service is running.',
        ),
      };
    }
  }

  public async getResolvedServerId(): Promise<number | null> {
    return this.resolveServerId();
  }

  private async resolveServerId(): Promise<number | null> {
    if (this.resolvedServerId != null) {
      return this.resolvedServerId;
    }
    if (!this.api) {
      return null;
    }

    try {
      const servers =
        await this.api.getWithoutCache<StreamystatsServer[]>('/api/servers');
      if (!Array.isArray(servers)) {
        return null;
      }

      const targetName = this.settings.jellyfin_server_name?.toLowerCase();
      const targetUrl = this.settings.jellyfin_url?.replace(/\/+$/, '');

      // Match by URL first (more unique than name, which can collide).
      // Fall back to name only when no URL match exists.
      const byUrl = targetUrl
        ? servers.find(
            (server) => server.url?.replace(/\/+$/, '') === targetUrl,
          )
        : undefined;
      const match =
        byUrl ??
        (targetName
          ? servers.find((server) => server.name?.toLowerCase() === targetName)
          : undefined);

      if (match) {
        this.resolvedServerId = match.id;
        return match.id;
      }
    } catch (error) {
      this.logger.debug(error);
    }
    return null;
  }
}
