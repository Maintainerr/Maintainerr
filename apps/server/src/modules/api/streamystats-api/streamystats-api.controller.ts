import { StreamystatsItemDetails } from '@maintainerr/contracts';
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { StreamystatsApiService } from './streamystats-api.service';

@Controller('api/streamystats')
export class StreamystatsApiController {
  constructor(
    private readonly streamystatsApiService: StreamystatsApiService,
  ) {}

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
