#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();
const docsRoot = process.env.DOCS_ROOT;
const baseRef = process.env.BASE_REF || "origin/main";
const outputPath = process.env.OUTPUT_PATH || null;

if (!docsRoot) {
  console.error("DOCS_ROOT env var is required");
  process.exit(1);
}

const git = (args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });

const parseCodeKeys = () => {
  const file = path.join(
    repoRoot,
    "apps/server/src/modules/rules/constants/rules.constants.ts",
  );
  const text = readFileSync(file, "utf8");
  const appHeaderRe = /^ {6}name: '([A-Z][a-zA-Z]*)',$/gm;
  const propNameRe = /^ {10}name: '([a-zA-Z_][a-zA-Z0-9_]*)',$/gm;
  const apps = [...text.matchAll(appHeaderRe)];
  const keys = new Set();
  for (let i = 0; i < apps.length; i++) {
    const app = apps[i][1];
    const start = apps[i].index;
    const end = i + 1 < apps.length ? apps[i + 1].index : text.length;
    for (const m of text.slice(start, end).matchAll(propNameRe)) {
      keys.add(`${app}.${m[1]}`);
    }
  }
  return keys;
};

const parseDocKeys = () => {
  const text = readFileSync(path.join(docsRoot, "docs/Glossary.md"), "utf8");
  const keys = new Set();
  for (const m of text.matchAll(/^- Key: (\S+)/gm)) {
    keys.add(m[1]);
  }
  return keys;
};

const diffNameStatus = (pathspec, filter) => {
  const args = ["diff", "--name-status"];
  if (filter) args.push(`--diff-filter=${filter}`);
  args.push(`${baseRef}...HEAD`, "--", pathspec);
  const out = git(args).trim();
  if (!out) return [];
  return out
    .split("\n")
    .map((l) => {
      const parts = l.split("\t");
      return { status: parts[0], file: parts[1] };
    })
    .filter((e) => e.file);
};

const newMigrations = () =>
  diffNameStatus("apps/server/src/database/migrations/", "A").map((e) =>
    e.file.replace("apps/server/src/database/migrations/", ""),
  );

const rulesConstantsDiff = () => {
  const out = git([
    "diff",
    "--numstat",
    `${baseRef}...HEAD`,
    "--",
    "apps/server/src/modules/rules/constants/rules.constants.ts",
  ]).trim();
  if (!out) return null;
  const [added, deleted] = out.split("\t");
  return { added, deleted };
};

const contractsChanges = () => {
  const entries = diffNameStatus("packages/contracts/src/");
  const buckets = { added: [], modified: [], deleted: [] };
  for (const e of entries) {
    if (e.status === "A") buckets.added.push(e.file);
    else if (e.status === "M") buckets.modified.push(e.file);
    else if (e.status === "D") buckets.deleted.push(e.file);
  }
  return buckets;
};

const newControllers = () =>
  diffNameStatus("apps/server/src/modules/", "A")
    .map((e) => e.file)
    .filter((f) => f.endsWith(".controller.ts"));

const featCommits = () => {
  const out = git([
    "log",
    `${baseRef}..HEAD`,
    "--no-merges",
    "--extended-regexp",
    "--grep=^feat(\\(|:)",
    "--pretty=format:%h %s",
  ]).trim();
  return out ? out.split("\n") : [];
};

// A `fix:` commit is worth a docs second-look when it touches a doc-worthy
// surface. Rather than an allowlist that silently misses newly added modules,
// we flag everything under these roots - the whole UI and every server
// module - and subtract a small denylist of internal-only surfaces below.
const FIX_PATH_ROOTS = [
  "apps/ui/",
  "apps/server/src/modules/",
  "README.md",
];

// Internal-only surfaces with no user- or API-facing behavior. Fixes that
// touch *only* these would add noise, so they're subtracted from the roots
// above. Keep this list tight - when in doubt, leave a module flaggable.
const FIX_PATH_DENYLIST = [
  "apps/server/src/modules/events/",
  "apps/server/src/modules/logging/",
];

// Controllers are an HTTP surface wherever they live - always doc-worthy,
// even under a denylisted directory.
const USER_VISIBLE_FIX_PATH_SUFFIXES = [".controller.ts"];

const isDocWorthyFixPath = (f) =>
  USER_VISIBLE_FIX_PATH_SUFFIXES.some((s) => f.endsWith(s)) ||
  (FIX_PATH_ROOTS.some((p) => f.startsWith(p)) &&
    !FIX_PATH_DENYLIST.some((p) => f.startsWith(p)));

