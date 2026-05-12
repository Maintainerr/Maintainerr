// One-off mirror: copy open GitHub issues labelled `enhancement` (excluding
// any authored by a CODEOWNER, so internal refactors stay on GitHub) to the
// public Fider feature board, then close the GitHub issue with a comment
// linking to the new Fider post.
//
// Run via:
//   FIDER_HOST=... FIDER_API_KEY=... GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo \
//   DRY_RUN=true node tools/fider-mirror-enhancements.mjs
//
// Defaults to dry-run. Set DRY_RUN=false to actually create posts and close
// issues. Idempotent: each Fider post embeds an HTML-comment marker tying it
// back to the source issue, so re-runs skip anything already mirrored — even
// if the GitHub issue was reopened in the meantime.

import { readFileSync } from 'node:fs';
import { createFider } from './fider-shared.mjs';

const {
  FIDER_HOST,
  FIDER_API_KEY,
  GITHUB_TOKEN,
  GITHUB_REPOSITORY,
  DRY_RUN = 'true',
  CODEOWNERS_PATH = '.github/CODEOWNERS',
  FIDER_FETCH_LIMIT = '500',
} = process.env;

const dryRun = DRY_RUN !== 'false';
const log = (msg) => process.stderr.write(`[fider-mirror] ${msg}\n`);

const requireEnv = () => {
  const missing = [];
  if (!FIDER_HOST) missing.push('FIDER_HOST');
  if (!FIDER_API_KEY) missing.push('FIDER_API_KEY');
  if (!GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
  if (!GITHUB_REPOSITORY) missing.push('GITHUB_REPOSITORY');
  if (missing.length) throw new Error(`missing env: ${missing.join(', ')}`);
};

const fider = createFider({ host: FIDER_HOST, apiKey: FIDER_API_KEY });
const fiderBase = (FIDER_HOST || '').replace(/\/$/, '');

const ghApi = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${init.method || 'GET'} ${path} → ${res.status}: ${await res.text().catch(() => '')}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

// Same parser as fider-invite-codeowners.mjs — kept inline rather than shared
// because this is a one-off and shouldn't add surface area to fider-shared.
const parseCodeowners = () => {
  const text = readFileSync(CODEOWNERS_PATH, 'utf8');
  const users = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    for (const match of line.matchAll(/@([a-zA-Z0-9][a-zA-Z0-9-]{0,38})\b(?!\/)/g)) {
      users.add(match[1].toLowerCase());
    }
  }
  return users;
};

// Marker is the source-of-truth for "is this issue already mirrored?". HTML
// comment so it's invisible in Fider's rendered Markdown but cheap to grep
// from the post description across re-runs.
const markerFor = (issueRef) => `<!-- maintainerr-fider-bot:gh-issue=${issueRef} -->`;
const MARKER_PREFIX = '<!-- maintainerr-fider-bot:gh-issue=';

// Collect every Fider post (any status), across both views, so we don't
// recreate posts that were previously declined or marked duplicate. Build a
// set of `owner/repo#N` references already present in any post description.
const fetchMirroredIssueRefs = async () => {
  const seen = new Set();
  for (const view of ['most-wanted', 'recent']) {
    const posts = await fider(`/api/v1/posts?view=${view}&limit=${FIDER_FETCH_LIMIT}`);
    for (const p of posts || []) {
      const desc = p.description || '';
      let idx = desc.indexOf(MARKER_PREFIX);
      while (idx !== -1) {
        const end = desc.indexOf(' -->', idx);
        if (end === -1) break;
        seen.add(desc.slice(idx + MARKER_PREFIX.length, end).trim());
        idx = desc.indexOf(MARKER_PREFIX, end);
      }
    }
  }
  return seen;
};

