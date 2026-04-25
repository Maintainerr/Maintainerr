import { execFileSync } from 'node:child_process';
import { createFider, ensureTags as ensureFiderTags, notifyDiscord, postHasTag } from './fider-shared.mjs';

const {
  FIDER_HOST,
  FIDER_API_KEY,
  GITHUB_TOKEN,
  GITHUB_REPOSITORY: repo,
  FIDER_TRIAGE_MODEL = 'openai/gpt-4o-mini',
  DRY_RUN = 'false',
  FORCE_REEVAL = 'false',
  CHECK_PRE_EXISTING = 'false',
  // Optional Discord webhook for maintainer notifications. Silent no-op when
  // unset — the bot's Fider work still happens, just nothing posted to chat.
  DISCORD_FIDER_BOT_WEBHOOK = '',
  // Optional Discord role ID (snowflake) to @-mention in notifications.
  // Empty = embed-only, no ping. Configure as a repo variable rather than
  // a secret since role IDs aren't sensitive.
  DISCORD_PING_ROLE_ID = '',
} = process.env;

const dryRun = DRY_RUN === 'true';
const forceReeval = FORCE_REEVAL === 'true';
const checkPreExisting = CHECK_PRE_EXISTING === 'true';
const MODELS_ENDPOINT = 'https://models.github.ai/inference/chat/completions';

const TAG_CHECKED = 'triage-checked';
const TAG_POSSIBLY_COMPLETED = 'possibly-completed';
const TAG_POSSIBLY_DUPLICATE = 'possibly-duplicate';
const TAG_POSSIBLY_PRE_EXISTING = 'possibly-pre-existing';

const MAX_POSTS_PER_RUN = 25;
const MAX_CANDIDATES = 3;
const MAX_PR_BODY_CHARS = 500;
const MAX_KEYWORDS = 4;
const PR_SEARCH_LIMIT_PER_KEYWORD = 5;
// Fider's default page size is small; bump well above the current Maintainerr
// open-post count so a single fetch covers the whole backlog.
const FIDER_FETCH_LIMIT = 500;
// Jaccard-similarity threshold between keyword sets for a post to be considered
// a plausible duplicate candidate worth asking the model about.
const DUPLICATE_SIMILARITY_THRESHOLD = 0.4;
const MAX_DUPLICATE_CANDIDATES = 3;
const MAX_DUPLICATE_DESCRIPTION_CHARS = 500;
// GitHub Models free tier caps at ~15 req/min; pace at 1 every 5s to stay clear.
const MIN_MODEL_CALL_GAP_MS = 5000;
// If this many posts in a row exhaust the model retry budget, abort the run
// rather than burn ~7 min of CI per remaining post on a guaranteed-failing API.
const MAX_CONSECUTIVE_MODEL_FAILURES = 3;

// Subjects we will not consider as "implementing" a feature request.
const NON_FEATURE_PREFIX_RE = /^(chore|deps|refactor|test|tests|ci|docs|build|style|revert|release)\b/i;
const FEATURE_PREFIX_RE = /^(feat|feature|fix)\b/i;

const STOPWORDS = new Set([
  'the','and','for','with','that','this','from','into','have','has','had','will','would','should','could',
  'when','where','what','which','while','about','after','before','their','there','them','they','then',
  'than','also','some','more','most','only','just','like','want','need','make','made','please','add',
  'added','adding','allow','allows','support','supports','option','options','ability','feature','request',
  'maintainerr','plex','jellyfin','radarr','sonarr','overseerr','jellyseerr','seerr','tautulli',
  'app','application','user','users','rule','rules','collection','collections','media','library','libraries',
  'item','items','setting','settings','page','tab','button','field','value','enable','disable',
  'are','was','were','can','any','all','one','two','out','use','via','etc','its','our','your','you',
]);

