#!/usr/bin/env node
/**
 * Applies the `plex`, `jellyfin` and `emby` labels to issues and pull requests.
 *
 * Runs on `issues`/`pull_request` open+edit so a report is labelled the moment it
 * lands, and on `workflow_dispatch` for a manual sweep. The dispatch path defaults
 * to a dry run, so a change to the rubric can be judged against real items before
 * it writes anything.
 *
 * Labelling is ADDITIVE. The bot never removes a label, because a maintainer who
 * corrects the bot must not have the bot correct them back on the next edit.
 * Low-confidence verdicts are reported and skipped rather than written.
 *
 * The model call is injected rather than imported at the point of use, so the
 * classifier can be exercised end to end without a key or a network.
 */
import { appendFileSync, readFileSync } from 'node:fs';

import { callModel, hasModelAccess } from './ai/model-client.mjs';

const {
  GITHUB_REPOSITORY = 'Maintainerr/Maintainerr',
  GITHUB_TOKEN,
  GH_TOKEN,
  GITHUB_EVENT_PATH,
  GITHUB_STEP_SUMMARY,
  ITEM_NUMBERS = '',
  DRY_RUN = 'false',
  MAX_ITEMS = '25',
  MEDIA_LABELER_MODEL,
} = process.env;

const token = GITHUB_TOKEN || GH_TOKEN || '';
const dryRun = DRY_RUN === 'true';
const log = (msg) => process.stderr.write(`[media-server-labeler] ${msg}\n`);

/** The only labels this tool may touch. Anything else on an item is left alone. */
export const MANAGED_LABELS = ['plex', 'jellyfin', 'emby'];

/** Confidence below this is reported but never written. */
const MIN_CONFIDENCE = 'medium';
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

/**
 * PRs from these accounts are dependency and translation churn. Their diffs sweep
 * every server's files without meaning anything, so they are skipped before the
 * model is ever asked.
 */
const SKIP_AUTHORS = new Set(['dependabot[bot]', 'hosted-weblate[bot]']);

// ---------------------------------------------------------------------------
// Evidence scan
//
// A mechanical pass over the FULL text, given to the model alongside the item.
// It exists because the decisive mention is often a single line buried in a
// pasted debug log, far past any sane truncation point.
// ---------------------------------------------------------------------------

const isWordChar = (c) =>
  c !== undefined && ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'));

const FAMILIES = [
  { key: 'plex', sub: ['plex'], word: ['pms'], adjacent: ['tautulli'] },
  { key: 'jellyfin', sub: ['jellyfin'], word: ['jf'], adjacent: ['streamystats'] },
  { key: 'emby', sub: ['emby'], word: [], adjacent: [] },
  { key: 'shared', sub: ['boxset', 'box set'], word: [], adjacent: [] },
];

/** Product names that contain a server-ish substring but are not that server. */
const DECOYS = ['jellyseerr', 'overseerr', 'plexseerr'];

const findAll = (hay, needle, wordBoundary) => {
  const out = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    const okLeft = !wordBoundary || !isWordChar(hay[i - 1]);
    const okRight = !wordBoundary || !isWordChar(hay[i + needle.length]);
    if (okLeft && okRight) out.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return out;
};

const lineAt = (text, idx) => {
  const start = text.lastIndexOf('\n', idx);
  const end = text.indexOf('\n', idx);
  return text.slice(start === -1 ? 0 : start + 1, end === -1 ? text.length : end).trim();
};

/**
 * The bug template ships `- Server: [e.g. Jellyfin/Plex]`. Left unfilled it names
 * two servers and means nothing, so it must never read as evidence for either.
 */
const isTemplateBoilerplate = (line) => {
  const l = line.toLowerCase();
  if (l.includes('e.g. jellyfin/plex')) return true;
  return l.includes('e.g.') && l.includes('server:');
};

