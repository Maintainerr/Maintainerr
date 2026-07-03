#!/usr/bin/env node
/**
 * Dev-only mock Seerr (v1 API) for Maintainerr.
 *
 * Maintainerr's Seerr client (apps/server/.../seerr-api/) talks to a real Seerr
 * over HTTP under /api/v1. The media-server mocks don't cover it, so the Seerr
 * getter path (isRequested / amountRequested / requestDate / addUser /
 * approvalDate / mediaAddedAt / releaseDate, at movie and season/episode level)
 * can't be exercised from a DB seed alone. This stub answers the endpoints that
 * path needs so the whole thing can be driven without a real Seerr.
 *
 * It exists to demonstrate the fix for #3152: under a whole-library run the
 * old getter made a per-item GET /movie|/tv call, which rate-limited and made
 * Seerr-seeded rules silently match almost nothing. The fix replaces those with
 * ONE bulk GET /request sweep per run. To prove that, this mock can be put in a
 * "flaky" mode (FAKE_SEERR_FLAKY=1) where the per-item /movie and /tv endpoints
 * fail with 429/503 while /request stays healthy - so the bulk path keeps
 * working and the per-item path collapses.
 *
 * Faithful to a real Seerr's /request shape (verified against a live instance):
 *   - GET /request is paginated ({ pageInfo:{page,pages,pageSize,results}, results })
 *   - each result carries request.media (tmdbId, status, updatedAt, mediaAddedAt)
 *   - each TV request carries request.seasons[] ({ seasonNumber, status })
 *   - media.requests is NOT populated on the list endpoint (would be circular)
 *
 * It is intentionally minimal and invented - no real media names (repo rule).
 * Titles are generic; tmdbIds are plain numbers (like fake-radarr). The set of
 * "requested" tmdbIds is configurable so it can be paired with whatever media
 * server library is under test.
 *
 * Usage
 * -----
 *   node tools/dev/fake-seerr.mjs                      # listens on :5055
 *   FAKE_SEERR_PORT=5055 node tools/dev/fake-seerr.mjs
 *   FAKE_SEERR_FLAKY=1 node tools/dev/fake-seerr.mjs   # /movie and /tv rate-limit
 *   FAKE_SEERR_TMDB_IDS=603,1396,1408 node tools/dev/fake-seerr.mjs  # explicit ids
 *   FAKE_SEERR_LOG=0 node tools/dev/fake-seerr.mjs     # silence the request log
 *
 * The dev seed (tools/dev/seed-db.mjs) points settings.seerr_url at
 * http://localhost:5055, so no settings change is needed - just start this
 * before (or alongside) `yarn dev`.
 */
import http from 'node:http';

const PORT = Number(process.env.FAKE_SEERR_PORT ?? 5055);
const LOG = process.env.FAKE_SEERR_LOG !== '0';
const FLAKY = process.env.FAKE_SEERR_FLAKY === '1';

// The tmdbIds that have a request. Pairs with the media server library under
// test: any library item resolving to one of these ids is "requested".
//   - FAKE_SEERR_TMDB_IDS=603,1396,...  : explicit list
//   - default                           : a deterministic synthetic range that
//                                          yields >120 requests across >1 page
const REQUESTED_TMDB_IDS = (() => {
  const explicit = process.env.FAKE_SEERR_TMDB_IDS;
  if (explicit) {
    return explicit
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  }
  // 130 synthetic ids: 90 movies (700001..700090) + 40 shows (710001..710040).
  const ids = [];
  for (let i = 1; i <= 90; i++) ids.push(700000 + i);
  for (let i = 1; i <= 40; i++) ids.push(710000 + i);
  return ids;
})();

// Three Seerr user shapes so addUser exercises every userType resolution path
// (Plex / local / Jellyfin). Names are invented.
const USERS = [
  {
    id: 1,
    userType: 1,
    plexUsername: 'devseed-plex',
    username: 'devseed-plex@example.test',
    displayName: 'devseed-plex',
  },
  {
    id: 2,
    userType: 2,
    username: 'devseed-local',
    plexUsername: '',
    displayName: 'devseed-local',
  },
  {
    id: 3,
    userType: 3,
    jellyfinUsername: 'devseed-jelly',
    username: 'devseed-jelly@example.test',
    displayName: 'devseed-jelly',
  },
];

