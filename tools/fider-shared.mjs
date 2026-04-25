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

// Discord webhook colours per event kind. Visual-only; the embed body has the
// text. RGB hex literals match Fider tag colours where applicable.
const DISCORD_COLOURS = {
  'possibly-completed': 0xf39c12,
  'possibly-pre-existing': 0x3498db,
  'possibly-duplicate': 0x9b59b6,
  'stale-warned': 0xe67e22,
  'stale-declined': 0xe74c3c,
};

// Post a single embed to a Discord webhook. Silent no-op if webhookUrl is empty
// so workflows without the secret configured still complete cleanly. Discord
// webhook errors are logged but never thrown — Discord is best-effort, the
// Fider work has already happened by the time we notify.
//
// pingRoleId (optional): a Discord snowflake for a role to @-mention. Goes in
// the message `content` field rather than the embed because Discord
// deliberately suppresses notifications inside embeds. allowed_mentions is
// scoped to that role so the message can never accidentally ping @everyone.
export const notifyDiscord = async ({ webhookUrl, log, host, kind, post, fields = {}, pingRoleId = '' }) => {
  if (!webhookUrl) return;
  const base = (host || '').replace(/\/$/, '');
  const postUrl = base
    ? `${base}/posts/${post.number}/${post.slug || ''}`.replace(/\/$/, '')
    : '';
  const lines = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v) lines.push(`**${k}:** ${v}`);
  }
  const description = lines.length ? lines.join('\n') : undefined;
  const payload = {
    content: pingRoleId ? `<@&${pingRoleId}>` : undefined,
    allowed_mentions: pingRoleId
      ? { parse: [], roles: [pingRoleId] }
      : { parse: [] },
    embeds: [
      {
        title: `Fider — ${kind}: #${post.number} ${post.title || ''}`.slice(0, 256),
        url: postUrl || undefined,
        description: description ? description.slice(0, 4000) : undefined,
        color: DISCORD_COLOURS[kind] || 0x7f8c8d,
      },
    ],
  };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      log(`Discord webhook ${res.status}: ${await res.text().catch(() => '')}`);
    }
  } catch (err) {
    log(`Discord webhook failed: ${err.message}`);
  }
};
