import { AxiosError } from 'axios';
import { formatConnectionFailureMessage } from './connection-error';

const FALLBACK = 'Failed to connect. Verify URL and credentials.';

describe('formatConnectionFailureMessage', () => {
  it('classifies a refused connection from the error code even when the message is empty', () => {
    // Node surfaces ECONNREFUSED for a dual-stack host (localhost) as an
    // AggregateError whose message is empty; axios copies the code.
    const error = new AxiosError('', 'ECONNREFUSED');

    expect(formatConnectionFailureMessage(error, FALLBACK)).toBe(
      'Connection refused. Verify host, port, and that the service is running.',
    );
  });

  it('classifies an unresolved host from the error code', () => {
    const error = new AxiosError('', 'ENOTFOUND');

    expect(formatConnectionFailureMessage(error, FALLBACK)).toBe(
      'Unable to resolve host. Verify hostname or IP address.',
    );
  });

  it('classifies an aborted (timeout) request', () => {
    const error = new AxiosError('timeout exceeded', 'ECONNABORTED');

    expect(formatConnectionFailureMessage(error, FALLBACK)).toContain(
      'Connection timed out',
    );
  });

  it('classifies ETIMEDOUT from the error code', () => {
    const error = new AxiosError('', 'ETIMEDOUT');

    expect(formatConnectionFailureMessage(error, FALLBACK)).toContain(
      'Connection timed out',
    );
  });

  it('maps 401/403 responses to an invalid-key message', () => {
    const error = new AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 401,
        statusText: 'Unauthorized',
        data: undefined,
        headers: {},
        config: {} as never,
      },
    );

    expect(formatConnectionFailureMessage(error, FALLBACK)).toBe(
      'Invalid API key',
    );
  });

  it('reports other HTTP status codes', () => {
    const error = new AxiosError(
      'Request failed',
      'ERR_BAD_RESPONSE',
      undefined,
      undefined,
      {
        status: 500,
        statusText: 'Internal Server Error',
        data: undefined,
        headers: {},
        config: {} as never,
      },
    );

    expect(formatConnectionFailureMessage(error, FALLBACK)).toBe(
      'Connection failed: received response 500 Internal Server Error.',
    );
  });

  it('falls back to the provided message for an unclassifiable error', () => {
    expect(formatConnectionFailureMessage({}, FALLBACK)).toBe(FALLBACK);
  });
});
