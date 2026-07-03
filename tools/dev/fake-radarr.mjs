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
 * It deliberately replicates the behaviour this exists to demonstrate: Radarr
 * validates every exclusion POST (RestController.OnActionExecuting runs the
 * uniqueness validator on each resource), so both the singular POST /exclusions
 * and POST /exclusions/bulk return HTTP 400 ("This exclusion has already been
 * added") on a duplicate tmdbId. Maintainerr therefore treats that 400 as
 * "already excluded" (#3084).
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
// Library root reported by /rootfolder and used to build each movie's `path`
// (<root>/mock-<tmdbId>). Point it at a writable dir to exercise the leftover-
// folder cleanup flow against a real filesystem; defaults to a Radarr-style path.
const LIBRARY_ROOT = process.env.FAKE_RADARR_LIBRARY_ROOT ?? "/movies";

// In-memory import-list-exclusion store (tmdbId -> resource). Persists for the
// lifetime of the process so re-running collection handling demonstrates the
// duplicate-rejection 400.
const exclusions = new Map();
let nextExclusionId = 1;

// In-memory tag store (id -> { id, label }) and per-movie tag membership
// (movieId -> Set<tagId>), so the membership/exclusion tagging flow can be driven
// and asserted via GET /tag and GET /movie.
const tags = new Map();
let nextTagId = 1;
const movieTags = new Map();

// Radarr restricts tag labels to ^[a-z0-9-]+$ (lowercase alnum + hyphen) and
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
  path: `${LIBRARY_ROOT}/mock-${tmdbId}`,
  tags: [...(movieTags.get(tmdbId) ?? [])],
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
  } else if (method === "DELETE" && /^\/movie\/\d+$/.test(path)) {
    // Radarr deletes the movie (and, with deleteFiles=true, its files). The mock
    // doesn't touch disk — the leftover-folder cleanup acts on whatever strays
    // remain in the movie folder afterwards.
    status = send(res, 200, {});
  } else if (method === "GET" && path === "/moviefile") {
    status = send(res, 200, []); // no files to delete in the mock

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
  } else if (method === "PUT" && path === "/movie/editor") {
    // Bulk tag editor: { movieIds, tags: [tagId], applyTags: 'add'|'remove' }.
    const body = (await readBody(req)) ?? {};
    const mode = body.applyTags;
    for (const movieId of body.movieIds ?? []) {
      const set = movieTags.get(movieId) ?? new Set();
      for (const tagId of body.tags ?? []) {
        if (mode === "remove") set.delete(tagId);
        else set.add(tagId); // 'add' (we never send 'replace')
      }
      movieTags.set(movieId, set);
      if (LOG) {
        console.log(`  ~ movie ${movieId} tags ${mode}: [${[...set]}]`);
      }
    }
    status = send(res, 200, (body.movieIds ?? []).map(movieFor));

    // --- Import list exclusions ----------------------------------------------
  } else if (method === "POST" && path === "/exclusions/bulk") {
    // Bulk endpoint: validated like the singular one. The validator runs on
    // every posted resource, so a single already-excluded tmdbId fails the whole
    // request with HTTP 400 and nothing is inserted.
    const body = (await readBody(req)) ?? [];
    const duplicate = body.find((item) => exclusions.has(item.tmdbId));
    if (duplicate) {
      status = send(res, 400, [
        {
          propertyName: "TmdbId",
          errorMessage: "This exclusion has already been added.",
          severity: "error",
        },
      ]);
    } else {
      for (const item of body) {
        exclusions.set(item.tmdbId, { ...item, id: nextExclusionId++ });
        if (LOG) console.log(`  + exclusion added: tmdbId ${item.tmdbId}`);
      }
      status = send(res, 200, body);
    }
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
  } else if (method === "GET" && path === "/rootfolder") {
    status = send(res, 200, [
      { id: 1, path: LIBRARY_ROOT, freeSpace: 1024 ** 4, unmappedFolders: [] },
    ]);
  } else if (
    method === "GET" &&
    ["/qualityProfile", "/diskspace", "/queue"].includes(path)
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
    "POST /exclusions and POST /exclusions/bulk both 400 on a duplicate tmdbId.",
  );
});
