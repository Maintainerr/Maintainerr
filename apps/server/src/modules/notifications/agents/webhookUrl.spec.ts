import { validateWebhookUrl } from './webhookUrl';

describe('validateWebhookUrl', () => {
  it('accepts an http URL and returns the normalised value', () => {
    expect(validateWebhookUrl('http://example.com/hook')).toEqual({
      ok: true,
      url: 'http://example.com/hook',
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
