import {
  StorageLibrarySizesResponse,
  StorageMetricsResponse,
} from '@maintainerr/contracts';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StorageMetricsService } from './storage-metrics.service';

@Controller('api/storage-metrics')
export class StorageMetricsController {
  constructor(private readonly storageMetricsService: StorageMetricsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Aggregated disk space and collection storage metrics across all configured Radarr/Sonarr instances.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns disk-usage totals, per-mount breakdowns, instance health and collection-size summaries.',
  })
  async getMetrics(): Promise<StorageMetricsResponse> {
    return this.storageMetricsService.getMetrics();
  }

  @Get('library-sizes')
  @ApiOperation({
    summary:
      'Accurate per-library size computed by iterating media items. Potentially slow — call on demand.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns a map of media server library id → bytes. Libraries missing from the map could not be sized.',
  })
  async getLibrarySizes(): Promise<StorageLibrarySizesResponse> {
    return this.storageMetricsService.computeMediaServerLibrarySizes();
  }
}
