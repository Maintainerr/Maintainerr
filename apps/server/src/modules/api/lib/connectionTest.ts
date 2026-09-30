import { CONNECTION_TEST_TIMEOUT_MS } from './httpTimeouts';

/** Reuse one config across every request in a test, including authentication. */
export const connectionTestConfig = (
  timeoutMs: number = CONNECTION_TEST_TIMEOUT_MS,
) => ({
  timeout: timeoutMs,
  signal: AbortSignal.timeout(timeoutMs),
});

export function assertApiKey(
  apiKey: string | null | undefined,
): asserts apiKey is string {
  if (!apiKey?.trim()) {
    throw new Error('API key is required');
  }
}
