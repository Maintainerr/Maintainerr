import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  database: 'ok' | 'unreachable';
  timestamp: string;
}

@Controller('/api/health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Liveness probe. Returns 200 as long as the process is up.
   * Suitable for `livenessProbe` in Kubernetes / Docker restart loops.
   */
  @Get('/live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness probe. Pings the database with `SELECT 1` and returns 503 if
   * the query fails. Suitable for `readinessProbe` in Kubernetes / Docker
   * healthchecks.
   */
  @Get('/ready')
  async ready(): Promise<HealthResponse> {
    let database: HealthResponse['database'] = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      database = 'unreachable';
      throw new HttpException(
        {
          status: 'degraded',
          uptimeSeconds: this.uptime(),
          database,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return {
      status: 'ok',
      uptimeSeconds: this.uptime(),
      database,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Combined endpoint for simple health checks that do not distinguish
   * liveness from readiness. Returns 200 when the DB is reachable and
   * 503 otherwise.
   */
  @Get('/')
  async health(): Promise<HealthResponse> {
    return this.ready();
  }

  private uptime(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }
}