const ISO = (daysAgo) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

// Seerr request/media status enums (mirror the codebase):
//   request.status: 1 PENDING, 2 APPROVED, 3 DECLINED, 4 FAILED, 5 COMPLETED
//   media.status:   1 UNKNOWN, 2 PENDING, 3 PROCESSING, 4 PARTIALLY_AVAILABLE, 5 AVAILABLE
const REQUEST_APPROVED = 2;
const MEDIA_AVAILABLE = 5;
const MEDIA_PROCESSING = 3;

// Build the flat request list once. Most titles get a single request; every
// 7th gets a second request from another user (so amountRequested > 1 and
// addUser de-dupes/aggregates). Roughly half are "available" (media.status 5,
// so approvalDate/mediaAddedAt resolve) and half still processing (status 3,
// so those date props are null) - exercises the status gate.
function buildRequests() {
  const requests = [];
  let requestId = 1;
  REQUESTED_TMDB_IDS.forEach((tmdbId, index) => {
    const isShow = tmdbId >= 710000 && tmdbId < 720000;
    const available = index % 2 === 0;
    const media = {
      id: 1000 + index,
      tmdbId,
      tvdbId: isShow ? 800000 + index : 0,
      status: available ? MEDIA_AVAILABLE : MEDIA_PROCESSING,
      updatedAt: ISO(index % 30),
      mediaAddedAt: available ? ISO(index % 30) : null,
    };
    const requesterCount = index % 7 === 0 ? 2 : 1;
    for (let r = 0; r < requesterCount; r++) {
      const user = USERS[(index + r) % USERS.length];
      const base = {
        id: requestId++,
        status: REQUEST_APPROVED,
        createdAt: ISO((index % 30) + 1),
        updatedAt: ISO(index % 30),
        requestedBy: user,
        modifiedBy: user,
        is4k: false,
        serverId: 1,
        profileId: 1,
        rootFolder: isShow ? '/tv' : '/movies',
        media,
      };
      if (isShow) {
        // First request covers seasons 1-2, the second (if any) season 3 - so a
        // season-scoped rule can match a specific season's request.
        const seasonNumbers = r === 0 ? [1, 2] : [3];
        requests.push({
          ...base,
          type: 'tv',
          seasons: seasonNumbers.map((seasonNumber) => ({
            id: seasonNumber,
            seasonNumber,
            status: REQUEST_APPROVED,
          })),
        });
      } else {
        requests.push({ ...base, type: 'movie' });
      }
    }
  });
  return requests;
}

const ALL_REQUESTS = buildRequests();

