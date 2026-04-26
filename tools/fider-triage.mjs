import { execFileSync } from 'node:child_process';
import {
  createFider,
  createModelCaller,
  ensureTags as ensureFiderTags,
  notifyDiscord,
  postHasTag,
  sleep,
} from './fider-shared.mjs';

const {
  FIDER_HOST,
  FIDER_API_KEY,
  GITHUB_TOKEN,
  GITHUB_REPOSITORY: repo,
  FIDER_TRIAGE_MODEL = 'openai/gpt-4o-mini',
  DRY_RUN = 'false',
  FORCE_REEVAL = 'false',
  CHECK_PRE_EXISTING = 'false',
  // Optional Discord webhook + role-ping. Empty = no chat notifications;
  // the Fider work still happens.
  DISCORD_FIDER_BOT_WEBHOOK = '',
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

const MAX_POSTS_PER_RUN = 100;
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
// If this many posts in a row exhaust the model retry budget, abort the run
// rather than burn ~7 min of CI per remaining post on a guaranteed-failing API.
const MAX_CONSECUTIVE_MODEL_FAILURES = 3;
// Small inter-post pause to keep the loop legible in logs; the model-call
// throttle in createModelCaller already paces traffic.
const POST_PROCESSING_GAP_MS = 250;

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

const requireEnv = () => {
  const missing = [];
  if (!FIDER_HOST) missing.push('FIDER_HOST');
  if (!FIDER_API_KEY) missing.push('FIDER_API_KEY');
  if (!GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
  if (!repo) missing.push('GITHUB_REPOSITORY');
  if (missing.length) throw new Error(`missing env: ${missing.join(', ')}`);
};

const fider = createFider({ host: FIDER_HOST, apiKey: FIDER_API_KEY });

const models = createModelCaller({
  endpoint: MODELS_ENDPOINT,
  token: GITHUB_TOKEN,
  log,
});

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
  // Use both views so neither voting nor recency biases which posts we see.
  // Terminal statuses (completed/declined/duplicate) are skipped so we don't
  // re-judge them.
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
const COMMENT_MARKERS = {
  completed: '<!-- maintainerr-fider-bot:completed -->',
  duplicate: '<!-- maintainerr-fider-bot:duplicate -->',
  preExisting: '<!-- maintainerr-fider-bot:pre-existing -->',
};

const findBotCommentOfType = async (post, marker) => {
  const comments = await fider(`/api/v1/posts/${post.number}/comments`);
  return (comments || []).find((c) => typeof c.content === 'string' && c.content.includes(marker)) || null;
};

// Post a new bot comment OR edit the existing one of the same type if its
// body has changed. Lets re-evaluation update stale evidence (e.g. pointing
// at a newer/better PR) instead of leaving the original verdict frozen.
const upsertBotComment = async (post, marker, content, label) => {
  const existing = await findBotCommentOfType(post, marker);
  if (!existing) {
    if (dryRun) {
      log(`[dry-run] would post comment on #${post.number}: ${label}`);
      return;
    }
    await fider(`/api/v1/posts/${post.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    log(`commented on #${post.number}: ${label}`);
    return;
  }
  if (existing.content === content) {
    log(`#${post.number}: ${label} unchanged, skipping`);
    return;
  }
  if (dryRun) {
    log(`[dry-run] would edit comment ${existing.id} on #${post.number}: ${label}`);
    return;
  }
  await fider(`/api/v1/posts/${post.number}/comments/${existing.id}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  log(`edited comment ${existing.id} on #${post.number}: ${label} (updated)`);
};

const buildBotComment = ({ header, quote, footer, marker }) => {
  const lines = [header, ''];
  const trimmed = (quote || '').trim();
  if (trimmed) {
    lines.push(`> ${trimmed.split('\n').join('\n> ')}`);
    lines.push('');
  }
  lines.push(footer, '', marker);
  return lines.join('\n');
};

const COMPLETED_FOOTER =
  '_Automated triage — please verify and mark this post as Completed if the PR delivers what was requested, or remove the `possibly-completed` tag if not._';
const DUPLICATE_FOOTER =
  '_Automated triage — please verify and either close as duplicate (with a link to the original) or remove the `possibly-duplicate` tag if these are distinct requests._';
const PRE_EXISTING_FOOTER =
  '_Automated triage — this is **lower confidence than `possibly-completed`** because the relevant code shipped before this request was filed, so the user may simply not have known the feature existed. A maintainer should verify and close as Completed (pointing at the docs/PR) or remove the `possibly-pre-existing` tag if the request asks for behaviour the existing feature does not provide._';

const commentOnPost = async (post, verdict, candidates) => {
  const candidate = candidates.find((c) => c.url === verdict.evidence_url);
  const merged = candidate?.mergedAt ? candidate.mergedAt.slice(0, 10) : 'recently';
  await upsertBotComment(
    post,
    COMMENT_MARKERS.completed,
    buildBotComment({
      header: `This request may already be implemented by ${verdict.evidence_url} (merged ${merged}).`,
      quote: verdict.quote,
      footer: COMPLETED_FOOTER,
      marker: COMMENT_MARKERS.completed,
    }),
    `cites ${verdict.evidence_url}`,
  );
};

const commentOnPreExisting = async (post, verdict, candidates) => {
  const candidate = candidates.find((c) => c.url === verdict.evidence_url);
  const merged = candidate?.mergedAt ? candidate.mergedAt.slice(0, 10) : 'before this request was filed';
  await upsertBotComment(
    post,
    COMMENT_MARKERS.preExisting,
    buildBotComment({
      header: `This may already be supported by an existing feature: ${verdict.evidence_url} (merged ${merged}).`,
      quote: verdict.quote,
      footer: PRE_EXISTING_FOOTER,
      marker: COMMENT_MARKERS.preExisting,
    }),
    `cites pre-existing ${verdict.evidence_url}`,
  );
};

const commentOnDuplicate = async (post, verdict, original) => {
  const filed = original.createdAt ? original.createdAt.slice(0, 10) : 'earlier';
  const url = `${FIDER_HOST.replace(/\/$/, '')}/posts/${original.number}/${original.slug || ''}`.replace(/\/$/, '');
  await upsertBotComment(
    post,
    COMMENT_MARKERS.duplicate,
    buildBotComment({
      header: `This may be a duplicate of #${original.number} ([${original.title}](${url}), filed ${filed}).`,
      quote: verdict.quote,
      footer: DUPLICATE_FOOTER,
      marker: COMMENT_MARKERS.duplicate,
    }),
    `flagged as duplicate of #${original.number}`,
  );
};

const extractKeywords = (post) => {
  const text = `${post.title || ''} ${(post.description || '').slice(0, 400)}`.toLowerCase();
  const counts = new Map();
  for (const tok of text.split(/[^a-z0-9]+/)) {
    if (tok.length < 4 || STOPWORDS.has(tok)) continue;
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
  // GitHub PR search AND's terms together, so multi-keyword queries miss real
  // matches. Search each keyword separately and union the results; downstream
  // filters and the LLM judge precision.
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
    try { parsed = JSON.parse(raw); } catch { continue; }
    for (const pr of parsed) if (!seen.has(pr.number)) seen.set(pr.number, pr);
  }
  return [...seen.values()];
};

// Shared filter for both the post-creation completion path and the
// pre-existing-feature path. `dateGate` decides which side of the FR's
// creation date a candidate must land on; `requireFeaturePrefix` is honoured
// only when the caller wants the strict precision-tuned gate (daily run for
// pre-existing). The post-creation completion path always requires it.
const filterPRs = ({ candidates, post, dateGate, requireFeaturePrefix }) => {
  const postCreatedAt = new Date(post.createdAt || 0).getTime();
  return candidates
    .filter((c) => dateGate(new Date(c.mergedAt || 0).getTime(), postCreatedAt))
    .filter((c) => !NON_FEATURE_PREFIX_RE.test(c.title || ''))
    .filter((c) => !requireFeaturePrefix || FEATURE_PREFIX_RE.test(c.title || ''))
    .slice(0, MAX_CANDIDATES)
    .map((c) => ({
      number: c.number,
      title: c.title,
      url: c.url,
      mergedAt: c.mergedAt,
      body: (c.body || '').slice(0, MAX_PR_BODY_CHARS),
    }));
};

// PRs merged AFTER the FR was filed are the only ones that can have
// implemented it. Always require the feat:/fix: prefix here — this path is
// tuned for precision.
const filterCandidates = (candidates, post) =>
  filterPRs({
    candidates,
    post,
    dateGate: (merged, filed) => merged > filed,
    requireFeaturePrefix: true,
  });

// Inverted variant for "user may not know this already exists": only consider
// PRs merged BEFORE the FR was filed. When forceReeval is true (monthly
// re-evaluation / manual full sweep), drop the prefix gate so foundational
// PRs that predate the feat:/fix: convention can surface as candidates. The
// model rubric is strict enough to keep precision; the daily run keeps the
// prefix gate for its tighter precision/cost target.
const filterPreExistingCandidates = (candidates, post) =>
  filterPRs({
    candidates,
    post,
    dateGate: (merged, filed) => merged > 0 && merged < filed,
    requireFeaturePrefix: !forceReeval,
  });

const findDuplicateCandidates = (post, allPosts) => {
  const postKeywords = new Set(extractKeywords(post));
  if (postKeywords.size < 2) return [];
  const postCreatedAt = new Date(post.createdAt || 0).getTime();
  const scored = [];
  for (const other of allPosts) {
    if (other.number === post.number) continue;
    // The duplicate is the NEWER post; the original must predate it.
    if (new Date(other.createdAt || 0).getTime() >= postCreatedAt) continue;
    const otherKeywords = new Set(extractKeywords(other));
    if (otherKeywords.size === 0) continue;
    let intersection = 0;
    for (const kw of postKeywords) if (otherKeywords.has(kw)) intersection += 1;
    const similarity = intersection / Math.max(postKeywords.size, otherKeywords.size);
    if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) scored.push({ post: other, similarity });
  }
  return scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_DUPLICATE_CANDIDATES)
    .map((s) => s.post);
};

// Generic judge runner: send the system+user prompts, parse JSON, and let the
// caller validate the verdict. `defaultVerdict` is what we return on parse
// failure or validation rejection. Returns the validated verdict.
const runJudge = async ({ post, system, userPayload, defaultVerdict, validate, label }) => {
  const res = await models.call(JSON.stringify({
    model: FIDER_TRIAGE_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
  }));
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch {
    log(`#${post.number}: ${label} output not JSON: ${raw.slice(0, 200)}`);
    return defaultVerdict;
  }
  return validate(parsed) ?? defaultVerdict;
};

// Helper — true when the model's quote is ≥10 chars and appears verbatim
// (case-insensitively) somewhere in the candidate haystack.
const quoteFoundIn = (verdict, haystack) => {
  const quote = (verdict.quote || '').toLowerCase().trim();
  return quote.length >= 10 && haystack.includes(quote);
};

const candidatesHaystack = (candidates) =>
  candidates.map((c) => `${c.title}\n${c.body || ''}`.toLowerCase()).join('\n');

const judgeWithModel = (post, candidates) =>
  runJudge({
    post,
    label: 'PR-completion',
    system:
      'You decide whether a feature request is already implemented by a merged pull request. ' +
      'Reply ONLY with compact JSON: {"status":"completed"|"not_done","confidence":"high"|"low","evidence_url":string,"quote":string}. ' +
      'Use status="completed" ONLY when one PR clearly delivers the requested behaviour. ' +
      'You MUST copy a verbatim phrase from that PR\'s title or body into "quote" that proves it. ' +
      'If you cannot quote a phrase that directly matches the request, return status="not_done".',
    userPayload: {
      feature_request: { title: post.title, description: (post.description || '').slice(0, 1200) },
      candidates: candidates.map((c) => ({ url: c.url, title: c.title, body: c.body })),
    },
    defaultVerdict: { status: 'not_done', confidence: 'low' },
    validate: (parsed) => {
      if (parsed.status === 'completed' && !quoteFoundIn(parsed, candidatesHaystack(candidates))) {
        log(`#${post.number}: rejecting completed verdict — quote not found in candidates`);
        return { status: 'not_done', confidence: 'low' };
      }
      return parsed;
    },
  });

const judgePreExistingWithModel = (post, candidates) =>
  runJudge({
    post,
    label: 'pre-existing-model',
    system:
      'You decide whether a feature request is ALREADY supported by an EXISTING feature that shipped BEFORE this request was filed. ' +
      'Reply ONLY with compact JSON: {"status":"pre_existing"|"not_supported","confidence":"high"|"low","evidence_url":string,"quote":string}. ' +
      'Use status="pre_existing" ONLY when one earlier PR clearly delivered exactly the behaviour the user is now asking for — i.e. the user simply may not know the feature exists. ' +
      'Be MORE conservative than for completion: if the existing behaviour is similar but not the specific ask, return status="not_supported". ' +
      'You MUST copy a verbatim phrase from that PR\'s title or body into "quote" that proves the existing feature does what is asked. ' +
      'If you cannot quote a phrase that directly matches the request, return status="not_supported".',
    userPayload: {
      feature_request: { title: post.title, description: (post.description || '').slice(0, 1200) },
      earlier_candidates: candidates.map((c) => ({ url: c.url, title: c.title, body: c.body })),
    },
    defaultVerdict: { status: 'not_supported', confidence: 'low' },
    validate: (parsed) => {
      if (parsed.status === 'pre_existing' && !quoteFoundIn(parsed, candidatesHaystack(candidates))) {
        log(`#${post.number}: rejecting pre_existing verdict — quote not found in candidates`);
        return { status: 'not_supported', confidence: 'low' };
      }
      return parsed;
    },
  });

const judgeDuplicateWithModel = (post, candidates) =>
  runJudge({
    post,
    label: 'duplicate-model',
    system:
      'You decide whether a feature request is a duplicate of an EARLIER feature request from the same project. ' +
      'Reply ONLY with compact JSON: {"status":"duplicate"|"unique","confidence":"high"|"low","original_number":number,"quote":string}. ' +
      'Use status="duplicate" ONLY when one of the earlier candidates clearly asks for the same behaviour as the new request — not merely the same area of the product. ' +
      'Different requests that touch the same feature but ask for different behaviour are NOT duplicates. ' +
      'You MUST copy a verbatim phrase from the matching earlier candidate that proves the overlap, and set original_number to that candidate\'s number. ' +
      'If you cannot do both, return status="unique".',
    userPayload: {
      new_request: { number: post.number, title: post.title, description: (post.description || '').slice(0, 1200) },
      earlier_candidates: candidates.map((c) => ({
        number: c.number,
        title: c.title,
        description: (c.description || '').slice(0, MAX_DUPLICATE_DESCRIPTION_CHARS),
      })),
    },
    defaultVerdict: { status: 'unique', confidence: 'low' },
    validate: (parsed) => {
      if (parsed.status !== 'duplicate') return parsed;
      // Defence against hallucination: the cited original must be in the
      // candidate list AND the quote must appear in its title/description.
      const original = candidates.find((c) => c.number === parsed.original_number);
      if (!original) {
        log(`#${post.number}: rejecting duplicate verdict — original_number not in candidates`);
        return { status: 'unique', confidence: 'low' };
      }
      const haystack = `${original.title}\n${original.description || ''}`.toLowerCase();
      if (!quoteFoundIn(parsed, haystack)) {
        log(`#${post.number}: rejecting duplicate verdict — quote not found in #${original.number}`);
        return { status: 'unique', confidence: 'low' };
      }
      return parsed;
    },
  });

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
      // Budget-exhausted is a hard stop — let it propagate so main()
      // aborts cleanly with the deferred-posts log instead of treating it
      // as a per-post failure.
      if (err instanceof models.BudgetExhaustedError) throw err;
      log(`#${post.number}: PR-completion model call failed, leaving untagged: ${err.message}`);
      return { error: err.message };
    }
  }
  if (prVerdict?.status === 'completed' && prVerdict.confidence === 'high') {
    await tagPost(post, TAG_POSSIBLY_COMPLETED);
    try { await commentOnPost(post, prVerdict, candidates); }
    catch (err) { log(`#${post.number}: completion comment failed (tag was applied): ${err.message}`); }
    await tagPost(post, TAG_CHECKED);
    return { verdict: prVerdict };
  }

  // Step 1b (opt-in): pre-existing-feature check. Inverts the date filter to
  // look at PRs merged BEFORE the FR was filed — catches "user didn't know
  // feature X already exists". Lower precision than the post-creation
  // completion check, hence opt-in and a separate tag for maintainer review.
  if (checkPreExisting) {
    const preExistingCandidates = filterPreExistingCandidates(searchMergedPRs(keywords), post);
    let preVerdict = null;
    if (preExistingCandidates.length > 0) {
      try {
        preVerdict = await judgePreExistingWithModel(post, preExistingCandidates);
      } catch (err) {
        // Budget-exhausted propagates; transient failures are best-effort.
        if (err instanceof models.BudgetExhaustedError) throw err;
        log(`#${post.number}: pre-existing model call failed (continuing): ${err.message}`);
      }
    }
    if (preVerdict?.status === 'pre_existing' && preVerdict.confidence === 'high') {
      await tagPost(post, TAG_POSSIBLY_PRE_EXISTING);
      try { await commentOnPreExisting(post, preVerdict, preExistingCandidates); }
      catch (err) { log(`#${post.number}: pre-existing comment failed (tag was applied): ${err.message}`); }
      await tagPost(post, TAG_CHECKED);
      return { verdict: preVerdict };
    }
  }

  // Step 2: duplicate check.
  const duplicateCandidates = findDuplicateCandidates(post, allOpen);
  let dupVerdict = null;
  if (duplicateCandidates.length > 0) {
    try {
      dupVerdict = await judgeDuplicateWithModel(post, duplicateCandidates);
    } catch (err) {
      // Budget-exhausted propagates; transient failures are best-effort.
      if (err instanceof models.BudgetExhaustedError) throw err;
      log(`#${post.number}: duplicate model call failed (continuing): ${err.message}`);
    }
  }
  if (dupVerdict?.status === 'duplicate' && dupVerdict.confidence === 'high') {
    const original = duplicateCandidates.find((c) => c.number === dupVerdict.original_number);
    await tagPost(post, TAG_POSSIBLY_DUPLICATE);
    try { await commentOnDuplicate(post, dupVerdict, original); }
    catch (err) { log(`#${post.number}: duplicate comment failed (tag was applied): ${err.message}`); }
  }

  await tagPost(post, TAG_CHECKED);
  return { verdict: dupVerdict?.status === 'duplicate' ? dupVerdict : prVerdict };
};

