import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MaintainerrLogger } from '../modules/logging/logs.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(HealthService.name);
  }

  /**
   * Pings the configured TypeORM datasource with `SELECT 1`. Returns `true`
   * when the database answers and `false` when the query throws, surfacing the
   * underlying error to debug logs so an `unreachable` result isn't silent.
   */
  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.warn('Database readiness check failed');
      this.logger.debug(error);
      return false;
    }
  }
}
