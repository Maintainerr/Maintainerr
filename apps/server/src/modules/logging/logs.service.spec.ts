import type { Repository } from 'typeorm';
import winston from 'winston';
import { LogSettings } from './entities/logSettings.entities';
import { LogSettingsService, MaintainerrLogger } from './logs.service';

describe('MaintainerrLogger', () => {
  let logger: MaintainerrLogger;
  let winstonLogger: {
    log: jest.Mock;
  };

  beforeEach(() => {
    winstonLogger = {
      log: jest.fn(),
    };

    logger = new MaintainerrLogger(winstonLogger as unknown as winston.Logger);
    logger.setContext('TestContext');
  });

  it('formats error objects passed as the second argument safely', () => {
    const error = Object.assign(new Error('connection failed'), {
      code: 'ECONNRESET',
      response: {
        status: 502,
        statusText: 'Bad Gateway',
      },
    });

    logger.error('Request failed', error);

    expect(winstonLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        context: 'TestContext',
        message:
          'Request failed: connection failed | code=ECONNRESET | status=502 Bad Gateway',
        errorName: 'Error',
        errorCode: 'ECONNRESET',
        status: 502,
        statusText: 'Bad Gateway',
        stack: [expect.any(String)],
      }),
    );
  });

  it('preserves the legacy error trace signature', () => {
    logger.error('Legacy failure', 'stack trace', 'CustomContext');

    expect(winstonLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        context: 'CustomContext',
        message: 'Legacy failure',
        stack: ['stack trace'],
      }),
    );
  });

  it('normalizes embedded error metadata on object log payloads', () => {
    const error = Object.assign(new Error('queue failed'), {
      code: 'EQUEUE',
    });

    logger.error({
      message: 'Failed to enqueue work',
      error,
      jobId: 'job-123',
    });

    expect(winstonLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        context: 'TestContext',
        message: 'Failed to enqueue work: queue failed | code=EQUEUE',
        jobId: 'job-123',
        errorName: 'Error',
        errorCode: 'EQUEUE',
        stack: [expect.any(String)],
      }),
    );
  });
});

describe('LogSettingsService', () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  afterEach(() => {
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
      return;
    }

    process.env.LOG_LEVEL = originalLogLevel;
  });

  it('keeps the LOG_LEVEL env override active after saving settings', async () => {
    process.env.LOG_LEVEL = 'debug';

    const logger = {
      level: 'info',
      transports: [],
    } as unknown as winston.Logger;

    const repo = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        level: 'warn',
        max_size: 20,
        max_files: 7,
      } satisfies LogSettings),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as Repository<LogSettings>;

    const service = new LogSettingsService(logger, repo);
    await service.update({
      level: 'warn',
      max_size: 30,
      max_files: 14,
    });

    expect(logger.level).toBe('debug');
    // The override applies to the live logger only; the persisted value stays
    // the user-facing UI choice so the env var never leaks into the database.
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn' }),
    );
  });
});