export const buildEvidence = (title, body) => {
  const text = `${title}\n${body}`;
  const lower = text.toLowerCase();

  // Mask every character of a decoy so "jellyseerr" cannot register as jellyfin.
  const masked = new Set();
  for (const decoy of DECOYS) {
    for (const i of findAll(lower, decoy, false)) {
      for (let k = 0; k < decoy.length; k++) masked.add(i + k);
    }
  }

  const evidence = {};
  for (const family of FAMILIES) {
    const snippets = [];
    const seen = new Set();
    let count = 0;
    let boilerplateOnly = true;

    const scan = (terms, wordBoundary) => {
      for (const term of terms) {
        for (const i of findAll(lower, term, wordBoundary)) {
          if (masked.has(i)) continue;
          count++;
          const line = lineAt(text, i);
          const boilerplate = isTemplateBoilerplate(line);
          if (!boilerplate) boilerplateOnly = false;
          const clipped = line.length > 190 ? `${line.slice(0, 190)}…` : line;
          if (seen.has(clipped) || snippets.length >= 5) continue;
          seen.add(clipped);
          snippets.push(boilerplate ? `[UNFILLED TEMPLATE LINE] ${clipped}` : clipped);
        }
      }
    };

    scan(family.sub, false);
    scan(family.word, true);
    const beforeAdjacent = count;
    scan(family.adjacent, false);

    if (count > 0) {
      evidence[family.key] = {
        count,
        adjacentOnly: beforeAdjacent === 0,
        boilerplateOnly,
        snippets,
      };
    }
  }

  const decoyCount = DECOYS.reduce((sum, d) => sum + findAll(lower, d, false).length, 0);
  if (decoyCount > 0) evidence.seerrDecoys = decoyCount;
  return evidence;
};

// ---------------------------------------------------------------------------
// Changed files
// ---------------------------------------------------------------------------

const NOISE_SUFFIXES = ['.po', '.pot'];
const NOISE_BASENAMES = ['yarn.lock', 'package-lock.json', 'pnpm-lock.yaml'];
const MAX_FILES_SHOWN = 30;

export const summariseFiles = (filenames) => {
  if (!filenames || filenames.length === 0) return null;
  const kept = [];
  let localeFiles = 0;
  let lockFiles = 0;

  for (const file of filenames) {
    const base = file.slice(file.lastIndexOf('/') + 1);
    if (NOISE_SUFFIXES.some((s) => file.endsWith(s))) {
      localeFiles++;
      continue;
    }
    if (NOISE_BASENAMES.includes(base)) {
      lockFiles++;
      continue;
    }
    kept.push(file);
  }

  // A path naming a server is the strongest signal a PR carries, and the oldest
  // Plex-only code never says "Plex" in prose. Float these to the front so they
  // survive the cap.
  const hits = kept.filter((f) => {
    const l = f.toLowerCase();
    return l.includes('plex') || l.includes('jellyfin') || l.includes('emby');
  });
  const rest = kept.filter((f) => !hits.includes(f));
  const shown = [...hits, ...rest.slice(0, Math.max(0, MAX_FILES_SHOWN - hits.length))];

  return {
    total: filenames.length,
    shown,
    omitted: Math.max(0, kept.length - shown.length),
    localeFiles,
    lockFiles,
    serverPathHits: hits,
  };
};

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const MAX_BODY_CHARS = 2600;

const clipBody = (body) => {
  if (body.length <= MAX_BODY_CHARS) return body;
  const elided = body.length - MAX_BODY_CHARS;
  return `${body.slice(0, 2000)}\n\n[…${elided} chars elided…]\n\n${body.slice(-600)}`;
};

