export interface WebhookUrlValidation {
  /** Whether the URL is usable as an outbound request target. */
  ok: boolean;
  /** The normalised URL to post to. Present only when `ok` is true. */
  url?: string;
  /** Why the URL was rejected. Present only when `ok` is false. */
  reason?: string;
}

/**
 * Validate a user-configured webhook URL before it is used as an outbound
 * request target. Rejects unparseable values and any scheme other than
 * http(s), so a misconfigured URL (file://, gopher://, …) cannot turn a
 * notification agent into the way the server leaves the network. On success the
 * normalised URL string is returned for posting.
 *
 * Shared by every agent that posts to an operator-supplied URL - the
 * `webhookUrl` agents (webhook, slack, lunasea, discord) and ntfy's server
 * `url` - so the guard stays in one place.
 */
export function validateWebhookUrl(
  url: string | undefined,
): WebhookUrlValidation {
  if (!url) {
    return { ok: false, reason: 'missing webhook URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid webhook URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported webhook URL scheme' };
  }

  return { ok: true, url: parsed.toString() };
}
