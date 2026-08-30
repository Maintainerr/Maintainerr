#!/usr/bin/env node
/**
 * Dev-only mock Sportarr (native /api) HTTP server for Maintainerr.
 *
 * Maintainerr's Sportarr client (apps/server/.../servarr-api/helpers/sportarr.helper.ts)
 * talks to Sportarr's own API, not the Sonarr-v3 compatibility shim, so none of the
 * other mocks cover it. Without this the seeded Sportarr connection is dead, so every
 * Sportarr rule answers the transient signal and its items sit pinned as
 * evaluation-failed. This stub answers the endpoints the getter and action handler call.
 *
 * Leagues carry the canonical `lg-` external id the media server agents stamp, so the
 * seeded shows in fake-jellyfin / fake-emby / fake-plex resolve two ways:
 *   - the native `sportarr` provider id (Plex `sportarr://lg-000001`, Jellyfin/Emby
 *     `ProviderIds.Sportarr`)
 *   - the numeric alias in the tvdb namespace (`tvdb://900000001`), which is what a
 *     library refreshed before the agents stamped the native id still carries
 * A show with neither carries no league at all: the getter answers the transient
 * signal and logs it at debug, deliberately, so an ordinary show sitting in a sports
 * library cannot match a NOT_EXISTS rule (#3406).
 *
 * Writes (delete league, delete event files, monitor toggles, quality profile) are
 * accepted and logged but change nothing, like fake-radarr: the action handler's
 * request shape is what matters, not the state.
 *
 * Everything below is invented - no real leagues, teams or events (repo rule).
 *
 * Usage
 * -----
 *   node tools/dev/fake-sportarr.mjs                 # listens on :1867 (matches dev seed)
 *   FAKE_SPORTARR_PORT=1867 node tools/dev/fake-sportarr.mjs
 *   FAKE_SPORTARR_LOG=0 node tools/dev/fake-sportarr.mjs   # silence the per-request log
 *
 * The dev seed (tools/dev/seed-db.mjs) points sportarr_settings.url at
 * http://localhost:1867, so no settings change is needed - start this before (or
 * alongside) `yarn dev`, then trigger a run with `POST /api/rules/:id/execute` or a
 * single-item check with `POST /api/rules/test`.
 */
import http from "node:http";

const PORT = Number(process.env.FAKE_SPORTARR_PORT ?? 1867);
const LOG = process.env.FAKE_SPORTARR_LOG !== "0";

const DAY = 86_400_000;
// Captured once so a process' answers stay stable across its lifetime.
const NOW = Date.now();
const iso = (msFromNow) => new Date(NOW + msFromNow).toISOString();

// Must be >= MINIMUM_SPORTARR_VERSION in packages/contracts; the connection test
// refuses anything older.
const VERSION = "4.1.5.1115";

const QUALITY_PROFILES = [
  { id: 1, name: "WEB-1080p (mock)", isDefault: true },
  { id: 2, name: "WEB-2160p (mock)", isDefault: false },
];

// Two leagues. The external id's digits plus the frozen 900,000,000 offset are the
// tvdb alias the media-server mocks stamp, so lg-000001 <-> tvdb://900000001.
const LEAGUES = [
  {
    id: 1,
    externalId: "lg-000001",
    name: "Mock League Alpha",
    sport: "Mock Sport",
    country: "XX",
    monitored: true,
    added: iso(-400 * DAY),
    qualityProfileId: 1,
  },
  {
    id: 42,
    externalId: "lg-000042",
    name: "Mock League Bravo",
    sport: "Other Mock Sport",
    country: "XX",
    monitored: false,
    added: iso(-120 * DAY),
    qualityProfileId: 2,
  },
];

