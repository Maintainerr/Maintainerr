import { MediaWatchStats } from '@maintainerr/contracts';
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { watchStatsOrThrow } from '../lib/watchStats';
import { TracearrApiService } from './tracearr-api.service';

@Controller('api/tracearr')
export class TracearrApiController {
  constructor(private readonly tracearrApiService: TracearrApiService) {}

  @Get('/items/:itemId')
  async getItemStats(
    @Param('itemId') itemId: string,
  ): Promise<MediaWatchStats> {
    if (!this.tracearrApiService.api) {
      throw new NotFoundException('Tracearr is not configured');
    }

    return watchStatsOrThrow(
      await this.tracearrApiService.getItemStats(itemId),
      'Tracearr',
    );
  }
}
