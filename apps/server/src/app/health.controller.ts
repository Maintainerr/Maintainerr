import { HealthResponse, LivenessResponse } from '@maintainerr/contracts';
import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('/api/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness probe. Returns 200 as long as the process is up, without touching
   * the database. Suitable for `livenessProbe` in Kubernetes / Docker restart
   * loops (no restarts on transient DB blips).
   */
  @Get('/live')
  live(): LivenessResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe. Pings the database and returns 503 if it is unreachable.
   * Suitable for `readinessProbe` in Kubernetes and the Docker `HEALTHCHECK`.
   */
  @Get('/ready')
  async ready(): Promise<HealthResponse> {
    const reachable = await this.healthService.isDatabaseReachable();
    const response: HealthResponse = {
      status: reachable ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      database: reachable ? 'ok' : 'unreachable',
      timestamp: new Date().toISOString(),
    };

    if (!reachable) {
      throw new HttpException(response, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return response;
  }

  /**
   * Combined endpoint for simple checks that don't distinguish liveness from
   * readiness. Mirrors `/ready`: 200 when the DB is reachable, 503 otherwise.
   */
  @Get()
  async health(): Promise<HealthResponse> {
    return this.ready();
  }
}
