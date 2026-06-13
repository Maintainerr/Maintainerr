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
function show(id, name) {
  return {
    Id: id,
    Name: name,
    Type: 'Series',
    ParentId: 'emby-shows',
    ProductionYear: 2020,
    DateCreated: ISO('2026-01-01'),
    ProviderIds: {},
  };
}
const SHOWS = [show('emby-show-1', 'Mock Show Alpha')];

// The shared manual ("custom name") BoxSet. Server-global, but reported only under
// libraries whose content it holds — and it holds movies only.
const SHARED_BOXSET = {
  Id: 'emby-boxset-shared',
  Name: 'Franchise A Collection',
  Type: 'BoxSet',
  ParentId: 'emby-movies',
  ChildCount: 3,
  DateCreated: ISO('2026-01-01'),
  Overview: 'Shared manual collection (mock)',
};

const ITEMS_BY_ID = new Map(
  [...SHOWS, SHARED_BOXSET].map((item) => [item.Id, item]),
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

  // Single item by id: /Items/{id} or /Users/{userId}/Items/{id}
  const itemMatch =
    path.match(/^\/Items\/([^/]+)$/) ||
    path.match(/^\/Users\/[^/]+\/Items\/([^/]+)$/);
  if (req.method === 'GET' && itemMatch) {
    const id = itemMatch[1];
    return send(res, 200, ITEMS_BY_ID.get(id) ?? show(id, `Mock item ${id}`));
  }

  // Item list: /Items or /Users/{userId}/Items — Emby sends PascalCase params.
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
    // BoxSet listing: server-global but surfaced only under libraries whose
    // content the boxset holds. This one holds movies only — the #3026 condition.
    if (itemTypes && itemTypes.includes('BoxSet')) {
      if (parentId === 'emby-movies') {
        return send(res, 200, itemsResponse([SHARED_BOXSET]));
      }
      return send(res, 200, itemsResponse([]));
    }
    if (parentId === 'emby-shows' || itemTypes === 'Series') {
      return send(res, 200, itemsResponse(SHOWS));
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
