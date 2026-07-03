#!/usr/bin/env node
/**
 * Dev-only mock Sonarr (v3 API) HTTP server for Maintainerr.
 *
 * Maintainerr's Sonarr client (apps/server/.../servarr-api/helpers/sonarr.helper.ts)
 * talks to a real Sonarr over HTTP. The fake media servers (fake-plex / fake-jellyfin)
 * don't cover Sonarr, so the show/season getter paths can't be exercised from a DB
 * seed alone. This stub answers the handful of endpoints those getters need so the
 * whole thing can be driven without a real Sonarr.
 *
 * It exists to reproduce #3153: the `part_of_latest_season` getter scans a show's
 * seasons newest-first to find the latest *aired* season, probing season episode 1's
 * airDateUtc. The seeded show therefore has four seasons whose episode-1 air dates are
 * past, past, past, future - so the latest aired season is S2 and only the live full
 * run (which shares one memoized series object across the show's seasons) ever
 * mis-evaluated it. The two endpoints the getter actually calls are answered here:
 *   - GET /series?tvdbId=<id>            -> the resolved series (getSeriesByTvdbId)
 *   - GET /episode?seriesId=<id>&seasonNumber=<n> -> that season's episodes
 *
 * Like fake-radarr, any tvdbId resolves to a deterministic series (series id == tvdbId)
 * so a media item carrying any tvdb id pairs straight through. It is intentionally
 * minimal and invented - no real media names (repo rule).
 *
 * Usage
 * -----
 *   node tools/dev/fake-sonarr.mjs                 # listens on :8989 (matches dev seed)
 *   FAKE_SONARR_PORT=8989 node tools/dev/fake-sonarr.mjs
 *   FAKE_SONARR_LOG=0 node tools/dev/fake-sonarr.mjs   # silence the per-request log
 *
 * The dev seed (tools/dev/seed-db.mjs) points sonarr_settings.url at
 * http://localhost:8989, so no settings change is needed - start this before (or
 * alongside) `yarn dev`, then trigger a run with `POST /api/rules/:id/execute` or a
 * single-item check with `POST /api/rules/test`.
 */
import http from "node:http";

const PORT = Number(process.env.FAKE_SONARR_PORT ?? 8989);
const LOG = process.env.FAKE_SONARR_LOG !== "0";

const DAY = 86_400_000;
// Captured once so a process' answers stay stable across its lifetime.
const NOW = Date.now();
const iso = (msFromNow) => new Date(NOW + msFromNow).toISOString();

// Four seasons; specials (0) plus three numbered. Episode 1's air date per season
// decides "latest aired": S0/S1/S2 already aired, S3 airs in the future, so the
// latest aired season is S2. The race this mock exists to expose collapsed that to
// the earliest aired season on a full run.
const SEASON_NUMBERS = [0, 1, 2, 3];
const SEASON_EP1_AIR_OFFSET_DAYS = { 0: -900, 1: -400, 2: -30, 3: 400 };

const seasonsFor = () =>
  SEASON_NUMBERS.map((seasonNumber) => ({
    seasonNumber,
    monitored: seasonNumber !== 0,
    statistics: {
      episodeFileCount: 1,
      episodeCount: 1,
      totalEpisodeCount: 1,
      sizeOnDisk: 1024 ** 3,
      percentOfEpisodes: 100,
    },
  }));

// A deterministic series for any requested tvdbId - id and tvdbId are kept equal so
// getEpisodes(seriesId=...) resolves straight back to the same show.
const seriesFor = (tvdbId) => ({
  id: tvdbId,
  tvdbId,
  title: `Mock Series ${tvdbId}`,
  sortTitle: `mock series ${tvdbId}`,
  status: "continuing",
  ended: false,
  added: iso(-1000 * DAY),
  firstAired: iso(-900 * DAY),
  monitored: true,
  qualityProfileId: 1,
  seriesType: "standard",
  path: `/tv/mock-${tvdbId}`,
  seasonFolder: true,
  tags: [],
  genres: ["Drama"],
  originalLanguage: { id: 1, name: "English" },
  ratings: { votes: 100, value: 8 },
  seasons: seasonsFor(),
  statistics: {
    seasonCount: SEASON_NUMBERS.length - 1,
    episodeFileCount: 3,
    episodeCount: 3,
    totalEpisodeCount: 4,
    sizeOnDisk: 3 * 1024 ** 3,
    percentOfEpisodes: 100,
  },
});

// Episode 1 of a season, dated so the getter's airDateUtc comparison classifies the
// season as aired/unaired. Sonarr returns every episode for the season; the client
// filters to episodeNumber 1 itself, so one episode is enough.
const episodesFor = (seriesId, seasonNumber) => {
  const offsetDays = SEASON_EP1_AIR_OFFSET_DAYS[seasonNumber] ?? -100;
  const airDateUtc = iso(offsetDays * DAY);
  return [
    {
      id: seriesId * 100 + seasonNumber,
      seriesId,
      seasonNumber,
      episodeNumber: 1,
      title: `S${seasonNumber}E1`,
      airDate: airDateUtc.slice(0, 10),
      airDateUtc,
      hasFile: offsetDays < 0,
      monitored: seasonNumber !== 0,
      episodeFileId: offsetDays < 0 ? seriesId * 100 + seasonNumber : 0,
    },
  ];
};

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
  return status;
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname.replace(/^\/api\/v3/, ""); // client base ends in /api/v3/
  const method = req.method ?? "GET";
  let status;

  if (method === "GET" && path === "/system/status") {
    status = send(res, 200, { appName: "Sonarr", version: "4.0.0.0" });
  } else if (method === "GET" && path === "/series") {
    // getSeriesByTvdbId -> GET /series?tvdbId=<id>. With no tvdbId this is the
    // full library list; the getters never need it, so an empty list is fine.
    const tvdbId = Number(url.searchParams.get("tvdbId"));
    status = send(res, 200, tvdbId ? [seriesFor(tvdbId)] : []);
  } else if (method === "GET" && /^\/series\/\d+$/.test(path)) {
    status = send(res, 200, seriesFor(Number(path.split("/")[2])));
  } else if (method === "GET" && path === "/series/lookup") {
    status = send(res, 200, []);
  } else if (method === "GET" && path === "/episode") {
    const seriesId = Number(url.searchParams.get("seriesId"));
    const seasonParam = url.searchParams.get("seasonNumber");
    if (!seriesId) {
      status = send(res, 200, []);
    } else if (seasonParam !== null) {
      status = send(res, 200, episodesFor(seriesId, Number(seasonParam)));
    } else {
      // Whole-series episode list: episode 1 of every season.
      status = send(
        res,
        200,
        SEASON_NUMBERS.flatMap((n) => episodesFor(seriesId, n)),
      );
    }
  } else if (
    method === "GET" &&
    ["/qualityprofile", "/rootfolder", "/tag", "/diskspace", "/queue"].includes(
      path,
    )
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
    "Any tvdbId resolves to a 4-season show; latest aired season is S2 (S3 airs in the future).",
  );
});
