import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

const createController = (isDatabaseReachable: jest.Mock) => {
  const controller = new HealthController({
    isDatabaseReachable,
  } as unknown as HealthService);
  return { controller, isDatabaseReachable };
};

describe('HealthController', () => {
  it('reports liveness without consulting the health service', () => {
    const isDatabaseReachable = jest.fn();
    const { controller } = createController(isDatabaseReachable);

    const result = controller.live();

    expect(result).toMatchObject({ status: 'ok' });
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
    expect(isDatabaseReachable).not.toHaveBeenCalled();
  });

  it('reports readiness as ok when the database is reachable', async () => {
    const isDatabaseReachable = jest.fn().mockResolvedValue(true);
    const { controller } = createController(isDatabaseReachable);

    const result = await controller.ready();

    expect(result).toMatchObject({ status: 'ok', database: 'ok' });
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('throws a 503 with database unreachable when the database is down', async () => {
    const isDatabaseReachable = jest.fn().mockResolvedValue(false);
    const { controller } = createController(isDatabaseReachable);

    await controller.ready().catch((error: HttpException) => {
      expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(error.getResponse()).toMatchObject({
        status: 'degraded',
        database: 'unreachable',
      });
    });

    await expect(controller.ready()).rejects.toBeInstanceOf(HttpException);
  });

  it('combined health endpoint mirrors the readiness check', async () => {
    const isDatabaseReachable = jest.fn().mockResolvedValue(true);
    const { controller } = createController(isDatabaseReachable);

    await expect(controller.health()).resolves.toMatchObject({
      status: 'ok',
      database: 'ok',
    });
  });

  it('combined health endpoint surfaces a 503 when the database is down', async () => {
    const isDatabaseReachable = jest.fn().mockResolvedValue(false);
    const { controller } = createController(isDatabaseReachable);

    await controller.health().catch((error: HttpException) => {
      expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(error.getResponse()).toMatchObject({ database: 'unreachable' });
    });
  });
});
