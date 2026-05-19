import {
  BasicResponseDto,
  StreamystatsItemDetails,
  streamystatsItemDetailsSchema,
} from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { SettingsService } from '../../../modules/settings/settings.service';
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

@Injectable()
export class StreamystatsApiService {
  api: StreamystatsApi;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
    private readonly logger: MaintainerrLogger,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {
    logger.setContext(StreamystatsApiService.name);
  }

  public init() {
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
    const serverIdentifier = this.resolveServerIdentifier();
    if (!serverIdentifier) {
      this.logger.warn(
        'Skipping Streamystats item details: no Jellyfin server identifier available in settings.',
      );
      return null;
    }

    try {
      const raw = await this.api.get<unknown>(
        `/api/get-item-details/${itemId}`,
        {
          params: serverIdentifier,
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

  private resolveServerIdentifier(): Record<string, string> | null {
    const serverName = this.settings.jellyfin_server_name;
    if (serverName) {
      return { serverName };
    }
    const jellyfinUrl = this.settings.jellyfin_url;
    if (jellyfinUrl) {
      return { serverUrl: jellyfinUrl };
    }
    return null;
  }
}
