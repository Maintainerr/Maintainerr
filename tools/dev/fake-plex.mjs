#!/usr/bin/env node
/**
 * Dev-only mock Plex Media Server for Maintainerr.
 *
 * Maintainerr's Plex stack (apps/server/.../plex-api/plex-api.service.ts via
 * apps/server/.../lib/plexApi.ts) talks to a real PMS over HTTP+JSON with an
 * X-Plex-Token header. This stub answers the endpoints the rule getter + rule
 * executor need so the *Plex-only* getter paths can be exercised without a real
 * Plex. It aims to cover the whole Plex rule-property surface, not just smart
 * collections: metadata, ratings (incl. imdb/RT/tmdb from the Rating[] array),
 * people/genres/labels, file media, normal + smart collections, watch history,
 * accounts, playlists, and a show with seasons/episodes for the sw_* rules.
 *
 * It is intentionally minimal and invented — no real media names (repo rule).
 * The dataset is deterministic so rule evaluation is predictable.
 *
 * NOT covered (need plex.tv, not the local PMS): the watchlist rules
 * (watchlist_isWatchlisted / watchlist_isListedByUsers) call plex.tv's
 * Discover/Community API and degrade to "not watchlisted" here.
 *
 * Highlight — case-sensitive smart-collection dedupe (rule ids 41/42):
 *   movie p1 owns Collection tags [' Saga ', 'saga'] and is a child of the SMART
 *   collection 'Saga'. id 42 aggregates [' Saga ', 'saga', smart 'Saga'] and,
 *   after case-sensitive dedupe, yields ['Saga', 'saga']: the smart 'Saga'
 *   collapses into the trimmed metadata 'Saga'; the case variant 'saga' stays.
 *
 * Usage
 * -----
 *   node tools/dev/fake-plex.mjs                  # listens on :32400
 *   FAKE_PLEX_PORT=32400 node tools/dev/fake-plex.mjs
 *   FAKE_PLEX_LOG=1 node tools/dev/fake-plex.mjs   # log every request
 *
 * Point Maintainerr at it (settings): plex_hostname=localhost, plex_port=32400,
 * plex_ssl=0, any non-empty plex_auth_token, media_server_type='plex'. The
 * fixed machineIdentifier makes the primary connection succeed (no plex.tv
 * re-discovery).
 */
import http from 'node:http';
import { buildScaleLibrary } from './lib/scale-library.mjs';

const PORT = Number(process.env.FAKE_PLEX_PORT ?? 32400);
const LOG = process.env.FAKE_PLEX_LOG === '1';
const MACHINE_ID = 'mockplexmachine0000000000000000';

const DAY = 86_400;
const NOW = Math.floor(Date.now() / 1000);
const daysAgo = (n) => NOW - n * DAY;

// --- Library sections (ids match the seeded rule_group.libraryId values) -----
const SECTIONS = [
  { key: '1', title: 'Movies (mock)', type: 'movie', uuid: 'mock-section-1' },
  { key: '2', title: 'Shows (mock)', type: 'show', uuid: 'mock-section-2' },
];

// --- Accounts (local users; getCorrectedUsers degrades to these) -------------
const ACCOUNTS = [
  { id: 1, key: '/accounts/1', name: 'alice', defaultAudioLanguage: 'en' },
  { id: 2, key: '/accounts/2', name: 'bob', defaultAudioLanguage: 'en' },
];

// --- Shared metadata fragments -----------------------------------------------
const ROLE = [
  { id: 1, tag: 'Director One', role: 'Director' },
  { id: 2, tag: 'Actor Two', role: 'Lead' },
];
const GENRE = [
  { id: 1, tag: 'Drama' },
  { id: 2, tag: 'Sci-Fi' },
];
const LABEL = [
  { id: 1, tag: 'Keep' },
  { id: 2, tag: 'Family' },
];
// Plex surfaces external scores in Rating[] with an image-prefix per source.
const RATING = [
  { image: 'imdb://image.rating', type: 'audience', value: 7.8 },
  { image: 'rottentomatoes://image.rating.ripe', type: 'critic', value: 9.1 },
  { image: 'rottentomatoes://image.rating.upright', type: 'audience', value: 8.5 },
  { image: 'themoviedb://image.rating', type: 'audience', value: 7.2 },
];
const media = (overrides = {}) => ({
  id: 1,
  duration: 7_200_000,
  bitrate: 12_000,
  width: 1920,
  height: 1080,
  audioChannels: 6,
  audioCodec: 'aac',
  videoCodec: 'h264',
  videoResolution: '1080',
  container: 'mkv',
  Part: [{ id: 1, size: 1_000_000_000, container: 'mkv' }],
  ...overrides,
});

