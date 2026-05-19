import { StreamystatsItemDetails } from '@maintainerr/contracts';
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { StreamystatsApiService } from './streamystats-api.service';

interface StreamystatsInfoResponse {
  url: string;
  serverId: number | null;
}

@Controller('api/streamystats')
export class StreamystatsApiController {
  constructor(
    private readonly streamystatsApiService: StreamystatsApiService,
    private readonly settingsService: SettingsService,
  ) {}

  @Get('/info')
  async getInfo(): Promise<StreamystatsInfoResponse> {
    const url = this.settingsService.streamystats_url;
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
}