const log = (msg) => process.stderr.write(`[fider-triage] ${msg}\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const requireEnv = () => {
  const missing = [];
  if (!FIDER_HOST) missing.push('FIDER_HOST');
  if (!FIDER_API_KEY) missing.push('FIDER_API_KEY');
  if (!GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
  if (!repo) missing.push('GITHUB_REPOSITORY');
  if (missing.length) {
    throw new Error(`missing env: ${missing.join(', ')}`);
  }
};

const fider = createFider({ host: FIDER_HOST, apiKey: FIDER_API_KEY });


const ensureTags = () =>
  ensureFiderTags({
    fider,
    log,
    dryRun,
    host: FIDER_HOST,
    tags: [
      { slug: TAG_CHECKED, color: '7f8c8d' },
      { slug: TAG_POSSIBLY_COMPLETED, color: 'f39c12' },
      { slug: TAG_POSSIBLY_DUPLICATE, color: '9b59b6' },
      { slug: TAG_POSSIBLY_PRE_EXISTING, color: '3498db' },
    ],
  });

const OPEN_STATUSES = new Set(['open', 'planned', 'started']);

const fetchOpenPosts = async () => {
  // Fider returns status as a string. Terminal statuses (completed,
  // declined, duplicate) are skipped so we don't re-judge them.
  // Use both views so neither voting nor recency biases which posts we see.
  const all = [];
  for (const view of ['most-wanted', 'recent']) {
    const posts = await fider(`/api/v1/posts?view=${view}&limit=${FIDER_FETCH_LIMIT}`);
    for (const p of posts || []) {
      if (!OPEN_STATUSES.has(p.status)) continue;
      if (!all.find((x) => x.number === p.number)) all.push(p);
    }
  }
  return all;
};

const tagPost = async (post, slug) => {
  if (dryRun) {
    log(`[dry-run] would tag #${post.number} '${post.title}' with '${slug}'`);
    return;
  }
  await fider(`/api/v1/posts/${post.number}/tags/${slug}`, { method: 'POST' });
  log(`tagged #${post.number} '${slug}'`);
};

// Per-comment-type marker so a re-evaluation can leave a NEW kind of comment
// (e.g. completion now, after previously commenting only as duplicate) without
// double-posting the same kind. Hidden HTML comment — invisible in Fider's
// rendered Markdown.
const COMMENT_MARKER_COMPLETED = '<!-- maintainerr-fider-bot:completed -->';
const COMMENT_MARKER_DUPLICATE = '<!-- maintainerr-fider-bot:duplicate -->';
const COMMENT_MARKER_PRE_EXISTING = '<!-- maintainerr-fider-bot:pre-existing -->';

const findBotCommentOfType = async (post, marker) => {
  const comments = await fider(`/api/v1/posts/${post.number}/comments`);
  return (comments || []).find((c) => typeof c.content === 'string' && c.content.includes(marker)) || null;
};