const fixCommits = () => {
  const out = git([
    "log",
    `${baseRef}..HEAD`,
    "--no-merges",
    "--extended-regexp",
    "--grep=^fix(\\(|:)",
    "--pretty=format:%h %s",
  ]).trim();
  if (!out) return [];

  const candidates = out.split("\n");
  const flagged = [];

  for (const line of candidates) {
    const sha = line.split(" ", 1)[0];
    if (!sha) continue;
    const filesOut = git([
      "show",
      "--no-renames",
      "--name-only",
      "--pretty=format:",
      sha,
    ]).trim();
    const files = filesOut ? filesOut.split("\n").filter(Boolean) : [];
    const matched = files.filter(isDocWorthyFixPath);
    if (matched.length > 0) {
      flagged.push({ line, matched });
    }
  }

  return flagged;
};

// Items a human has explicitly tagged for documentation. Anyone can apply the
// `documentation` label to an issue or PR; the drift flow then picks it up so
// it isn't lost. Needs a GitHub token + `gh` on PATH - degrades gracefully
// when run locally without either.
const ghJson = (args) => {
  try {
    return JSON.parse(
      execFileSync("gh", args, {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      }),
    );
  } catch {
    return null;
  }
};

const docLabeledItems = () => {
  const repo = process.env.GITHUB_REPOSITORY || "Maintainerr/Maintainerr";
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) return { available: false, prs: [], issues: [] };

  let sinceDate = "";
  try {
    sinceDate = git(["log", "-1", "--format=%aI", baseRef]).trim().slice(0, 10);
  } catch {
    return { available: false, prs: [], issues: [] };
  }

  const prs = ghJson([
    "pr", "list",
    "--repo", repo,
    "--label", "documentation",
    "--state", "merged",
    "--search", `merged:>=${sinceDate}`,
    "--json", "number,title,url",
    "--limit", "100",
  ]);
  const issues = ghJson([
    "issue", "list",
    "--repo", repo,
    "--label", "documentation",
    "--state", "open",
    "--json", "number,title,url",
    "--limit", "100",
  ]);
  if (prs === null && issues === null) {
    return { available: false, prs: [], issues: [] };
  }
  return { available: true, prs: prs || [], issues: issues || [] };
};

const codeKeys = parseCodeKeys();
const docKeys = parseDocKeys();
const missingFromDocs = [...codeKeys].filter((k) => !docKeys.has(k)).sort();
const missingFromCode = [...docKeys].filter((k) => !codeKeys.has(k)).sort();
const migrations = newMigrations();
const constantsDiff = rulesConstantsDiff();
const contracts = contractsChanges();
const controllers = newControllers();
const feats = featCommits();
const behavioralFixes = fixCommits();
const docLabeled = docLabeledItems();

const lines = [];
lines.push("<!-- maintainerr-docs-drift -->");
lines.push("## 📚 Docs drift report");
lines.push("");
lines.push(
  `Comparing \`${baseRef}\` → \`HEAD\` against [Maintainerr_docs](https://github.com/Maintainerr/Maintainerr_docs). Informational only - maintainers decide what needs doc updates before release.`,
);
lines.push("");

lines.push("### Rule glossary parity");
lines.push("");
lines.push(`- Code rule keys (\`rules.constants.ts\`): **${codeKeys.size}**`);
lines.push(`- Documented keys (\`docs/Glossary.md\`): **${docKeys.size}**`);
lines.push("");
if (missingFromDocs.length) {
  lines.push(
    `<details open><summary><strong>In code but missing from Glossary (${missingFromDocs.length})</strong></summary>`,
  );
  lines.push("");
  for (const k of missingFromDocs) lines.push(`- \`${k}\``);
  lines.push("");
  lines.push("</details>");
  lines.push("");
}
if (missingFromCode.length) {
  lines.push(
    `<details><summary><strong>In Glossary but not in code (${missingFromCode.length})</strong></summary>`,
  );
  lines.push("");
  for (const k of missingFromCode) lines.push(`- \`${k}\``);
  lines.push("");
  lines.push("</details>");
  lines.push("");
}
if (!missingFromDocs.length && !missingFromCode.length) {
  lines.push("_Glossary is in sync with the code._");
  lines.push("");
}

lines.push("### New migrations on this branch");
lines.push("");
if (migrations.length) {
  for (const f of migrations) lines.push(`- [ ] \`${f}\``);
  lines.push("");
  lines.push(
    "_Each migration typically introduces a setting or schema change. Confirm `Configuration.md` and `Migration.md` still reflect user-facing behaviour._",
  );
} else {
  lines.push("_No new migrations._");
}
lines.push("");

lines.push("### Rule constants");
lines.push("");
if (constantsDiff) {
  lines.push(
    `- \`rules.constants.ts\` changed: **+${constantsDiff.added} / -${constantsDiff.deleted}** lines`,
  );
  lines.push(
    "- Review rule tables in `docs/Rules.mdx` and entries in `docs/Glossary.md`.",
  );
} else {
  lines.push("_No changes to `rules.constants.ts`._");
}
lines.push("");

lines.push("### Public contracts (`@maintainerr/contracts`)");
lines.push("");
const anyContracts =
  contracts.added.length + contracts.modified.length + contracts.deleted.length;
