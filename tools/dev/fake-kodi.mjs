#!/usr/bin/env node
/**
 * Dev-only mock Kodi JSON-RPC server for Maintainerr.
 *
 * Maintainerr's Kodi adapter (apps/server/.../kodi/kodi-adapter.service.ts) talks
 * to Kodi over JSON-RPC: HTTP POST /jsonrpc, HTTP Basic auth, a single envelope
 * `{ jsonrpc, method, params, id }`. This mock dispatches on `method` and answers
 * the handful the collection/rule flows need so the Kodi path can be exercised
 * without a real Kodi. Tag writes are persisted in-memory, so creating a
 * tag-backed collection and reading its members back round-trips.
 *
 * No real media names (repo rule). Auth is not validated (dev mock). Pairs with a
 * DB configured for Kodi:
 *   - settings.media_server_type = 'kodi'
 *   - settings.kodi_url = http://localhost:8098
 *
 * Usage:
 *   node tools/dev/fake-kodi.mjs               # listens on :8098
 *   FAKE_KODI_PORT=8098 FAKE_KODI_LOG=1 node tools/dev/fake-kodi.mjs
 */
import http from 'node:http';

const PORT = Number(process.env.FAKE_KODI_PORT ?? 8098);
const LOG = process.env.FAKE_KODI_LOG === '1';

// --- In-memory library (invented titles only) ------------------------------------
const movies = [
  {
    movieid: 1,
    title: 'The Hollow Atlas',
    year: 2019,
    playcount: 2,
    lastplayed: '2026-05-01 20:14:00',
    dateadded: '2026-01-02 10:00:00',
    premiered: '2019-03-10',
    rating: 7.4,
    uniqueid: { imdb: 'tt90000001', tmdb: '900001' },
    tag: ['demo'],
    genre: ['Drama'],
  },
  {
    movieid: 2,
    title: 'Quartz Meridian',
    year: 2021,
    playcount: 0,
    lastplayed: '',
    dateadded: '2026-02-14 09:30:00',
    premiered: '2021-07-22',
    rating: 6.1,
    uniqueid: { imdb: 'tt90000002', tmdb: '900002' },
    tag: [],
    genre: ['Adventure'],
  },
  {
    movieid: 3,
    title: 'Paper Lighthouses',
    year: 2017,
    playcount: 5,
    lastplayed: '2026-06-10 22:05:00',
    dateadded: '2026-03-01 12:00:00',
    premiered: '2017-11-05',
    rating: 8.2,
    uniqueid: { imdb: 'tt90000003', tmdb: '900003' },
    tag: [],
    genre: ['Comedy'],
  },
];

const tvshows = [
  {
    tvshowid: 1,
    title: 'Signals From Nowhere',
    year: 2020,
    playcount: 0,
    lastplayed: '',
    dateadded: '2026-01-05 08:00:00',
    premiered: '2020-09-01',
    rating: 7.0,
    uniqueid: { tvdb: '700001', tmdb: '800001' },
    tag: [],
    genre: ['Sci-Fi'],
    episode: 2,
    watchedepisodes: 1,
  },
];

const seasons = [
  { seasonid: 1, tvshowid: 1, season: 1, showtitle: 'Signals From Nowhere', playcount: 0, episode: 2, watchedepisodes: 1 },
];

const episodes = [
  { episodeid: 1, tvshowid: 1, seasonid: 1, season: 1, episode: 1, title: 'First Light', showtitle: 'Signals From Nowhere', playcount: 1, lastplayed: '2026-05-20 19:00:00', dateadded: '2026-01-05 08:00:00', firstaired: '2020-09-01', uniqueid: { tvdb: '710001' } },
  { episodeid: 2, tvshowid: 1, seasonid: 1, season: 1, episode: 2, title: 'Static Bloom', showtitle: 'Signals From Nowhere', playcount: 0, lastplayed: '', dateadded: '2026-01-06 08:00:00', firstaired: '2020-09-08', uniqueid: { tvdb: '710002' } },
];

// --- Query helpers ---------------------------------------------------------------
const INVALID_PARAMS = { code: -32602, message: 'Invalid params.' };

function pick(obj, props) {
  if (!props || props.length === 0) return { ...obj };
  const out = {};
  for (const p of props) if (obj[p] !== undefined) out[p] = obj[p];
  out.label = obj.title ?? obj.label ?? '';
  return out;
}

function applyFilter(list, filter) {
  if (!filter) return list;
  const { field, operator, value } = filter;
  return list.filter((item) => {
    if (field === 'tag') {
      const tags = item.tag ?? [];
      return operator === 'is'
        ? tags.includes(value)
        : tags.some((t) => t.includes(value));
    }
    if (field === 'title') {
      return (item.title ?? '').toLowerCase().includes(String(value).toLowerCase());
    }
    return true;
  });
}

