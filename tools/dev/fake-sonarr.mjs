#!/usr/bin/env node
/**
 * Dev-only mock Sonarr (v3 API) HTTP server for Maintainerr.
 *
 * Mirror of tools/dev/fake-radarr.mjs for the Sonarr side. Maintainerr's Sonarr
 * client (apps/server/.../servarr-api/helpers/sonarr.helper.ts) talks to a real
 * Sonarr over HTTP; the fake media servers don't cover it, so the show-tagging
 * (membership / exclusion) and action flows can't be exercised from a DB seed
 * alone. This stub answers the endpoints those flows need.
 *
 * It is intentionally minimal and invented — no real media names (repo rule). Any
 * tvdbId queried resolves to a deterministic series (series id == tvdbId), so it
 * pairs with collection_media rows seeded with a tvdbId.
 *
 * Usage
 * -----
 *   node tools/dev/fake-sonarr.mjs                 # listens on :8989
 *   FAKE_SONARR_PORT=8989 node tools/dev/fake-sonarr.mjs
 *   FAKE_SONARR_LOG=0 node tools/dev/fake-sonarr.mjs   # silence the per-request log
 *
 * Point sonarr_settings.url at http://localhost:8989, start this before/alongside
 * `yarn dev`, then drive a run with POST /api/rules/:id/execute (membership tags)
 * or the exclusion endpoints (exclusion tags).
 */
import http from "node:http";

const PORT = Number(process.env.FAKE_SONARR_PORT ?? 8989);
const LOG = process.env.FAKE_SONARR_LOG !== "0";

// In-memory tag store (id -> { id, label }) and per-series tag membership
// (seriesId -> Set<tagId>), so the tagging flow can be driven and asserted via
// GET /tag and GET /series.
const tags = new Map();
let nextTagId = 1;
const seriesTags = new Map();

// Sonarr restricts tag labels to ^[a-z0-9-]+$ (lowercase alnum + hyphen) and
// 400s otherwise — mirror it so the label-charset path is exercised offline.
const isValidTagLabel = (label) => /^[a-z0-9-]+$/.test(String(label));

const ensureTag = (label) => {
  for (const tag of tags.values()) {
    if (tag.label.toLowerCase() === String(label).toLowerCase()) return tag;
  }
  const tag = { id: nextTagId++, label: String(label) };
  tags.set(tag.id, tag);
  if (LOG) console.log(`  + tag created: ${tag.id} '${tag.label}'`);
  return tag;
};

// A deterministic series for any requested id/tvdbId — id and tvdbId are kept
// equal so a collection_media.tvdbId resolves straight through to a "series".
const seriesFor = (tvdbId) => ({
  id: tvdbId,
  tvdbId,
  title: `Mock Series ${tvdbId}`,
  year: 2020,
  monitored: true,
  status: "continuing",
  qualityProfileId: 1,
  path: `/tv/mock-${tvdbId}`,
  seasons: [{ seasonNumber: 1, monitored: true }],
  statistics: { episodeFileCount: 1 },
  tags: [...(seriesTags.get(tvdbId) ?? [])],
});

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
  return status;
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch {
        resolve(undefined);
      }
    });
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname.replace(/^\/api\/v3/, ""); // client base ends in /api/v3/
  const method = req.method ?? "GET";
  let status;

  // --- Connection / lookups --------------------------------------------------
  if (method === "GET" && path === "/system/status") {
    status = send(res, 200, { appName: "Sonarr", version: "4.0.0.0" });
  } else if (method === "GET" && path === "/series") {
    const tvdbId = Number(url.searchParams.get("tvdbId"));
    status = send(res, 200, tvdbId ? [seriesFor(tvdbId)] : []);
  } else if (method === "GET" && /^\/series\/\d+$/.test(path)) {
    status = send(res, 200, seriesFor(Number(path.split("/")[2])));
  } else if (method === "PUT" && /^\/series(\/\d+)?$/.test(path)) {
    // updateSeries posts the whole series object back; echo it.
    const body = (await readBody(req)) ?? {};
    status = send(res, 200, body);
  } else if (method === "GET" && path === "/episode") {
    status = send(res, 200, []); // no episodes to act on in the mock

    // --- Tags (membership / exclusion tagging) -------------------------------
  } else if (method === "GET" && path === "/tag") {
    status = send(res, 200, [...tags.values()]);
  } else if (method === "POST" && path === "/tag") {
    const body = (await readBody(req)) ?? {};
    if (!isValidTagLabel(body.label)) {
      status = send(res, 400, [
        {
          propertyName: "Label",
          errorMessage: "Allowed characters a-z, 0-9 and -",
          attemptedValue: body.label,
          severity: "error",
        },
      ]);
    } else {
      status = send(res, 201, ensureTag(body.label));
    }
  } else if (method === "PUT" && path === "/series/editor") {
    // Bulk tag editor: { seriesIds, tags: [tagId], applyTags: 'add'|'remove' }.
    const body = (await readBody(req)) ?? {};
    const mode = body.applyTags;
    for (const seriesId of body.seriesIds ?? []) {
      const set = seriesTags.get(seriesId) ?? new Set();
      for (const tagId of body.tags ?? []) {
        if (mode === "remove") set.delete(tagId);
        else set.add(tagId); // 'add' (we never send 'replace')
      }
      seriesTags.set(seriesId, set);
      if (LOG) {
        console.log(`  ~ series ${seriesId} tags ${mode}: [${[...set]}]`);
      }
    }
    status = send(res, 200, (body.seriesIds ?? []).map(seriesFor));

    // --- Misc endpoints other flows may probe --------------------------------
  } else if (
    method === "GET" &&
    ["/qualityProfile", "/rootfolder", "/diskspace", "/queue"].includes(path)
  ) {
    status = send(res, 200, []);
  } else {
    status = send(res, 404, { message: "Not found in fake-sonarr" });
  }

  if (LOG) console.log(`${method} ${url.pathname}${url.search} -> ${status}`);
});

server.listen(PORT, () => {
  console.log(`fake-sonarr listening on http://localhost:${PORT} (api/v3)`);
  console.log(
    "Resolves any tvdbId to a series (id == tvdbId); supports /tag + PUT /series/editor.",
  );
});
