#!/usr/bin/env node
// Reports endpoints added or removed in the upstream OpenAPI specs Maintainerr
// integrates against.
//
//   node tools/api-spec-drift.mjs            report drift against the baseline
//   node tools/api-spec-drift.mjs --update   report, and refresh the baseline
//
// SPECS is the only place these URLs live, and every one is fetched on each run,
// so a dead URL fails. AGENTS.md and implementation.instructions.md point here
// rather than restating them.
//
// Field-level schema changes are deliberately not tracked: they churn on every
// upstream release and would bury the signal that an endpoint moved or vanished.
//
// Integrations with no spec to track: Tautulli (a single /api/v2?cmd= endpoint),
// Sportarr, Streamystats, TMDB, and the plex.tv community GraphQL API. GitHub
// publishes one, but it is 13 MB and we only use it for release checks.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();
const outputPath = process.env.OUTPUT_PATH || null;
const update = process.argv.includes("--update");
const baselinePath = path.join(repoRoot, "tools/api-spec-drift.baseline.json");

const SPECS = {
  // Emby's own spec is Swagger 2.0 and ships with a trailing comma, so it is
  // not valid JSON. It parses as YAML, which is why the parser falls back.
  emby: "https://raw.githubusercontent.com/MediaBrowser/Emby.SDK/master/Documentation/Download/openapi_v2_noversion.json",
  // The published stable spec runs ahead of released servers, so it can list
  // endpoints a given instance lacks and omit deprecated ones it still serves.
  jellyfin: "https://api.jellyfin.org/openapi/jellyfin-openapi-stable.json",
  plex: "https://raw.githubusercontent.com/LukasParke/plex-api-spec/refs/heads/main/plex-api-spec.yaml",
  qbittorrent:
    "https://raw.githubusercontent.com/qbittorrent-ecosystem/webui-api-openapi/master/specs/v2.0.0/build/openapi.yaml",
  radarr:
    "https://raw.githubusercontent.com/Radarr/Radarr/develop/src/Radarr.Api.V3/openapi.json",
  seerr:
    "https://raw.githubusercontent.com/seerr-team/seerr/develop/seerr-api.yml",
  sonarr:
    "https://raw.githubusercontent.com/Sonarr/Sonarr/develop/src/Sonarr.Api.V3/openapi.json",
  // Tracearr attaches its spec to each GitHub release. Only v2 is tracked
  // because that is the version this codebase calls.
  tracearr:
    "https://github.com/connorgallopo/Tracearr/releases/latest/download/openapi-v2.json",
  tvdb: "https://thetvdb.github.io/v4-api/swagger.yml",
};

// OpenAPI path items also hold parameters/summary/servers/$ref, which are not operations.
const METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

const readBaseline = () => {
  let raw;
  try {
    raw = readFileSync(baselinePath, "utf8");
  } catch {
    return {};
  }
  // Only a missing file means "no baseline yet". A malformed one is a real
  // error: swallowing it would report every endpoint as newly added.
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${baselinePath} is not valid JSON: ${error.message}`);
  }
};

const endpointsOf = (spec) => {
  const found = [];
  for (const [route, item] of Object.entries(spec?.paths ?? {})) {
    for (const method of Object.keys(item ?? {})) {
      if (METHODS.has(method.toLowerCase())) {
        found.push(`${method.toUpperCase()} ${route}`);
      }
    }
  }
  return found.sort();
};

const FETCH_TIMEOUT_MS = 30_000;

const fetchEndpoints = async (url) => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    // statusText is empty over HTTP/2, so only append it when present.
    const detail = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(`HTTP ${response.status}${detail}`);
  }
  const body = await response.text();
  // YAML is a superset of JSON, so it also recovers specs that are nearly-valid
  // JSON. Trying JSON first keeps the common path fast and strict.
  let spec;
  try {
    spec = JSON.parse(body);
  } catch {
    spec = parseYaml(body);
  }
  const endpoints = endpointsOf(spec);
  // An empty spec means the fetch succeeded but the document was not what we
  // expect. Treating it as real would report every endpoint as removed.
  if (endpoints.length === 0) {
    throw new Error("spec contained no operations");
  }
  return endpoints;
};

const baseline = readBaseline();
const services = Object.keys(SPECS).sort();

const results = await Promise.all(
  services.map(async (service) => {
    try {
      return { service, endpoints: await fetchEndpoints(SPECS[service]) };
    } catch (error) {
      return { service, error: error.message };
    }
  }),
);

const failed = results.filter((r) => r.error);
const fetched = results.filter((r) => !r.error);

const diffs = {};
for (const { service, endpoints } of fetched) {
  const previous = new Set(baseline[service] ?? []);
  const current = new Set(endpoints);
  diffs[service] = {
    added: endpoints.filter((e) => !previous.has(e)),
    removed: [...previous].filter((e) => !current.has(e)).sort(),
    isNew: !baseline[service],
  };
}

const drifted = Object.entries(diffs).filter(
  ([, d]) => d.added.length > 0 || d.removed.length > 0,
);

const lines = ["## API spec drift", ""];
lines.push(
  "Endpoints added or removed in the upstream specs tracked by `tools/api-spec-drift.mjs`, compared against `tools/api-spec-drift.baseline.json`.",
);
lines.push("");

for (const [service, diff] of drifted) {
  lines.push(`### ${service}`);
  if (diff.isNew) {
    lines.push("");
    lines.push("_No baseline recorded yet - every endpoint shows as added._");
  }
  lines.push("");
  for (const endpoint of diff.removed) lines.push(`- Removed: \`${endpoint}\``);
  for (const endpoint of diff.added) lines.push(`- Added: \`${endpoint}\``);
  lines.push("");
}

const unchanged = Object.entries(diffs)
  .filter(([, d]) => d.added.length === 0 && d.removed.length === 0)
  .map(([service]) => service);
if (unchanged.length > 0) {
  lines.push(`_Unchanged: ${unchanged.join(", ")}._`);
  lines.push("");
}

if (failed.length > 0) {
  lines.push("### Not checked");
  lines.push("");
  for (const { service, error } of failed) {
    lines.push(`- \`${service}\`: ${error}`);
  }
  lines.push("");
}

if (drifted.length === 0 && failed.length === 0) {
  lines.push("No drift. Every tracked spec matches the baseline.");
  lines.push("");
}

if (drifted.length > 0) {
  lines.push(
    update
      ? "The refreshed baseline is part of this diff, so merging accepts the upstream state."
      : "Run `node tools/api-spec-drift.mjs --update` to accept the upstream state once the changes have been reviewed.",
  );
  lines.push("");
}

if (update) {
  if (failed.length > 0) {
    // Never accept a partial snapshot: the unread services would silently keep
    // their old endpoints while the rest move on.
    console.error(
      `Not writing the baseline: ${failed.length} spec(s) could not be fetched.`,
    );
  } else {
    const next = {};
    for (const { service, endpoints } of fetched) next[service] = endpoints;
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    console.error(`Wrote baseline for ${fetched.length} service(s)`);
  }
}

const output = lines.join("\n");
if (outputPath) {
  writeFileSync(outputPath, output);
  console.error(`Wrote drift report to ${outputPath}`);
} else {
  process.stdout.write(output);
}

process.exitCode = failed.length > 0 ? 1 : 0;