// GitHub's /issues endpoint returns PRs too; the `pull_request` field
// distinguishes them. Paginate until we've drained the label.
const fetchOpenEnhancementIssues = async () => {
  const out = [];
  for (let page = 1; ; page += 1) {
    const batch = await ghApi(
      `/repos/${GITHUB_REPOSITORY}/issues?state=open&labels=enhancement&per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const issue of batch) {
      if (issue.pull_request) continue;
      out.push(issue);
    }
    if (batch.length < 100) break;
  }
  return out;
};

const buildFiderDescription = (issue) => {
  const author = issue.user?.login || 'unknown';
  const issueRef = `${GITHUB_REPOSITORY}#${issue.number}`;
  const header = `Originally requested by @${author} on GitHub: ${issue.html_url}`;
  const body = (issue.body || '').trim();
  return `${header}\n\n${body}\n\n${markerFor(issueRef)}`.trim();
};

const buildClosingComment = (fiderUrl) =>
  `Thanks for the request! Feature ideas now live on the Maintainerr feature board, which is the proper place for them:\n\n${fiderUrl}\n\nHead over to follow progress, vote, and join the discussion — community votes help us prioritise what to build next. Closing here; this request continues on Fider.`;

const mirrorOne = async (issue) => {
  const issueRef = `${GITHUB_REPOSITORY}#${issue.number}`;
  const description = buildFiderDescription(issue);

  if (dryRun) {
    log(`[dry-run] would mirror ${issueRef} '${issue.title}' (author=@${issue.user?.login})`);
    return { ok: true, dryRun: true };
  }

  const created = await fider('/api/v1/posts', {
    method: 'POST',
    body: JSON.stringify({ title: issue.title, description }),
  });
  // Fider returns at minimum { id }; some versions also include number/slug.
  // Fall through gracefully — `/posts/N` redirects to the canonical URL so an
  // empty slug is fine.
  const postNumber = created?.number ?? created?.id;
  if (!postNumber) {
    throw new Error(`Fider POST /api/v1/posts returned no usable id: ${JSON.stringify(created)}`);
  }
  const slugSegment = created?.slug ? `/${created.slug}` : '';
  const fiderUrl = `${fiderBase}/posts/${postNumber}${slugSegment}`;
  log(`created Fider post ${postNumber} for ${issueRef} → ${fiderUrl}`);

  await ghApi(`/repos/${GITHUB_REPOSITORY}/issues/${issue.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: buildClosingComment(fiderUrl) }),
  });
  await ghApi(`/repos/${GITHUB_REPOSITORY}/issues/${issue.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  });
  log(`closed ${issueRef} with link to Fider post ${postNumber}`);
  return { ok: true, fiderUrl };
};

const main = async () => {
  requireEnv();
  log(`dryRun=${dryRun} repo=${GITHUB_REPOSITORY} fider=${fiderBase}`);

  const maintainers = parseCodeowners();
  log(`maintainers excluded by author filter: ${[...maintainers].join(', ') || '(none)'}`);

  const mirroredRefs = await fetchMirroredIssueRefs();
  log(`Fider already has ${mirroredRefs.size} mirrored issue reference(s)`);

  const issues = await fetchOpenEnhancementIssues();
  log(`fetched ${issues.length} open enhancement issue(s) from GitHub`);

  const candidates = [];
  const skipped = { maintainerAuthored: 0, alreadyMirrored: 0 };
  for (const issue of issues) {
    const author = (issue.user?.login || '').toLowerCase();
    if (maintainers.has(author)) {
      skipped.maintainerAuthored += 1;
      continue;
    }
    if (mirroredRefs.has(`${GITHUB_REPOSITORY}#${issue.number}`)) {
      skipped.alreadyMirrored += 1;
      continue;
    }
    candidates.push(issue);
  }
  log(`skipped: ${skipped.maintainerAuthored} maintainer-authored, ${skipped.alreadyMirrored} already mirrored`);
  log(`will process ${candidates.length} issue(s)`);

  let succeeded = 0;
  const failures = [];
  for (const issue of candidates) {
    try {
      await mirrorOne(issue);
      succeeded += 1;
    } catch (err) {
      failures.push({ number: issue.number, message: err.message });
      log(`FAILED #${issue.number}: ${err.message}`);
    }
  }

  log(`done: ${succeeded}/${candidates.length} processed (${dryRun ? 'dry-run' : 'apply'})`);
  if (failures.length > 0) {
    log(`failures: ${failures.map((f) => `#${f.number}`).join(', ')}`);
    process.exitCode = 1;
  }
};

main().catch((err) => {
  log(`fatal: ${err.message}`);
  process.exit(1);
});