export const SYSTEM_PROMPT = `You label issues and pull requests in the Maintainerr repository.
Maintainerr maintains media libraries and integrates with THREE media servers - Plex,
Jellyfin and Emby - plus many services that are NOT media servers and never earn one of
these labels on their own: the *arrs (Radarr, Sonarr, Sportarr); Seerr; the watch-history
services Tautulli, Streamystats and Tracearr; the metadata providers TMDB and TVDB; the
qBittorrent download client; and the notification agents (Discord, Slack, Telegram, ntfy,
Gotify, Pushover, Pushbullet, LunaSea, email, generic webhooks).

Three labels are in play: plex, jellyfin, emby. An item may get zero, one, two or three.

Label a server when a maintainer triaging this item would have to look at that server's
integration or behaviour:
- the item concerns that server's API, client, or code path
- the bug happens on that server, or is caused by how that server behaves
- the change is scoped to that server or must be implemented per-server
- it is setup, configuration, authentication or connection trouble for that server
- the diff touches that server's files or its settings UI

Do NOT label a server that is only mentioned in passing: background colour on a bug
that is plainly in the rule engine, the scheduler, the UI or a migration; an unrelated
line inside a pasted log; a "supports Plex/Jellyfin/Emby" capability blurb; or the
unfilled template line marked [UNFILLED TEMPLATE LINE], which is worth nothing.

Return no labels when nothing points at a specific server. That is the correct and
common answer - most rule-engine, UI, docs, CI, dependency and *arr/Seerr work is
server-agnostic. Do not reach for a label to seem thorough.

Traps:
1. Seerr is not a media server. Jellyseerr and Overseerr are request managers; an item
   about Jellyseerr gets no jellyfin label unless Jellyfin itself is involved.
2. Tautulli is Plex-only and Streamystats is Jellyfin-only, so each hints at its server
   without proving it: an item purely about the Tautulli API is about Tautulli. These
   arrive flagged adjacentOnly. Tracearr is the one to watch - it is also a watch-history
   service, but it binds to whichever media server you run, so it hints at NONE of them.
3. "BoxSet" belongs to both Jellyfin and Emby, which share an API lineage, so it
   usually earns both labels unless the text pins it to one. It is never a Plex term.
4. Jellyfin and Emby share code paths here. Shared logic earns both; a fix guarded by
   an emby-only branch earns only emby.
5. Plex is the original backend. Jellyfin arrived in PR #2330 (Feb 2026) and Emby in
   PR #2911 (May 2026), and items are numbered in creation order, so a lower-numbered
   item cannot describe their integration behaviour - only a request for that support.
   An old item about "the media server" without naming one means Plex. This dates an
   item; it does not make every old item a Plex item, and server-agnostic work from
   that era still earns nothing.
6. A dependency bump earns a label only if the dependency is that server's SDK.
7. Release, translation and lockfile pull requests earn nothing, however wide the diff.
8. A bug seen on more than one server is usually server-agnostic. If it reproduces
   everywhere the reporter tried, the cause sits in shared code and it earns nothing.
   Label several servers when the item is scoped to them by design - "add X for Plex
   and Jellyfin" - not merely because a symptom showed up on more than one.
9. Jellyfin is a FORK of Emby, so a Jellyfin stack trace still names Emby internally -
   "Emby.Server.Implementations" in a pasted Jellyfin log is Jellyfin, not Emby. The
   same goes for a server named only inside a rule option string such as "Requested by
   user (Jellyfin, Emby, Plex or local username)", which is a list of choices, not a
   report about any of them.

The evidence block is a mechanical term scan of the full untruncated text. It is raw
input, never a verdict: a high count can still be background noise, and an empty block
can still be a Plex item.

Answer with one JSON object and nothing else:
{"labels":["jellyfin"],"confidence":"high","why":"one line naming the deciding evidence"}
confidence is high, medium or low. Never invent evidence that is not in the input.`;

export const buildUserPayload = (item) => ({
  number: item.number,
  type: item.type,
  title: item.title,
  body: clipBody(item.body || ''),
  existingLabels: item.existingLabels || [],
  evidence: buildEvidence(item.title || '', item.body || ''),
  ...(item.changedFiles ? { changedFiles: item.changedFiles } : {}),
});

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

/** Strip a ```json fence if the model wrapped its answer in one. */
const stripFence = (raw) => {
  let text = raw.trim();
  if (!text.startsWith('```')) return text;
  const firstNewline = text.indexOf('\n');
  if (firstNewline === -1) return text;
  text = text.slice(firstNewline + 1);
  const closing = text.lastIndexOf('```');
  return (closing === -1 ? text : text.slice(0, closing)).trim();
};

const NO_VERDICT = { labels: [], confidence: 'low', why: 'unparseable model output' };

export const parseVerdict = (raw) => {
  let parsed;
  try {
    parsed = JSON.parse(stripFence(raw || ''));
  } catch {
    return NO_VERDICT;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.labels)) return NO_VERDICT;

  // Anything outside the managed set is dropped rather than trusted - the model
  // does not get to invent a label that does not exist in the repository.
  const labels = [...new Set(parsed.labels)].filter((l) => MANAGED_LABELS.includes(l));
  const confidence = CONFIDENCE_RANK[parsed.confidence] === undefined ? 'low' : parsed.confidence;
  const why = typeof parsed.why === 'string' ? parsed.why : '';
  return { labels, confidence, why };
};

export const classifyItem = async (item, { call = callModel, model } = {}) => {
  const raw = await call(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(buildUserPayload(item)) },
    ],
    model ? { model } : {},
  );
  return parseVerdict(raw);
};

/**
 * What we would actually write. Additive only, confidence-gated, and never a label
 * the item already carries.
 */
export const planWrites = (item, verdict) => {
  const existing = new Set(item.existingLabels || []);
  const confident = CONFIDENCE_RANK[verdict.confidence] >= CONFIDENCE_RANK[MIN_CONFIDENCE];
  const add = confident ? verdict.labels.filter((l) => !existing.has(l)) : [];
  const withheld = confident ? [] : verdict.labels.filter((l) => !existing.has(l));
  return { add, withheld };
};

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

