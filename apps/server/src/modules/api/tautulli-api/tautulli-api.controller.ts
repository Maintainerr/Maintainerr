import { MediaServerType, MediaWatchStats } from '@maintainerr/contracts';
import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { watchStatsOrThrow } from '../lib/watchStats';
import { SettingsDataService } from '../../settings/settings-data.service';
import { TautulliApiService } from './tautulli-api.service';

@Controller('api/tautulli')
export class TautulliApiController {
  constructor(
    private readonly tautulliApiService: TautulliApiService,
    private readonly settingsDataService: SettingsDataService,
  ) {}

  @Get('/items/:itemId')
  async getItemStats(
    @Param('itemId') itemId: string,
  ): Promise<MediaWatchStats> {
    // Tautulli only knows Plex rating keys.
    if (this.settingsDataService.media_server_type !== MediaServerType.PLEX) {
      throw new ForbiddenException(
        'Tautulli is only available when Plex is the active media server.',
      );
    }
    if (!this.tautulliApiService.api) {
      throw new NotFoundException('Tautulli is not configured');
    }

    return watchStatsOrThrow(
      await this.tautulliApiService.getItemStats(itemId),
      'Tautulli',
    );
  }
}
