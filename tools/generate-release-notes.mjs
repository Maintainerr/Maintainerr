import { execFileSync } from 'node:child_process';

const MAX_COMMITS = 300;
const MAX_PROMPT_CHARS = 24000;
const MAX_MIGRATION_CHARS = 3000;
const MAX_MIGRATIONS_TOTAL_CHARS = 12000;
const MAX_PR_BODY_CHARS = 400;
const MAX_ORPHAN_BODY_CHARS = 300;
const MIGRATION_PATH_PREFIX = 'apps/server/src/database/migrations/';
const MODELS_ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const DEP_SUBJECT_RE = /^build\(deps(?:-dev)?\):/i;
const CHORE_SUBJECT_RE = /^chore(?:\([^)]*\))?!?:/i;
const SYNC_SUBJECT_RE = /^chore:\s*sync\s+development\s+to\s+main/i;
const DEP_PKG_RE = /bump\s+([^\s]+)/i;

const REC_SEP = String.fromCharCode(0x1e);
const FIELD_SEP = String.fromCharCode(0x1f);
const TRAILER_RE = /^(co-authored-by|signed-off-by|reviewed-by|acked-by|reported-by):/i;

const {
  LAST_RELEASE_GITTAG: lastTag = '',
  NEXT_RELEASE_VERSION: nextVersion = '',
  NEXT_RELEASE_GITHEAD: nextHead = 'HEAD',
  GITHUB_REPOSITORY: repo = '',
  GITHUB_TOKEN,
  GH_TOKEN,
  RELEASE_NOTES_MODEL = 'openai/gpt-4o',
} = process.env;

const modelToken = GITHUB_TOKEN || GH_TOKEN || '';

const log = (msg) => process.stderr.write(`[release-notes] ${msg}\n`);

const runGit = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

const runGh = (args) => {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return '';
  }
};

const resolveLastTag = () => {
  if (lastTag) return lastTag;
  try {
    const tag = runGit(['describe', '--tags', '--abbrev=0', nextHead]).trim();
    if (tag) {
      log(`LAST_RELEASE_GITTAG not provided; using ${tag} from git describe`);
      return tag;
    }
  } catch {
    log('no prior tag found; range will walk full history (capped by MAX_COMMITS)');
  }
  return '';
};

const effectiveLastTag = resolveLastTag();
const range = effectiveLastTag ? `${effectiveLastTag}..${nextHead}` : nextHead;

