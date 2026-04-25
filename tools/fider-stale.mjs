import { buildMentionPrefix, createFider, postHasTag } from './fider-shared.mjs';

const {
  FIDER_HOST,
  FIDER_API_KEY,
  DRY_RUN = 'false',
  // Same fallback knob as fider-triage uses, so the cc: line stays consistent
  // across all bot-authored comments.
  FIDER_MENTION_USERS_FALLBACK = '',
  FIDER_BOT_USERNAME = 'maintainerr-fider-bot',
} = process.env;

const dryRun = DRY_RUN === 'true';
const log = (msg) => process.stderr.write(`[fider-stale] ${msg}\n`);

const STALE_AGE_DAYS = 547;            // post must be at least 1.5 years old
const MAX_VOTES_FOR_STALE = 3;          // strictly less than this counts as low engagement
const DECLINE_GRACE_DAYS = 30;          // days after stale-warn before auto-decline
const FIDER_FETCH_LIMIT = 500;
const TAG_STALE = 'stale';
const COMMENT_MARKER_STALE_WARN = '<!-- maintainerr-fider-bot:stale-warn -->';

// Posts carrying any of these tags are exempt from the stale sweep entirely.
// Mirrors the spirit of the GitHub stale-bot's exempt-issue-labels list.
const EXEMPT_TAGS = new Set(['never-stale', 'planned', 'started', 'bug', 'enhancement', 'possibly-completed']);

// Statuses that should NEVER be touched by the stale sweep — terminal states
// or in-flight engagement that means a maintainer is on it.
const SWEEPABLE_STATUSES = new Set(['open']);

const requireEnv = () => {
  const missing = [];
  if (!FIDER_HOST) missing.push('FIDER_HOST');
  if (!FIDER_API_KEY) missing.push('FIDER_API_KEY');
  if (missing.length) throw new Error(`missing env: ${missing.join(', ')}`);
};

const fider = createFider({ host: FIDER_HOST, apiKey: FIDER_API_KEY });

let mentionPrefix = '';
const withMentionPrefix = (body) => (mentionPrefix ? `${mentionPrefix}\n\n${body}` : body);

const fetchOpenPosts = async () => {
  const all = [];
  for (const view of ['most-wanted', 'recent']) {
    const posts = await fider(`/api/v1/posts?view=${view}&limit=${FIDER_FETCH_LIMIT}`);
    for (const p of posts || []) {
      if (!SWEEPABLE_STATUSES.has(p.status)) continue;
      if (!all.find((x) => x.number === p.number)) all.push(p);
    }
  }
  return all;
};

const ageInDays = (iso) => {
  const t = new Date(iso || 0).getTime();
  if (!t) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
};

const isExempt = (post) => {
  if (!post.tags) return false;
  for (const t of post.tags) {
    const slug = typeof t === 'string' ? t : t.slug;
    if (EXEMPT_TAGS.has(slug)) return true;
  }
  return false;
};

const tagPost = async (post, slug) => {
  if (dryRun) {
    log(`[dry-run] would tag #${post.number} '${post.title}' with '${slug}'`);
    return;
  }
  await fider(`/api/v1/posts/${post.number}/tags/${slug}`, { method: 'POST' });
  log(`tagged #${post.number} '${slug}'`);
};

const buildStaleWarnComment = () => {
  return [
    `This request hasn't received much engagement in over **1.5 years** (fewer than ${MAX_VOTES_FOR_STALE} votes, no recent activity).`,
    '',
    `If it's still relevant, **add a comment or vote within ${DECLINE_GRACE_DAYS} days** to keep it open. Otherwise it will be auto-closed as Declined to keep the board focused on actionable requests.`,
    '',
    'Maintainers can suppress this check on a specific post by adding the `never-stale` tag.',
    '',
    '_Automated cleanup — this comment is informational, not a deletion._',
    '',
    COMMENT_MARKER_STALE_WARN,
  ].join('\n');
};

