import { ArrDiskspaceResource, QualityProfile } from '@maintainerr/contracts';
import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ServarrService } from './servarr.service';

@Controller('api/servarr')
export class ServarrApiController {
  constructor(private readonly servarrService: ServarrService) {}

  @Get('sonarr/:id/diskspace')
  async getSonarrDiskspace(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ArrDiskspaceResource[]> {
    const client = await this.servarrService.getSonarrApiClient(id);
    return await client.getDiskspaceWithRootFolders();
  }

  @Get('radarr/:id/diskspace')
  async getRadarrDiskspace(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ArrDiskspaceResource[]> {
    const client = await this.servarrService.getRadarrApiClient(id);
    return await client.getDiskspaceWithRootFolders();
  }

  @Get('radarr/:id/profiles')
  async getRadarrProfiles(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<QualityProfile[]> {
    const client = await this.servarrService.getRadarrApiClient(id);
    return (await client.getProfiles()) ?? [];
  }

  @Get('sonarr/:id/profiles')
  async getSonarrProfiles(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<QualityProfile[]> {
    const client = await this.servarrService.getSonarrApiClient(id);
    return (await client.getProfiles()) ?? [];
  }
}
