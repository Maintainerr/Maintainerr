#!/usr/bin/env node
/**
 * Dev-only mock Radarr (v3 API) HTTP server for Maintainerr.
 *
 * Maintainerr's Radarr client (apps/server/.../servarr-api/helpers/radarr.helper.ts)
 * talks to a real Radarr over HTTP. The fake media servers (fake-jellyfin /
 * fake-plex) don't cover Radarr, so the collection-handler -> RadarrActionHandler
 * flow (DELETE / UNMONITOR / "add import list exclusion") can't be exercised from a
 * DB seed alone. This stub answers the handful of endpoints that flow needs so the
 * whole thing can be driven without a real Radarr.
 *
 * It deliberately replicates the one behaviour this exists to demonstrate: adding an
 * import list exclusion is idempotent on POST /exclusions/bulk (server de-dupes, no
 * error), whereas the singular POST /exclusions runs a uniqueness validator and
 * returns HTTP 400 ("This exclusion has already been added") on a duplicate — exactly
 * as the real Radarr controller does.
 *
 * It is intentionally minimal and invented — no real media names (repo rule). Any
 * tmdbId queried resolves to a deterministic movie (movie id == tmdbId), so it pairs
 * with collection_media rows seeded with a tmdbId.
 *
 * Usage
 * -----
 *   node tools/dev/fake-radarr.mjs                 # listens on :7878 (matches dev seed)
 *   FAKE_RADARR_PORT=7878 node tools/dev/fake-radarr.mjs
 *   FAKE_RADARR_LOG=0 node tools/dev/fake-radarr.mjs   # silence the per-request log
 *
 * The dev seed (tools/dev/seed-db.mjs) already points radarr_settings.url at
 * http://localhost:7878, so no settings change is needed — just start this before
 * (or alongside) `yarn dev`, then trigger a run with `POST /api/collections/handle`.
 */
import http from "node:http";

const PORT = Number(process.env.FAKE_RADARR_PORT ?? 7878);
const LOG = process.env.FAKE_RADARR_LOG !== "0";

// In-memory import-list-exclusion store (tmdbId -> resource). Persists for the
// lifetime of the process so re-running collection handling demonstrates the
// idempotent de-dupe.
const exclusions = new Map();
let nextExclusionId = 1;

// A deterministic movie for any requested id/tmdbId — id and tmdbId are kept equal
// so a collection_media.tmdbId resolves straight through to a Radarr "movie".
const movieFor = (tmdbId) => ({
  id: tmdbId,
  tmdbId,
  title: `Mock Movie ${tmdbId}`,
  year: 2020,
  monitored: true,
  hasFile: true,
  qualityProfileId: 1,
  sizeOnDisk: 1024 ** 3,
  path: `/movies/mock-${tmdbId}`,
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
    status = send(res, 200, { appName: "Radarr", version: "5.0.0.0" });
  } else if (method === "GET" && path === "/movie") {
    const tmdbId = Number(url.searchParams.get("tmdbId"));
    status = send(res, 200, tmdbId ? [movieFor(tmdbId)] : []);
  } else if (method === "GET" && /^\/movie\/\d+$/.test(path)) {
    status = send(res, 200, movieFor(Number(path.split("/")[2])));
  } else if (method === "PUT" && /^\/movie\/\d+$/.test(path)) {
    status = send(res, 200, movieFor(Number(path.split("/")[2])));
  } else if (method === "GET" && path === "/moviefile") {
    status = send(res, 200, []); // no files to delete in the mock

    // --- Import list exclusions ----------------------------------------------
  } else if (method === "POST" && path === "/exclusions/bulk") {
    // Bulk endpoint: de-dupes server-side, never 400s (the idempotent path).
    const body = (await readBody(req)) ?? [];
    for (const item of body) {
      if (!exclusions.has(item.tmdbId)) {
        exclusions.set(item.tmdbId, { ...item, id: nextExclusionId++ });
        if (LOG) console.log(`  + exclusion added: tmdbId ${item.tmdbId}`);
      } else if (LOG) {
        console.log(
          `  = exclusion already present (no-op): tmdbId ${item.tmdbId}`,
        );
      }
    }
    status = send(res, 200, body);
  } else if (method === "POST" && path === "/exclusions") {
    // Singular endpoint: uniqueness validator -> HTTP 400 on a duplicate.
    const body = (await readBody(req)) ?? {};
    if (exclusions.has(body.tmdbId)) {
      status = send(res, 400, [
        {
          propertyName: "TmdbId",
          errorMessage: "This exclusion has already been added.",
          severity: "error",
        },
      ]);
    } else {
      const resource = { ...body, id: nextExclusionId++ };
      exclusions.set(body.tmdbId, resource);
      status = send(res, 201, resource);
    }
  } else if (method === "GET" && path === "/exclusions") {
    status = send(res, 200, [...exclusions.values()]);

    // --- Misc endpoints other flows may probe --------------------------------
  } else if (
    method === "GET" &&
    ["/qualityProfile", "/rootfolder", "/diskspace", "/tag", "/queue"].includes(
      path,
    )
  ) {
    status = send(res, 200, []);
  } else {
    status = send(res, 404, { message: "Not found in fake-radarr" });
  }

  if (LOG) console.log(`${method} ${url.pathname}${url.search} -> ${status}`);
});

server.listen(PORT, () => {
  console.log(`fake-radarr listening on http://localhost:${PORT} (api/v3)`);
  console.log(
    "POST /exclusions/bulk de-dupes (idempotent); POST /exclusions 400s on a duplicate.",
  );
});
