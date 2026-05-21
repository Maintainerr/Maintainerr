import {
  MediaServerType,
  StreamystatsItemDetails,
} from '@maintainerr/contracts';
import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { SettingsDataService } from '../../settings/settings-data.service';
import { StreamystatsApiService } from './streamystats-api.service';

interface StreamystatsInfoResponse {
  url: string;
  serverId: number | null;
}

@Controller('api/streamystats')
export class StreamystatsApiController {
  constructor(
    private readonly streamystatsApiService: StreamystatsApiService,
    private readonly settingsDataService: SettingsDataService,
  ) {}

  @Get('/info')
  async getInfo(): Promise<StreamystatsInfoResponse> {
    this.assertJellyfinActive();
    const url = this.settingsDataService.streamystats_url;
    if (!url || !this.streamystatsApiService.api) {
      throw new NotFoundException('Streamystats is not configured');
    }
    const serverId = await this.streamystatsApiService.getResolvedServerId();
    return { url, serverId };
  }

  @Get('/items/:itemId')
  async getItemDetails(
    @Param('itemId') itemId: string,
  ): Promise<StreamystatsItemDetails> {
    this.assertJellyfinActive();
    if (!this.streamystatsApiService.api) {
      throw new NotFoundException('Streamystats is not configured');
    }

    const details = await this.streamystatsApiService.getItemDetails(itemId);
    if (!details) {
      throw new NotFoundException(
        'No Streamystats data available for this item',
      );
    }

    return details;
  }

  private assertJellyfinActive(): void {
    if (
      this.settingsDataService.media_server_type !== MediaServerType.JELLYFIN
    ) {
      throw new ForbiddenException(
        'Streamystats is only available when Jellyfin is the active media server.',
      );
    }
  }
}
