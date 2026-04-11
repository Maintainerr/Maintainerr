import { AxiosError } from 'axios';
import { ExternalApiService } from './external-api.service';

describe('ExternalApiService', () => {
  const createLogger = () => ({
    debug: jest.fn(),
    warn: jest.fn(),
  });

  it('logs a single debug line for expected 404 GET failures', async () => {
    const logger = createLogger();
    const service = new ExternalApiService(
      'https://example.test',
      {},
      logger as any,
    );

    (service as any).axios = {
      get: jest.fn().mockRejectedValue(
        new AxiosError(
          'Request failed with status code 404',
          undefined,
          undefined,
          undefined,
          {
            status: 404,
            statusText: 'Not Found',
            data: undefined,
            headers: {},
            config: { headers: {} } as any,
          } as any,
        ),
      ),
      getUri: jest.fn().mockReturnValue('https://example.test/items/123'),
    };

    await expect(service.get('/items/123')).resolves.toBeUndefined();

    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      'GET https://example.test/items/123 failed with status 404 Not Found',
    );
  });

  it('logs a single debug line for network GET failures without a stack trace', async () => {
    const logger = createLogger();
    const service = new ExternalApiService(
      'https://example.test',
      {},
      logger as any,
    );

    const error = new AxiosError('connect ETIMEDOUT');
    Object.defineProperty(error, 'code', { value: 'ETIMEDOUT' });

    (service as any).axios = {
      get: jest.fn().mockRejectedValue(error),
      getUri: jest.fn().mockReturnValue('https://example.test/items/123'),
    };

    await expect(service.get('/items/123')).resolves.toBeUndefined();

    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      'GET https://example.test/items/123 failed (code=ETIMEDOUT)',
    );
  });
});
