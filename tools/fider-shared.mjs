// Shared helpers for the fider-* scripts in this directory. Kept dependency-
// free (Node built-ins only) so each script can stay an `mjs` entry point
// invoked directly from a workflow step.

// Returns a thin Fider API wrapper bound to the given host + bearer token.
// Throws on any non-2xx response with the response body included for context.
export const createFider = ({ host, apiKey }) => {
  if (!host || !apiKey) {
    throw new Error('createFider requires { host, apiKey }');
  }
  const base = host.replace(/\/$/, '');
  return async (path, init = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Fider ${init.method || 'GET'} ${path} → ${res.status}: ${body}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
};

// Tags on a post are returned either as bare slug strings or as objects
// depending on Fider version / endpoint — this handles both shapes.
export const postHasTag = (post, slug) =>
  Array.isArray(post.tags) &&
  post.tags.some((t) => (typeof t === 'string' ? t === slug : t.slug === slug));

// Render a username as a Fider-compatible @-token (whitespace collapsed).
// Fider doesn't auto-notify on @mentions, but the token shows up plainly in
// rendered Markdown and in admin digest emails.
export const buildMentionToken = (name) =>
  '@' + String(name || '').trim().replace(/\s+/g, '-');

// Idempotently create a set of Fider tags. Skips ones that already exist.
// Tag creation requires Administrator role (per docs.fider.io/api/tags) — on
// 403 we throw a clear instructional error instead of the raw HTTP failure
// so the maintainer knows about the one-time promote/demote dance.
export const ensureTags = async ({ fider, log, dryRun, host, tags }) => {
  const existing = await fider('/api/v1/tags');
  const existingSlugs = new Set((existing || []).map((t) => t.slug));
  for (const tag of tags) {
    if (existingSlugs.has(tag.slug)) continue;
    if (dryRun) {
      log(`[dry-run] would create tag '${tag.slug}'`);
      continue;
    }
    try {
      await fider('/api/v1/tags', {
        method: 'POST',
        body: JSON.stringify({
          name: tag.name || tag.slug,
          color: tag.color,
          isPublic: tag.isPublic ?? false,
        }),
      });
      log(`created tag '${tag.slug}'`);
    } catch (err) {
      if (String(err.message).includes('403')) {
        const settingsUrl = host
          ? `${host.replace(/\/$/, '')}/settings/tags`
          : '/settings/tags';
        throw new Error(
          `cannot create tag '${tag.slug}': Fider returned 403. ` +
            `Tag creation requires Administrator role. Either temporarily promote ` +
            `the bot to Administrator, run the workflow once, then demote, or have ` +
            `an admin create the tag manually at ${settingsUrl}.`,
        );
      }
      throw err;
    }
  }
};

// Resolve a "cc: @u1 @u2 ..." prefix to prepend to bot-authored comments.
// Source of truth in priority order:
//   1. GET /api/v1/users (works for Collaborator OR Administrator)
//   2. fallback env-var list (comma-separated names)
//   3. nothing — caller's comments post without a cc line
// The bot's own user is always excluded.
export const buildMentionPrefix = async ({ fider, log, botUsername, fallback }) => {
  const selfName = botUsername;
  try {
    const users = await fider('/api/v1/users');
    if (Array.isArray(users)) {
      const targets = users
        .filter(
          (u) =>
            u &&
            (u.role === 1 ||
              u.role === 2 ||
              u.role === 'administrator' ||
              u.role === 'collaborator'),
        )
        .map((u) => u.name)
        .filter((n) => n && n !== selfName);
      if (targets.length > 0) {
        log(`mention prefix sourced from API: ${targets.length} maintainer(s)`);
        return 'cc: ' + targets.map(buildMentionToken).join(' ');
      }
    }
  } catch (err) {
    log(`could not fetch user list (${err.message}); will check fallback`);
  }
  const list = (fallback || '')
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n && n !== selfName);
  if (list.length > 0) {
    log(`mention prefix sourced from env: ${list.length} maintainer(s)`);
    return 'cc: ' + list.map(buildMentionToken).join(' ');
  }
  log('no mention prefix available — comments will not @-mention anyone');
  return '';
};
