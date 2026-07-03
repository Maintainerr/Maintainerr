#!/usr/bin/env node
/**
 * Dev-only mock Jellyfin HTTP server for Maintainerr.
 *
 * Maintainerr's Jellyfin adapter (apps/server/.../jellyfin/jellyfin-adapter.service.ts)
 * talks to a real Jellyfin over HTTP via @jellyfin/sdk. A DB seed alone leaves the
 * editor's library dropdown disabled, blocks rule-group save (it verifies the
 * media-server connection + library), and leaves collection grids empty (each
 * collection_media row is hydrated against the live server). This stub answers the
 * handful of endpoints those flows need so the whole thing can be exercised without
 * a real Jellyfin.
 *
 * It is intentionally minimal and invented - no real media names (repo rule). The
 * dataset is small and deterministic so rule evaluation is predictable.
 *
 * Usage
 * -----
 *   node tools/dev/fake-jellyfin.mjs            # listens on :8096 (matches dev seed)
 *   FAKE_JELLYFIN_PORT=8096 node tools/dev/fake-jellyfin.mjs
 *   FAKE_JELLYFIN_LOG=1 node tools/dev/fake-jellyfin.mjs   # log every request
 *
 * The dev seed (tools/dev/seed-db.mjs) already points settings.jellyfin_url at
 * http://localhost:8096 with a fixed api key + user id, so no settings change is
 * needed - just start this before (or alongside) `yarn dev`.
 */
import http from 'node:http';
import { buildScaleLibrary } from './lib/scale-library.mjs';

const PORT = Number(process.env.FAKE_JELLYFIN_PORT ?? 8096);
const LOG = process.env.FAKE_JELLYFIN_LOG === '1';
const USER_ID = 'devseeduser000000000000000000jelly';

// --- Libraries (ids must match the dev seed's rule_group.libraryId values) -------
const LIBRARIES = [
  { Id: 'jellyfin-movies', Name: 'Movies (mock)', CollectionType: 'movies' },
  { Id: 'jellyfin-shows', Name: 'Shows (mock)', CollectionType: 'tvshows' },
];

// --- Items -----------------------------------------------------------------------
// A tiny, deterministic movie set used for rule evaluation. CommunityRating drives
// the "User rating (scale 1-10)" rule property (Plex.rating_audience -> CommunityRating).
// All names invented.
const ISO = (d) => new Date(d).toISOString();
function movie(id, name, rating, addDate) {
  return {
    Id: id,
    Name: name,
    Type: 'Movie',
    ServerId: 'mockserver',
    ParentId: 'jellyfin-movies',
    CommunityRating: rating,
    CriticRating: rating ? rating * 10 : undefined,
    ProductionYear: 2020,
    DateCreated: ISO(addDate),
    PremiereDate: ISO(addDate),
    RunTimeTicks: 60 * 60 * 1000 * 10000,
    Genres: ['Placeholder'],
    Tags: [],
    ProviderIds: {},
    ImageTags: { Primary: 'mocktag' },
    MediaSources: [
      {
        Id: id,
        Size: 1_000_000_000,
        Bitrate: 8_000_000,
        Container: 'mkv',
        MediaStreams: [
          { Type: 'Video', Codec: 'h264', Width: 1920, Height: 1080 },
          { Type: 'Audio', Codec: 'aac', Channels: 6 },
        ],
      },
    ],
    UserData: {
      PlayCount: 0,
      Played: false,
      PlayedPercentage: 0,
      IsFavorite: false,
      Rating: rating,
    },
  };
}

// rating spread chosen so an OR rule (rating > 8) OR (rating > 5) is easy to reason about.
const MOVIES = [
  movie('mock-movie-high', 'Mock Alpha', 9, '2026-01-01'),
  movie('mock-movie-mid', 'Mock Bravo', 6, '2026-02-01'),
  movie('mock-movie-low', 'Mock Charlie', 2, '2026-03-01'),
];

// Show counterpart, used to drive Sonarr/show-side flows (e.g. the
// metadata-fallback path when a series is absent from Sonarr). Provider IDs
// are synthetic - they won't resolve against real TMDB/TVDB, which is fine
// for any flow that doesn't depend on year-validation passing.
function series(id, name, addDate, providerIds = {}) {
  return {
    Id: id,
    Name: name,
    Type: 'Series',
    ServerId: 'mockserver',
    ParentId: 'jellyfin-shows',
    CommunityRating: 7,
    CriticRating: 70,
    ProductionYear: 2020,
    DateCreated: ISO(addDate),
    PremiereDate: ISO(addDate),
    Genres: ['Placeholder'],
    Tags: [],
    ProviderIds: providerIds,
    ImageTags: { Primary: 'mocktag' },
    UserData: {
      PlayCount: 0,
      Played: false,
      PlayedPercentage: 0,
      IsFavorite: false,
    },
  };
}

