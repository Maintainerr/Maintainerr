import { StorageMetricsResponse } from '@maintainerr/contracts';
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
}
