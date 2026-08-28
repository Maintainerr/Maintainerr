#!/usr/bin/env node
/**
 * Dev-only mock Emby HTTP server for Maintainerr.
 *
 * Maintainerr's Emby adapter (apps/server/.../emby/emby-adapter.service.ts) talks
 * to a real Emby over HTTP via raw axios (X-Emby-Token auth). Unlike the Jellyfin
 * SDK, it sends PascalCase query params (ParentId, UserId, IncludeItemTypes), so
 * this mock reads those casings. It answers the handful of endpoints the
 * collection flows need so the Emby path can be exercised without a real Emby.
 *
 * It deliberately models the #3026 condition: a server-global BoxSet that holds
 * movies only, so the server reports it under the movie library and NOT the show
 * library. A show rule's own-library lookup misses; the cross-library fallback
 * must find it under the movie library.
 *
 * No real media names (repo rule). Pairs with a DB configured for Emby:
 *   - settings.media_server_type = 'emby'
 *   - settings.emby_url = http://localhost:8097
 *   - library ids: emby-movies / emby-shows
 *
 * Usage:
 *   node tools/dev/fake-emby.mjs            # listens on :8097
 *   FAKE_EMBY_PORT=8097 FAKE_EMBY_LOG=1 node tools/dev/fake-emby.mjs
 */
import http from 'node:http';
import { buildScaleLibrary } from './lib/scale-library.mjs';

const PORT = Number(process.env.FAKE_EMBY_PORT ?? 8097);
const LOG = process.env.FAKE_EMBY_LOG === '1';
const ISO = (d) => new Date(d).toISOString();

// --- Libraries -------------------------------------------------------------------
const LIBRARIES = [
  { Id: 'emby-movies', Name: 'Movies (mock)', CollectionType: 'movies' },
  { Id: 'emby-shows', Name: 'Shows (mock)', CollectionType: 'tvshows' },
];

// --- Users (admin + non-admin, to exercise admin auto-resolve) -------------------
const USERS = [
  { Id: 'emby-viewer', Name: 'viewer', Policy: { IsAdministrator: false } },
  { Id: 'emby-admin', Name: 'admin', Policy: { IsAdministrator: true } },
];

// --- Items -----------------------------------------------------------------------
function show(id, name, providerIds = {}) {
  return {
    Id: id,
    Name: name,
    Type: 'Series',
    ParentId: 'emby-shows',
    ProductionYear: 2020,
    DateCreated: ISO('2026-01-01'),
    ProviderIds: providerIds,
  };
}
const SHOWS = [
  // Synthetic ids, deliberately below 900,000,000: that window is reserved by
  // Sportarr for its league aliases, so ids inside it resolve as leagues.
  show('emby-show-1', 'Mock Show Alpha', {
    Tvdb: '800000001',
    Tmdb: '800000001',
  }),
  // Sportarr fixtures, matching fake-sportarr's leagues. One carries the native
  // id its agents stamp, one only the older tvdb alias, so both resolution paths
  // are covered. emby-show-1 carries neither, which the getter answers with the
  // transient signal at debug level - deliberately, so an ordinary show in a
  // sports library cannot match a NOT_EXISTS rule (#3406).
  show('emby-show-sportarr-native', 'Mock League Alpha', {
    Sportarr: 'lg-000001',
    Tvdb: '900000001',
  }),
  show('emby-show-sportarr-alias', 'Mock League Bravo', {
    Tvdb: '900000042',
  }),
];
const SEASONS = [0, 1, 2, 3].map((index) => ({
  Id: `emby-show-1-season-${index}`,
  Name: index === 0 ? 'Specials' : `Season ${index}`,
  Type: 'Season',
  ParentId: 'emby-shows',
  SeriesId: 'emby-show-1',
  IndexNumber: index,
  DateCreated: ISO('2026-01-01'),
  PremiereDate: ISO(`202${index}-01-01`),
  ProviderIds: {},
  UserData: { PlayCount: 0, Played: false, PlayedPercentage: 0 },
}));
const EPISODES = [
  ['0', '2026-06-01'],
  ['1', '2026-04-20'],
  ['2', '2026-03-01'],
  ['3', '2026-07-01'],
].map(([season, lastPlayedDate]) => ({
  Id: `emby-show-1-season-${season}-episode-1`,
  Name: 'Episode 1',
  Type: 'Episode',
  ParentId: `emby-show-1-season-${season}`,
  SeasonId: `emby-show-1-season-${season}`,
  SeriesId: 'emby-show-1',
  ParentIndexNumber: Number(season),
  IndexNumber: 1,
  DateCreated: ISO('2026-01-01'),
  PremiereDate: ISO(`202${season}-01-07`),
  ProviderIds: {},
  UserData: {
    PlayCount: 1,
    Played: true,
    PlayedPercentage: 100,
    LastPlayedDate: ISO(lastPlayedDate),
  },
}));