const postFiderComment = async (post, content, label) => {
  if (dryRun) {
    log(`[dry-run] would post comment on #${post.number}: ${label}`);
    return;
  }
  await fider(`/api/v1/posts/${post.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  log(`commented on #${post.number}: ${label}`);
};

const editFiderComment = async (post, commentId, content, label) => {
  if (dryRun) {
    log(`[dry-run] would edit comment ${commentId} on #${post.number}: ${label}`);
    return;
  }
  await fider(`/api/v1/posts/${post.number}/comments/${commentId}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  log(`edited comment ${commentId} on #${post.number}: ${label}`);
};

// Post a new bot comment OR edit the existing one of the same type if its
// body has changed. Lets re-evaluation update stale evidence (e.g. pointing
// at a newer/better PR) instead of leaving the original verdict frozen.
const upsertBotComment = async (post, marker, newContent, label) => {
  const existing = await findBotCommentOfType(post, marker);
  if (!existing) {
    await postFiderComment(post, newContent, label);
    return;
  }
  if (existing.content === newContent) {
    log(`#${post.number}: ${label} unchanged, skipping`);
    return;
  }
  await editFiderComment(post, existing.id, newContent, `${label} (updated)`);
};

const buildCompletedComment = (verdict, candidate) => {
  const merged = candidate?.mergedAt ? candidate.mergedAt.slice(0, 10) : 'recently';
  const quote = (verdict.quote || '').trim();
  const lines = [
    `This request may already be implemented by ${verdict.evidence_url} (merged ${merged}).`,
    '',
  ];
  if (quote) {
    lines.push(`> ${quote.split('\n').join('\n> ')}`);
    lines.push('');
  }
  lines.push('_Automated triage — please verify and mark this post as Completed if the PR delivers what was requested, or remove the `possibly-completed` tag if not._');
  lines.push('');
  lines.push(COMMENT_MARKER_COMPLETED);
  return lines.join('\n');
};

const commentOnPost = async (post, verdict, candidates) => {
  const candidate = candidates.find((c) => c.url === verdict.evidence_url);
  const content = buildCompletedComment(verdict, candidate);
  await upsertBotComment(post, COMMENT_MARKER_COMPLETED, content, `cites ${verdict.evidence_url}`);
};

const buildDuplicateComment = (original, verdict) => {
  const filed = original.createdAt ? original.createdAt.slice(0, 10) : 'earlier';
  const quote = (verdict.quote || '').trim();
  const url = `${FIDER_HOST.replace(/\/$/, '')}/posts/${original.number}/${original.slug || ''}`.replace(/\/$/, '');
  const lines = [
    `This may be a duplicate of #${original.number} ([${original.title}](${url}), filed ${filed}).`,
    '',
  ];
  if (quote) {
    lines.push(`> ${quote.split('\n').join('\n> ')}`);
    lines.push('');
  }
  lines.push('_Automated triage — please verify and either close as duplicate (with a link to the original) or remove the `possibly-duplicate` tag if these are distinct requests._');
  lines.push('');
  lines.push(COMMENT_MARKER_DUPLICATE);
  return lines.join('\n');
};

const commentOnDuplicate = async (post, verdict, original) => {
  const content = buildDuplicateComment(original, verdict);
  await upsertBotComment(post, COMMENT_MARKER_DUPLICATE, content, `flagged as duplicate of #${original.number}`);
};

const buildPreExistingComment = (verdict, candidate) => {
  const merged = candidate?.mergedAt ? candidate.mergedAt.slice(0, 10) : 'before this request was filed';
  const quote = (verdict.quote || '').trim();
  const lines = [
    `This may already be supported by an existing feature: ${verdict.evidence_url} (merged ${merged}).`,
    '',
  ];
  if (quote) {
    lines.push(`> ${quote.split('\n').join('\n> ')}`);
    lines.push('');
  }
  lines.push('_Automated triage — this is **lower confidence than `possibly-completed`** because the relevant code shipped before this request was filed, so the user may simply not have known the feature existed. A maintainer should verify and close as Completed (pointing at the docs/PR) or remove the `possibly-pre-existing` tag if the request asks for behaviour the existing feature does not provide._');
  lines.push('');
  lines.push(COMMENT_MARKER_PRE_EXISTING);
  return lines.join('\n');
};

const commentOnPreExisting = async (post, verdict, candidates) => {
  const candidate = candidates.find((c) => c.url === verdict.evidence_url);
  const content = buildPreExistingComment(verdict, candidate);
  await upsertBotComment(post, COMMENT_MARKER_PRE_EXISTING, content, `cites pre-existing ${verdict.evidence_url}`);
};

const extractKeywords = (post) => {
  const text = `${post.title || ''} ${(post.description || '').slice(0, 400)}`.toLowerCase();
  const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
  const counts = new Map();
  for (const tok of tokens) {
    if (tok.length < 4) continue;
    if (STOPWORDS.has(tok)) continue;
    counts.set(tok, (counts.get(tok) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_KEYWORDS)
    .map(([t]) => t);
};

const runGh = (args) => {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GH_TOKEN: GITHUB_TOKEN },
    });
  } catch (err) {
    log(`gh ${args.join(' ')} failed: ${err.message}`);
    return '';
  }
};