function baseItem(ratingKey, type, title, overrides = {}) {
  return {
    ratingKey,
    key: `/library/metadata/${ratingKey}`,
    guid: `plex://${type}/${ratingKey}`,
    type,
    title,
    librarySectionID: type === 'movie' ? 1 : 2,
    librarySectionKey: `/library/sections/${type === 'movie' ? 1 : 2}`,
    addedAt: daysAgo(30),
    updatedAt: daysAgo(30),
    year: 2020,
    Media: [media()],
    ...overrides,
  };
}

// --- Movies (section 1) ------------------------------------------------------
const MOVIES = [
  baseItem('p1', 'movie', 'Mock Reel One', {
    audienceRating: 9, // rating_audience
    rating: 7.5, // rating_critics
    userRating: 8, // rating_user
    viewCount: 1, // native (fallback only)
    addedAt: daysAgo(120),
    lastViewedAt: daysAgo(3),
    originallyAvailableAt: '2024-01-01',
    Role: ROLE,
    Genre: GENRE,
    Label: LABEL,
    Rating: RATING,
    // case variants here + the SMART 'Saga' below drive the dedupe
    Collection: [{ tag: ' Saga ' }, { tag: 'saga' }, { tag: 'Keepers' }],
  }),
  baseItem('p2', 'movie', 'Mock Reel Two', {
    audienceRating: 6,
    rating: 5.5,
    addedAt: daysAgo(60),
    lastViewedAt: daysAgo(10),
    originallyAvailableAt: '2024-02-01',
    Genre: GENRE,
    Collection: [{ tag: 'Saga' }],
  }),
  baseItem('p3', 'movie', 'Mock Reel Three', {
    audienceRating: 2,
    addedAt: daysAgo(10),
    originallyAvailableAt: '2024-03-01',
    Genre: [{ id: 1, tag: 'Drama' }],
    Collection: [],
  }),
];

// --- Show / seasons / episodes (section 2) -----------------------------------
// tvdb id stamped on the show's Guid[] so the Sonarr getter resolves it through
// fake-sonarr (which maps any tvdbId to a deterministic 4-season series).
const SHOW_TVDB_ID = 990013;
const SHOW = baseItem('sh1', 'show', 'Mock Series One', {
  leafCount: 2,
  viewedLeafCount: 1, // sw_markedWatchedEpisodes
  childCount: 4,
  addedAt: daysAgo(200),
  originallyAvailableAt: '2023-01-01',
  Guid: [{ id: `tvdb://${SHOW_TVDB_ID}` }],
  Role: ROLE,
  Genre: GENRE,
  Label: [{ id: 1, tag: 'Keep' }],
  Collection: [{ tag: 'Box Set' }],
});
// Four seasons drive the #3153 part_of_latest_season repro: fake-sonarr dates
// S0/S1/S2 episode 1 in the past and S3 in the future, so the latest aired season
// is S2. Evaluated together in one run they share a memoized series object — the
// case the in-place season reverse corrupted. Season 1 keeps the episodes the
// sw_* episode rules use.
const SEASONS = [0, 1, 2, 3].map((n) =>
  baseItem(`se${n}`, 'season', `Season ${n}`, {
    parentRatingKey: 'sh1',
    index: n,
    leafCount: n === 1 ? 2 : 1,
    addedAt: daysAgo(200),
    Collection: n === 1 ? [{ tag: 'Box Set' }, { tag: 'Season Set' }] : [],
  }),
);
const EPISODES = [
  baseItem('ep1', 'episode', 'Episode One', {
    parentRatingKey: 'se1',
    grandparentRatingKey: 'sh1',
    index: 1,
    viewCount: 1,
    addedAt: daysAgo(40),
    lastViewedAt: daysAgo(5),
    originallyAvailableAt: '2023-01-07',
    Collection: [{ tag: ' Episode Set ' }],
  }),
  baseItem('ep2', 'episode', 'Episode Two', {
    parentRatingKey: 'se1',
    grandparentRatingKey: 'sh1',
    index: 2,
    viewCount: 0,
    addedAt: daysAgo(20),
    originallyAvailableAt: '2023-01-14',
    Collection: [],
  }),
];

const ALL_ITEMS = [...MOVIES, SHOW, ...SEASONS, ...EPISODES];
const ITEMS_BY_ID = new Map(ALL_ITEMS.map((m) => [m.ratingKey, m]));

