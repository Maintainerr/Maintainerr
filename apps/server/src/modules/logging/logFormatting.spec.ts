import { maskSecret } from '../../utils/secretMasking';
import {
  formatLogMessage,
  sanitizeLogInfo,
  sanitizeLogValue,
} from './logFormatting';

describe('logFormatting', () => {
  it('masks secret values with the shared contract', () => {
    expect(maskSecret(undefined)).toBeNull();
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret('')).toBe('');
    expect(maskSecret('abc123')).toBe('****');
    expect(maskSecret('secret123')).toBe('sec...123');
  });

  it('sanitizes supported secret formats in log values', () => {
    expect(
      sanitizeLogValue(
        'myauthorization: Bearer token123 Authorization: Bearer super-secret-token, apikey=secret123 /token/abcdef123456/details token=keepmehidden',
      ),
    ).toBe(
      'myauthorization: Bearer token123 Authorization: Bearer sup...ken, apikey=sec...123 /token/abc...456/details token=kee...den',
    );
  });

  it('preserves winston symbol metadata while sanitizing nested values', () => {
    const levelSymbol = Symbol.for('level');
    const splatSymbol = Symbol.for('splat');
    const nestedSymbol = Symbol('nested');

    expect(
      sanitizeLogInfo({
        message: 'POST https://example.com?api_key=abcd1234 failed',
        stack: ['Authorization=Basic dGVzdDp0b2tlbg=='],
        meta: {
          token: 'token=keepmehidden',
          [nestedSymbol]: 'Authorization: Bearer super-secret-token',
        },
        [levelSymbol]: 'info',
        [splatSymbol]: ['Authorization: Bearer super-secret-token'],
      }),
    ).toEqual({
      message: 'POST https://example.com?api_key=abc...234 failed',
      stack: ['Authorization=Basic dGV...g=='],
      meta: {
        token: 'token=kee...den',
        [nestedSymbol]: 'Authorization: Bearer sup...ken',
      },
      [levelSymbol]: 'info',
      [splatSymbol]: ['Authorization: Bearer sup...ken'],
    });
  });

  it('formats message with stack trace', () => {
    const result = formatLogMessage('Request failed', [
      'Error: something went wrong',
    ]);
    expect(result).toContain('Request failed');
    expect(result).toContain('Error: something went wrong');
  });

  it('sanitizes circular error objects without overflowing the stack', () => {
    const error = new Error('Authorization: Bearer super-secret-token');
    const response = {} as Record<string, unknown>;

    response.self = response;
    response.error = error;
    Object.assign(error as Error & Record<string, unknown>, { response });
    Object.defineProperty(error, 'cause', {
      value: error,
      enumerable: true,
      configurable: true,
    });

    const sanitized = sanitizeLogValue(error) as Record<string, unknown>;
    const sanitizedResponse = sanitized.response as Record<string, unknown>;

    expect(sanitized.message).toBe('Authorization: Bearer sup...ken');
    expect(sanitized.cause).toBe(sanitized);
    expect(sanitizedResponse.self).toBe(sanitizedResponse);
    expect(sanitizedResponse.error).toBe(sanitized);
  });
});