const searchMergedPRs = (keywords) => {
  if (keywords.length === 0) return [];
  // GitHub PR search AND's terms together, so multi-keyword queries
  // miss real matches. Search each keyword separately and union the
  // results; downstream filters and the LLM judge precision.
  const seen = new Map();
  for (const keyword of keywords) {
    const raw = runGh([
      'pr', 'list',
      '--repo', repo,
      '--state', 'merged',
      '--search', keyword,
      '--limit', String(PR_SEARCH_LIMIT_PER_KEYWORD),
      '--json', 'number,title,url,body,mergedAt,labels',
    ]);
    if (!raw) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const pr of parsed) {
      if (!seen.has(pr.number)) seen.set(pr.number, pr);
    }
  }
  return [...seen.values()];
};

const filterCandidates = (candidates, post) => {
  const postCreatedAt = new Date(post.createdAt || 0).getTime();
  return candidates
    .filter((c) => {
      // PRs merged before the FR was filed cannot have implemented it.
      const merged = new Date(c.mergedAt || 0).getTime();
      return merged > postCreatedAt;
    })
    .filter((c) => !NON_FEATURE_PREFIX_RE.test(c.title || ''))
    .filter((c) => FEATURE_PREFIX_RE.test(c.title || ''))
    .slice(0, MAX_CANDIDATES)
    .map((c) => ({
      number: c.number,
      title: c.title,
      url: c.url,
      mergedAt: c.mergedAt,
      body: (c.body || '').slice(0, MAX_PR_BODY_CHARS),
    }));
};

// Inverted variant for the "user may not know this already exists" detector:
// only consider PRs merged BEFORE the FR was filed.
const filterPreExistingCandidates = (candidates, post) => {
  const postCreatedAt = new Date(post.createdAt || 0).getTime();
  return candidates
    .filter((c) => {
      const merged = new Date(c.mergedAt || 0).getTime();
      return merged > 0 && merged < postCreatedAt;
    })
    .filter((c) => !NON_FEATURE_PREFIX_RE.test(c.title || ''))
    .filter((c) => FEATURE_PREFIX_RE.test(c.title || ''))
    .slice(0, MAX_CANDIDATES)
    .map((c) => ({
      number: c.number,
      title: c.title,
      url: c.url,
      mergedAt: c.mergedAt,
      body: (c.body || '').slice(0, MAX_PR_BODY_CHARS),
    }));
};

const findDuplicateCandidates = (post, allPosts) => {
  const postKeywords = new Set(extractKeywords(post));
  if (postKeywords.size < 2) return [];
  const postCreatedAt = new Date(post.createdAt || 0).getTime();
  const scored = [];
  for (const other of allPosts) {
    if (other.number === post.number) continue;
    // The duplicate is the NEWER post; the original must predate it.
    const otherCreatedAt = new Date(other.createdAt || 0).getTime();
    if (otherCreatedAt >= postCreatedAt) continue;
    const otherKeywords = new Set(extractKeywords(other));
    if (otherKeywords.size === 0) continue;
    let intersection = 0;
    for (const kw of postKeywords) if (otherKeywords.has(kw)) intersection += 1;
    const denom = Math.max(postKeywords.size, otherKeywords.size);
    const similarity = intersection / denom;
    if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
      scored.push({ post: other, similarity });
    }
  }
  return scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_DUPLICATE_CANDIDATES)
    .map((s) => s.post);
};

let lastModelCallAt = 0;

const throttleModelCall = async () => {
  const elapsed = Date.now() - lastModelCallAt;
  if (elapsed < MIN_MODEL_CALL_GAP_MS) {
    await sleep(MIN_MODEL_CALL_GAP_MS - elapsed);
  }
  lastModelCallAt = Date.now();
};

const MODEL_RETRY_DELAYS_MS = [60000, 120000, 240000];
// Cap on how long we'll honour a Retry-After header. GitHub Models can return
// values measured in tens of thousands of seconds (~daily quota reset). At
// that point there's no point sleeping inside the CI run — bail out so
// abort-on-3-failures shuts the run down cleanly and the next scheduled run
// picks up after the quota resets.
const MAX_HONOURED_RETRY_AFTER_MS = 5 * 60 * 1000;

