import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const MAX_COMMITS = 300;
const MAX_PROMPT_CHARS = 24000;
const MAX_MIGRATION_CHARS = 3000;
const MAX_MIGRATIONS_TOTAL_CHARS = 12000;
const MAX_PR_BODY_CHARS = 400;
const MAX_ORPHAN_BODY_CHARS = 300;
const MIGRATION_PATH_PREFIX = "apps/server/src/database/migrations/";
import {
  DEFAULT_REASONING_EFFORT,
  callModel,
  hasModelAccess,
} from "./ai/model-client.mjs";
const DEP_SUBJECT_RE = /^build\(deps(?:-dev)?\):/i;
const CHORE_SUBJECT_RE = /^chore(?:\([^)]*\))?!?:/i;
const SYNC_SUBJECT_RE = /^chore:\s*sync\s+development\s+to\s+main/i;
// Grouped updates read "bump the nestjs group with 4 updates", so the optional
// article has to be consumed or every grouped bump is listed as "the".
const DEP_PKG_RE = /bump\s+(?:the\s+)?([^\s]+)/i;
const BOT_LOGIN_RE = /\[bot\]$/i;

const REC_SEP = String.fromCharCode(0x1e);
const FIELD_SEP = String.fromCharCode(0x1f);
const TRAILER_RE =
  /^(co-authored-by|signed-off-by|reviewed-by|acked-by|reported-by):/i;

const {
  LAST_RELEASE_GITTAG: lastTag = "",
  NEXT_RELEASE_VERSION: nextVersion = "",
  NEXT_RELEASE_GITHEAD: nextHead = "HEAD",
  GITHUB_REPOSITORY: repo = "",
  GITHUB_TOKEN,
  GH_TOKEN,
  RELEASE_NOTES_MODEL = process.env.AI_MODEL || "gemini-3.1-flash-lite",
} = process.env;

// For api.github.com, not for the model endpoint - that one reads
// AI_MODEL_API_KEY through the shared client.
const githubToken = GITHUB_TOKEN || GH_TOKEN || "";

const log = (msg) => process.stderr.write(`[release-notes] ${msg}\n`);

const runGit = (args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

const runGh = (args) => {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return "";
  }
};

const resolveLastTag = () => {
  if (lastTag) return lastTag;
  try {
    const tag = runGit(["describe", "--tags", "--abbrev=0", nextHead]).trim();
    if (tag) {
      log(`LAST_RELEASE_GITTAG not provided; using ${tag} from git describe`);
      return tag;
    }
  } catch {
    log(
      "no prior tag found; range will walk full history (capped by MAX_COMMITS)",
    );
  }
  return "";
};

const effectiveLastTag = resolveLastTag();
const range = effectiveLastTag ? `${effectiveLastTag}..${nextHead}` : nextHead;

const buildHeader = () => {
  if (!nextVersion) return "";
  const version = nextVersion.replace(/^v/, "");
  const date = new Date().toISOString().slice(0, 10);
  if (repo && effectiveLastTag) {
    return `# [${version}](https://github.com/${repo}/compare/${effectiveLastTag}...v${version}) (${date})\n\n\n`;
  }
  return `# ${version} (${date})\n\n\n`;
};

const isBotLogin = (login = "") => BOT_LOGIN_RE.test(login);

const extractNewContributorsSection = (body = "") => {
  const marker = "## New Contributors";
  const start = body.indexOf(marker);
  if (start < 0) return "";

  const rest = body.slice(start);
  const nextSection = rest.search(/\n## |\n\*\*Full Changelog/);
  return (nextSection < 0 ? rest : rest.slice(0, nextSection)).trim();
};

/**
 * GitHub's generate-notes counts bots as contributors, so a translation bot
 * lands in a section meant to credit people. The local builder already skips
 * them; this makes the API path agree. Drops the heading too when nothing but
 * bots was listed, rather than leaving an empty section behind.
 */
const withoutBotContributors = (section = "") => {
  if (!section) return "";

  const kept = [];
  let people = 0;

  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    const at = trimmed.indexOf("@");

    if (!trimmed.startsWith("*") || at === -1) {
      kept.push(line);
      continue;
    }

    const after = trimmed.slice(at + 1);
    const space = after.indexOf(" ");
    const login = space === -1 ? after : after.slice(0, space);
    if (isBotLogin(login)) continue;

    people += 1;
    kept.push(line);
  }

  return people ? kept.join("\n").trim() : "";
};

