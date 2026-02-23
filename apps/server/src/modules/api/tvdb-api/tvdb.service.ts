import { BasicResponseDto, MaintainerrEvent } from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import axios from 'axios';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import { ExternalApiService } from '../external-api/external-api.service';
import cacheManager from '../lib/cache';

const TVDB_BASE_URL = 'https://api4.thetvdb.com/v4';

@Injectable()
export class TvdbApiService extends ExternalApiService {
  private bearerToken: string | undefined;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TvdbApiService.name);
    super(TVDB_BASE_URL, {}, logger, {
      nodeCache: cacheManager.getCache('tvdb').data,
    });
  }

  /**
   * Called after NestJS has resolved all dependencies.
   * Authenticates with TVDB if an API key is configured.
   */
  async onModuleInit() {
    const customKey = this.settings.tvdb_api_key;
    if (customKey) {
      await this.authenticate(customKey);
    }
  }

  @OnEvent(MaintainerrEvent.Settings_Updated)
  async handleSettingsUpdate(payload: {
    oldSettings: { tvdb_api_key?: string };
    settings: { tvdb_api_key?: string };
  }) {
    const newKey = payload.settings.tvdb_api_key;
    const oldKey = payload.oldSettings.tvdb_api_key;

    if (newKey !== oldKey) {
      if (newKey) {
        await this.authenticate(newKey);
        this.logger.log('TVDB API key updated — re-authenticated');
      } else {
        this.clearAuth();
        this.logger.log('TVDB API key removed — cleared authentication');
      }
    }
  }

  /**
   * Authenticate with the TVDB v4 API.
   * POST /login with { apikey } → returns a bearer token valid for 1 month.
   */
  private async authenticate(apiKey: string): Promise<boolean> {
    try {
      const resp = await axios.post<{
        status: string;
        data: { token: string };
      }>(`${TVDB_BASE_URL}/login`, { apikey: apiKey });

      this.bearerToken = resp.data?.data?.token;
      if (this.bearerToken) {
        this.updateBearerToken(this.bearerToken);
        return true;
      }
      return false;
    } catch (e) {
      this.logger.warn(`TVDB authentication failed: ${e.message}`);
      this.bearerToken = undefined;
      return false;
    }
  }

  private updateBearerToken(token: string) {
    this.axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  private clearAuth() {
    this.bearerToken = undefined;
    delete this.axios.defaults.headers.common['Authorization'];
  }

  /**
   * Test connectivity to the TVDB v4 API.
   * When an API key is provided, it performs a fresh login to verify the key.
   * Otherwise tests using the current bearer token.
   */
  public async testConnection(apiKey?: string): Promise<BasicResponseDto> {
    const keyToTest = apiKey || this.settings.tvdb_api_key;

    if (!keyToTest) {
      return {
        status: 'NOK',
        code: 0,
        message: 'No TVDB API key configured',
      };
    }

    try {
      // Always perform a fresh login to validate the key
      const resp = await axios.post<{
        status: string;
        data: { token: string };
      }>(`${TVDB_BASE_URL}/login`, { apikey: keyToTest });

      if (resp.data?.data?.token) {
        return { status: 'OK', code: 1, message: 'Success' };
      }

      return { status: 'NOK', code: 0, message: 'Unexpected response' };
    } catch (e) {
      this.logger.warn(`A failure occurred testing TVDB connectivity: ${e}`);

      const message =
        e.response?.status === 401
          ? 'Invalid API key'
          : `Connection failed: ${e.message}`;
      return { status: 'NOK', code: 0, message };
    }
  }
}