// Seasons are calendar years, which is how Sportarr models them. One season aired and
// one still to come, so "has upcoming events" is true and the downloaded-event count
// is a fraction of the total rather than all or nothing.
const SEASONS = [2025, 2026];
const eventsFor = (league) =>
  SEASONS.flatMap((seasonNumber, seasonIndex) =>
    [1, 2, 3].map((episodeNumber) => {
      const index = seasonIndex * 3 + episodeNumber;
      const aired = seasonNumber === SEASONS[0];
      return {
        id: league.id * 1000 + index,
        externalId: `ev-${String(league.id * 1000 + index).padStart(6, "0")}`,
        title: `${league.name} round ${episodeNumber}`,
        sport: league.sport,
        leagueId: league.id,
        leagueName: league.name,
        season: String(seasonNumber),
        seasonNumber,
        episodeNumber,
        round: String(episodeNumber),
        eventDate: iso((aired ? -200 : 200) * DAY),
        broadcastDate: iso((aired ? -200 : 200) * DAY),
        venue: `Mock Venue ${episodeNumber}`,
        monitored: episodeNumber !== 3,
        hasFile: aired,
        filePath: aired
          ? `/sports/${league.name}/Season ${seasonNumber}/round-${episodeNumber}.mkv`
          : null,
        fileSize: aired ? 2 * 1024 ** 3 : null,
        quality: aired ? "WEBDL-1080p" : null,
        qualityProfileId: league.qualityProfileId,
      };
    }),
  );

// The list omits monitored counts; the detail carries them (same split as Sportarr).
const leagueDetail = (league) => {
  const events = eventsFor(league);
  return {
    ...league,
    eventCount: events.length,
    fileCount: events.filter((e) => e.hasFile).length,
  };
};

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
  return status;
};

const leagueById = (id) => LEAGUES.find((l) => l.id === Number(id));

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  // The client's base URL ends in /api/, so strip that prefix and match the rest.
  const API_PREFIX = "/api";
  const path = url.pathname.startsWith(API_PREFIX)
    ? url.pathname.slice(API_PREFIX.length)
    : url.pathname;
  const method = req.method ?? "GET";
  let status;

  if (method === "GET" && path === "/system/status") {
    status = send(res, 200, {
      appName: "Sportarr",
      version: VERSION,
      isDocker: true,
      isProduction: true,
    });
  } else if (method === "GET" && path === "/leagues") {
    status = send(res, 200, LEAGUES);
  } else if (method === "GET" && path === "/qualityprofile") {
    status = send(res, 200, QUALITY_PROFILES);
  } else if (method === "GET" && path.startsWith("/leagues/")) {
    const [, , idPart, tail] = path.split("/");
    const league = leagueById(idPart);
    if (!league) {
      status = send(res, 404, { message: "league not found" });
    } else if (!tail) {
      status = send(res, 200, leagueDetail(league));
    } else if (tail === "events") {
      status = send(res, 200, eventsFor(league));
    } else if (tail === "download-history") {
      // One grab per event that has a file, so the download-client cleanup after
      // a delete has something to walk.
      status = send(
        res,
        200,
        eventsFor(league)
          .filter((e) => e.hasFile)
          .map((e) => ({
            eventId: e.id,
            seasonNumber: e.seasonNumber,
            downloadId: `mockhash${e.id}`,
            torrentInfoHash: `mockhash${e.id}`,
            protocol: "torrent",
          })),
      );
    } else {
      status = send(res, 404, { message: "not found" });
    }
  } else if (
    (method === "DELETE" && path.startsWith("/leagues/")) ||
    (method === "DELETE" && path.startsWith("/events/")) ||
    (method === "PUT" && path.startsWith("/leagues/")) ||
    (method === "PUT" && path.startsWith("/events/"))
  ) {
    // Accepted, not applied. The action handler only checks that the call succeeds.
    status = send(res, 200, {});
  } else {
    status = send(res, 404, { message: "not found" });
  }

  if (LOG) {
    console.log(`${method} ${url.pathname}${url.search} -> ${status}`);
  }
});

server.listen(PORT, () => {
  console.log(`fake-sportarr listening on http://localhost:${PORT}`);
  console.log(
    `  leagues: ${LEAGUES.map((l) => `${l.externalId} (${l.name})`).join(", ")}`,
  );
});
