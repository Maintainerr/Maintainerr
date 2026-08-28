import axios, { AxiosError, type AxiosResponse } from 'axios';
import {
  applyHttpRetry,
  isRetryableRateLimit,
  rateLimitWaitMs,
} from './httpRetry';

const failedWith = (
  status: number,
  headers: Record<string, string> = {},
  data?: unknown,
) => ({ response: { status, headers, data } }) as unknown as AxiosError;

describe('rate-limit retry policy', () => {
  it('waits out the declared window, not the Retry-After header', () => {
    // Captured from a live discord.com webhook 429: the header is neither
    // seconds nor a countdown, while the body and reset-after agree.
    const discord = failedWith(
      429,
      { 'retry-after': '1665', 'x-ratelimit-reset-after': '2' },
      { retry_after: 0.3 },
    );

    expect(rateLimitWaitMs(discord)).toBe(2000);
    expect(isRetryableRateLimit(discord)).toBe(true);
    // Slack, ntfy and operator webhooks only send the plain header.
    expect(rateLimitWaitMs(failedWith(429, { 'retry-after': '3' }))).toBe(3000);
  });

  it('only retries a 429 the limiter will release in time', () => {
    expect(isRetryableRateLimit(failedWith(429))).toBe(true);
    expect(
      isRetryableRateLimit(failedWith(429, {}, { retry_after: 900 })),
    ).toBe(false);
    expect(isRetryableRateLimit(failedWith(400))).toBe(false);
  });
});

describe('applyHttpRetry', () => {
  // Through a real instance rather than the predicate alone, so the attempt
  // count axios-retry keeps is the one the policy reads.
  const failEveryAttempt = async (
    status: number,
    headers: Record<string, string> = {},
  ) => {
    const instance = axios.create();
    let attempts = 0;
    instance.defaults.adapter = (config) => {
      attempts += 1;
      return Promise.reject(
        new AxiosError('failed', 'ERR_BAD_RESPONSE', config, undefined, {
          status,
          headers,
          data: {},
          statusText: '',
          config,
        } as AxiosResponse),
      );
    };
    applyHttpRetry(instance);

    const startedAt = Date.now();
    await expect(instance.get('/anything')).rejects.toThrow();
    return { attempts, elapsedMs: Date.now() - startedAt };
  };

  it('answers a 429 with one wait of the length it asked for', async () => {
    const { attempts, elapsedMs } = await failEveryAttempt(429, {
      'retry-after': '0.2',
    });

    expect(attempts).toBe(2);
    expect(elapsedMs).toBeGreaterThanOrEqual(150);
  });

  it('gives up on a 429 that will not release inside the cap', async () => {
    expect(
      (await failEveryAttempt(429, { 'retry-after': '900' })).attempts,
    ).toBe(1);
  });

  it('keeps the backoff curve for a 5xx that carries Retry-After', async () => {
    // Left to itself axios-retry would wait out the 15 minutes this names.
    const { attempts, elapsedMs } = await failEveryAttempt(503, {
      'retry-after': '900',
    });

    expect(attempts).toBe(4);
    expect(elapsedMs).toBeLessThan(3000);
  });
});
