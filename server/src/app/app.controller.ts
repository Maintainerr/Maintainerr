import { VersionResponse } from '@maintainerr/contracts';
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { ConfigResponse } from './dto/config-response.dto';

@Controller('/api/app')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private configService: ConfigService,
  ) {}

  @Get('/status')
  async getAppStatus(): Promise<VersionResponse> {
    return this.appService.getAppVersionStatus();
  }

  @Get('/config')
  getConfig(): ConfigResponse {
    const dataDir = this.configService.get<string>('DATA_DIR');

    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dataDirectory: dataDir,
    };
  }
}
