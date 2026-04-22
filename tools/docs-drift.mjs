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

const codeKeys = parseCodeKeys();
const docKeys = parseDocKeys();
const missingFromDocs = [...codeKeys].filter((k) => !docKeys.has(k)).sort();
const missingFromCode = [...docKeys].filter((k) => !codeKeys.has(k)).sort();
const migrations = newMigrations();
const constantsDiff = rulesConstantsDiff();
const contracts = contractsChanges();
const controllers = newControllers();
const feats = featCommits();

const lines = [];
lines.push("<!-- maintainerr-docs-drift -->");
lines.push("## 📚 Docs drift report");
lines.push("");
lines.push(
  `Comparing \`${baseRef}\` → \`HEAD\` against [Maintainerr_docs](https://github.com/Maintainerr/Maintainerr_docs). Informational only — maintainers decide what needs doc updates before release.`,
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
    "_New controllers almost always mean new routes — check `docs/API.md` and the OpenAPI spec._",
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
    feats.length > 0,
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