// Allowlist of response headers whose VALUES are safe to log. These are
// quota/rate-limit signals only — anything that could leak infra topology,
// trace IDs, or session state is deliberately omitted.
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

let rateHeaderLogged = false;

const callModelWithRetry = async (body) => {
  let attempt = 0;
  for (;;) {
    await throttleModelCall();
    const res = await fetch(MODELS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body,
    });

    // Log quota/rate-limit headers once per run on the first response so we
    // can confirm whether 500s are quota-driven without spamming the log.
    if (!rateHeaderLogged) {
      log(`models headers: ${summariseRateHeaders(res.headers)}`);
      rateHeaderLogged = true;
    }
    if (res.ok) return res;

    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt >= MODEL_RETRY_DELAYS_MS.length) {
      const text = await res.text().catch(() => '');
      log(`models headers on final failure: ${summariseRateHeaders(res.headers)}`);
      throw new Error(`GitHub Models ${res.status}: ${text}`);
    }
    const retryAfterRaw = Number(res.headers.get('retry-after'));
    const retryAfterMs =
      Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? retryAfterRaw * 1000 : 0;
    // If the server demands a wait longer than our cap, treat it as a hard
    // failure rather than sleeping for hours inside the CI run. The
    // abort-on-3-failures logic in main() will then shut the run down cleanly
    // and the next scheduled run will pick up after the quota resets.
    if (retryAfterMs > MAX_HONOURED_RETRY_AFTER_MS) {
      const text = await res.text().catch(() => '');
      log(`models ${res.status} with retry-after=${retryAfterRaw}s exceeds ${Math.round(MAX_HONOURED_RETRY_AFTER_MS / 1000)}s cap — likely daily quota; giving up on this post`);
      log(`models headers on final failure: ${summariseRateHeaders(res.headers)}`);
      throw new Error(`GitHub Models ${res.status}: retry-after ${retryAfterRaw}s; ${text}`);
    }
    const wait = retryAfterMs > 0 ? retryAfterMs : MODEL_RETRY_DELAYS_MS[attempt];
    log(`models ${res.status}, retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${MODEL_RETRY_DELAYS_MS.length}) — ${summariseRateHeaders(res.headers)}`);
    await sleep(wait);
    attempt += 1;
  }
};

const judgeWithModel = async (post, candidates) => {
  const system =
    'You decide whether a feature request is already implemented by a merged pull request. ' +
    'Reply ONLY with compact JSON: {"status":"completed"|"not_done","confidence":"high"|"low","evidence_url":string,"quote":string}. ' +
    'Use status="completed" ONLY when one PR clearly delivers the requested behaviour. ' +
    'You MUST copy a verbatim phrase from that PR\'s title or body into "quote" that proves it. ' +
    'If you cannot quote a phrase that directly matches the request, return status="not_done".';

  const user = JSON.stringify({
    feature_request: {
      title: post.title,
      description: (post.description || '').slice(0, 1200),
    },
    candidates: candidates.map((c) => ({
      url: c.url,
      title: c.title,
      body: c.body,
    })),
  });

  const res = await callModelWithRetry(JSON.stringify({
    model: FIDER_TRIAGE_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }));
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    log(`#${post.number}: model output not JSON: ${raw.slice(0, 200)}`);
    return { status: 'not_done', confidence: 'low' };
  }

  // Verify the quote actually appears in one of the candidates we sent.
  const quote = (parsed.quote || '').toLowerCase().trim();
  const haystack = candidates.map((c) => `${c.title}\n${c.body}`.toLowerCase()).join('\n');
  if (parsed.status === 'completed' && (quote.length < 10 || !haystack.includes(quote))) {
    log(`#${post.number}: rejecting completed verdict — quote not found in candidates`);
    return { status: 'not_done', confidence: 'low' };
  }
  return parsed;
};

