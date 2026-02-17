/**
 * Seed script for development / stress testing.
 * Sets up a fake Plex server with 50 rule groups and 500 Plex rules
 * so you can test the media server switch & rule migration flow in the UI.
 *
 * Usage:
 *   1. Run `yarn build && yarn dev` to start the server (creates the database).
 *   2. In a separate terminal, run `npx tsx jellyfin-dev/seed-dev-db.ts`
 *   3. Test in the UI — seeded data is available immediately.
 *
 * To reset: stop the server, delete data/maintainerr.sqlite, and repeat from step 1.
 *
 * ----- Jellyfin setup (for testing Plex → Jellyfin migration) -----
 *
 * This codespace has Jellyfin installed at /usr/bin/jellyfin.
 * The default data dirs (/var/cache/jellyfin etc.) are not writable,
 * so use temp directories instead.
 *
 * 1. Start Jellyfin:
 *      mkdir -p /tmp/jellyfin-{data,cache,config,log}
 *      nohup jellyfin -d /tmp/jellyfin-data -C /tmp/jellyfin-cache \
 *        -c /tmp/jellyfin-config -l /tmp/jellyfin-log --nowebclient \
 *        > /tmp/jellyfin.log 2>&1 &
 *
 * 2. Wait ~10 seconds, then complete the startup wizard:
 *      curl -X POST http://localhost:8096/Startup/User \
 *        -H 'Content-Type: application/json' \
 *        -d '{"Name":"admin","Password":"admin123"}'
 *      curl -X POST http://localhost:8096/Startup/Configuration \
 *        -H 'Content-Type: application/json' \
 *        -d '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}'
 *      curl -X POST http://localhost:8096/Startup/RemoteAccess \
 *        -H 'Content-Type: application/json' \
 *        -d '{"EnableRemoteAccess":true,"EnableAutomaticPortMapping":false}'
 *      curl -X POST http://localhost:8096/Startup/Complete
 *
 * 3. Authenticate to get an API key and user ID:
 *      curl -X POST http://localhost:8096/Users/AuthenticateByName \
 *        -H 'Content-Type: application/json' \
 *        -H 'X-Emby-Authorization: MediaBrowser Client="Maintainerr", Device="dev", DeviceId="seed", Version="1.0"' \
 *        -d '{"Username":"admin","Pw":"admin123"}'
 *    Note the `AccessToken` and `User.Id` from the response.
 *
 * 4. Create dummy libraries so Maintainerr can assign them to rule groups:
 *      mkdir -p /tmp/jellyfin-media/movies /tmp/jellyfin-media/tvshows
 *      TOKEN="<AccessToken>"
 *      curl -X POST "http://localhost:8096/Library/VirtualFolders?name=Movies&collectionType=movies&refreshLibrary=false" \
 *        -H "X-Emby-Token: $TOKEN" -H 'Content-Type: application/json' \
 *        -d '{"LibraryOptions":{},"PathInfos":[{"Path":"/tmp/jellyfin-media/movies"}]}'
 *      curl -X POST "http://localhost:8096/Library/VirtualFolders?name=TV%20Shows&collectionType=tvshows&refreshLibrary=false" \
 *        -H "X-Emby-Token: $TOKEN" -H 'Content-Type: application/json' \
 *        -d '{"LibraryOptions":{},"PathInfos":[{"Path":"/tmp/jellyfin-media/tvshows"}]}'
 *
 * 5. Seed the Jellyfin settings into the Maintainerr database:
 *      npx tsx -e "
 *        import Database from 'better-sqlite3';
 *        const db = new Database('data/maintainerr.sqlite');
 *        db.prepare(\`UPDATE settings SET
 *          jellyfin_url = 'http://localhost:8096',
 *          jellyfin_api_key = '<AccessToken>',
 *          jellyfin_user_id = '<User.Id>',
 *          jellyfin_server_name = 'codespaces'
 *        WHERE id = 1\`).run();
 *        db.close();
 *      "
 *
 * 6. Now switch from Plex to Jellyfin in the Maintainerr UI (Settings → Media Server)
 *    and test the migration flow.
 *
 * To stop Jellyfin: kill $(pgrep jellyfin)
 * To reset Jellyfin: rm -rf /tmp/jellyfin-{data,cache,config,log} and repeat from step 1.
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "../data/maintainerr.sqlite");

const APP_PLEX = 0;

// RulePossibility enum values (numeric, matching @maintainerr/contracts)
const ACTION_BIGGER = 0;
const ACTION_SMALLER = 1;
const ACTION_EQUALS = 2;
const ACTION_NOT_EQUALS = 3;
const ACTION_CONTAINS = 4;
const ACTION_BEFORE = 5;
const ACTION_AFTER = 6;
const ACTION_IN_LAST = 7;

// RuleType IDs (must be numbers to match the UI's switch/case checks)
const TYPE_NUMBER = 0;
const TYPE_DATE = 1;
const TYPE_TEXT = 2;
const TYPE_BOOL = 3;
const TYPE_TEXT_LIST = 4;

// RuleOperators (null = first rule / section start, '0'=AND / '1'=OR matching UI <select> values)
const OPERATORS = ["0", "1"] as const;

// --- Plex property definitions with type and mediaType compatibility ---
// MediaType: 0=BOTH, 1=MOVIE, 2=SHOW
interface PropDef {
  id: number;
  type: number; // RuleType ID (matches RuleType enum)
  mediaType: 0 | 1 | 2;
  showType?: string[]; // if set, only valid for these show sub-types (matches UI filter)
  incompatible?: boolean; // true if not available in Jellyfin
}

// Compatible properties (exist in both Plex and Jellyfin with same name)
const PLEX_PROPS: PropDef[] = [
  { id: 0, type: TYPE_DATE, mediaType: 0 }, // addDate
  { id: 1, type: TYPE_TEXT_LIST, mediaType: 1 }, // seenBy (movie)
  { id: 2, type: TYPE_DATE, mediaType: 0 }, // releaseDate
  { id: 3, type: TYPE_NUMBER, mediaType: 0 }, // rating_user
  { id: 4, type: TYPE_TEXT_LIST, mediaType: 0 }, // people
  { id: 5, type: TYPE_NUMBER, mediaType: 1 }, // viewCount (movie)
  { id: 6, type: TYPE_NUMBER, mediaType: 0 }, // collections
  { id: 7, type: TYPE_DATE, mediaType: 0 }, // lastViewedAt
  { id: 8, type: TYPE_TEXT, mediaType: 1 }, // fileVideoResolution (movie)
  { id: 9, type: TYPE_NUMBER, mediaType: 1 }, // fileBitrate (movie)
  { id: 10, type: TYPE_TEXT, mediaType: 1 }, // fileVideoCodec (movie)
  { id: 11, type: TYPE_TEXT_LIST, mediaType: 0 }, // genre
  { id: 12, type: TYPE_TEXT_LIST, mediaType: 2, showType: ["show", "season"] }, // sw_allEpisodesSeenBy
  { id: 13, type: TYPE_DATE, mediaType: 2, showType: ["show", "season"] }, // sw_lastWatched
  { id: 14, type: TYPE_NUMBER, mediaType: 2, showType: ["show", "season"] }, // sw_episodes
  { id: 15, type: TYPE_NUMBER, mediaType: 2, showType: ["show", "season"] }, // sw_viewedEpisodes
  { id: 16, type: TYPE_DATE, mediaType: 2, showType: ["show", "season"] }, // sw_lastEpisodeAddedAt
  { id: 17, type: TYPE_NUMBER, mediaType: 2 }, // sw_amountOfViews
  {
    id: 18,
    type: TYPE_TEXT_LIST,
    mediaType: 2,
    showType: ["show", "season", "episode"],
  }, // sw_watchers
  { id: 19, type: TYPE_TEXT_LIST, mediaType: 0 }, // collection_names
  { id: 20, type: TYPE_NUMBER, mediaType: 0 }, // playlists
  { id: 21, type: TYPE_TEXT_LIST, mediaType: 0 }, // playlist_names
  { id: 22, type: TYPE_NUMBER, mediaType: 0 }, // rating_critics
  { id: 23, type: TYPE_NUMBER, mediaType: 0 }, // rating_audience
  { id: 24, type: TYPE_TEXT_LIST, mediaType: 0 }, // labels
  { id: 25, type: TYPE_NUMBER, mediaType: 2, showType: ["season", "episode"] }, // sw_collections_including_parent
  {
    id: 26,
    type: TYPE_TEXT_LIST,
    mediaType: 2,
    showType: ["season", "episode"],
  }, // sw_collection_names_including_parent
  { id: 27, type: TYPE_DATE, mediaType: 2, showType: ["show", "season"] }, // sw_lastEpisodeAiredAt
  { id: 29, type: TYPE_DATE, mediaType: 2, showType: ["episode"] }, // sw_seasonLastEpisodeAiredAt

  // Plex-only properties (truly incompatible — no Jellyfin equivalent)
  { id: 28, type: TYPE_TEXT_LIST, mediaType: 0, incompatible: true }, // watchlist_isListedByUsers
  { id: 30, type: TYPE_BOOL, mediaType: 0, incompatible: true }, // watchlist_isWatchlisted
  {
    id: 31,
    type: TYPE_NUMBER,
    mediaType: 0,
    showType: ["episode", "show"],
    incompatible: true,
  }, // rating_imdb (Jellyfin ID 31 is sw_playCount — different property)

  // Rating properties — IDs 32-38 exist in both Plex and Jellyfin with same name+ID.
  // These migrate without remapping.
  {
    id: 32,
    type: TYPE_NUMBER,
    mediaType: 0,
    showType: ["episode", "show"],
  }, // rating_rottenTomatoesCritic
  {
    id: 33,
    type: TYPE_NUMBER,
    mediaType: 0,
    showType: ["episode", "show"],
  }, // rating_rottenTomatoesAudience
  {
    id: 34,
    type: TYPE_NUMBER,
    mediaType: 0,
    showType: ["episode", "show"],
  }, // rating_tmdb
  {
    id: 35,
    type: TYPE_NUMBER,
    mediaType: 2,
    showType: ["season", "episode"],
  }, // rating_imdbShow
  {
    id: 36,
    type: TYPE_NUMBER,
    mediaType: 2,
    showType: ["season", "episode"],
  }, // rating_rottenTomatoesCriticShow
  {
    id: 37,
    type: TYPE_NUMBER,
    mediaType: 2,
    showType: ["season", "episode"],
  }, // rating_rottenTomatoesAudienceShow
  {
    id: 38,
    type: TYPE_NUMBER,
    mediaType: 2,
    showType: ["season", "episode"],
  }, // rating_tmdbShow

  // Smart collection properties — remappable via migrateTo (not incompatible).
  // 39→collections(6), 40→sw_collections_including_parent(25),
  // 41→sw_collection_names_including_parent(26), 42→collection_names(19)
  { id: 39, type: TYPE_NUMBER, mediaType: 0 }, // collectionsIncludingSmart → collections
  {
    id: 40,
    type: TYPE_NUMBER,
    mediaType: 2,
    showType: ["season", "episode"],
  }, // sw_collections_including_parent_and_smart → sw_collections_including_parent
  {
    id: 41,
    type: TYPE_TEXT_LIST,
    mediaType: 2,
    showType: ["season", "episode"],
  }, // sw_collection_names_including_parent_and_smart → sw_collection_names_including_parent
  { id: 42, type: TYPE_TEXT_LIST, mediaType: 0 }, // collection_names_including_smart → collection_names
];

/** Valid actions per RuleType */
const ACTIONS_BY_TYPE: Record<number, number[]> = {
  [TYPE_NUMBER]: [
    ACTION_BIGGER,
    ACTION_SMALLER,
    ACTION_EQUALS,
    ACTION_NOT_EQUALS,
  ],
  [TYPE_DATE]: [
    ACTION_EQUALS,
    ACTION_NOT_EQUALS,
    ACTION_BEFORE,
    ACTION_AFTER,
    ACTION_IN_LAST,
  ],
  [TYPE_TEXT]: [ACTION_EQUALS, ACTION_NOT_EQUALS, ACTION_CONTAINS],
  [TYPE_BOOL]: [ACTION_EQUALS, ACTION_NOT_EQUALS],
  [TYPE_TEXT_LIST]: [ACTION_EQUALS, ACTION_NOT_EQUALS, ACTION_CONTAINS],
};

