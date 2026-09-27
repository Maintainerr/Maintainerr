import { CONNECTION_TEST_TIMEOUT_MS } from './httpTimeouts';

/** Reuse one config across every request in a test, including authentication. */
export const connectionTestConfig = () => ({
  timeout: CONNECTION_TEST_TIMEOUT_MS,
  signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
});

export function assertApiKey(
  apiKey: string | null | undefined,
): asserts apiKey is string {
  if (!apiKey?.trim()) {
    throw new Error('API key is required');
  }
}