// The shared manual ("custom name") BoxSet. Server-global, but reported only under
// libraries whose content it holds - and it holds movies only.
const SHARED_BOXSET = {
  Id: 'emby-boxset-shared',
  Name: 'Franchise A Collection',
  Type: 'BoxSet',
  ParentId: 'emby-movies',
  ChildCount: 3,
  DateCreated: ISO('2026-01-01'),
  Overview: 'Shared manual collection (mock)',
};

// --- Optional large library for Seerr whole-library scale tests (#3152) ----------
// Off unless FAKE_SCALE>0 (see lib/scale-library.mjs). Real tmdb ProviderId, no
// ProductionYear (so the metadata resolver accepts the id without a year check).
// Shared with fake-plex/fake-jellyfin so the item set is identical across
// backends - note this is the only movie content this Emby mock serves.
const SCALE = buildScaleLibrary();
const scaleMovie = (it) => ({
  Id: it.key,
  Name: it.title,
  Type: 'Movie',
  ParentId: 'emby-movies',
  DateCreated: ISO('2026-01-01'),
  ProviderIds: { Tmdb: String(it.tmdbId) },
  MediaSources: [{ Id: it.key, Size: 1_000_000_000, Container: 'mkv' }],
});
const scaleSeries = (it) => ({
  Id: it.key,
  Name: it.title,
  Type: 'Series',
  ParentId: 'emby-shows',
  DateCreated: ISO('2026-01-01'),
  ProviderIds: { Tmdb: String(it.tmdbId) },
});
const SCALE_MOVIES = SCALE.movies.map(scaleMovie);
const SCALE_SHOWS = SCALE.shows.map(scaleSeries);