const cleanCommitBody = (raw) => {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !TRAILER_RE.test(line.trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseCommits = () => {
  const raw = runGit([
    'log',
    range,
    `--format=%s${FIELD_SEP}%b${REC_SEP}`,
    '--no-merges',
    '-n',
    String(MAX_COMMITS),
  ]);
  return raw
    .split(REC_SEP)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject, body = ''] = entry.split(FIELD_SEP);
      const prMatch = subject.match(/\(#(\d+)\)\s*$/);
      const cleanedBody = cleanCommitBody(body);
      return {
        subject,
        pr: prMatch ? Number(prMatch[1]) : null,
        cleanSubject: subject.replace(/\s*\(#\d+\)\s*$/, ''),
        body:
          cleanedBody.length > MAX_ORPHAN_BODY_CHARS
            ? `${cleanedBody.slice(0, MAX_ORPHAN_BODY_CHARS)}…`
            : cleanedBody,
      };
    });
};

const changedFiles = () => {
  try {
    return runGit(['diff', '--name-only', range]).split('\n').filter(Boolean);
  } catch {
    return [];
  }
};

const readMigrationContents = (migrationPaths) => {
  const out = [];
  let total = 0;
  for (const path of migrationPaths) {
    try {
      const content = runGit(['show', `${nextHead}:${path}`]);
      const trimmed =
        content.length > MAX_MIGRATION_CHARS
          ? `${content.slice(0, MAX_MIGRATION_CHARS)}\n… (truncated)`
          : content;
      if (total + trimmed.length > MAX_MIGRATIONS_TOTAL_CHARS) {
        out.push({ path, content: '(omitted: total migration content budget exceeded)' });
        break;
      }
      total += trimmed.length;
      out.push({ path, content: trimmed });
    } catch {
      out.push({ path, content: '(unable to read file content)' });
    }
  }
  return out;
};

const fetchPrMeta = (commits) => {
  const prNumbers = [...new Set(commits.map((c) => c.pr).filter(Boolean))];
  const meta = {};
  for (const num of prNumbers) {
    const raw = runGh([
      'pr',
      'view',
      String(num),
      '--json',
      'labels,body',
    ]);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      let body = parsed.body || '';
      let prev;
      do {
        prev = body;
        body = body.replace(/<!--[\s\S]*?-->/g, '');
      } while (body !== prev);
      body = body
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      meta[num] = {
        labels: (parsed.labels || []).map((l) => l.name),
        body:
          body.length > MAX_PR_BODY_CHARS
            ? `${body.slice(0, MAX_PR_BODY_CHARS)}…`
            : body,
      };
    } catch {
      // ignore bad JSON
    }
  }
  return meta;
};

const partitionCommits = (commits) => {
  const deps = [];
  const syncs = [];
  const chores = [];
  const main = [];
  for (const c of commits) {
    if (DEP_SUBJECT_RE.test(c.subject)) deps.push(c);
    else if (SYNC_SUBJECT_RE.test(c.subject)) syncs.push(c);
    else if (CHORE_SUBJECT_RE.test(c.subject)) chores.push(c);
    else main.push(c);
  }
  return { deps, syncs, chores, main };
};

const depSummary = (deps) => {
  if (!deps.length) return null;
  const pkgs = new Set();
  for (const d of deps) {
    const m = d.subject.match(DEP_PKG_RE);
    if (m) pkgs.add(m[1]);
  }
  return { count: deps.length, pkgs: [...pkgs] };
};

const fallbackNotes = (commits, migrations) => {
  const groups = {
    feat: [],
    fix: [],
    perf: [],
    refactor: [],
    docs: [],
    test: [],
    other: [],
  };
  const { deps, main } = partitionCommits(commits);
  for (const c of main) {
    const m = c.subject.match(/^(\w+)(\(.+?\))?!?:/);
    const type = m && groups[m[1]] ? m[1] : 'other';
    groups[type].push(c);
  }
  const bullet = (c) =>
    `- ${c.cleanSubject}${c.pr ? ` (#${c.pr})` : ''}`;
  const section = (title, items) =>
    items.length ? `### ${title}\n\n${items.map(bullet).join('\n')}\n` : '';
  const parts = [
    section('Features', groups.feat),
    section('Fixes', groups.fix),
    section('Performance', groups.perf),
    section('Refactors', groups.refactor),
    section('Other', [...groups.docs, ...groups.test, ...groups.other]),
  ];
  if (deps.length) {
    const d = depSummary(deps);
    parts.push(
      `### Dependencies\n\n- ${d.count} dependency update${d.count === 1 ? '' : 's'}${d.pkgs.length ? ` (${d.pkgs.slice(0, 10).join(', ')}${d.pkgs.length > 10 ? ', …' : ''})` : ''}\n`,
    );
  }
  if (migrations.length) {
    parts.unshift(
      `### Database migrations\n\n${migrations
        .map((f) => `- \`${f.replace(MIGRATION_PATH_PREFIX, '')}\``)
        .join('\n')}\n`,
    );
  }
  return parts.filter(Boolean).join('\n');
};

const stripOuterFence = (s) => {
  const trimmed = s.trim();
  const fenceOpen = /^```(?:markdown|md)?\s*\n/i;
  const fenceClose = /\n```\s*$/;
  if (fenceOpen.test(trimmed) && fenceClose.test(trimmed)) {
    return trimmed.replace(fenceOpen, '').replace(fenceClose, '').trim();
  }
  return trimmed;
};

const callModel = async (payload) => {
  const res = await fetch(MODELS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${modelToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`GitHub Models ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return stripOuterFence(data.choices?.[0]?.message?.content ?? '');
};

const buildPrompt = ({
  main,
  deps,
  syncs,
  prMeta,
  migrationDetails,
}) => {
  const emittedPrBodies = new Set();
  const commitLine = (c) => {
    const meta = c.pr ? prMeta[c.pr] : null;
    const labels = meta?.labels;
    const labelSuffix =
      labels && labels.length ? ` [${labels.slice(0, 3).join(',')}]` : '';
    const prSuffix = c.pr ? ` (#${c.pr})` : '';
    const lines = [`- ${c.cleanSubject}${prSuffix}${labelSuffix}`];
    if (c.pr && meta?.body && !emittedPrBodies.has(c.pr)) {
      emittedPrBodies.add(c.pr);
      const compactBody = meta.body.replace(/\n+/g, ' ');
      lines.push(`  pr#${c.pr} body: ${compactBody}`);
    } else if (!c.pr && c.body) {
      lines.push(`  body: ${c.body}`);
    }
    return lines.join('\n');
  };

  const d = depSummary(deps);
  const depLine = d
    ? `- ${d.count} dependency bumps: ${d.pkgs.slice(0, 20).join(', ')}${d.pkgs.length > 20 ? ', …' : ''}`
    : null;

  const migrationsBlock = migrationDetails.length
    ? migrationDetails
        .map(
          ({ path, content }) =>
            `### ${path.replace(MIGRATION_PATH_PREFIX, '')}\n\`\`\`ts\n${content}\n\`\`\``,
        )
        .join('\n\n')
    : '(none)';

  const sections = [
    `You generate release notes for ${repo || 'this project'} v${nextVersion}.`,
    '',
    'Rules:',
    '1. Never invent items. Only describe entries present below.',
    '2. Deduplicate aggressively. Collapse bullets describing the same change into one. Grouping signals (weakest to strongest):',
    '   a. Weaker: same conventional-commit scope (e.g. `storage-metrics`, `overlays`) usually groups bullets within a section.',
    '   b. Stronger: PR bodies that explicitly reference each other (`Part of #NNN`, `Related to #NNN`, `Depends on #NNN`) — merge these into one bullet.',
    '3. PR attribution rule (CRITICAL): a bullet may cite `(#NNN)` only if that PR number appears in the Commits list below AND its commit subject or PR body clearly describes the same change as the bullet. If no listed commit carries a `(#NNN)` suffix for that change, OMIT the citation — do not guess or reuse a nearby PR number. Do NOT cite a PR merely because it shares a conventional-commit scope, label, or touches the same files. Max 2 PR citations per bullet.',
    '4. Highlights: 1-3 MOST impactful user-facing or breaking changes. An item in Highlights MUST NOT reappear in Features/Fixes/Performance/Internal. Pick one section per concrete change.',
    '5. For each database migration below, write ONE plain-English sentence: describe net schema effect (new tables, columns added to existing tables, indexes, data backfills). Ignore intermediate TypeORM `temporary_*` rename tables — describe the end state.',
    '6. Section order (omit empty): Highlights, Breaking Changes, Features, Fixes, Performance, Database migrations, Internal, Dependencies.',
    '7. One line per bullet. No emoji.',
    '8. For dependency bumps, emit ONE bullet under Dependencies summarizing count and notable packages.',
    '9. Output GitHub-flavored Markdown only. The first line MUST be the first `## <Section>` heading. Do NOT emit a top-level `#` title, version string, "Release Notes" header, introductory prose, trailing commentary, or wrapping code fences.',
    '10. Do NOT include `[label]` tags, `pr#… body:` lines, `body:` lines, or raw commit subjects in the output — they are input hints only.',
    '',
    `## Commits (${main.length} user-facing${syncs.length ? `, ${syncs.length} sync-back merges already filtered` : ''})`,
    main.map(commitLine).join('\n'),
    '',
    '## Migration files changed',
    migrationsBlock,
  ];

  if (depLine) {
    sections.push('', '## Dependency bumps (pre-collapsed)', depLine);
  }

  return sections.join('\n');
};

const main = async () => {
  const commits = parseCommits();
  log(`range=${range} commits=${commits.length} model=${RELEASE_NOTES_MODEL}`);
  if (!commits.length) {
    process.stdout.write('_No user-facing changes in this release._\n');
    return;
  }

  const files = changedFiles();
  const migrations = files.filter((f) => f.startsWith(MIGRATION_PATH_PREFIX));
  const migrationDetails = readMigrationContents(migrations);
  const { deps, syncs, main: mainCommits } = partitionCommits(commits);
  const prMeta = fetchPrMeta(mainCommits);

  if (!modelToken) {
    log('no GITHUB_TOKEN/GH_TOKEN available; emitting fallback notes');
    process.stdout.write(fallbackNotes(commits, migrations));
    return;
  }

  const prompt = buildPrompt({
    main: mainCommits,
    deps,
    syncs,
    prMeta,
    migrationDetails,
  });

  if (prompt.length > MAX_PROMPT_CHARS) {
    log(
      `prompt too large (${prompt.length} chars > ${MAX_PROMPT_CHARS}); emitting fallback notes`,
    );
    process.stdout.write(fallbackNotes(commits, migrations));
    return;
  }

  const messages = [
    {
      role: 'system',
      content:
        'You write terse, accurate release notes. You never fabricate changes.',
    },
    { role: 'user', content: prompt },
  ];

  const tryCall = async (payload) => {
    try {
      return await callModel(payload);
    } catch (err) {
      if (/temperature/i.test(err.message) && 'temperature' in payload) {
        log('model rejected temperature parameter; retrying without it');
        const { temperature, ...rest } = payload;
        return callModel(rest);
      }
      throw err;
    }
  };

  try {
    const notes = await tryCall({
      model: RELEASE_NOTES_MODEL,
      messages,
      temperature: 0.1,
    });
    if (!notes) throw new Error('empty model output');
    process.stdout.write(`${notes}\n`);
  } catch (err) {
    log(`model call failed: ${err.message}; emitting fallback notes`);
    process.stdout.write(fallbackNotes(commits, migrations));
  }
};

main().catch((err) => {
  process.stderr.write(`[release-notes] fatal: ${err.stack || err.message}\n`);
  process.stdout.write('_Release notes unavailable (generator error)._\n');
});