// --- Optional large library for Seerr whole-library scale tests (#3152) ------
// Off unless FAKE_SCALE>0 (see lib/scale-library.mjs). Each item carries only a
// tmdb Guid and no `year`, so the metadata resolver accepts the direct id
// without a year cross-check. Shared with fake-jellyfin/fake-emby so the item
// set is identical across backends.
const SCALE = buildScaleLibrary();
const scaleItem = (it) => ({
  ratingKey: it.key,
  key: `/library/metadata/${it.key}`,
  guid: `plex://${it.type}/${it.key}`,
  type: it.type,
  title: it.title,
  librarySectionID: it.type === 'movie' ? 1 : 2,
  librarySectionKey: `/library/sections/${it.type === 'movie' ? 1 : 2}`,
  addedAt: daysAgo(30),
  updatedAt: daysAgo(30),
  Media: [media()],
  Guid: [{ id: `tmdb://${it.tmdbId}` }],
});
const SCALE_MOVIES = SCALE.movies.map(scaleItem);
const SCALE_SHOWS = SCALE.shows.map(scaleItem);
for (const it of [...SCALE_MOVIES, ...SCALE_SHOWS]) {
  ITEMS_BY_ID.set(it.ratingKey, it);
}

// children: show -> [seasons], season 1 -> [episodes]
const CHILDREN = {
  sh1: SEASONS,
  se1: EPISODES,
};

// --- Collections (section-level; getCollections reads .smart) ----------------
// Plex ratingKeys are numeric — collections too (updateCollection does +id).
const COLLECTIONS_BY_SECTION = {
  1: [
    { ratingKey: '90001', key: '/library/collections/90001/children', type: 'collection', title: 'Saga', smart: true, subtype: 'movie', childCount: 2 },
    { ratingKey: '90002', key: '/library/collections/90002/children', type: 'collection', title: 'Keepers', smart: false, subtype: 'movie', childCount: 1 },
  ],
  2: [
    { ratingKey: '90003', key: '/library/collections/90003/children', type: 'collection', title: 'Box Set', smart: true, subtype: 'show', childCount: 1 },
  ],
};
const COLLECTION_CHILDREN = {
  90001: [{ ratingKey: 'p1' }, { ratingKey: 'p2' }],
  90002: [{ ratingKey: 'p1' }],
  90003: [{ ratingKey: 'sh1' }, { ratingKey: 'ep1' }],
};
// Collections created at runtime by Maintainerr (forced rule runs). Keyed by id.
const CREATED = new Map();
let nextCollectionId = 95000;
const allCollectionsById = (id) =>
  CREATED.get(id) ??
  Object.values(COLLECTIONS_BY_SECTION).flat().find((c) => c.ratingKey === id);

// --- Playlists ---------------------------------------------------------------
const PLAYLISTS = [
  { ratingKey: 'pl1', key: '/playlists/pl1/items', type: 'playlist', title: 'Mock Playlist', playlistType: 'video', leafCount: 1 },
];
const PLAYLIST_ITEMS = { pl1: [{ ratingKey: 'p1' }] };

// --- Watch history (drives getWatchState + seenBy + sw_watchers) -------------
// keyed by metadataItemID
const HISTORY = {
  p1: [
    { ratingKey: 'p1', accountID: 1, viewedAt: daysAgo(3), deviceID: 1 },
    { ratingKey: 'p1', accountID: 2, viewedAt: daysAgo(8), deviceID: 1 },
  ],
  p2: [{ ratingKey: 'p2', accountID: 1, viewedAt: daysAgo(10), deviceID: 1 }],
  ep1: [{ ratingKey: 'ep1', accountID: 1, viewedAt: daysAgo(5), deviceID: 1 }],
};

// --- HTTP helpers ------------------------------------------------------------
function send(res, status, body) {
  const json = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}
const container = (extra) => ({ MediaContainer: { size: 0, ...extra } });
const list = (key, items) =>
  container({ size: items.length, totalSize: items.length, [key]: items });
