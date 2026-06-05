import { DataSource } from 'typeorm';
import { createMockLogger } from '../../test/utils/data';
import { HealthService } from './health.service';

const createService = (query: jest.Mock) => {
  const logger = createMockLogger();
  const service = new HealthService({ query } as unknown as DataSource, logger);
  return { service, logger };
};

describe('HealthService', () => {
  it('returns true when the datasource answers the ping', async () => {
    const query = jest.fn().mockResolvedValue([{ '1': 1 }]);
    const { service, logger } = createService(query);

    await expect(service.isDatabaseReachable()).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('returns false and surfaces the error to logs when the ping throws', async () => {
    const error = new Error('connection refused');
    const query = jest.fn().mockRejectedValue(error);
    const { service, logger } = createService(query);

    await expect(service.isDatabaseReachable()).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Database readiness check failed');
    expect(logger.debug).toHaveBeenCalledWith(error);
  });
});