export const buildLocalNewContributorsSection = (
  prMeta,
  { repoName = repo, ghRunner = runGh } = {},
) => {
  if (!repoName) return "";

  const firstPrByAuthor = new Map();

  for (const [prNumber, meta] of Object.entries(prMeta)) {
    const login = meta.author;
    if (!login || isBotLogin(login)) continue;

    const pr = Number(prNumber);
    if (!Number.isFinite(pr)) continue;

    const existing = firstPrByAuthor.get(login);
    if (
      !existing ||
      meta.mergedAt < existing.mergedAt ||
      (meta.mergedAt === existing.mergedAt && pr < existing.pr)
    ) {
      firstPrByAuthor.set(login, { pr, mergedAt: meta.mergedAt || "" });
    }
  }

  const newContributors = [];

  for (const [login, firstContribution] of [...firstPrByAuthor.entries()].sort(
    (left, right) => {
      if (left[1].mergedAt !== right[1].mergedAt) {
        return left[1].mergedAt.localeCompare(right[1].mergedAt);
      }
      return left[1].pr - right[1].pr;
    },
  )) {
    if (!firstContribution.mergedAt) continue;

    const raw = ghRunner([
      "search",
      "prs",
      "--author",
      login,
      "--repo",
      repoName,
      "--state",
      "closed",
      "--merged",
      "--merged-at",
      `<${firstContribution.mergedAt}`,
      "--limit",
      "1",
      "--json",
      "number",
    ]);
    if (!raw) continue;

    try {
      const results = JSON.parse(raw);
      if (Array.isArray(results) && results.length === 0) {
        newContributors.push(
          `- @${login} made their first contribution in #${firstContribution.pr}`,
        );
      }
    } catch {
      // ignore malformed CLI output and skip the fallback entry
    }
  }

  return newContributors.length
    ? `## New Contributors\n${newContributors.join("\n")}`
    : "";
};

