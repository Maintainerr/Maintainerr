import {
  BasicResponseDto,
  StreamystatsItemDetails,
  streamystatsItemDetailsSchema,
} from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { SettingsService } from '../../../modules/settings/settings.service';
import type { SettingsService as SettingsServiceType } from '../../../modules/settings/settings.service';
import {
  CONNECTION_TEST_TIMEOUT_MS,
  formatConnectionFailureMessage,
  logConnectionTestError,
} from '../../../utils/connection-error';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
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

@Injectable()
export class StreamystatsApiService {
  api: StreamystatsApi | undefined;
  private resolvedServerId: number | null = null;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsServiceType,
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
