#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const MODELS_ENDPOINT = "https://models.github.ai/inference/chat/completions";
const MODEL = process.env.DOCS_DRIFT_MODEL || "openai/gpt-4o";
const MAX_PROMPT_CHARS = 24000;
const MAX_DOC_CHARS = 4000;
const MAX_ISSUE_BODY_CHARS = 2000;
const MAX_PR_BODY_CHARS = 2000;
const MAX_FILES_PER_PR = 40;

const {
  DOCS_ROOT,
  BASE_REF = "origin/main",
  GITHUB_REPOSITORY = "Maintainerr/Maintainerr",
  GITHUB_TOKEN,
  GH_TOKEN,
  OUTPUT_PATH,
} = process.env;

const token = GITHUB_TOKEN || GH_TOKEN || "";
const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();
const log = (m) => process.stderr.write(`[docs-drift-ai] ${m}\n`);

if (!DOCS_ROOT) {
  console.error("DOCS_ROOT env var is required");
  process.exit(1);
}

const runGit = (args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

const runGh = (args) =>
  execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token },
  });

const writeOutput = (text) => {
  if (OUTPUT_PATH) {
    if (existsSync(OUTPUT_PATH)) appendFileSync(OUTPUT_PATH, text);
    else writeFileSync(OUTPUT_PATH, text);
  } else {
    process.stdout.write(text);
  }
};

const DOC_MAP = [
  {
    match: /^apps\/server\/src\/modules\/rules\/constants\//,
    docs: ["docs/Rules.mdx", "docs/Glossary.md"],
  },
  {
    match: /^apps\/server\/src\/modules\/rules\/helpers\/rule\.comparator/,
    docs: ["docs/Rules.mdx"],
  },
  {
    match: /^apps\/server\/src\/modules\/rules\//,
    docs: ["docs/Rules.mdx", "docs/Glossary.md"],
  },
  {
    match: /^apps\/server\/src\/modules\/notifications\//,
    docs: ["docs/Notifications.md"],
  },
  {
    match: /^apps\/server\/src\/modules\/collections\//,
    docs: ["docs/Collections.md"],
  },
  {
    match: /^apps\/server\/src\/database\/migrations\//,
    docs: ["docs/Configuration.md", "docs/Migration.md"],
  },
  { match: /\.controller\.ts$/, docs: ["docs/API.md"] },
  { match: /^packages\/contracts\//, docs: ["docs/API.md"] },
];

const docsForFiles = (files) => {
  const set = new Set();
  for (const f of files) {
    for (const m of DOC_MAP) {
      if (m.match.test(f)) for (const d of m.docs) set.add(d);
    }
  }
  return [...set];
};

const readDocSnippet = (relPath) => {
  const abs = path.join(DOCS_ROOT, relPath);
  if (!existsSync(abs)) return null;
  let text = readFileSync(abs, "utf8");
  if (text.length > MAX_DOC_CHARS) {
    text = text.slice(0, MAX_DOC_CHARS) + "\n…[truncated]";
  }
  return text;
};

const callModel = async (messages) => {
  const res = await fetch(MODELS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.1 }),
  });
  if (!res.ok) {
    throw new Error(`GitHub Models ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
};

const header = () => [
  "",
  "### 🤖 Documentation-labeled issues resolved by merged PRs",
  "",
];

const fail = (msg) => {
  log(msg);
  writeOutput(
    [...header(), `_AI analysis skipped: ${msg}_`, ""].join("\n") + "\n",
  );
  process.exit(0);
};

if (!token) fail("no GITHUB_TOKEN available");

const baseDateIso = runGit(["log", "-1", "--format=%aI", BASE_REF]);
if (!baseDateIso) fail(`could not resolve date for ${BASE_REF}`);
const baseDate = new Date(baseDateIso);
log(`base ref ${BASE_REF} date=${baseDateIso}`);

let issueList;
try {
  issueList = JSON.parse(
    runGh([
      "issue",
      "list",
      "--repo",
      GITHUB_REPOSITORY,
      "--label",
      "documentation",
      "--state",
      "all",
      "--limit",
      "100",
      "--json",
      "number,title,url,state",
    ]),
  );
} catch (e) {
  fail(`gh issue list failed: ${e.message}`);
}
log(`found ${issueList.length} documentation-labeled issues`);

const prBucket = new Map();
for (const issue of issueList) {
  let timeline;
  try {
    timeline = JSON.parse(
      runGh([
        "api",
        `repos/${GITHUB_REPOSITORY}/issues/${issue.number}/timeline`,
        "--paginate",
      ]),
    );
  } catch (e) {
    log(`  issue #${issue.number}: timeline fetch failed (${e.message})`);
    continue;
  }
  const mergedPrs = (timeline || [])
    .filter((ev) => ev.event === "cross-referenced")
    .map((ev) => ev.source?.issue)
    .filter((iss) => iss?.pull_request?.merged_at)
    .filter((iss) => new Date(iss.pull_request.merged_at) >= baseDate);
  for (const pr of mergedPrs) {
    const existing = prBucket.get(pr.number) || {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      issues: [],
    };
    if (!existing.issues.some((i) => i.number === issue.number)) {
      existing.issues.push({
        number: issue.number,
        title: issue.title,
        url: issue.url,
      });
    }
    prBucket.set(pr.number, existing);
  }
}