const fetchNewContributors = async (prMeta) => {
  const fallback = buildLocalNewContributorsSection(prMeta);
  if (!githubToken || !repo || !nextVersion || !effectiveLastTag) {
    return fallback;
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/releases/generate-notes`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tag_name: `v${nextVersion.replace(/^v/, "")}`,
          previous_tag_name: effectiveLastTag,
          target_commitish: nextHead === "HEAD" ? "main" : nextHead,
        }),
      },
    );
    if (!res.ok) {
      log(`generate-notes ${res.status}: ${await res.text()}`);
      return fallback;
    }
    const data = await res.json();
    return (
      withoutBotContributors(extractNewContributorsSection(data.body || "")) ||
      fallback
    );
  } catch (err) {
    log(`generate-notes fetch failed: ${err.message}`);
    return fallback;
  }
};

const cleanCommitBody = (raw) => {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !TRAILER_RE.test(line.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

const parseCommits = () => {
  const raw = runGit([
    "log",
    range,
    `--format=%H${FIELD_SEP}%s${FIELD_SEP}%b${REC_SEP}`,
    "--no-merges",
    "-n",
    String(MAX_COMMITS),
  ]);
  return raw
    .split(REC_SEP)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, subject, body = ""] = entry.split(FIELD_SEP);
      const prMatch = subject.match(/\(#(\d+)\)\s*$/);
      const cleanedBody = cleanCommitBody(body);
      return {
        sha,
        subject,
        pr: prMatch ? Number(prMatch[1]) : null,
        cleanSubject: subject.replace(/\s*\(#\d+\)\s*$/, ""),
        body:
          cleanedBody.length > MAX_ORPHAN_BODY_CHARS
            ? `${cleanedBody.slice(0, MAX_ORPHAN_BODY_CHARS)}…`
            : cleanedBody,
      };
    });
};

const MERGE_PR_PREFIX = "Merge pull request #";
// A sync merge carries a whole branch rather than one pull request's work, so
// it must never become the attribution for the commits flowing through it.
const SYNC_HEAD_BRANCHES = new Set(["development", "main"]);

/** The pull request number from a `Merge pull request #N from owner/branch` subject. */
const parseMergePr = (subject = "") => {
  if (!subject.startsWith(MERGE_PR_PREFIX)) return null;

  const rest = subject.slice(MERGE_PR_PREFIX.length);
  const spaceAt = rest.indexOf(" ");
  const number = Number(spaceAt === -1 ? rest : rest.slice(0, spaceAt));
  if (!Number.isInteger(number) || number <= 0) return null;

  const fromAt = rest.indexOf(" from ");
  const headRef =
    fromAt === -1 ? "" : rest.slice(fromAt + " from ".length).trim();
  const slashAt = headRef.indexOf("/");
  const branch = slashAt === -1 ? headRef : headRef.slice(slashAt + 1);
  if (SYNC_HEAD_BRANCHES.has(branch)) return null;

  return number;
};

/**
 * A commit only carries `(#NNN)` when its pull request was squash-merged. One
 * merged with a merge commit leaves the number on the merge commit, which
 * `--no-merges` drops, and the bullet then reaches the model with no PR at all
 * - which is when it starts borrowing a neighbouring number. Walk the ancestry
 * path instead and take the first real pull-request merge that contains it.
 */
const resolvePrNumbers = (commits) => {
  const orphans = commits.filter((c) => !c.pr && c.sha);
  if (!orphans.length) return commits;

  let resolved = 0;
  for (const commit of orphans) {
    let merges = "";
    try {
      merges = runGit([
        "log",
        "--ancestry-path",
        "--merges",
        "--reverse",
        "--format=%s",
        `${commit.sha}..${nextHead}`,
      ]);
    } catch {
      continue;
    }

    for (const subject of merges.split("\n")) {
      const number = parseMergePr(subject.trim());
      if (number) {
        commit.pr = number;
        resolved += 1;
        break;
      }
    }
  }

  log(
    `resolved ${resolved}/${orphans.length} commits without a squash-merge suffix to a pull request`,
  );
  return commits;
};

const changedFiles = () => {
  try {
    return runGit(["diff", "--name-only", range]).split("\n").filter(Boolean);
  } catch {
    return [];
  }
};

const readMigrationContents = (migrationPaths) => {
  const out = [];
  let total = 0;
  for (const path of migrationPaths) {
    try {
      const content = runGit(["show", `${nextHead}:${path}`]);
      const trimmed =
        content.length > MAX_MIGRATION_CHARS
          ? `${content.slice(0, MAX_MIGRATION_CHARS)}\n… (truncated)`
          : content;
      if (total + trimmed.length > MAX_MIGRATIONS_TOTAL_CHARS) {
        out.push({
          path,
          content: "(omitted: total migration content budget exceeded)",
        });
        break;
      }
      total += trimmed.length;
      out.push({ path, content: trimmed });
    } catch {
      out.push({ path, content: "(unable to read file content)" });
    }
  }
  return out;
};

const fetchPrMeta = (commits) => {
  const prNumbers = [...new Set(commits.map((c) => c.pr).filter(Boolean))];
  const meta = {};
  for (const num of prNumbers) {
    const raw = runGh([
      "pr",
      "view",
      String(num),
      "--json",
      "labels,body,author,mergedAt",
    ]);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      let body = parsed.body || "";
      let prev;
      do {
        prev = body;
        body = body.replace(/<!--[\s\S]*?-->/g, "");
      } while (body !== prev);
      body = body
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      meta[num] = {
        labels: (parsed.labels || []).map((l) => l.name),
        author: parsed.author?.login || "",
        mergedAt: parsed.mergedAt || "",
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

/**
 * SYNC_SUBJECT_RE only catches a sync squash that kept the pull request title.
 * When a sync pull request holds exactly one commit, GitHub squashes it under
 * that commit's own message instead, so the change lands in the range twice:
 * the original, and a twin carrying the sync pull request's number. The model
 * is then handed the same work under two numbers and cites both, which is how
 * 3.23.0 credited the retry fix to #3529, the sync pull request itself.
 *
 * Keep the oldest occurrence of a subject. A squash can only ever be newer than
 * what it squashed, so the survivor is the real commit. Applied to the
 * model-facing commits only: dependency and translation bumps legitimately
 * repeat a subject across releases and are counted, not described.
 */
const dropSyncSquashTwins = (commits) => {
  const seen = new Set();
  const kept = [];

  // git log is newest first, so walking backwards reaches the original first.
  for (let i = commits.length - 1; i >= 0; i -= 1) {
    const commit = commits[i];
    if (seen.has(commit.cleanSubject)) continue;
    seen.add(commit.cleanSubject);
    kept.push(commit);
  }

  kept.reverse();
  const dropped = commits.length - kept.length;
  if (dropped) log(`dropped ${dropped} sync-squash duplicate(s)`);
  return kept;
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

// Takes the already-partitioned commits rather than re-deriving them, so the
// fallback describes exactly what the model would have been given. Re-running
// partitionCommits here silently skipped the sync-squash dedupe.
const fallbackNotes = ({ main, deps }, migrations) => {
  const groups = {
    feat: [],
    fix: [],
    perf: [],
    refactor: [],
    docs: [],
    test: [],
    other: [],
  };
  for (const c of main) {
    const m = c.subject.match(/^(\w+)(\(.+?\))?!?:/);
    const type = m && groups[m[1]] ? m[1] : "other";
    groups[type].push(c);
  }
  const bullet = (c) => `- ${c.cleanSubject}${c.pr ? ` (#${c.pr})` : ""}`;
  const section = (title, items) =>
    items.length ? `### ${title}\n\n${items.map(bullet).join("\n")}\n` : "";
  const parts = [
    section("Features", groups.feat),
    section("Fixes", groups.fix),
    section("Performance", groups.perf),
    section("Refactors", groups.refactor),
    section("Other", [...groups.docs, ...groups.test, ...groups.other]),
  ];
  if (deps.length) {
    const d = depSummary(deps);
    parts.push(
      `### Dependencies\n\n- ${d.count} dependency update${d.count === 1 ? "" : "s"}${d.pkgs.length ? ` (${d.pkgs.slice(0, 10).join(", ")}${d.pkgs.length > 10 ? ", …" : ""})` : ""}\n`,
    );
  }
  if (migrations.length) {
    parts.unshift(
      `### Database migrations\n\n${migrations
        .map((f) => `- \`${f.replace(MIGRATION_PATH_PREFIX, "")}\``)
        .join("\n")}\n`,
    );
  }
  return parts.filter(Boolean).join("\n");
};

const stripOuterFence = (s) => {
  const trimmed = s.trim();
  const fenceOpen = /^```(?:markdown|md)?\s*\n/i;
  const fenceClose = /\n```\s*$/;
  if (fenceOpen.test(trimmed) && fenceClose.test(trimmed)) {
    return trimmed.replace(fenceOpen, "").replace(fenceClose, "").trim();
  }
  return trimmed;
};

const generateNotes = async (messages) =>
  stripOuterFence(
    await callModel(messages, {
      model: RELEASE_NOTES_MODEL,
      // Rule 3 is the one this tool gets wrong when it guesses. Checking every
      // citation against the commit list is reasoning work, and this runs once
      // per release, so buy the thinking rather than the cheapest answer.
      // AI_MODEL_REASONING_EFFORT still wins, so dialling it back stays a
      // repository-variable change rather than a pull request.
      reasoningEffort: DEFAULT_REASONING_EFFORT || "high",
    }),
  );

const buildPrompt = ({ main, deps, syncs, prMeta, migrationDetails }) => {
  const emittedPrBodies = new Set();
  const commitLine = (c) => {
    const meta = c.pr ? prMeta[c.pr] : null;
    const labels = meta?.labels;
    const labelSuffix =
      labels && labels.length ? ` [${labels.slice(0, 3).join(",")}]` : "";
    const prSuffix = c.pr ? ` (#${c.pr})` : "";
    const lines = [`- ${c.cleanSubject}${prSuffix}${labelSuffix}`];
    if (c.pr && meta?.body && !emittedPrBodies.has(c.pr)) {
      emittedPrBodies.add(c.pr);
      const compactBody = meta.body.replace(/\n+/g, " ");
      lines.push(`  pr#${c.pr} body: ${compactBody}`);
    } else if (!c.pr && c.body) {
      lines.push(`  body: ${c.body}`);
    }
    return lines.join("\n");
  };

  const d = depSummary(deps);
  const depLine = d
    ? `- ${d.count} dependency bumps: ${d.pkgs.slice(0, 20).join(", ")}${d.pkgs.length > 20 ? ", …" : ""}`
    : null;

  const migrationsBlock = migrationDetails.length
    ? migrationDetails
        .map(
          ({ path, content }) =>
            `### ${path.replace(MIGRATION_PATH_PREFIX, "")}\n\`\`\`ts\n${content}\n\`\`\``,
        )
        .join("\n\n")
    : "(none)";

  const sections = [
    `You generate release notes for ${repo || "this project"} v${nextVersion}.`,
    "",
    "Rules:",
    "1. Never invent items. Only describe entries present below.",
    "2. Deduplicate aggressively. Collapse bullets describing the same change into one. Grouping signals (weakest to strongest):",
    "   a. Weaker: same conventional-commit scope (e.g. `storage-metrics`, `overlays`) usually groups bullets within a section.",
    "   b. Stronger: PR bodies that explicitly reference each other (`Part of #NNN`, `Related to #NNN`, `Depends on #NNN`) - merge these into one bullet.",
    "3. PR attribution rule (CRITICAL): a bullet may cite `(#NNN)` only if that PR number appears in the Commits list below AND its commit subject or PR body clearly describes the same change as the bullet. If no listed commit carries a `(#NNN)` suffix for that change, OMIT the citation - do not guess or reuse a nearby PR number. Do NOT cite a PR merely because it shares a conventional-commit scope, label, or touches the same files. Max 2 PR citations per bullet.",
    "4. Highlights: 1-3 MOST impactful user-facing or breaking changes. An item in Highlights MUST NOT reappear in Features/Fixes/Performance/Internal. Pick one section per concrete change.",
    "5. Breaking Changes classification: only flag something as breaking if it changes behavior, an environment variable, config key, setting, API, CLI flag, or DB column that ALREADY SHIPPED in a previous release. The commits below are the entire range since the last release - net them out. If an identifier is BOTH introduced and renamed/removed/changed within this range, it never shipped under its old form: describe only its FINAL state under the normal section (e.g. a brand-new environment variable belongs under Features, not Breaking Changes) and never as a breaking change. Treat a `rename X -> Y` commit as breaking only when no other commit in the range introduces X. When unsure whether the old form shipped, do NOT classify it as breaking.",
    "6. For each database migration below, write ONE plain-English sentence: describe net schema effect (new tables, columns added to existing tables, indexes, data backfills). Ignore intermediate TypeORM `temporary_*` rename tables - describe the end state.",
    "7. Section order (omit empty): Highlights, Breaking Changes, Features, Fixes, Performance, Database migrations, Internal, Dependencies.",
    "8. One line per bullet. No emoji.",
    "9. For dependency bumps, emit ONE bullet under Dependencies summarizing count and notable packages.",
    '10. Output GitHub-flavored Markdown only. The first line MUST be the first `## <Section>` heading. Do NOT emit a top-level `#` title, version string, "Release Notes" header, introductory prose, trailing commentary, or wrapping code fences.',
    "11. Do NOT include `[label]` tags, `pr#… body:` lines, `body:` lines, or raw commit subjects in the output - they are input hints only.",
    "",
    `## Commits (${main.length} user-facing${syncs.length ? `, ${syncs.length} sync-back merges already filtered` : ""})`,
    main.map(commitLine).join("\n"),
    "",
    "## Migration files changed",
    migrationsBlock,
  ];

  if (depLine) {
    sections.push("", "## Dependency bumps (pre-collapsed)", depLine);
  }

  return sections.join("\n");
};

const main = async () => {
  const commits = resolvePrNumbers(parseCommits());
  log(`range=${range} commits=${commits.length} model=${RELEASE_NOTES_MODEL}`);
  const header = buildHeader();
  const {
    deps,
    syncs,
    main: partitionedMain,
  } = partitionCommits(commits);
  const mainCommits = dropSyncSquashTwins(partitionedMain);
  const prMeta = fetchPrMeta(mainCommits);
  const newContribs = await fetchNewContributors(prMeta);
  const footer = newContribs ? `\n\n${newContribs}\n` : "";
  if (!commits.length) {
    process.stdout.write(
      `${header}_No user-facing changes in this release._${footer}\n`,
    );
    return;
  }

  const files = changedFiles();
  const migrations = files.filter((f) => f.startsWith(MIGRATION_PATH_PREFIX));
  const migrationDetails = readMigrationContents(migrations);

  if (!hasModelAccess()) {
    log("no AI_MODEL_API_KEY available; emitting fallback notes");
    process.stdout.write(
      `${header}${fallbackNotes({ main: mainCommits, deps }, migrations)}${footer}`,
    );
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
    process.stdout.write(
      `${header}${fallbackNotes({ main: mainCommits, deps }, migrations)}${footer}`,
    );
    return;
  }

  const messages = [
    {
      role: "system",
      content:
        "You write terse, accurate release notes. You never fabricate changes.",
    },
    { role: "user", content: prompt },
  ];

  try {
    const notes = await generateNotes(messages);
    if (!notes) throw new Error("empty model output");
    process.stdout.write(`${header}${notes}${footer}\n`);
  } catch (err) {
    log(`model call failed: ${err.message}; emitting fallback notes`);
    process.stdout.write(
      `${header}${fallbackNotes({ main: mainCommits, deps }, migrations)}${footer}`,
    );
  }
};

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  main().catch((err) => {
    process.stderr.write(
      `[release-notes] fatal: ${err.stack || err.message}\n`,
    );
    process.stdout.write("_Release notes unavailable (generator error)._\n");
  });
}