const SHOWS = [
  series('mock-show-1', 'Mock Show Alpha', '2026-01-01', {
    Tvdb: '900000001',
    Tmdb: '900000001',
  }),
  series('mock-show-2', 'Mock Show Bravo', '2026-02-01', {
    Tvdb: '900000002',
    Tmdb: '900000002',
  }),
];

// A manual ("custom name") collection the user created in Jellyfin/Emby. BoxSets
// are server-global, but the server only reports one under libraries whose content
// it currently holds. This one holds movies only, so it is visible under the movie
// library and INVISIBLE under the show library - exactly the #3026 reproduction.
const SHARED_BOXSET = {
  Id: 'mock-boxset-shared',
  Name: 'Franchise A Collection',
  Type: 'BoxSet',
  ServerId: 'mockserver',
  ParentId: 'jellyfin-movies',
  ChildCount: 3,
  DateCreated: ISO('2026-01-01'),
  Overview: 'Shared manual collection (mock)',
  ImageTags: { Primary: 'mocktag' },
};

// --- Optional large library for Seerr whole-library scale tests (#3152) ----------
// Off unless FAKE_SCALE>0 (see lib/scale-library.mjs). Items carry a real tmdb
// ProviderId and NO ProductionYear, so the metadata resolver accepts the direct
// id without a year cross-check. Shared with fake-plex/fake-emby so the item set
// is identical across backends.
const SCALE = buildScaleLibrary();
const scaleMovie = (it) => ({
  Id: it.key,
  Name: it.title,
  Type: 'Movie',
  ServerId: 'mockserver',
  ParentId: 'jellyfin-movies',
  DateCreated: ISO('2026-01-01'),
  ProviderIds: { Tmdb: String(it.tmdbId) },
  ImageTags: { Primary: 'mocktag' },
  MediaSources: [
    {
      Id: it.key,
      Size: 1_000_000_000,
      Container: 'mkv',
      MediaStreams: [
        { Type: 'Video', Codec: 'h264', Width: 1920, Height: 1080 },
        { Type: 'Audio', Codec: 'aac', Channels: 6 },
      ],
    },
  ],
  UserData: { PlayCount: 0, Played: false, PlayedPercentage: 0, IsFavorite: false },
});
const scaleSeries = (it) => ({
  Id: it.key,
  Name: it.title,
  Type: 'Series',
  ServerId: 'mockserver',
  ParentId: 'jellyfin-shows',
  DateCreated: ISO('2026-01-01'),
  ProviderIds: { Tmdb: String(it.tmdbId) },
  ImageTags: { Primary: 'mocktag' },
  UserData: { PlayCount: 0, Played: false, PlayedPercentage: 0, IsFavorite: false },
});
const SCALE_MOVIES = SCALE.movies.map(scaleMovie);
const SCALE_SHOWS = SCALE.shows.map(scaleSeries);

const ITEMS_BY_ID = new Map(
  [...MOVIES, ...SHOWS, SHARED_BOXSET, ...SCALE_MOVIES, ...SCALE_SHOWS].map(
    (item) => [item.Id, item],
  ),
);

