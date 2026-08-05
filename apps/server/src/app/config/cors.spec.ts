import { resolveCorsOptions } from './cors';

describe('resolveCorsOptions', () => {
  it('returns nothing in production, so enableCors is never called', () => {
    expect(resolveCorsOptions({ NODE_ENV: 'production' })).toBeUndefined();
  });

  it('reflects any origin outside production', () => {
    expect(resolveCorsOptions({ NODE_ENV: 'development' })).toEqual({
      origin: true,
    });
    expect(resolveCorsOptions({})).toEqual({ origin: true });
  });

  it('uses the configured allowlist, trimming and dropping empty entries', () => {
    expect(
      resolveCorsOptions({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: ' https://a.example , ,https://b.example ',
      }),
    ).toEqual({ origin: ['https://a.example', 'https://b.example'] });
  });

  it('prefers the allowlist over development reflection', () => {
    expect(
      resolveCorsOptions({
        NODE_ENV: 'development',
        CORS_ALLOWED_ORIGINS: 'https://a.example',
      }),
    ).toEqual({ origin: ['https://a.example'] });
  });
});