const prs = [...prBucket.values()].sort((a, b) => a.number - b.number);
log(
  `${prs.length} unique merged PRs resolve documentation-labeled issues in range`,
);

const lines = [...header()];
if (prs.length === 0) {
  lines.push(
    "_No merged PRs resolving `documentation`-labeled issues in this range._",
  );
  lines.push("");
  writeOutput(lines.join("\n") + "\n");
  process.exit(0);
}
lines.push(
  `Analyzing ${prs.length} merged PR${prs.length === 1 ? "" : "s"} that closed \`documentation\`-labeled issues since \`${BASE_REF}\`.`,
);
lines.push("");

const systemPrompt = `You are a documentation reviewer for the open-source project Maintainerr. For a merged PR, you identify concrete documentation updates needed.

Rules:
- Only propose edits justified by the PR diff, PR body, or linked issue content.
- Do not invent behaviour that isn't in the diff or body.
- Prefer short, specific edits like "add row to operator table for EXISTS" over rewrites.
- Format each suggestion as a bullet: \`- <doc-file>: <specific edit>\`
- If no doc change is needed, reply exactly: No docs changes needed.
- Output bullets only. No preamble, no code fences, no trailing commentary.`;

for (const pr of prs) {
  log(`processing PR #${pr.number}: ${pr.title}`);
  let detail;
  try {
    detail = JSON.parse(
      runGh([
        "pr",
        "view",
        String(pr.number),
        "--repo",
        GITHUB_REPOSITORY,
        "--json",
        "title,body,files,url",
      ]),
    );
  } catch (e) {
    log(`  gh pr view failed: ${e.message}`);
    lines.push(`**[PR #${pr.number}](${pr.url}) — ${pr.title}**`);
    lines.push("");
    lines.push(`_Could not fetch PR detail: ${e.message}_`);
    lines.push("");
    continue;
  }

  const files = (detail.files || [])
    .map((f) => f.path)
    .slice(0, MAX_FILES_PER_PR);
  const docs = docsForFiles(files);

  let issueBlocks = "";
  for (const iss of pr.issues.slice(0, 3)) {
    try {
      const idata = JSON.parse(
        runGh([
          "issue",
          "view",
          String(iss.number),
          "--repo",
          GITHUB_REPOSITORY,
          "--json",
          "title,body",
        ]),
      );
      let body = idata.body || "";
      if (body.length > MAX_ISSUE_BODY_CHARS) {
        body = body.slice(0, MAX_ISSUE_BODY_CHARS) + "…[truncated]";
      }
      issueBlocks += `\n\n#### Issue #${iss.number}: ${idata.title}\n${body}`;
    } catch (e) {
      log(`  gh issue view #${iss.number} failed: ${e.message}`);
    }
  }

  let docContext = "";
  for (const d of docs.slice(0, 3)) {
    const snip = readDocSnippet(d);
    if (snip) docContext += `\n\n#### ${d}\n\`\`\`\n${snip}\n\`\`\``;
  }

  const prBody = (detail.body || "").slice(0, MAX_PR_BODY_CHARS);
  const userPrompt = [
    `PR #${pr.number}: ${detail.title}`,
    `URL: ${detail.url}`,
    "",
    "## PR body",
    prBody || "(empty)",
    "",
    "## Changed files",
    files.map((f) => `- ${f}`).join("\n") || "(none)",
    "",
    `## Linked documentation-labeled issue(s)${issueBlocks || "\n(none)"}`,
    "",
    `## Current state of likely-affected docs${docContext || "\n(no file match)"}`,
    "",
    "Propose concrete documentation edits needed to reflect this merged PR.",
  ].join("\n");

  const issueRefs = pr.issues.map((i) => `[#${i.number}](${i.url})`).join(", ");
  lines.push(
    `**[PR #${pr.number}](${pr.url}) — ${detail.title}**  \nResolves: ${issueRefs}`,
  );
  lines.push("");

  if (userPrompt.length > MAX_PROMPT_CHARS) {
    log(`  prompt too large (${userPrompt.length} chars); skipping model call`);
    lines.push("_Prompt too large to analyze. Review manually._");
    lines.push("");
    continue;
  }

  try {
    const suggestion = await callModel([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    lines.push(suggestion || "_Empty model response._");
  } catch (e) {
    log(`  model call failed: ${e.message}`);
    lines.push(`_Model call failed: ${e.message}_`);
  }
  lines.push("");
}

lines.push("");
lines.push(
  "_AI suggestions are informational and may be incomplete or wrong. Always review the actual PR diff before writing docs._",
);

writeOutput(lines.join("\n") + "\n");
