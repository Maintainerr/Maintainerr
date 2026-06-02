#!/usr/bin/env node
/**
 * Dev-only database seed for Maintainerr.
 *
 * Populates the local SQLite DB with a coherent media-server + Radarr + Sonarr
 * setup, several collections of fictional media so the UI renders with
 * real-looking content (Collections list, Collection detail, Storage, Rules),
 * and rule groups whose rules cover (almost) the whole rule-property surface
 * for the active media server.
 *
 * This is the only one of the three dev scripts that touches the DB; the
 * companion mocks are stateless HTTP servers:
 *   - tools/dev/fake-jellyfin.mjs  (mock Jellyfin, :8096) — pairs with MEDIA_SERVER=jellyfin
 *   - tools/dev/fake-plex.mjs      (mock Plex, :32400)    — pairs with MEDIA_SERVER=plex
 *
 * Notes
 * -----
 * - Media titles are NOT stored on collection_media (they resolve at runtime
 *   from TMDB / the media server), so the seeded cards show posters only.
 *   Posters use picsum.photos seeded URLs (placeholder photography) via the
 *   collection_media.image_path "absolute URL" fast-path — no real media is
 *   referenced, satisfying the repo's no-real-media-names rule.
 * - All names below are invented for testing.
 * - Rules use action EXISTS so they stay property-agnostic (any item with the
 *   value matches) while still exercising every getter. Inspect a getter's
 *   actual output with POST /api/rules/test {"mediaId","rulegroupId"} — e.g.
 *   the Plex case-sensitive smart-collection dedupe (rule ids 41/42).
 * - Watchlist rules (need plex.tv, not the local mock) are intentionally left out.
 * - This RESETS the collection/rule/servarr tables, then re-seeds, so it is
 *   safe to re-run. The settings row is updated in place.
 *
 * Usage
 * -----
 *   1. Start the matching mock (tools/dev/fake-jellyfin.mjs or tools/dev/fake-plex.mjs).
 *   2. Stop `yarn dev` (SQLite allows a single writer).
 *   3. node tools/dev/seed-db.mjs                 # Jellyfin (default)
 *      MEDIA_SERVER=plex node tools/dev/seed-db.mjs   # Plex
 *   4. Start `yarn dev` and open http://localhost:3000/collections
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// This script lives in tools/dev/, so the repo root is two levels up.
const repoRoot = resolve(__dirname, "..", "..");
// better-sqlite3 lives in the server workspace; resolve it from there.
const require = createRequire(resolve(repoRoot, "apps/server/package.json"));
const Database = require("better-sqlite3");

const dbPath =
  process.env.MAINTAINERR_DB ?? resolve(repoRoot, "data/maintainerr.sqlite");

const db = new Database(dbPath);
db.pragma("busy_timeout = 5000");

const poster = (slug) => `https://picsum.photos/seed/mtrr-${slug}/300/450`;
const GiB = 1024 ** 3;
const daysAgo = (n) => {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 19).replace("T", " ");
};
const jellyfinId = () =>
  [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

// --- Target media server + rule coverage -------------------------------------
const TARGET = process.env.MEDIA_SERVER === "plex" ? "plex" : "jellyfin";
const APP = TARGET === "plex" ? 0 : 6; // Application id: Plex=0, Jellyfin=6
const LIB =
  TARGET === "plex"
    ? { movie: "1", show: "2" } // tools/dev/fake-plex.mjs section ids
    : { movie: "jellyfin-movies", show: "jellyfin-shows" }; // tools/dev/fake-jellyfin.mjs

// ruleTypeId: NUMBER=0 DATE=1 TEXT=2 BOOL=3 TEXT_LIST=4. Property ids/types
// differ per server, so keep one map each (mirrors RuleConstants).
const N = 0, D = 1, T = 2, B = 3, L = 4;
const TYPES = {
  plex: { 0:D,1:L,2:D,3:N,4:L,5:N,6:N,7:D,8:T,9:N,10:T,11:L,12:L,13:D,14:N,15:N,16:D,17:N,18:L,19:L,20:N,21:L,22:N,23:N,24:L,25:N,26:L,27:D,29:D,31:N,32:N,33:N,34:N,35:N,36:N,37:N,38:N,39:N,40:N,41:L,42:L,43:B,44:D,45:N },
  jellyfin: { 0:D,1:L,2:D,3:N,4:L,5:N,6:N,7:D,8:T,9:N,10:T,11:L,12:L,13:D,14:N,15:N,16:D,17:N,18:L,19:L,20:N,21:L,22:N,23:N,24:L,25:N,26:L,27:D,29:D,30:N,31:N,32:N,33:N,34:N,35:N,36:N,37:N,38:N,39:L,40:L,41:L,42:B,44:N,45:D },
};
// Rule-property ids covered per group type (movie vs show/episode).
const COVERAGE = {
  plex: {
    movie: [0,1,2,3,4,5,6,7,8,9,10,11,19,20,21,22,23,24,31,32,33,34,39,42,43,44],
    show: [0,2,4,11,12,13,14,15,16,17,18,19,25,26,27,29,35,36,37,38,40,41,42,45],
  },
  jellyfin: {
    movie: [0,1,2,3,4,5,6,7,8,9,10,11,19,20,21,22,23,24,30,32,33,34,39,42,44,45],
    show: [0,2,4,11,12,13,14,15,16,17,18,19,25,26,27,29,31,35,36,37,38,40,41,42],
  },
};
const EXISTS = 18; // RulePossibility.EXISTS — valid for every RuleType
const ruleType = TYPES[TARGET];
const ruleJson = (id, i) =>
  JSON.stringify({
    customVal: { ruleTypeId: ruleType[id], value: "" },
    operator: i === 0 ? null : 1, // first rule unset, rest OR (union)
    firstVal: [APP, id],
    action: EXISTS,
    section: 0,
  });

// --- Fictional catalogues (slugs only drive distinct posters) ----------------
const STALE_MOVIES = [
  "crimson-meridian",
  "the-last-cartographer",
  "hollowpoint-drive",
  "echoes-of-tomorrow",
  "glass-canyon",
  "vanishing-point-theory",
  "the-salt-road",
  "midnight-aviary",
  "paper-tigers",
  "concrete-garden",
  "the-ninth-wave",
  "static-bloom",
  "cobalt-harbor",
  "ashfall",
];
const UNWATCHED_SHOWS = [
  "driftwood-county",
  "the-lantern-society",
  "wired-hollow",
  "northern-static",
  "the-tidewater-files",
  "brass-and-bone",
  "lowtide",
  "signal-and-noise",
  "ferrous",
  "the-quiet-mile",
];
const ARCHIVE_MOVIES = [
  "quiet-harbor",
  "the-paper-lantern",
  "umbral",
  "foxglove",
  "tin-soldiers",
  "the-long-afternoon",
  "saltwater-hymn",
  "greyscale",
];

const run = db.transaction(() => {
  // 1) Reset seeded tables (children first; collection cascades, but be explicit)
  db.pragma("foreign_keys = OFF");
  for (const t of [
    "notification_rulegroup",
    "notification",
    "exclusion",
    "collection_log",
    "overlay_item_state",
    "collection_media",
    "rules",
    "rule_group",
    "collection",
    "radarr_settings",
    "sonarr_settings",
  ]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  db.pragma("foreign_keys = ON");

  // 2) Configure the active media server + metadata + integrations.
  if (TARGET === "plex") {
    // Points at tools/dev/fake-plex.mjs. The fixed machine id lets the primary
    // connection succeed without plex.tv re-discovery.
    db.prepare(
      `UPDATE settings SET
         media_server_type = 'plex',
         plex_name = @name,
         plex_hostname = @host,
         plex_port = @port,
         plex_ssl = 0,
         plex_auth_token = @token,
         plex_machine_id = @machine,
         tmdb_api_key = @tmdb
       WHERE id = 1`,
    ).run({
      name: "Plex (dev seed)",
      host: "localhost",
      port: 32400,
      token: "devseed000000000000000000000plex",
      machine: "mockplexmachine0000000000000000",
      tmdb: "devseed00000000000000000000000tmdb",
    });
  } else {
    db.prepare(
      `UPDATE settings SET
         media_server_type = 'jellyfin',
         jellyfin_url = @url,
         jellyfin_api_key = @key,
         jellyfin_user_id = @user,
         jellyfin_server_name = @name,
         tmdb_api_key = @tmdb
       WHERE id = 1`,
    ).run({
      url: "http://localhost:8096",
      key: "devseed0000000000000000000000jelly",
      user: "devseeduser000000000000000000jelly",
      name: "Jellyfin (dev seed)",
      tmdb: "devseed00000000000000000000000tmdb",
    });
  }

  // 3) Radarr / Sonarr settings rows.
  const radarrId = db
    .prepare(
      `INSERT INTO radarr_settings (serverName, url, apiKey) VALUES (?, ?, ?)`,
    )
    .run(
      "Radarr (dev seed)",
      "http://localhost:7878",
      "devseed00radarr00000000000000000000",
    ).lastInsertRowid;
  const sonarrId = db
    .prepare(
      `INSERT INTO sonarr_settings (serverName, url, apiKey) VALUES (?, ?, ?)`,
    )
    .run(
      "Sonarr (dev seed)",
      "http://localhost:8989",
      "devseed00sonarr00000000000000000000",
    ).lastInsertRowid;

  // 4) Collections + media + linked rule groups.
  const insCollection = db.prepare(
    `INSERT INTO collection
       (libraryId, title, description, isActive, type, mediaServerType,
        deleteAfterDays, visibleOnHome, visibleOnRecommended, arrAction, listExclusions,
        radarrSettingsId, sonarrSettingsId, handledMediaAmount,
        handledMediaSizeBytes, totalSizeBytes, lastDurationInSeconds, addDate)
     VALUES
       (@libraryId, @title, @description, 1, @type, @mediaServerType,
        @deleteAfterDays, @visibleOnHome, 0, @arrAction, @listExclusions,
        @radarrSettingsId, @sonarrSettingsId, @handledMediaAmount,
        @handledMediaSizeBytes, @totalSizeBytes, @lastDuration, @addDate)`,
  );
  const insMedia = db.prepare(
    `INSERT INTO collection_media
       (collectionId, mediaServerId, addDate, image_path, isManual, includedByRule, sizeBytes, tmdbId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insRuleGroup = db.prepare(
    `INSERT INTO rule_group
       (name, description, libraryId, isActive, collectionId, useRules, dataType)
     VALUES (?, ?, ?, 1, ?, 1, ?)`,
  );
  const insRule = db.prepare(
    `INSERT INTO rules (ruleGroupId, ruleJson, section, isActive) VALUES (?, ?, 0, 1)`,
  );

  const seedCollection = (cfg) => {
    let totalSize = 0;
    const sizes = cfg.slugs.map(() =>
      Math.round((1 + Math.random() * 7) * GiB),
    );
    totalSize = sizes.reduce((a, b) => a + b, 0);

    const colId = insCollection.run({
      libraryId: cfg.libraryId,
      title: cfg.title,
      description: cfg.description,
      type: cfg.type,
      mediaServerType: TARGET,
      deleteAfterDays: cfg.deleteAfterDays,
      visibleOnHome: cfg.visibleOnHome ? 1 : 0,
      // ServarrAction: DELETE=0, UNMONITOR_DELETE_ALL=1, UNMONITOR=3, DO_NOTHING=4.
      arrAction: cfg.arrAction ?? 0,
      listExclusions: cfg.listExclusions ? 1 : 0,
      radarrSettingsId: cfg.type === "movie" ? radarrId : null,
      sonarrSettingsId: cfg.type === "show" ? sonarrId : null,
      handledMediaAmount: cfg.slugs.length,
      handledMediaSizeBytes: totalSize,
      totalSizeBytes: totalSize,
      lastDuration: 3 + Math.floor(Math.random() * 40),
      addDate: daysAgo(cfg.maxAge + 5),
    }).lastInsertRowid;

    cfg.slugs.forEach((slug, i) => {
      const age = Math.round((i / cfg.slugs.length) * cfg.maxAge);
      // Movies get a deterministic tmdbId so the Radarr action handler resolves
      // them without the media server (fake-radarr returns a movie for any
      // tmdbId). Shows are left null (Sonarr resolves via tvdb, not exercised).
      const tmdbId = cfg.type === "movie" ? colId * 1000 + i : null;
      insMedia.run(
        colId,
        jellyfinId(),
        daysAgo(age),
        poster(slug),
        0,
        1,
        sizes[i],
        tmdbId,
      );
    });

    const groupId = insRuleGroup.run(
      cfg.title,
      cfg.description,
      cfg.libraryId,
      colId,
      cfg.type,
    ).lastInsertRowid;

    const ruleIds = COVERAGE[TARGET][cfg.type === "show" ? "show" : "movie"];
    ruleIds.forEach((id, i) => insRule.run(groupId, ruleJson(id, i)));

    return { colId, groupId, count: cfg.slugs.length, rules: ruleIds.length };
  };

  const results = [
    seedCollection({
      title: "Stale Movies",
      description: "Movies untouched for a while — up for cleanup.",
      libraryId: LIB.movie,
      type: "movie",
      deleteAfterDays: 30,
      visibleOnHome: true,
      slugs: STALE_MOVIES,
      maxAge: 120,
      // Unmonitor + add import list exclusion: exercises the Radarr exclusion
      // path against tools/dev/fake-radarr.mjs (POST /exclusions/bulk).
      arrAction: 3, // UNMONITOR
      listExclusions: true,
    }),
    seedCollection({
      title: "Unwatched Series",
      description: "Series nobody has started.",
      libraryId: LIB.show,
      type: "show",
      deleteAfterDays: 90,
      visibleOnHome: true,
      slugs: UNWATCHED_SHOWS,
      maxAge: 200,
      // Do nothing: there is no fake Sonarr, so keep collection-handling runs
      // focused on the Radarr path. Set to a real action once one exists.
      arrAction: 4, // DO_NOTHING
    }),
    seedCollection({
      title: "Archive Queue",
      description: "Kept indefinitely (no auto-delete).",
      libraryId: LIB.movie,
      type: "movie",
      deleteAfterDays: null,
      visibleOnHome: false,
      slugs: ARCHIVE_MOVIES,
      maxAge: 365,
      arrAction: 4, // DO_NOTHING (null deleteAfterDays would otherwise be "due now")
    }),
  ];

  // 5) Cron schedules (Settings handlers + one per-group override + overlays).
  db.prepare(
    `UPDATE settings SET collection_handler_job_cron = ?, rules_handler_job_cron = ? WHERE id = 1`,
  ).run("0 4 * * *", "0 */12 * * *");
  // Per-group override on the first group (visible on the rule edit screen).
  db.prepare(`UPDATE rule_group SET ruleHandlerCronSchedule = ? WHERE id = ?`).run(
    "0 */6 * * *",
    results[0].groupId,
  );

  // 6) Notifications (agents + links to rule groups). Endpoints are local
  //    placeholders — these never fire in dev, they just populate the UI.
  const insNotification = db.prepare(
    `INSERT INTO notification (name, agent, enabled, types, options, aboutScale)
     VALUES (@name, @agent, @enabled, @types, @options, @aboutScale)`,
  );
  const insNotifLink = db.prepare(
    `INSERT INTO notification_rulegroup (notificationId, rulegroupId) VALUES (?, ?)`,
  );
  // NotificationType bitmask values: added=2, removed=4, aboutToHandle=8, handled=16.
  const NOTIFS = [
    {
      name: "Dev Gotify",
      agent: "gotify",
      enabled: 1,
      types: [2, 4, 16],
      options: { url: "http://localhost:8080", token: "devseedgotifytoken000" },
    },
    {
      name: "Dev Discord",
      agent: "discord",
      enabled: 1,
      types: [8, 16],
      options: {
        webhookUrl: "http://localhost:9999/discord-webhook",
        botUsername: "Maintainerr (dev)",
      },
    },
    {
      name: "Dev Webhook",
      agent: "webhook",
      enabled: 0,
      types: [2, 4, 8, 16, 32, 64],
      options: {
        webhookUrl: "http://localhost:9999/hook",
        jsonPayload: '{"event":"{{event}}","subject":"{{subject}}"}',
      },
    },
  ];
  NOTIFS.forEach((n, i) => {
    const notifId = insNotification.run({
      name: n.name,
      agent: n.agent,
      enabled: n.enabled,
      types: JSON.stringify(n.types),
      options: JSON.stringify(n.options),
      aboutScale: 3,
    }).lastInsertRowid;
    // Link each agent to a different rule group (round-robin).
    insNotifLink.run(notifId, results[i % results.length].groupId);
  });

  // 7) Collection activity log (drives Overview activity + collection history).
  //    ECollectionLogType: COLLECTION=0, MEDIA=1, RULES=2.
  const insLog = db.prepare(
    `INSERT INTO collection_log (collectionId, timestamp, message, type, meta)
     VALUES (?, ?, ?, ?, null)`,
  );
  const tsAgo = (n) =>
    new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  for (const r of results) {
    insLog.run(r.colId, tsAgo(14), "Collection created", 0);
    insLog.run(r.colId, tsAgo(7), `Rule run added ${r.count} media items`, 2);
    insLog.run(r.colId, tsAgo(3), `${Math.max(1, Math.floor(r.count / 4))} media items handled`, 1);
    insLog.run(r.colId, tsAgo(1), "Collection settings updated", 0);
  }

  // 8) Manual exclusions (populate the exclusions screen). type = media type.
  const insExclusion = db.prepare(
    `INSERT INTO exclusion (mediaServerId, ruleGroupId, parent, type) VALUES (?, ?, ?, ?)`,
  );
  // One global exclusion + one scoped to the first rule group.
  insExclusion.run(TARGET === "plex" ? "p3" : jellyfinId(), null, null, "movie");
  insExclusion.run(TARGET === "plex" ? "p2" : jellyfinId(), results[0].groupId, null, "movie");

  // 9) Enable overlays + give them a cron (Overlays screen).
  db.prepare(`UPDATE overlay_settings SET enabled = 1, cronSchedule = ? WHERE id = 1`).run(
    "0 5 * * *",
  );

  return results;
});

const results = run();
const totalItems = results.reduce((a, r) => a + r.count, 0);
const totalRules = results.reduce((a, r) => a + r.rules, 0);
console.log(
  `Seeded ${results.length} collections, ${totalItems} media items, ${totalRules} rules into ${dbPath}`,
);
console.log(
  `Media server set to ${TARGET === "plex" ? "Plex" : "Jellyfin"} (dev seed); Radarr + Sonarr configured.`,
);
console.log(
  "Also seeded: notifications, cron schedules, collection logs, exclusions, overlays.",
);
console.log("Restart `yarn dev` and open http://localhost:3000/collections");
db.close();