const judgePreExistingWithModel = async (post, candidates) => {
  const system =
    'You decide whether a feature request is ALREADY supported by an EXISTING feature that shipped BEFORE this request was filed. ' +
    'Reply ONLY with compact JSON: {"status":"pre_existing"|"not_supported","confidence":"high"|"low","evidence_url":string,"quote":string}. ' +
    'Use status="pre_existing" ONLY when one earlier PR clearly delivered exactly the behaviour the user is now asking for — i.e. the user simply may not know the feature exists. ' +
    'Be MORE conservative than for completion: if the existing behaviour is similar but not the specific ask, return status="not_supported". ' +
    'You MUST copy a verbatim phrase from that PR\'s title or body into "quote" that proves the existing feature does what is asked. ' +
    'If you cannot quote a phrase that directly matches the request, return status="not_supported".';

  const user = JSON.stringify({
    feature_request: {
      title: post.title,
      description: (post.description || '').slice(0, 1200),
    },
    earlier_candidates: candidates.map((c) => ({
      url: c.url,
      title: c.title,
      body: c.body,
    })),
  });

  const res = await callModelWithRetry(JSON.stringify({
    model: FIDER_TRIAGE_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }));
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    log(`#${post.number}: pre-existing-model output not JSON: ${raw.slice(0, 200)}`);
    return { status: 'not_supported', confidence: 'low' };
  }
  const quote = (parsed.quote || '').toLowerCase().trim();
  const haystack = candidates.map((c) => `${c.title}\n${c.body}`.toLowerCase()).join('\n');
  if (parsed.status === 'pre_existing' && (quote.length < 10 || !haystack.includes(quote))) {
    log(`#${post.number}: rejecting pre_existing verdict — quote not found in candidates`);
    return { status: 'not_supported', confidence: 'low' };
  }
  return parsed;
};

const judgeDuplicateWithModel = async (post, candidates) => {
  const system =
    'You decide whether a feature request is a duplicate of an EARLIER feature request from the same project. ' +
    'Reply ONLY with compact JSON: {"status":"duplicate"|"unique","confidence":"high"|"low","original_number":number,"quote":string}. ' +
    'Use status="duplicate" ONLY when one of the earlier candidates clearly asks for the same behaviour as the new request — not merely the same area of the product. ' +
    'Different requests that touch the same feature but ask for different behaviour are NOT duplicates. ' +
    'You MUST copy a verbatim phrase from the matching earlier candidate that proves the overlap, and set original_number to that candidate\'s number. ' +
    'If you cannot do both, return status="unique".';

  const user = JSON.stringify({
    new_request: {
      number: post.number,
      title: post.title,
      description: (post.description || '').slice(0, 1200),
    },
    earlier_candidates: candidates.map((c) => ({
      number: c.number,
      title: c.title,
      description: (c.description || '').slice(0, MAX_DUPLICATE_DESCRIPTION_CHARS),
    })),
  });

  const res = await callModelWithRetry(JSON.stringify({
    model: FIDER_TRIAGE_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }));
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    log(`#${post.number}: duplicate-model output not JSON: ${raw.slice(0, 200)}`);
    return { status: 'unique', confidence: 'low' };
  }

  // Defence against hallucination: the cited original must be in the
  // candidate list AND the quote must appear in its title/description.
  const original = candidates.find((c) => c.number === parsed.original_number);
  if (parsed.status === 'duplicate' && !original) {
    log(`#${post.number}: rejecting duplicate verdict — original_number not in candidates`);
    return { status: 'unique', confidence: 'low' };
  }
  if (parsed.status === 'duplicate') {
    const quote = (parsed.quote || '').toLowerCase().trim();
    const haystack = `${original.title}\n${original.description || ''}`.toLowerCase();
    if (quote.length < 10 || !haystack.includes(quote)) {
      log(`#${post.number}: rejecting duplicate verdict — quote not found in #${original.number}`);
      return { status: 'unique', confidence: 'low' };
    }
  }
  return parsed;
};

