// Shared helpers for the fider-* scripts in this directory. Kept dependency-
// free (Node built-ins only) so each script can stay an `mjs` entry point
// invoked directly from a workflow step.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Headers safe to log on every model response — quota/rate-limit signals only.
// Anything that could leak infra topology, trace IDs, or session state is
// deliberately omitted.
const RATE_LIMIT_HEADERS = [
  'x-ratelimit-limit-requests',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-reset-requests',
  'x-ratelimit-renewalperiod-requests',
  'x-ratelimit-limit-tokens',
  'x-ratelimit-remaining-tokens',
  'x-ratelimit-reset-tokens',
  'x-ratelimit-renewalperiod-tokens',
  'x-ratelimit-abusepenalty-active',
  'retry-after',
];

const summariseRateHeaders = (headers) => {
  const parts = [];
  for (const name of RATE_LIMIT_HEADERS) {
    const value = headers.get(name);
    if (value) parts.push(`${name}=${value}`);
  }
  return parts.length ? parts.join(' ') : '(no rate-limit headers returned)';
};

// Factory for a throttled, retrying GitHub Models caller with a per-run
// budget. Returns { call, count, BudgetExhaustedError }.
//
// Observed runner-token limits (GitHub Actions GITHUB_TOKEN, models: read):
// 1000 RPM and 1M TPM with no exposed daily cap (run id 24963827391,
// 2026-04-26). Defaults pace at 60 RPM with an 800-call sanity ceiling.
//
// Throws BudgetExhaustedError once the per-run cap is reached so the caller
// can break the loop cleanly without it counting as a per-post failure.
export const createModelCaller = ({
  endpoint,
  token,
  log,
  minGapMs = 1000,
  maxCalls = 800,
  retryDelaysMs = [60000, 120000, 240000],
  // Cap on how long we'll honour a Retry-After header. Models can return
  // values measured in tens of thousands of seconds (~daily quota reset).
  // Past this cap we bail so the scheduled run can shut down cleanly and
  // the next run picks up after the quota window resets.
  maxHonouredRetryAfterMs = 5 * 60 * 1000,
}) => {
  let lastCallAt = 0;
  let callCount = 0;
  let headersLoggedOnce = false;

  class BudgetExhaustedError extends Error {
    constructor() {
      super(`model-call budget exhausted (${maxCalls})`);
      this.name = 'BudgetExhaustedError';
    }
  }

  const throttle = async () => {
    if (callCount >= maxCalls) throw new BudgetExhaustedError();
    const elapsed = Date.now() - lastCallAt;
    if (elapsed < minGapMs) await sleep(minGapMs - elapsed);
    lastCallAt = Date.now();
    callCount += 1;
  };

  const call = async (body) => {
    let attempt = 0;
    for (;;) {
      await throttle();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body,
      });
      if (!headersLoggedOnce) {
        log(`models headers: ${summariseRateHeaders(res.headers)}`);
        headersLoggedOnce = true;
      }
      if (res.ok) return res;

      const transient = res.status === 429 || res.status >= 500;
      if (!transient || attempt >= retryDelaysMs.length) {
        const text = await res.text().catch(() => '');
        log(`models headers on final failure: ${summariseRateHeaders(res.headers)}`);
        throw new Error(`GitHub Models ${res.status}: ${text}`);
      }
      const retryAfterRaw = Number(res.headers.get('retry-after'));
      const retryAfterMs =
        Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? retryAfterRaw * 1000 : 0;
      if (retryAfterMs > maxHonouredRetryAfterMs) {
        const text = await res.text().catch(() => '');
        log(`models ${res.status} with retry-after=${retryAfterRaw}s exceeds ${Math.round(maxHonouredRetryAfterMs / 1000)}s cap — likely daily quota; giving up on this post`);
        log(`models headers on final failure: ${summariseRateHeaders(res.headers)}`);
        throw new Error(`GitHub Models ${res.status}: retry-after ${retryAfterRaw}s; ${text}`);
      }
      const wait = retryAfterMs > 0 ? retryAfterMs : retryDelaysMs[attempt];
      log(`models ${res.status}, retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${retryDelaysMs.length}) — ${summariseRateHeaders(res.headers)}`);
      await sleep(wait);
      attempt += 1;
    }
  };

  return {
    call,
    get count() { return callCount; },
    BudgetExhaustedError,
  };
};

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