function windowed(list, limits, key) {
  const total = list.length;
  const start = limits?.start ?? 0;
  const end = limits?.end != null && limits.end > 0 ? limits.end : total;
  const slice = start === end ? [] : list.slice(start, end);
  return { [key]: slice, limits: { start, end: Math.min(end, total), total } };
}

function distinctTags(list) {
  const set = new Set();
  for (const item of list) for (const t of item.tag ?? []) set.add(t);
  return [...set].map((label, i) => ({ tagid: i + 1, label }));
}

// --- JSON-RPC dispatch -----------------------------------------------------------
function dispatch(method, params = {}) {
  switch (method) {
    case 'JSONRPC.Ping':
      return 'pong';
    case 'JSONRPC.Version':
      return { version: { major: 13, minor: 5, patch: 0 } };
    case 'Application.GetProperties':
      return { version: { major: 21, minor: 3, tag: 'stable' }, name: 'Kodi (mock)' };

    case 'VideoLibrary.GetMovies':
      return windowed(applyFilter(movies, params.filter).map((m) => pick(m, params.properties)), params.limits, 'movies');
    case 'VideoLibrary.GetTVShows':
      return windowed(applyFilter(tvshows, params.filter).map((s) => pick(s, params.properties)), params.limits, 'tvshows');
    case 'VideoLibrary.GetSeasons': {
      const list = seasons.filter((s) => params.tvshowid == null || s.tvshowid === params.tvshowid);
      return windowed(list.map((s) => pick(s, params.properties)), params.limits, 'seasons');
    }
    case 'VideoLibrary.GetEpisodes': {
      let list = episodes;
      if (params.tvshowid != null) list = list.filter((e) => e.tvshowid === params.tvshowid);
      if (params.season != null) list = list.filter((e) => e.season === params.season);
      list = applyFilter(list, params.filter);
      return windowed(list.map((e) => pick(e, params.properties)), params.limits, 'episodes');
    }

    case 'VideoLibrary.GetMovieDetails': {
      const m = movies.find((x) => x.movieid === params.movieid);
      if (!m) throw INVALID_PARAMS;
      return { moviedetails: pick(m, params.properties) };
    }
    case 'VideoLibrary.GetTVShowDetails': {
      const s = tvshows.find((x) => x.tvshowid === params.tvshowid);
      if (!s) throw INVALID_PARAMS;
      return { tvshowdetails: pick(s, params.properties) };
    }
    case 'VideoLibrary.GetSeasonDetails': {
      const s = seasons.find((x) => x.seasonid === params.seasonid);
      if (!s) throw INVALID_PARAMS;
      return { seasondetails: pick(s, params.properties) };
    }
    case 'VideoLibrary.GetEpisodeDetails': {
      const e = episodes.find((x) => x.episodeid === params.episodeid);
      if (!e) throw INVALID_PARAMS;
      return { episodedetails: pick(e, params.properties) };
    }

    case 'VideoLibrary.GetTags':
      return windowed(distinctTags(params.type === 'tvshow' ? tvshows : movies), params.limits, 'tags');

    case 'VideoLibrary.SetMovieDetails': {
      const m = movies.find((x) => x.movieid === params.movieid);
      if (!m) throw INVALID_PARAMS;
      if (params.tag !== undefined) m.tag = params.tag;
      if (params.playcount !== undefined) m.playcount = params.playcount;
      return 'OK';
    }
    case 'VideoLibrary.SetTVShowDetails': {
      const s = tvshows.find((x) => x.tvshowid === params.tvshowid);
      if (!s) throw INVALID_PARAMS;
      if (params.tag !== undefined) s.tag = params.tag;
      return 'OK';
    }
    case 'VideoLibrary.RefreshMovie':
    case 'VideoLibrary.RefreshTVShow':
    case 'VideoLibrary.RefreshEpisode':
      return 'OK';

    case 'Player.GetActivePlayers':
      return [];
    case 'Player.GetItem':
      return { item: { type: 'unknown', label: '', title: '' } };

    default:
      throw { code: -32601, message: `Method not found: ${method}` };
  }
}

// --- HTTP transport --------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/jsonrpc')) {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch {
      payload = {};
    }
    const { method, params, id = null } = payload;
    if (LOG) process.stdout.write(`[fake-kodi] ${method}\n`);
    let envelope;
    try {
      envelope = { jsonrpc: '2.0', id, result: dispatch(method, params) };
    } catch (error) {
      // Echo only a sanitized JSON-RPC error shape — never a raw Error/stack.
      const rpcError =
        error && typeof error === 'object' && 'code' in error
          ? { code: error.code, message: String(error.message ?? 'error') }
          : { code: -32603, message: 'Internal error' };
      envelope = { jsonrpc: '2.0', id, error: rpcError };
    }
    const json = JSON.stringify(envelope);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(json),
    });
    res.end(json);
  });
});

server.listen(PORT, () => {
  process.stdout.write(`[fake-kodi] listening on http://localhost:${PORT}/jsonrpc\n`);
});