const declinePost = async (post, warnComment) => {
  const text = `Auto-closed as Declined: more than 1.5 years old with low engagement, and no response to the stale-warning comment posted ${ageInDays(warnComment.createdAt).toFixed(0)} days ago. Please re-file if this becomes relevant again.`;
  if (dryRun) {
    log(`[dry-run] would decline #${post.number} '${post.title}'`);
    return;
  }
  await fider(`/api/v1/posts/${post.number}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'declined', text }),
  });
  log(`declined #${post.number} '${post.title}'`);
};

const sweepPost = async (post) => {
  if (isExempt(post)) return { skipped: 'exempt-tag' };
  if (ageInDays(post.createdAt) < STALE_AGE_DAYS) return { skipped: 'too-young' };
  if ((post.votesCount || 0) >= MAX_VOTES_FOR_STALE) return { skipped: 'enough-votes' };

  const alreadyStale = postHasTag(post, TAG_STALE);
  if (!alreadyStale) {
    // Phase 1: tag + warn comment.
    await tagPost(post, TAG_STALE);
    if (dryRun) {
      log(`[dry-run] would post stale-warn comment on #${post.number}`);
      return { phase: 1 };
    }
    await fider(`/api/v1/posts/${post.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: withMentionPrefix(buildStaleWarnComment()) }),
    });
    log(`stale-warn posted on #${post.number}`);
    return { phase: 1 };
  }

  // Phase 2: stale tag already present. Look for our warn comment to see how
  // long ago we warned. If the maintainer or the user has commented since
  // (anything that ISN'T our warn marker), skip — they've engaged.
  const comments = await fider(`/api/v1/posts/${post.number}/comments`);
  const warn = (comments || []).find((c) => typeof c.content === 'string' && c.content.includes(COMMENT_MARKER_STALE_WARN));
  if (!warn) {
    // Stale tag without our warn comment — probably manually tagged. Don't
    // auto-decline; that requires explicit bot warning first.
    return { skipped: 'stale-no-warn' };
  }
  const warnAge = ageInDays(warn.createdAt);
  if (warnAge < DECLINE_GRACE_DAYS) {
    return { skipped: `grace-window (${warnAge.toFixed(0)}/${DECLINE_GRACE_DAYS} days)` };
  }
  // Has anything happened since the warn? Any comment newer than the warn
  // (other than the warn itself) counts as engagement.
  const warnTime = new Date(warn.createdAt).getTime();
  const newerComment = (comments || []).find(
    (c) => c.id !== warn.id && new Date(c.createdAt).getTime() > warnTime,
  );
  if (newerComment) {
    return { skipped: 'engagement-since-warn' };
  }
  await declinePost(post, warn);
  return { phase: 2 };
};

const main = async () => {
  requireEnv();
  log(`dryRun=${dryRun} ageThreshold=${STALE_AGE_DAYS}d minVotesToKeep=${MAX_VOTES_FOR_STALE} graceWindow=${DECLINE_GRACE_DAYS}d`);
  mentionPrefix = await buildMentionPrefix({
    fider,
    log,
    botUsername: FIDER_BOT_USERNAME,
    fallback: FIDER_MENTION_USERS_FALLBACK,
  });
  const posts = await fetchOpenPosts();
  log(`fetched ${posts.length} open post(s)`);
  let warned = 0;
  let declined = 0;
  for (const post of posts) {
    try {
      const result = await sweepPost(post);
      if (result.phase === 1) warned += 1;
      else if (result.phase === 2) declined += 1;
      // Skips are quiet — most posts don't qualify and we don't want noise.
    } catch (err) {
      log(`#${post.number} error: ${err.message}`);
    }
  }
  log(`done. warned ${warned}, declined ${declined}.`);
};

main().catch((err) => {
  log(`fatal: ${err.message}`);
  process.exit(1);
});
