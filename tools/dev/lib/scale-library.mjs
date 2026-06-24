#!/usr/bin/env node
/**
 * Shared large-library fixture for exercising the Seerr getter at whole-library
 * scale (issue #3152) against a REAL Seerr. Every media-server fake
 * (fake-plex/jellyfin/emby) imports this, so the item set is byte-identical
 * across backends: one Seerr rule yields the same matches whether Maintainerr
 * points at Plex, Jellyfin, or Emby.
 *
 * Why these exact ids:
 *  - tmdbIds are REAL. The metadata resolver (metadata.service) validates each
 *    direct id against TMDB before the Seerr lookup, so synthetic ids would 404
 *    and the item would be skipped. Items therefore also OMIT year — the
 *    resolver accepts a direct id without a year cross-check when the item has
 *    no year (avoids false rejects on year drift).
 *  - MATCH_* ids are actually requested in the dev Seerr (seeded via the API),
 *    so the bulk GET /request index matches them -> "requested".
 *  - FILLER_* ids are real but NOT requested, so they resolve cleanly to "not
 *    requested" (definitive 0/[]), reproducing a large library where only a
 *    minority is requested.
 * Titles are invented (repo rule: no real media names).
 *
 * Enable inside a fake with FAKE_SCALE=<movieCount> (and optional
 * FAKE_SCALE_TV=<showCount>); 0/unset leaves the fake's small dataset untouched.
 */

// Real TMDB ids requested in the dev Seerr (the bulk /request index matches these).
const MATCH_MOVIE_IDS = [862, 11012, 28322, 83533, 301528, 424711, 454639, 479787, 614945, 687163, 912378, 931285, 936075, 949536, 969681, 976912, 1007757, 1057265, 1081003, 1083381, 1084242, 1084244, 1103473, 1122573, 1127384, 1219739, 1226293, 1226863, 1227241, 1228710, 1239134, 1241752, 1275779, 1280738, 1288341, 1293550, 1297842, 1304313, 1308553, 1311031, 1318413, 1318447, 1327819, 1339713, 1358005, 1367220, 1380291, 1392469, 1419406, 1430077, 1431068, 1439930, 1451344, 1462591, 1477317, 1486860, 1522126, 1523145, 1582770, 1694978];
const MATCH_TV_IDS = [456, 549, 764, 1396, 1399, 1408, 1416, 1431, 1434, 1622, 1911, 2734, 4057, 4614, 5920, 33238, 34307, 46952, 60625, 65334, 66732, 71790, 73586, 76479, 79744, 94997, 95897, 107447, 124364, 218613, 232393, 233643, 241002, 273240, 276161, 276880, 278178, 284631, 284725, 288603, 299167];