const ghApi = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(
      `GitHub ${init.method || 'GET'} ${path} → ${res.status}: ${await res.text().catch(() => '')}`,
    );
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const toItem = async (raw) => {
  const type = raw.pull_request || raw.head ? 'pr' : 'issue';
  const item = {
    number: raw.number,
    type,
    title: raw.title || '',
    body: raw.body || '',
    author: raw.user?.login || '',
    existingLabels: (raw.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
  };
  if (type === 'pr') {
    const files = await ghApi(
      `/repos/${GITHUB_REPOSITORY}/pulls/${raw.number}/files?per_page=100`,
    ).catch(() => []);
    const summary = summariseFiles((files || []).map((f) => f.filename));
    if (summary) item.changedFiles = summary;
  }
  return item;
};

/** Numbers to process: the triggering item, an explicit list, or an unlabelled sweep. */
const resolveNumbers = async () => {
  if (GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
      const number = event.issue?.number ?? event.pull_request?.number;
      if (number) return [number];
    } catch (err) {
      log(`could not read event payload: ${err.message}`);
    }
  }

  const explicit = ITEM_NUMBERS.split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (explicit.length) return explicit;

  const open = await ghApi(`/repos/${GITHUB_REPOSITORY}/issues?state=open&per_page=100`);
  return (open || [])
    .filter((raw) => !(raw.labels || []).some((l) => MANAGED_LABELS.includes(l.name)))
    .map((raw) => raw.number)
    .slice(0, Number(MAX_ITEMS) || 25);
};

const main = async () => {
  if (!token) {
    log('GITHUB_TOKEN is required');
    process.exit(1);
  }
  if (!hasModelAccess()) {
    log('AI_MODEL_API_KEY is not set; skipping (set it as a repository secret)');
    return;
  }

  const numbers = await resolveNumbers();
  if (!numbers.length) {
    log('nothing to label');
    return;
  }
  log(`${dryRun ? 'dry run over' : 'labelling'} ${numbers.length} item(s)`);

  const rows = [];
  for (const number of numbers) {
    let item;
    try {
      item = await toItem(await ghApi(`/repos/${GITHUB_REPOSITORY}/issues/${number}`));
    } catch (err) {
      log(`#${number}: could not read: ${err.message}`);
      continue;
    }

    if (item.type === 'pr' && SKIP_AUTHORS.has(item.author)) {
      log(`#${number}: skipped, ${item.author} pull request`);
      continue;
    }

    let verdict;
    try {
      verdict = await classifyItem(item, { model: MEDIA_LABELER_MODEL });
    } catch (err) {
      // One item failing to classify must not fail the run for the others.
      log(`#${number}: classification failed: ${err.message}`);
      continue;
    }

    const { add, withheld } = planWrites(item, verdict);
    rows.push({ number, type: item.type, verdict, add, withheld });

    if (add.length && !dryRun) {
      try {
        await ghApi(`/repos/${GITHUB_REPOSITORY}/issues/${number}/labels`, {
          method: 'POST',
          body: JSON.stringify({ labels: add }),
        });
      } catch (err) {
        log(`#${number}: could not add ${add.join(', ')}: ${err.message}`);
        continue;
      }
    }

    const outcome = add.length
      ? `${dryRun ? 'would add' : 'added'} ${add.join(', ')}`
      : withheld.length
        ? `withheld ${withheld.join(', ')} (low confidence)`
        : 'no labels';
    log(`#${number}: ${outcome} - ${verdict.why}`);
  }

  if (GITHUB_STEP_SUMMARY && rows.length) {
    const lines = [
      `### Media server labels${dryRun ? ' (dry run)' : ''}`,
      '',
      '| Item | Verdict | Confidence | Why |',
      '| --- | --- | --- | --- |',
      ...rows.map((r) => {
        const verdict = r.add.length
          ? r.add.join(', ')
          : r.withheld.length
            ? `_withheld: ${r.withheld.join(', ')}_`
            : '_none_';
        return `| #${r.number} | ${verdict} | ${r.verdict.confidence} | ${r.verdict.why.split('|').join('\\|')} |`;
      }),
    ];
    appendFileSync(GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
};

// Only run when invoked directly, so the classifier can be imported and tested.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    log(err.stack || err.message);
    process.exit(1);
  });
}
