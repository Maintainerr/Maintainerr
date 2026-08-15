import { AxiosError } from 'axios';
import { isRetryableRateLimit, rateLimitWaitMs } from './httpRetry';

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
