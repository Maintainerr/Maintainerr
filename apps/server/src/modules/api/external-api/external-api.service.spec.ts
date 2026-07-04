import { AxiosError } from 'axios';
import NodeCache from 'node-cache';
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
    };

    await expect(service.get('/items/123')).resolves.toBeUndefined();

    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      'GET https://example.test/items/123 failed (code=ETIMEDOUT)',
    );
  });

  describe('caching guard (isCacheable)', () => {
    const createServiceWithCache = () => {
      const logger = createLogger();
      const cache = new NodeCache({ stdTTL: 300 });
      const service = new ExternalApiService(
        'https://example.test',
        {},
        logger as any,
        { nodeCache: cache },
      );
      return { service, cache };
    };

    it('does not cache Buffer responses - second call hits the network again', async () => {
      const { service } = createServiceWithCache();
      const validObject = { data: 'ok' };

      const getFn = jest
        .fn()
        .mockResolvedValueOnce({ data: Buffer.from('binary') })
        .mockResolvedValueOnce({ data: validObject });

      (service as any).axios = { get: getFn };

      await service.get('/binary');
      await service.get('/binary');

      // Buffer was not cached, so two network calls were made
      expect(getFn).toHaveBeenCalledTimes(2);
    });

    it('does not cache null responses - second call hits the network again', async () => {
      const { service } = createServiceWithCache();
      const validObject = { items: [] };

      const getFn = jest
        .fn()
        .mockResolvedValueOnce({ data: null })
        .mockResolvedValueOnce({ data: validObject });

      (service as any).axios = { get: getFn };

      await service.get('/nullable');
      await service.get('/nullable');

      expect(getFn).toHaveBeenCalledTimes(2);
    });

    it('caches valid object responses - second call does not hit the network', async () => {
      const { service } = createServiceWithCache();
      const validObject = { items: [1, 2, 3] };

      const getFn = jest.fn().mockResolvedValueOnce({ data: validObject });

      (service as any).axios = { get: getFn };

      const first = await service.get('/data');
      const second = await service.get('/data');

      expect(getFn).toHaveBeenCalledTimes(1);
      expect(first).toEqual(validObject);
      expect(second).toEqual(validObject);
    });
  });
});