// --- Per-item detail payloads (releaseDate fallback path) ------------------------
// releaseDate is NOT derivable from /request, so the getter still calls these.
// They are the endpoints made flaky to reproduce #3152.
const movieDetail = (tmdbId) => ({
  id: tmdbId,
  mediaInfo: { tmdbId, status: MEDIA_AVAILABLE },
  releaseDate: '2020-05-01',
});
const tvDetail = (tmdbId) => ({
  id: tmdbId,
  mediaInfo: { tmdbId, status: MEDIA_AVAILABLE },
  firstAirDate: '2019-09-01',
  seasons: [
    { id: 1, name: 'Season 1', seasonNumber: 1, airDate: '2019-09-01', episodes: [] },
    { id: 2, name: 'Season 2', seasonNumber: 2, airDate: '2020-09-01', episodes: [] },
  ],
});
const seasonDetail = (seasonNumber) => ({
  id: seasonNumber,
  name: `Season ${seasonNumber}`,
  seasonNumber,
  airDate: '2020-09-01',
  episodes: [
    { id: 1, name: 'Episode 1', seasonNumber, episodeNumber: 1, airDate: '2020-09-01' },
  ],
});

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
  return status;
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/api\/v1/, ''); // client base ends in /api/v1
  const method = req.method ?? 'GET';
  let status;

  // --- Connection test -----------------------------------------------------
  if (method === 'GET' && path === '/settings/about') {
    status = send(res, 200, {
      version: '2.0.0-fake',
      totalMediaItems: REQUESTED_TMDB_IDS.length,
      totalRequests: ALL_REQUESTS.length,
    });
  } else if (method === 'GET' && path === '/status') {
    status = send(res, 200, {
      version: '2.0.0-fake',
      commitTag: 'fake',
      updateAvailable: false,
      commitsBehind: 0,
    });

    // --- Bulk request sweep (the fix path; stays healthy even when flaky) ---
  } else if (method === 'GET' && path === '/request') {
    // Honor `take` as-is - real Seerr imposes no upper bound (default 10).
    const take = Number(url.searchParams.get('take')) || 10;
    const skip = Number(url.searchParams.get('skip')) || 0;
    const pageItems = ALL_REQUESTS.slice(skip, skip + take);
    const pages = Math.ceil(ALL_REQUESTS.length / take);
    status = send(res, 200, {
      pageInfo: {
        page: Math.floor(skip / take) + 1,
        pages,
        pageSize: take,
        results: ALL_REQUESTS.length,
      },
      results: pageItems,
    });

    // --- Per-item detail (releaseDate fallback) - flaky to reproduce #3152 --
  } else if (method === 'GET' && /^\/movie\/\d+$/.test(path)) {
    if (FLAKY) {
      status = send(res, 429, { message: 'Rate limit exceeded (fake-seerr flaky)' });
    } else {
      status = send(res, 200, movieDetail(Number(path.split('/')[2])));
    }
  } else if (method === 'GET' && /^\/tv\/\d+$/.test(path)) {
    if (FLAKY) {
      status = send(res, 503, { message: 'Service unavailable (fake-seerr flaky)' });
    } else {
      status = send(res, 200, tvDetail(Number(path.split('/')[2])));
    }
  } else if (method === 'GET' && /^\/tv\/\d+\/season\/\d+$/.test(path)) {
    if (FLAKY) {
      status = send(res, 503, { message: 'Service unavailable (fake-seerr flaky)' });
    } else {
      status = send(res, 200, seasonDetail(Number(path.split('/')[4])));
    }

    // --- Users (paginated, like the real /user) ------------------------------
  } else if (method === 'GET' && path === '/user') {
    const take = Number(url.searchParams.get('take')) || 50;
    const skip = Number(url.searchParams.get('skip')) || 0;
    status = send(res, 200, {
      pageInfo: {
        page: Math.floor(skip / take) + 1,
        pages: 1,
        pageSize: take,
        results: USERS.length,
      },
      results: USERS,
    });

    // --- Writes other flows may probe (request/media deletion) ---------------
  } else if (method === 'DELETE') {
    status = send(res, 200, { code: 'ok', description: 'deleted (fake-seerr)' });
  } else {
    status = send(res, 404, { message: 'Not found in fake-seerr' });
  }

  if (LOG) console.log(`${method} ${url.pathname}${url.search} -> ${status}`);
});

server.listen(PORT, () => {
  const movies = REQUESTED_TMDB_IDS.filter((id) => id < 710000 || id >= 720000).length;
  const shows = REQUESTED_TMDB_IDS.length - movies;
  console.log(`fake-seerr listening on http://localhost:${PORT} (api/v1)`);
  console.log(
    `  ${ALL_REQUESTS.length} requests across ${REQUESTED_TMDB_IDS.length} titles ` +
      `(${movies} movie / ${shows} tv); GET /request paginates.`,
  );
  console.log(
    FLAKY
      ? '  FLAKY mode: GET /movie/:id and /tv/:id return 429/503; /request stays healthy.'
      : '  Healthy mode: set FAKE_SEERR_FLAKY=1 to rate-limit the per-item endpoints.',
  );
});