function generateValue(type: number, action: number): string {
  switch (type) {
    case TYPE_DATE:
      // IN_LAST uses seconds (e.g. 30 days = 2592000)
      if (action === ACTION_IN_LAST) {
        return String(pick([7, 14, 30, 60, 90, 180, 365]) * 86400);
      }
      // Other date actions use date strings
      {
        const d = new Date();
        d.setDate(d.getDate() - Math.floor(Math.random() * 365));
        return d.toISOString().split("T")[0]!; // "YYYY-MM-DD"
      }
    case TYPE_BOOL:
      return pick(["true", "false"]);
    case TYPE_TEXT:
    case TYPE_TEXT_LIST:
      return pick([
        "Action",
        "Comedy",
        "Drama",
        "Sci-Fi",
        "Horror",
        "user1",
        "user2",
      ]);
    case TYPE_NUMBER:
    default:
      return String(Math.floor(Math.random() * 100));
  }
}

function makeRule(
  prop: PropDef,
  opts: { operator?: string | null; value?: string } = {},
) {
  const actions = ACTIONS_BY_TYPE[prop.type] ?? [ACTION_EQUALS];
  const action = pick(actions);
  const value = opts.value ?? generateValue(prop.type, action);

  // Match what the real UI stores for ruleTypeId:
  // - TEXT_LIST properties → ruleTypeId: 2 (TEXT), not 4 (legacy)
  // - DATE + IN_LAST action → ruleTypeId: 0 (NUMBER), value in seconds
  // - DATE + other actions → ruleTypeId: 1 (DATE), value as "YYYY-MM-DD"
  let ruleTypeId = prop.type;
  if (prop.type === TYPE_TEXT_LIST) {
    ruleTypeId = TYPE_TEXT;
  } else if (prop.type === TYPE_DATE && action === ACTION_IN_LAST) {
    ruleTypeId = TYPE_NUMBER;
  }

  return JSON.stringify({
    operator: opts.operator ?? null,
    action,
    firstVal: [APP_PLEX, prop.id],
    customVal: { ruleTypeId, value },
    section: 0,
  });
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function seed() {
  let db: Database.Database;
  try {
    db = new Database(DB_PATH);
  } catch {
    console.error(`Could not open database at ${DB_PATH}`);
    console.error(
      "Run `yarn dev` first to create the database, then run this script.",
    );
    process.exit(1);
  }

  const tableCheck = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='rule_group'",
    )
    .get();
  if (!tableCheck) {
    console.error(
      "Database exists but has no tables. Run `yarn dev` first to run migrations.",
    );
    db.close();
    process.exit(1);
  }

  // --- Configure fake Plex server ---
  db.prepare(
    `
    UPDATE settings SET
      media_server_type = 'plex',
      plex_name = 'Fake Plex Server',
      plex_hostname = '192.168.1.100',
      plex_port = 32400,
      plex_ssl = 0,
      plex_auth_token = 'fake-plex-token-abc123',
      jellyfin_url = NULL,
      jellyfin_api_key = NULL,
      jellyfin_user_id = NULL,
      jellyfin_server_name = NULL
    WHERE id = 1
  `,
  ).run();

  console.log("Configured fake Plex server (media_server_type = plex).");

  // Clean existing test data
  db.exec("DELETE FROM rules");
  db.exec("DELETE FROM rule_group");
  db.exec("DELETE FROM collection");

  const insertCollection = db.prepare(`
    INSERT INTO collection (libraryId, title, description, type, mediaServerType, isActive, arrAction,
      visibleOnRecommended, visibleOnHome, manualCollection, manualCollectionName, listExclusions,
      forceOverseerr, keepLogsForMonths, handledMediaAmount, lastDurationInSeconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRuleGroup = db.prepare(`
    INSERT INTO rule_group (name, description, libraryId, isActive, collectionId, useRules, dataType)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRule = db.prepare(`
    INSERT INTO rules (ruleJson, ruleGroupId, section, isActive)
    VALUES (?, ?, ?, ?)
  `);

  const NUM_GROUPS = 50;
  const RULES_PER_GROUP = 10; // 50 * 10 = 500 rules
  const TYPES: ("movie" | "show")[] = ["movie", "show"];

  // Pre-filter properties by media type
  // mediaType 0 (BOTH) is valid for both movie and show groups
  // mediaType 1 (MOVIE) only for movie groups
  // mediaType 2 (SHOW) only for show groups
  const movieProps = PLEX_PROPS.filter(
    (p) => p.mediaType === 0 || p.mediaType === 1,
  );
  const showProps = PLEX_PROPS.filter(
    (p) => p.mediaType === 0 || p.mediaType === 2,
  );

  const movieCompatible = movieProps.filter((p) => !p.incompatible);
  const movieIncompatible = movieProps.filter((p) => p.incompatible);
  // Filter by showType: only include props valid for the group's dataType ("show")
  const showCompatible = showProps.filter(
    (p) =>
      !p.incompatible &&
      (p.showType === undefined || p.showType.includes("show")),
  );
  const showIncompatible = showProps.filter(
    (p) =>
      p.incompatible &&
      (p.showType === undefined || p.showType.includes("show")),
  );

  let totalRules = 0;
  let incompatibleCount = 0;

  for (let g = 0; g < NUM_GROUPS; g++) {
    const type = TYPES[g % 2]!;
    const libraryId = type === "movie" ? "1" : "2";
    const name = `${type === "movie" ? "Movies" : "TV Shows"} - Group ${g + 1}`;

    const compatible = type === "movie" ? movieCompatible : showCompatible;
    const incompatible =
      type === "movie" ? movieIncompatible : showIncompatible;

    const col = insertCollection.run(
      libraryId,
      name,
      `Auto-generated test group ${g + 1}`,
      type,
      "plex",
      1,
      0,
      0,
      0,
      0,
      "",
      0,
      0,
      6,
      0,
      0,
    );

    const rg = insertRuleGroup.run(
      name,
      `Auto-generated test group ${g + 1}`,
      libraryId,
      1, // active
      Number(col.lastInsertRowid),
      1,
      type,
    );

    const groupId = Number(rg.lastInsertRowid);

    for (let r = 0; r < RULES_PER_GROUP; r++) {
      // ~20% of rules use incompatible Plex-only properties
      const useIncompatible = incompatible.length > 0 && Math.random() < 0.2;
      const prop = useIncompatible ? pick(incompatible) : pick(compatible);

      if (useIncompatible) incompatibleCount++;

      const operator = r === 0 ? null : pick(OPERATORS);

      insertRule.run(makeRule(prop, { operator }), groupId, 0, 1);
      totalRules++;
    }
  }

  console.log(
    `Seeded ${NUM_GROUPS} rule groups with ${totalRules} Plex rules (~${incompatibleCount} incompatible).`,
  );
  console.log("");
  console.log("Migration test flow:");
  console.log("  1. Open Settings → Media Server");
  console.log("  2. Switch from Plex to Jellyfin");
  console.log(
    "  3. Preview migration → should show compatible/incompatible breakdown",
  );
  console.log('  4. Execute migration with "skip incompatible" enabled');
  console.log(
    "  5. Verify: incompatible rules deleted, empty groups cleaned up",
  );
  console.log('  6. Click "Run Rules" → test validation toasts');
  console.log("");

  db.close();
}

seed();