const ITEMS_BY_ID = new Map(
  [
    ...SHOWS,
    ...SEASONS,
    ...EPISODES,
    SHARED_BOXSET,
    ...SCALE_MOVIES,
    ...SCALE_SHOWS,
  ].map((item) => [item.Id, item]),
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
const itemsResponse = (items) => ({
  Items: items,
  TotalRecordCount: items.length,
  StartIndex: 0,
});
// Honors PascalCase StartIndex/Limit so the adapter's offset loop terminates at
// scale instead of re-fetching the full set per page. Only matters past one page.
function pagedItems(items, u) {
  const start = Number(u.searchParams.get('StartIndex')) || 0;
  const limRaw = u.searchParams.get('Limit');
  const lim = limRaw ? Number(limRaw) : items.length;
  const slice = items.slice(start, start + (lim || items.length));
  return { Items: slice, TotalRecordCount: items.length, StartIndex: start };
}

const SYSTEM_INFO = {
  Id: 'mockembyserver',
  ServerName: 'Emby (mock)',
  Version: '4.8.0.0',
  ProductName: 'Emby Server',
  OperatingSystem: 'Linux',
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const path = u.pathname;
  if (LOG) process.stdout.write(`[fake-emby] ${req.method} ${path}${u.search}\n`);

  // Connection check
  if (path === '/System/Info' || path === '/System/Info/Public') {
    return send(res, 200, SYSTEM_INFO);
  }
  // Users (Emby returns a query-result envelope for /Users/Query)
  if (path === '/Users/Query') return send(res, 200, itemsResponse(USERS));
  if (path === '/Users') return send(res, 200, USERS);
  if (/^\/Users\/[^/]+$/.test(path)) {
    const id = path.split('/')[2];
    return send(res, 200, USERS.find((x) => x.Id === id) ?? USERS[1]);
  }
  // Libraries
  if (
    path === '/Library/MediaFolders' ||
    path === '/Library/VirtualFolders' ||
    /^\/Users\/[^/]+\/Views$/.test(path)
  ) {
    return send(res, 200, itemsResponse(LIBRARIES));
  }
  // Sessions (active-playback check)
  if (path === '/Sessions') return send(res, 200, []);

  const seasonsMatch = path.match(/^\/Shows\/([^/]+)\/Seasons$/);
  if (req.method === 'GET' && seasonsMatch) {
    return send(
      res,
      200,
      itemsResponse(
        SEASONS.filter((season) => season.SeriesId === seasonsMatch[1]),
      ),
    );
  }

  // Single item by id: /Items/{id} or /Users/{userId}/Items/{id}
  const itemMatch =
    path.match(/^\/Items\/([^/]+)$/) ||
    path.match(/^\/Users\/[^/]+\/Items\/([^/]+)$/);
  if (req.method === 'GET' && itemMatch) {
    const id = itemMatch[1];
    return send(res, 200, ITEMS_BY_ID.get(id) ?? show(id, `Mock item ${id}`));
  }

  // Item list: /Items or /Users/{userId}/Items - Emby sends PascalCase params.
  if (
    req.method === 'GET' &&
    (path === '/Items' || /^\/Users\/[^/]+\/Items$/.test(path))
  ) {
    const ids = u.searchParams.get('Ids');
    if (ids) {
      return send(
        res,
        200,
        itemsResponse(
          ids.split(',').map((id) => ITEMS_BY_ID.get(id) ?? show(id, id)),
        ),
      );
    }
    const parentId = u.searchParams.get('ParentId');
    const itemTypes = u.searchParams.get('IncludeItemTypes');
    if (
      SEASONS.some((season) => season.Id === parentId) &&
      itemTypes?.includes('Episode')
    ) {
      return send(
        res,
        200,
        pagedItems(EPISODES.filter((episode) => episode.SeasonId === parentId), u),
      );
    }
    // BoxSet listing: server-global but surfaced only under libraries whose
    // content the boxset holds. This one holds movies only - the #3026 condition.
    if (itemTypes && itemTypes.includes('BoxSet')) {
      if (parentId === 'emby-movies') {
        return send(res, 200, itemsResponse([SHARED_BOXSET]));
      }
      return send(res, 200, itemsResponse([]));
    }
    if (parentId === 'emby-movies' || itemTypes === 'Movie') {
      return send(res, 200, pagedItems(SCALE_MOVIES, u));
    }
    if (
      parentId === 'emby-shows' &&
      u.searchParams.get('Recursive') === 'true' &&
      itemTypes?.split(',').includes('Season')
    ) {
      return send(res, 200, pagedItems(SEASONS, u));
    }
    if (parentId === 'emby-shows' || itemTypes === 'Series') {
      return send(res, 200, pagedItems([...SHOWS, ...SCALE_SHOWS], u));
    }
    return send(res, 200, itemsResponse([]));
  }

  // Image redirect so any grid hydration renders.
  if (req.method === 'GET' && /^\/Items\/[^/]+\/Images\//.test(path)) {
    res.writeHead(302, {
      Location: 'https://picsum.photos/seed/emby/300/450',
    });
    return res.end();
  }

  // Writes: create collection, add/remove items, update item -> accept.
  if (req.method === 'POST' || req.method === 'DELETE') {
    if (path === '/Collections') {
      // Real Emby 500s when creating an empty collection under a library folder
      // (CollectionManager "Sequence contains no elements", #3075). It needs at
      // least one item (Ids), so reject an empty create the same way.
      if (!u.searchParams.get('Ids')) {
        return send(res, 500, { error: 'Sequence contains no elements' });
      }
      return send(res, 200, { Id: 'emby-boxset-new' });
    }
    return send(res, 204, undefined);
  }

  if (LOG) process.stdout.write(`[fake-emby] UNHANDLED ${req.method} ${path}\n`);
  return send(res, 200, itemsResponse([]));
});

server.listen(PORT, () => {
  process.stdout.write(`[fake-emby] listening on http://localhost:${PORT}\n`);
});
