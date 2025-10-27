import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../../modules/settings/settings.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import { InternalApi } from './helpers/internal-api.helper';

@Injectable()
export class InternalApiService {
  private api: InternalApi;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
    private readonly logger: MaintainerrLogger,
    private readonly configService: ConfigService,
  ) {}

  public init() {
    const apiPort = this.configService.get<number>('API_PORT');

    this.api = new InternalApi(
      {
        url: `http://localhost:${apiPort}/api/`,
        apiKey: `${this.settings.apikey}`,
      },
      this.logger,
    );
  }

  public getApi() {
    return this.api;
  }
}