// --- HTTP helpers ----------------------------------------------------------------
function send(res, status, body) {
  const json = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

const PUBLIC_SYSTEM_INFO = {
  Id: 'mockserver',
  ServerName: 'Jellyfin (mock)',
  Version: '10.10.0',
  ProductName: 'Jellyfin Server',
  OperatingSystem: 'Linux',
  StartupWizardCompleted: true,
};

const USERS = [
  {
    Id: USER_ID,
    Name: 'dev',
    ServerId: 'mockserver',
    Policy: { IsAdministrator: true },
  },
];

function itemsResponse(items) {
  return { Items: items, TotalRecordCount: items.length, StartIndex: 0 };
}

// Honors startIndex/limit so the adapter's pagination loop terminates at scale
// (jellyfin-adapter breaks on items.length < pageSize || startIndex >= total).
// Only matters once a library exceeds one page.
function pagedItems(items, u) {
  const start =
    Number(u.searchParams.get('startIndex') ?? u.searchParams.get('StartIndex')) ||
    0;
  const limRaw = u.searchParams.get('limit') ?? u.searchParams.get('Limit');
  const lim = limRaw ? Number(limRaw) : items.length;
  const slice = items.slice(start, start + (lim || items.length));
  return { Items: slice, TotalRecordCount: items.length, StartIndex: start };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const path = u.pathname;
  if (LOG) {
    process.stdout.write(
      `[fake-jellyfin] ${req.method} ${path}${u.search}\n`,
    );
  }

  // Connection check
  if (path === '/System/Info/Public' || path === '/System/Info') {
    return send(res, 200, PUBLIC_SYSTEM_INFO);
  }
  if (path === '/System/Configuration') {
    return send(res, 200, { MaxResumePct: 90 });
  }
  // Auth / users
  if (path === '/Users') {
    return send(res, 200, USERS);
  }
  if (/^\/Users\/[^/]+$/.test(path)) {
    return send(res, 200, USERS[0]);
  }
  // Libraries
  if (path === '/Library/MediaFolders' || path === '/Library/VirtualFolders') {
    return send(res, 200, itemsResponse(LIBRARIES));
  }
  if (path === '/UserViews' || /^\/Users\/[^/]+\/Views$/.test(path)) {
    return send(res, 200, itemsResponse(LIBRARIES));
  }
  // Single item by id: /Items/{id}  or  /Users/{userId}/Items/{id}
  const itemMatch =
    path.match(/^\/Items\/([^/]+)$/) ||
    path.match(/^\/Users\/[^/]+\/Items\/([^/]+)$/);
  if (req.method === 'GET' && itemMatch) {
    const id = itemMatch[1];
    // Known evaluation items keep their fixed ratings; any other id (e.g. the
    // dev-seed collection_media rows) gets a generic placeholder so collection
    // grids hydrate instead of dropping the row.
    const item =
      ITEMS_BY_ID.get(id) ?? movie(id, `Mock item ${id.slice(0, 6)}`, 5, '2026-01-01');
    return send(res, 200, item);
  }
  // Item list: /Items or /Users/{userId}/Items  (supports ids=, parentId=)
  if (
    req.method === 'GET' &&
    (path === '/Items' || /^\/Users\/[^/]+\/Items$/.test(path))
  ) {
    const ids = u.searchParams.get('ids');
    if (ids) {
      const wanted = ids.split(',');
      return send(
        res,
        200,
        itemsResponse(
          wanted.map(
            (id) =>
              ITEMS_BY_ID.get(id) ??
              movie(id, `Mock item ${id.slice(0, 6)}`, 5, '2026-01-01'),
          ),
        ),
      );
    }
    const parentId = u.searchParams.get('parentId');
    const itemTypes = u.searchParams.get('includeItemTypes');
    // BoxSet (collection) listing. A BoxSet is server-global but the server only
    // reports it under libraries whose content it currently holds. Our shared
    // boxset holds movies only -> surfaced under the movie library, absent under
    // the show library. This is the #3026 condition. (Checked before the generic
    // parentId branches, which would otherwise return the library's media.)
    if (itemTypes && itemTypes.includes('BoxSet')) {
      if (parentId === 'jellyfin-movies') {
        return send(res, 200, itemsResponse([SHARED_BOXSET]));
      }
      return send(res, 200, itemsResponse([]));
    }
    if (parentId === 'jellyfin-movies' || itemTypes === 'Movie') {
      return send(res, 200, pagedItems([...MOVIES, ...SCALE_MOVIES], u));
    }
    if (parentId === 'jellyfin-shows' || itemTypes === 'Series') {
      return send(res, 200, pagedItems([...SHOWS, ...SCALE_SHOWS], u));
    }
    // Episodes, etc. -> empty for now
    return send(res, 200, itemsResponse([]));
  }
  // Item images -> redirect to a deterministic placeholder so grids render.
  const imgMatch = path.match(/^\/Items\/([^/]+)\/Images\//);
  if (req.method === 'GET' && imgMatch) {
    res.writeHead(302, {
      Location: `https://picsum.photos/seed/${imgMatch[1].slice(0, 12)}/300/450`,
    });
    return res.end();
  }
  // Ancestors / seasons -> empty
  if (/\/Ancestors$/.test(path) || /\/Seasons$/.test(path)) {
    return send(res, 200, itemsResponse([]));
  }
  // Writes (create/add collection, update item, set image) -> accept
  if (req.method === 'POST' || req.method === 'DELETE') {
    if (path === '/Collections') {
      return send(res, 200, { Id: 'mock-boxset' });
    }
    return send(res, 204, undefined);
  }

  // Default: empty item list (keeps the SDK happy) + log unknowns
  if (LOG) process.stdout.write(`[fake-jellyfin] UNHANDLED ${req.method} ${path}\n`);
  return send(res, 200, itemsResponse([]));
});

server.listen(PORT, () => {
  process.stdout.write(`[fake-jellyfin] listening on http://localhost:${PORT}\n`);
});