// Verdict → notification fan-out config. Centralises the post-loop branching
// so the main loop is just "find the matching kind, count, notify".
const VERDICT_NOTIFICATIONS = [
  {
    match: (v) => v?.status === 'completed' && v.confidence === 'high',
    counter: 'completed',
    kind: 'possibly-completed',
    logSuffix: (v) => `: ${v.evidence_url}`,
    fields: (v) => ({ 'Cited PR': v.evidence_url, Quote: v.quote }),
  },
  {
    match: (v) => v?.status === 'pre_existing' && v.confidence === 'high',
    counter: 'preExisting',
    kind: 'possibly-pre-existing',
    logSuffix: (v) => `: ${v.evidence_url}`,
    fields: (v) => ({ 'Existing PR': v.evidence_url, Quote: v.quote }),
  },
  {
    match: (v) => v?.status === 'duplicate' && v.confidence === 'high',
    counter: 'duplicate',
    kind: 'possibly-duplicate',
    logSuffix: (v) => ` of #${v.original_number}`,
    fields: (v) => ({ 'Duplicate of': `#${v.original_number}`, Quote: v.quote }),
  },
];

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

  const counts = { completed: 0, preExisting: 0, duplicate: 0 };
  let consecutiveModelFailures = 0;
  let aborted = false;

  for (const post of posts) {
    try {
      const result = await triagePost(post, allOpen);
      const match = VERDICT_NOTIFICATIONS.find((n) => n.match(result.verdict));
      if (match) {
        counts[match.counter] += 1;
        log(`#${post.number} '${post.title}' → ${match.kind}${match.logSuffix(result.verdict)}`);
        await notifyDiscord({
          webhookUrl: DISCORD_FIDER_BOT_WEBHOOK,
          pingRoleId: DISCORD_PING_ROLE_ID,
          log,
          host: FIDER_HOST,
          kind: match.kind,
          post,
          fields: match.fields(result.verdict),
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
      if (err instanceof models.BudgetExhaustedError) {
        const handled = counts.completed + counts.preExisting + counts.duplicate;
        log(`aborting run: model-call budget exhausted. ${posts.length - handled} post(s) deferred to the next run.`);
        aborted = true;
        break;
      }
      log(`#${post.number} unexpected error: ${err.message}`);
    }
    await sleep(POST_PROCESSING_GAP_MS);
  }

  log(`done${aborted ? ' (aborted early)' : ''}. used ${models.count} model call(s). flagged ${counts.completed} possibly-completed, ${counts.preExisting} possibly-pre-existing, ${counts.duplicate} possibly-duplicate.`);
};

main().catch((err) => {
  log(`fatal: ${err.message}`);
  process.exit(1);
});