const triagePost = async (post, allOpen) => {
  // forceReeval ignores the triage-checked gate so we can re-run against
  // the latest PRs and posts; comment-marker idempotency still prevents
  // double-commenting and tag re-application is a no-op.
  if (!forceReeval && postHasTag(post, TAG_CHECKED)) {
    return { skipped: 'already-checked' };
  }
  const keywords = extractKeywords(post);
  if (keywords.length < 2) {
    await tagPost(post, TAG_CHECKED);
    return { skipped: 'too-few-keywords' };
  }

  // Step 1: PR-completion check.
  const candidates = filterCandidates(searchMergedPRs(keywords), post);
  let prVerdict = null;
  if (candidates.length > 0) {
    try {
      prVerdict = await judgeWithModel(post, candidates);
    } catch (err) {
      log(`#${post.number}: PR-completion model call failed, leaving untagged: ${err.message}`);
      return { error: err.message };
    }
  }
  if (prVerdict?.status === 'completed' && prVerdict.confidence === 'high') {
    await tagPost(post, TAG_POSSIBLY_COMPLETED);
    try {
      await commentOnPost(post, prVerdict, candidates);
    } catch (err) {
      log(`#${post.number}: completion comment failed (tag was applied): ${err.message}`);
    }
    await tagPost(post, TAG_CHECKED);
    return { verdict: prVerdict };
  }

  // Step 1b (opt-in): pre-existing-feature check. Only when CHECK_PRE_EXISTING
  // is true. Inverts the date filter to look at PRs merged BEFORE the FR was
  // filed — catches "user didn't know feature X already exists". Lower
  // precision than the post-creation completion check, hence opt-in and a
  // separate tag for maintainer review.
  if (checkPreExisting) {
    const preExistingCandidates = filterPreExistingCandidates(searchMergedPRs(keywords), post);
    let preVerdict = null;
    if (preExistingCandidates.length > 0) {
      try {
        preVerdict = await judgePreExistingWithModel(post, preExistingCandidates);
      } catch (err) {
        // Best-effort — don't fail the whole post on this optional step.
        log(`#${post.number}: pre-existing model call failed (continuing): ${err.message}`);
      }
    }
    if (preVerdict?.status === 'pre_existing' && preVerdict.confidence === 'high') {
      await tagPost(post, TAG_POSSIBLY_PRE_EXISTING);
      try {
        await commentOnPreExisting(post, preVerdict, preExistingCandidates);
      } catch (err) {
        log(`#${post.number}: pre-existing comment failed (tag was applied): ${err.message}`);
      }
      await tagPost(post, TAG_CHECKED);
      return { verdict: preVerdict };
    }
  }

  // Step 2: duplicate check, only if the post wasn't flagged as completed.
  const duplicateCandidates = findDuplicateCandidates(post, allOpen);
  let dupVerdict = null;
  if (duplicateCandidates.length > 0) {
    try {
      dupVerdict = await judgeDuplicateWithModel(post, duplicateCandidates);
    } catch (err) {
      // Duplicate detection is best-effort — don't error out the whole post
      // just because the second model call failed.
      log(`#${post.number}: duplicate model call failed (continuing): ${err.message}`);
    }
  }
  if (dupVerdict?.status === 'duplicate' && dupVerdict.confidence === 'high') {
    const original = duplicateCandidates.find((c) => c.number === dupVerdict.original_number);
    await tagPost(post, TAG_POSSIBLY_DUPLICATE);
    try {
      await commentOnDuplicate(post, dupVerdict, original);
    } catch (err) {
      log(`#${post.number}: duplicate comment failed (tag was applied): ${err.message}`);
    }
  }

  await tagPost(post, TAG_CHECKED);
  return { verdict: dupVerdict?.status === 'duplicate' ? dupVerdict : prVerdict };
};

