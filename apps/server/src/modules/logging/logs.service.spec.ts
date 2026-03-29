import winston from 'winston';
import { MaintainerrLogger } from './logs.service';

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

  it('formats warn and debug calls with error objects safely', () => {
    const error = new Error('temporary failure');

    logger.warn('Warn message', error);
    logger.debug?.('Debug message', error);

    expect(winstonLogger.log).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        level: 'warn',
        context: 'TestContext',
        message: 'Warn message: temporary failure',
        stack: [expect.any(String)],
      }),
    );

    expect(winstonLogger.log).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        level: 'debug',
        context: 'TestContext',
        message: 'Debug message: temporary failure',
        stack: [expect.any(String)],
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

  it('normalizes error on warn and info object log payloads', () => {
    const error = new Error('background failure');

    logger.warn({ message: 'Warn payload', error, requestId: 'req-1' });
    logger.log({ level: 'info', message: 'Info payload', error, runId: '1' });

    expect(winstonLogger.log).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        level: 'warn',
        context: 'TestContext',
        message: 'Warn payload: background failure',
        requestId: 'req-1',
        errorName: 'Error',
        stack: [expect.any(String)],
      }),
    );

    expect(winstonLogger.log).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        level: 'info',
        context: 'TestContext',
        message: 'Info payload: background failure',
        runId: '1',
        errorName: 'Error',
        stack: [expect.any(String)],
      }),
    );
  });

  it('formats first-argument Error instances for info, debug, and verbose', () => {
    const error = new Error('background failure');

    logger.log(error);
    logger.debug?.(error);
    logger.verbose?.(error);

    expect(winstonLogger.log).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        level: 'info',
        context: 'TestContext',
        message: 'background failure',
        errorName: 'Error',
        stack: [expect.any(String)],
      }),
    );

    expect(winstonLogger.log).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        level: 'debug',
        context: 'TestContext',
        message: 'background failure',
        errorName: 'Error',
        stack: [expect.any(String)],
      }),
    );

    expect(winstonLogger.log).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        level: 'verbose',
        context: 'TestContext',
        message: 'background failure',
        errorName: 'Error',
        stack: [expect.any(String)],
      }),
    );
  });

  it('avoids duplicated punctuation when appending error summaries', () => {
    const error = new Error('save failed');

    logger.error('Error while saving settings: ', error);
    logger.error('Error while saving settings.', error);

    expect(winstonLogger.log).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        level: 'error',
        context: 'TestContext',
        message: 'Error while saving settings: save failed',
      }),
    );

    expect(winstonLogger.log).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        level: 'error',
        context: 'TestContext',
        message: 'Error while saving settings: save failed',
      }),
    );
  });
});
