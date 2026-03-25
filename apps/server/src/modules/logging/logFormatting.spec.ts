import {
  formatLogMessage,
  sanitizeLogInfo,
  sanitizeLogValue,
} from './logFormatting';

describe('logFormatting', () => {
  it('redacts sensitive query parameters from log strings', () => {
    expect(
      sanitizeLogValue(
        'GET https://example.com/?apikey=secret123&foo=bar&token=abc failed',
      ),
    ).toBe('GET https://example.com/?apikey=****&foo=bar&token=**** failed');
  });

  it('redacts authorization headers from log strings', () => {
    expect(sanitizeLogValue('Authorization: Bearer super-secret-token')).toBe(
      'Authorization: Bearer ****',
    );
  });

  it('redacts sensitive values recursively in log info objects', () => {
    expect(
      sanitizeLogInfo({
        message: 'POST https://example.com?api_key=abcd1234 failed',
        stack: ['Authorization=Basic dGVzdDp0b2tlbg=='],
        meta: {
          token: 'token=keepmehidden',
        },
      }),
    ).toEqual({
      message: 'POST https://example.com?api_key=**** failed',
      stack: ['Authorization=Basic ****'],
      meta: {
        token: 'token=****',
      },
    });
  });

  it('redacts path token segments when formatting log messages', () => {
    expect(
      formatLogMessage('Request failed', [
        'Error: https://plex.tv/api/v2/user/token/abcdef123456/details',
      ]),
    ).toContain('/token/****/details');
  });
});
