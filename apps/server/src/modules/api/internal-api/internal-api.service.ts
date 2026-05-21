import { Injectable } from '@nestjs/common';
import { SettingsDataService } from '../../../modules/settings/settings-data.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import { InternalApi } from './helpers/internal-api.helper';

@Injectable()
export class InternalApiService {
  private api: InternalApi;

  constructor(
    private readonly settings: SettingsDataService,
    private readonly logger: MaintainerrLogger,
  ) {}

  public init() {
    const apiPort = process.env.UI_PORT || 6246;

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
