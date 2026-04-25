import { execFileSync } from 'node:child_process';

const {
  FIDER_HOST,
  FIDER_API_KEY,
  GITHUB_TOKEN,
  GITHUB_REPOSITORY: repo,
  FIDER_TRIAGE_MODEL = 'openai/gpt-4o-mini',
  DRY_RUN = 'false',
} = process.env;

const dryRun = DRY_RUN === 'true';
const MODELS_ENDPOINT = 'https://models.github.ai/inference/chat/completions';

const TAG_CHECKED = 'triage-checked';
const TAG_POSSIBLY_COMPLETED = 'possibly-completed';

const MAX_POSTS_PER_RUN = 25;
const MAX_CANDIDATES = 3;
const MAX_PR_BODY_CHARS = 500;
const MAX_KEYWORDS = 6;

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

const fider = async (path, init = {}) => {
  const url = `${FIDER_HOST.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${FIDER_API_KEY}`,
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
  return res.json();
};

const ensureTags = async () => {
  const existing = await fider('/api/v1/tags');
  const slugs = new Set((existing || []).map((t) => t.slug));
  const wanted = [
    { slug: TAG_CHECKED, name: TAG_CHECKED, color: '7f8c8d', isPublic: false },
    { slug: TAG_POSSIBLY_COMPLETED, name: TAG_POSSIBLY_COMPLETED, color: 'f39c12', isPublic: false },
  ];
  for (const tag of wanted) {
    if (slugs.has(tag.slug)) continue;
    if (dryRun) {
      log(`[dry-run] would create tag '${tag.slug}'`);
      continue;
    }
    await fider('/api/v1/tags', {
      method: 'POST',
      body: JSON.stringify({ name: tag.name, color: tag.color, isPublic: tag.isPublic }),
    });
    log(`created tag '${tag.slug}'`);
  }
};

const fetchOpenPosts = async () => {
  // Fider statuses we care about: 0=open, 1=planned, 2=started.
  // "completed" / "declined" / "duplicate" are terminal — skip them.
  const all = [];
  for (const view of ['most-wanted', 'most-recent']) {
    const posts = await fider(`/api/v1/posts?view=${view}&limit=50`);
    for (const p of posts || []) {
      if (![0, 1, 2].includes(p.status)) continue;
      if (!all.find((x) => x.number === p.number)) all.push(p);
    }
  }
  return all;
};

const postHasTag = (post, slug) =>
  Array.isArray(post.tags) && post.tags.some((t) => (typeof t === 'string' ? t === slug : t.slug === slug));

const tagPost = async (post, slug) => {
  if (dryRun) {
    log(`[dry-run] would tag #${post.number} '${post.title}' with '${slug}'`);
    return;
  }
  await fider(`/api/v1/posts/${post.number}/tags/${slug}`, { method: 'POST' });
  log(`tagged #${post.number} '${slug}'`);
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
  // Quote each keyword so gh treats them as required terms.
  const query = keywords.map((k) => `"${k}"`).join(' ');
  const raw = runGh([
    'pr', 'list',
    '--repo', repo,
    '--state', 'merged',
    '--search', query,
    '--limit', '10',
    '--json', 'number,title,url,body,mergedAt,labels',
  ]);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
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

  const res = await fetch(MODELS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      model: FIDER_TRIAGE_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub Models ${res.status}: ${await res.text().catch(() => '')}`);
  }
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

const triagePost = async (post) => {
  if (postHasTag(post, TAG_CHECKED)) {
    return { skipped: 'already-checked' };
  }
  const keywords = extractKeywords(post);
  if (keywords.length < 2) {
    await tagPost(post, TAG_CHECKED);
    return { skipped: 'too-few-keywords' };
  }
  const raw = searchMergedPRs(keywords);
  const candidates = filterCandidates(raw, post);
  if (candidates.length === 0) {
    await tagPost(post, TAG_CHECKED);
    return { skipped: 'no-candidates' };
  }
  let verdict;
  try {
    verdict = await judgeWithModel(post, candidates);
  } catch (err) {
    log(`#${post.number}: model call failed, leaving untagged: ${err.message}`);
    return { error: err.message };
  }
  if (verdict.status === 'completed' && verdict.confidence === 'high') {
    await tagPost(post, TAG_POSSIBLY_COMPLETED);
  }
  await tagPost(post, TAG_CHECKED);
  return { verdict };
};

const main = async () => {
  requireEnv();
  log(`dryRun=${dryRun} repo=${repo} model=${FIDER_TRIAGE_MODEL}`);
  await ensureTags();
  const posts = (await fetchOpenPosts()).slice(0, MAX_POSTS_PER_RUN);
  log(`processing ${posts.length} open post(s)`);
  let completedCount = 0;
  for (const post of posts) {
    try {
      const result = await triagePost(post);
      if (result.verdict?.status === 'completed' && result.verdict.confidence === 'high') {
        completedCount += 1;
        log(`#${post.number} '${post.title}' → possibly-completed: ${result.verdict.evidence_url}`);
      } else if (result.skipped) {
        log(`#${post.number} '${post.title}' → skipped (${result.skipped})`);
      } else if (result.error) {
        log(`#${post.number} '${post.title}' → error`);
      } else {
        log(`#${post.number} '${post.title}' → not_done`);
      }
    } catch (err) {
      log(`#${post.number} unexpected error: ${err.message}`);
    }
    await sleep(250);
  }
  log(`done. flagged ${completedCount} post(s) as possibly-completed.`);
};

main().catch((err) => {
  log(`fatal: ${err.message}`);
  process.exit(1);
});