// Honors X-Plex-Container-Start/Size so the adapter's pagination loop (plexApi.ts,
// size 120, loops while totalSize > size*(page+1)) terminates instead of
// re-fetching the full set per page — only matters once a library exceeds 120.
function sendPaged(res, req, items) {
  const start = Number(req.headers['x-plex-container-start']) || 0;
  const size = Number(req.headers['x-plex-container-size']) || items.length;
  const slice = items.slice(start, start + size);
  return send(
    res,
    200,
    container({ size: slice.length, totalSize: items.length, Metadata: slice }),
  );
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const path = u.pathname;
  if (LOG) process.stdout.write(`[fake-plex] ${req.method} ${path}${u.search}\n`);

  // Writes (create/update/delete collection, add children, refresh) -> accept.
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    // Create collection: mint a numeric ratingKey and remember it so the
    // follow-up getCollection(+ratingKey)/updateCollection round trips resolve.
    if (req.method === 'POST' && path === '/library/collections') {
      const id = String(nextCollectionId++);
      const col = {
        ratingKey: id,
        key: `/library/collections/${id}/children`,
        type: 'collection',
        title: u.searchParams.get('title') ?? `Collection ${id}`,
        smart: false,
        subtype: u.searchParams.get('type') === '2' ? 'show' : 'movie',
        childCount: 0,
      };
      CREATED.set(id, col);
      return send(res, 200, list('Metadata', [col]));
    }
    return send(res, 200, container({}));
  }

  // Server identity / status probe (setMachineId + getStatus query '/').
  if (path === '/' || path === '/identity') {
    return send(res, 200, container({
      machineIdentifier: MACHINE_ID,
      friendlyName: 'Plex (mock)',
      version: '1.40.0.0',
      myPlexUsername: 'dev',
    }));
  }

  // Accounts (local users)
  if (path === '/accounts') return send(res, 200, list('Account', ACCOUNTS));
  const acctMatch = path.match(/^\/accounts\/(\d+)$/);
  if (acctMatch) {
    const a = ACCOUNTS.find((x) => x.id === Number(acctMatch[1]));
    return send(res, 200, list('Account', a ? [a] : []));
  }

  // Libraries
  if (path === '/library/sections') return send(res, 200, list('Directory', SECTIONS));

  // Section contents: /library/sections/:id/all. The rule executor passes Plex's
  // numeric data type (EPlexDataType: movie=1, show=2, season=3, episode=4) so a
  // season-scoped rule group enumerates seasons, not the show.
  const allMatch = path.match(/^\/library\/sections\/([^/]+)\/all$/);
  if (allMatch) {
    let items = [...MOVIES, ...SCALE_MOVIES];
    if (allMatch[1] === '2') {
      const type = u.searchParams.get('type');
      items =
        type === '3'
          ? SEASONS
          : type === '4'
            ? EPISODES
            : [SHOW, ...SCALE_SHOWS];
    }
    return sendPaged(res, req, items);
  }

  // Section collections: /library/sections/:id/collections
  const secCol = path.match(/^\/library\/sections\/([^/]+)\/collections$/);
  if (secCol) {
    return send(res, 200, list('Metadata', COLLECTIONS_BY_SECTION[secCol[1]] ?? []));
  }

  // Collection children: /library/collections/:id/children
  const colKids = path.match(/^\/library\/collections\/([^/]+)\/children$/);
  if (colKids) return send(res, 200, list('Metadata', COLLECTION_CHILDREN[colKids[1]] ?? []));

  // Single collection: /library/collections/:id  (getCollection after create/update)
  const colOne = path.match(/^\/library\/collections\/([^/]+)$/);
  if (colOne) {
    const col = allCollectionsById(colOne[1]);
    return send(res, 200, list('Metadata', col ? [col] : []));
  }

  // Item children (seasons/episodes): /library/metadata/:key/children
  const itemKids = path.match(/^\/library\/metadata\/([^/]+)\/children$/);
  if (itemKids) return send(res, 200, list('Metadata', CHILDREN[itemKids[1]] ?? []));

  // Single item: /library/metadata/:key
  const itemMatch = path.match(/^\/library\/metadata\/([^/]+)$/);
  if (itemMatch) {
    const item = ITEMS_BY_ID.get(itemMatch[1]) ??
      baseItem(itemMatch[1], 'movie', `Mock item ${itemMatch[1]}`, { audienceRating: 5 });
    return send(res, 200, list('Metadata', [item]));
  }

  // Watch history: /status/sessions/history/all?metadataItemID=X
  if (path === '/status/sessions/history/all') {
    const id = u.searchParams.get('metadataItemID');
    return send(res, 200, list('Metadata', (id && HISTORY[id]) || []));
  }

  // Playlists list + items
  if (path === '/playlists') return send(res, 200, list('Metadata', PLAYLISTS));
  const plItems = path.match(/^\/playlists\/([^/]+)\/items$/);
  if (plItems) return send(res, 200, list('Metadata', PLAYLIST_ITEMS[plItems[1]] ?? []));

  if (LOG) process.stdout.write(`[fake-plex] UNHANDLED ${req.method} ${path}\n`);
  return send(res, 200, container({}));
});

server.listen(PORT, () => {
  process.stdout.write(`[fake-plex] listening on http://localhost:${PORT}\n`);
});
