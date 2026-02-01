import { Controller, Get, Param } from '@nestjs/common';
import { ServarrService } from './servarr.service';

@Controller('api/servarr')
export class ServarrApiController {
  constructor(private readonly servarrService: ServarrService) {}

  @Get('sonarr/:id/diskspace')
  async getSonarrDiskspace(@Param('id') id: string) {
    const client = await this.servarrService.getSonarrApiClient(+id);
    return await client.getDiskspace();
  }

  @Get('radarr/:id/diskspace')
  async getRadarrDiskspace(@Param('id') id: string) {
    const client = await this.servarrService.getRadarrApiClient(+id);
    return await client.getDiskspace();
  }
}