const main = async () => {
  requireEnv();
  log(`dryRun=${dryRun} forceReeval=${forceReeval} checkPreExisting=${checkPreExisting} repo=${repo} model=${FIDER_TRIAGE_MODEL}`);
  await ensureTags();
  const allOpen = await fetchOpenPosts();
  // Drop already-processed posts BEFORE capping so the budget reaches new
  // posts instead of being eaten by the already-handled most-wanted backlog.
  // forceReeval (set by the monthly re-evaluation workflow) ignores the gate
  // so every post gets re-judged against the latest PRs and corpus.
  const queue = forceReeval ? allOpen : allOpen.filter((p) => !postHasTag(p, TAG_CHECKED));
  const posts = queue.slice(0, MAX_POSTS_PER_RUN);
  log(`fetched ${allOpen.length} open post(s); ${queue.length} eligible (forceReeval=${forceReeval}); processing up to ${posts.length}`);
  let completedCount = 0;
  let preExistingCount = 0;
  let duplicateCount = 0;
  let consecutiveModelFailures = 0;
  let aborted = false;
  for (const post of posts) {
    try {
      const result = await triagePost(post, allOpen);
      if (result.verdict?.status === 'completed' && result.verdict.confidence === 'high') {
        completedCount += 1;
        log(`#${post.number} '${post.title}' → possibly-completed: ${result.verdict.evidence_url}`);
        await notifyDiscord({
          webhookUrl: DISCORD_FIDER_BOT_WEBHOOK,
          pingRoleId: DISCORD_PING_ROLE_ID,
          log,
          host: FIDER_HOST,
          kind: 'possibly-completed',
          post,
          fields: { 'Cited PR': result.verdict.evidence_url, Quote: result.verdict.quote },
        });
        consecutiveModelFailures = 0;
      } else if (result.verdict?.status === 'pre_existing' && result.verdict.confidence === 'high') {
        preExistingCount += 1;
        log(`#${post.number} '${post.title}' → possibly-pre-existing: ${result.verdict.evidence_url}`);
        await notifyDiscord({
          webhookUrl: DISCORD_FIDER_BOT_WEBHOOK,
          pingRoleId: DISCORD_PING_ROLE_ID,
          log,
          host: FIDER_HOST,
          kind: 'possibly-pre-existing',
          post,
          fields: { 'Existing PR': result.verdict.evidence_url, Quote: result.verdict.quote },
        });
        consecutiveModelFailures = 0;
      } else if (result.verdict?.status === 'duplicate' && result.verdict.confidence === 'high') {
        duplicateCount += 1;
        log(`#${post.number} '${post.title}' → possibly-duplicate of #${result.verdict.original_number}`);
        await notifyDiscord({
          webhookUrl: DISCORD_FIDER_BOT_WEBHOOK,
          pingRoleId: DISCORD_PING_ROLE_ID,
          log,
          host: FIDER_HOST,
          kind: 'possibly-duplicate',
          post,
          fields: { 'Duplicate of': `#${result.verdict.original_number}`, Quote: result.verdict.quote },
        });
        consecutiveModelFailures = 0;
      } else if (result.skipped) {
        log(`#${post.number} '${post.title}' → skipped (${result.skipped})`);
        // Skips don't touch the model, so they don't reset the failure streak.
      } else if (result.error) {
        log(`#${post.number} '${post.title}' → error`);
        consecutiveModelFailures += 1;
        if (consecutiveModelFailures >= MAX_CONSECUTIVE_MODEL_FAILURES) {
          log(`aborting run: ${consecutiveModelFailures} consecutive model failures — likely API outage or quota exhausted. Remaining posts will be retried on the next scheduled run.`);
          aborted = true;
          break;
        }
      } else {
        log(`#${post.number} '${post.title}' → not_done`);
        consecutiveModelFailures = 0;
      }
    } catch (err) {
      log(`#${post.number} unexpected error: ${err.message}`);
    }
    await sleep(250);
  }
  log(`done${aborted ? ' (aborted early)' : ''}. flagged ${completedCount} possibly-completed, ${preExistingCount} possibly-pre-existing, ${duplicateCount} possibly-duplicate.`);
};

main().catch((err) => {
  log(`fatal: ${err.message}`);
  process.exit(1);
});