if (anyContracts) {
  if (contracts.added.length) {
    lines.push(`- Added (${contracts.added.length}):`);
    for (const f of contracts.added) lines.push(`  - \`${f}\``);
  }
  if (contracts.modified.length) {
    lines.push(`- Modified (${contracts.modified.length}):`);
    for (const f of contracts.modified) lines.push(`  - \`${f}\``);
  }
  if (contracts.deleted.length) {
    lines.push(`- Deleted (${contracts.deleted.length}):`);
    for (const f of contracts.deleted) lines.push(`  - \`${f}\``);
  }
  lines.push("");
  lines.push(
    "_Public DTO changes may affect `docs/API.md` and the OpenAPI spec in `static/openapi-spec/maintainerr_api_specs.yaml`._",
  );
} else {
  lines.push("_No contract changes._");
}
lines.push("");

lines.push("### New HTTP controllers");
lines.push("");
if (controllers.length) {
  for (const f of controllers) lines.push(`- [ ] \`${f}\``);
  lines.push("");
  lines.push(
    "_New controllers almost always mean new routes - check `docs/API.md` and the OpenAPI spec._",
  );
} else {
  lines.push("_No new controllers._");
}
lines.push("");

lines.push("### `feat:` commits on this branch");
lines.push("");
if (feats.length) {
  for (const l of feats) lines.push(`- ${l}`);
} else {
  lines.push("_No `feat:` commits detected._");
}
lines.push("");

lines.push("### Behavioral fixes worth reviewing");
lines.push("");
if (behavioralFixes.length) {
  for (const { line, matched } of behavioralFixes) {
    lines.push(`- ${line}`);
    lines.push(
      `  - touched: ${matched.map((f) => `\`${f}\``).join(", ")}`,
    );
  }
  lines.push("");
  lines.push(
    "_`fix:` commits that touched a doc-worthy surface - the UI, any server module except internal-only `events`/`logging`, any controller, or the README. Worth scanning to decide whether observable behavior changed enough to warrant a docs note._",
  );
} else {
  lines.push("_No user-facing `fix:` commits detected._");
}
lines.push("");

lines.push("### Documentation-labeled issues & PRs");
lines.push("");
if (!docLabeled.available) {
  lines.push(
    "_Skipped - no GitHub token available to query the `documentation` label._",
  );
} else if (!docLabeled.prs.length && !docLabeled.issues.length) {
  lines.push(
    "_No open issues or in-range merged PRs carry the `documentation` label._",
  );
} else {
  if (docLabeled.prs.length) {
    lines.push(
      `**Merged PRs labeled \`documentation\` (${docLabeled.prs.length}):**`,
    );
    for (const pr of docLabeled.prs) {
      lines.push(`- [ ] [#${pr.number}](${pr.url}) - ${pr.title}`);
    }
    lines.push("");
  }
  if (docLabeled.issues.length) {
    lines.push(
      `**Open issues labeled \`documentation\` (${docLabeled.issues.length}):**`,
    );
    for (const iss of docLabeled.issues) {
      lines.push(`- [ ] [#${iss.number}](${iss.url}) - ${iss.title}`);
    }
    lines.push("");
  }
  lines.push(
    "_Manually tagged with the `documentation` label - confirm each is reflected in Maintainerr_docs before release._",
  );
}
lines.push("");

const meta = {
  baseRef,
  hasDrift:
    missingFromDocs.length > 0 ||
    missingFromCode.length > 0 ||
    migrations.length > 0 ||
    constantsDiff !== null ||
    contracts.added.length +
      contracts.modified.length +
      contracts.deleted.length >
      0 ||
    controllers.length > 0 ||
    feats.length > 0 ||
    behavioralFixes.length > 0 ||
    docLabeled.prs.length > 0 ||
    docLabeled.issues.length > 0,
  sections: {
    glossaryMissingFromDocs: missingFromDocs.length,
    glossaryMissingFromCode: missingFromCode.length,
    newMigrations: migrations.length,
    rulesConstantsChanged: constantsDiff !== null,
    contractsAdded: contracts.added.length,
    contractsModified: contracts.modified.length,
    contractsDeleted: contracts.deleted.length,
    newControllers: controllers.length,
    featCommits: feats.length,
    behavioralFixCommits: behavioralFixes.length,
    docLabeledPRs: docLabeled.prs.length,
    docLabeledIssues: docLabeled.issues.length,
  },
};

const output = lines.join("\n");
if (outputPath) {
  writeFileSync(outputPath, output);
  writeFileSync(`${outputPath}.meta.json`, JSON.stringify(meta, null, 2));
  console.error(`Wrote drift report to ${outputPath}`);
  console.error(`Wrote drift metadata to ${outputPath}.meta.json`);
} else {
  process.stdout.write(output);
}