// Real TMDB ids NOT requested -> resolve to "not requested".
const FILLER_MOVIE_IDS = [980431, 157336, 222517, 278, 1291608, 1351908, 1245398, 39254, 350, 755898, 1290821, 1536233, 1273221, 863, 1679791, 840464, 920728, 1159559, 1294203, 1472951, 137051, 48650, 299536, 1699820, 687259, 1010581, 1242898, 10193, 1292415, 1368166, 235271, 1340206, 980477, 1305781, 1510767, 1628448, 1002398, 1202285, 1156593, 744275, 1265609, 1315772, 1463681, 1246049, 24428, 140638, 1171145, 1375646, 1117898, 1156594, 1198994, 226674, 1658216, 1564614, 1413976, 337167, 1292695, 847742, 238, 1325734, 1428990, 1092936, 979, 1480259, 17073, 1667198, 1363387, 1630423, 1613798, 1314481, 808, 671, 4258, 122, 460465, 1433117, 680, 1220522, 1584215, 533535, 120, 803796, 432123, 1515729, 1579, 1368337, 1669051, 299534, 1061474, 405871, 1558796, 1266127, 47612, 1168190, 315635, 496243, 27, 5082, 1266990, 1157008, 14836, 249397, 1599189, 1330021, 1110034, 1671548, 1560681, 27205, 911430, 4248, 129, 1475803, 1084577, 597, 1233413, 585, 519182, 1272837, 240, 1146058, 19995, 1135873, 1539104, 1284016, 1641319, 569094, 372058, 1507097, 39688, 425274, 106646, 1372, 550, 672, 269955, 673, 1380126, 575265, 1301421, 216015, 875828, 769, 22, 1241982, 674, 1083884, 91269, 1554631, 8587, 1234731, 429617, 1022789, 4935, 121, 1598785, 99861, 1699155, 1600735, 1084187, 7451, 1646787, 1316427, 767, 1320660, 829557, 414906, 950387, 18, 792723, 497, 1470130, 502356, 77338, 98, 675, 1213898, 939243, 16869, 1218925, 1411773, 1688935, 1284465, 1087192, 872585, 13333, 185664, 150540, 1274706, 47971, 933260, 10138, 1210938, 1383731, 1197306, 1290417, 1514125, 324857, 807, 12153, 680493, 1227877, 1316092, 285, 537915, 405746, 1726, 1408208, 1306368, 335984, 2105, 693134, 1414413, 1119449, 1329471, 424, 11036, 256835, 617126, 58, 1116201, 209112, 106, 1597280, 438631, 9806, 1621114, 857041, 1446056, 4257, 13078, 12444, 1706197, 177572, 329505, 77429, 829560, 578, 1556616, 1930, 1011985, 1312867, 1196067, 1530510, 10895, 76600, 1669057, 991494, 13, 1397485, 411, 12445, 11, 1359005, 912649, 564, 354912, 796, 1108427, 533533, 640, 269149, 324786, 286217, 272, 385687, 1003596, 1417285, 389, 37165, 2062, 37169, 38, 12, 10681, 1628367, 1236153, 1549519];
const FILLER_TV_IDS = [1412, 320118, 95479, 45952, 70998, 3172, 4604, 37680, 1433, 85552, 1973, 90966, 1668, 60735, 13805, 315038, 45140, 65733, 502, 44217, 2288, 22980, 1402, 1421, 322430, 44006, 36, 59941, 1405, 324723, 223911, 2661, 4607, 98031, 250596, 65942, 40, 32798, 1419, 693, 2224, 63770, 65494, 63174, 108978, 4629, 1428, 280932, 18165, 71712, 80748, 61818, 90388, 288659, 57243, 2316, 94722, 60574, 1620, 220102, 74561, 63247, 2261, 94664, 57532, 32692, 60059, 113360, 270476, 296285, 1400, 1398, 1407, 154770, 30984, 75219, 39351, 1435, 200709, 260592, 60572, 120089, 261145, 31132, 209867, 206559, 299989, 4177, 4419, 1516, 56570, 58841, 226637, 2691, 311858, 106449, 71728, 17610, 873, 217772, 97072, 269, 60622, 1981, 1411, 12971, 13859, 4601, 220542, 46296, 41956, 10083, 46260, 4087, 70672, 45247, 211288, 3022, 288577, 194, 45790, 322649, 4515, 219971, 4630, 14944, 259140, 1409, 12225, 31910, 1021, 4656, 1413, 37678, 74428, 15260, 2593, 1695, 2122, 218559, 1415, 13945, 48891, 220150, 1395, 34524, 224, 2406, 88580, 46195, 79481, 240407, 76572, 39185, 4588, 255483, 84105, 900, 62650, 105903, 1220, 1104, 32726, 127529, 2190, 5368, 13887, 3346, 790, 300054, 4556, 81044, 4239, 212568, 3034, 78191, 69478, 245215, 1100, 283123, 40663, 127532, 615, 95603, 1508, 101172, 1667, 290138, 1636, 48866, 276609, 14424];

export const SCALE_MOVIE_IDS = [...MATCH_MOVIE_IDS, ...FILLER_MOVIE_IDS];
export const SCALE_TV_IDS = [...MATCH_TV_IDS, ...FILLER_TV_IDS];
const MATCH_MOVIES = new Set(MATCH_MOVIE_IDS);
const MATCH_TV = new Set(MATCH_TV_IDS);

const pad = (n) => String(n).padStart(4, '0');

// Returns server-neutral items: { key, type, tmdbId, title, requested }.
// `movies`/`shows` are clamped to the available real-id pools.
export function buildScaleLibrary({
  movies = Number(process.env.FAKE_SCALE ?? 0),
  shows = Number(process.env.FAKE_SCALE_TV ?? 0),
} = {}) {
  const mk = (ids, matchSet, n, type, prefix) =>
    ids.slice(0, Math.max(0, Math.min(n, ids.length))).map((tmdbId, i) => ({
      key: `${prefix}${pad(i + 1)}`,
      type,
      tmdbId,
      // The "#" prefix keeps the trailing digits from being read as a release
      // year by the metadata resolver (a space + 4 digits would parse as a year
      // and then disagree with TMDB, rejecting the otherwise-valid direct id).
      title: `Scale ${type === 'movie' ? 'Movie' : 'Show'} #${pad(i + 1)}`,
      requested: matchSet.has(tmdbId),
    }));
  return {
    movies: mk(SCALE_MOVIE_IDS, MATCH_MOVIES, movies, 'movie', 'sclm'),
    shows: mk(SCALE_TV_IDS, MATCH_TV, shows, 'show', 'sclt'),
  };
}
