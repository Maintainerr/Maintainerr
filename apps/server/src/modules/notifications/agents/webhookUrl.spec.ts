import { validateWebhookUrl } from './webhookUrl';

describe('validateWebhookUrl', () => {
  it('accepts an http URL and returns the normalised value', () => {
    expect(validateWebhookUrl('http://example.com/hook')).toEqual({
      ok: true,
      url: 'http://example.com/hook',
    });
  });

  it('accepts an https URL', () => {
    expect(validateWebhookUrl('https://example.com/hook')).toEqual({
      ok: true,
      url: 'https://example.com/hook',
    });
  });

  it('returns the normalised URL (e.g. adds the root path)', () => {
    expect(validateWebhookUrl('https://example.com')).toEqual({
      ok: true,
      url: 'https://example.com/',
    });
  });

  it('rejects a missing URL', () => {
    expect(validateWebhookUrl(undefined)).toEqual({
      ok: false,
      reason: 'missing webhook URL',
    });
    expect(validateWebhookUrl('')).toEqual({
      ok: false,
      reason: 'missing webhook URL',
    });
  });

  it('rejects an unparseable URL', () => {
    expect(validateWebhookUrl('not a url')).toEqual({
      ok: false,
      reason: 'invalid webhook URL',
    });
  });

  it('rejects non-http(s) schemes', () => {
    for (const url of [
      'file:///etc/passwd',
      'gopher://example.com',
      'ftp://example.com/x',
    ]) {
      expect(validateWebhookUrl(url)).toEqual({
        ok: false,
        reason: 'unsupported webhook URL scheme',
      });
    }
  });
});
