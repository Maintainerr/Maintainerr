import { maskSecret, maskSecretString } from '../../utils/secretMasking';
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
      'myauthorization: Bearer tok...123 Authorization: Bearer sup...ken, apikey=sec...123 /token/abc...456/details token=kee...den',
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
      message: 'POST https://exa...com?ap...234 failed',
      stack: ['Authorization=Basic dGV...g=='],
      meta: {
        token: 'token=kee...den',
        [nestedSymbol]: 'Authorization: Bearer sup...ken',
      },
      [levelSymbol]: 'info',
      [splatSymbol]: ['Authorization: Bearer sup...ken'],
    });
  });

  it('masks http and https URL payloads using the shared standard', () => {
    expect(
      sanitizeLogValue(
        'Fetch failed for https://jelly.example.com/web/index.html',
      ),
    ).toBe('Fetch failed for https://jel...com/we...tml');

    expect(sanitizeLogValue('Redirected to http://192.168.1.100:32400/,')).toBe(
      'Redirected to http://192.***.***.100:32400/,',
    );

    expect(sanitizeLogValue('See (https://abc.plex.direct/details?id=1)')).toBe(
      'See (https://****.plex.direct/de...d=1)',
    );
  });

  it('masks IPv4 addresses keeping first and last octet', () => {
    expect(sanitizeLogValue('Target host 192.168.1.100:32400 failed')).toBe(
      'Target host 192.***.***.100:32400 failed',
    );

    expect(sanitizeLogValue('Connected to 10.0.0.1 successfully')).toBe(
      'Connected to 10.***.***.1 successfully',
    );
  });

  it('masks plex.direct hostnames using first/last 3 chars', () => {
    expect(
      sanitizeLogValue(
        'Host 192-168-1-100.abc123def456.plex.direct:32400 failed',
      ),
    ).toBe('Host 192...456.plex.direct:32400 failed');

    expect(sanitizeLogValue('host: abc.plex.direct')).toBe(
      'host: ****.plex.direct',
    );

    expect(sanitizeLogValue('host:abc.plex.direct,')).toBe(
      'host:****.plex.direct,',
    );

    expect(sanitizeLogValue('host=(abc.plex.direct)')).toBe(
      'host=(****.plex.direct)',
    );

    expect(sanitizeLogValue('host=abc.plex.directory')).toBe(
      'host=abc.plex.directory',
    );
  });

  it('masks DNS resolution hosts in error messages and stacks', () => {
    const host = 'reqFULLADDRESS';
    const maskedHost = maskSecretString(host);
    const error = new Error(`getaddrinfo ENOTFOUND ${host}`);
    Object.assign(error, { code: 'ENOTFOUND' });

    const sanitized = sanitizeLogValue(error) as Record<string, unknown>;

    expect(sanitized.message).toBe(`getaddrinfo ENOTFOUND ${maskedHost}`);
    expect(sanitized.stack).toContain(`getaddrinfo ENOTFOUND ${maskedHost}`);
  });

  it('preserves host structure when masking URL authorities', () => {
    expect(sanitizeLogValue('http://1.152.99.2')).toBe('http://1.***.***.2');
    expect(sanitizeLogValue('https://requr.domain.n')).toBe(
      'https://req...n.n',
    );
    expect(sanitizeLogValue('http://[2001:db8::7334]:32400')).toBe(
      'http://[200...334]:32400',
    );
  });

  it('masks bracketed IPv6 hosts in DNS errors', () => {
    expect(
      sanitizeLogValue('Error: getaddrinfo ENOTFOUND [2001:db8::7334]'),
    ).toBe('Error: getaddrinfo ENOTFOUND [200...334]');
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
