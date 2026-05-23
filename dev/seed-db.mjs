#!/usr/bin/env node
/**
 * Dev-only database seed for Maintainerr.
 *
 * Populates the local SQLite DB with a coherent Jellyfin + Radarr + Sonarr
 * setup and several collections of fictional media so the UI renders with
 * real-looking content (Collections list, Collection detail, Storage, Rules).
 *
 * Notes
 * -----
 * - Media titles are NOT stored on collection_media (they resolve at runtime
 *   from TMDB / the media server), so the seeded cards show posters only.
 *   Posters use picsum.photos seeded URLs (placeholder photography) via the
 *   collection_media.image_path "absolute URL" fast-path — no real media is
 *   referenced, satisfying the repo's no-real-media-names rule.
 * - All names below are invented for testing.
 * - This RESETS the collection/rule/servarr tables, then re-seeds, so it is
 *   safe to re-run. The settings row is updated in place (Plex token kept).
 *
 * Usage
 * -----
 *   1. Stop `yarn dev` (SQLite allows a single writer).
 *   2. node dev/seed-db.mjs            # or: MAINTAINERR_DB=/path/to.sqlite node dev/seed-db.mjs
 *   3. Start `yarn dev` and open http://localhost:3000/collections
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
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

  // 2) Configure the active media server (Jellyfin) + metadata + integrations.
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
        deleteAfterDays, visibleOnHome, visibleOnRecommended,
        radarrSettingsId, sonarrSettingsId, handledMediaAmount,
        handledMediaSizeBytes, totalSizeBytes, lastDurationInSeconds, addDate)
     VALUES
       (@libraryId, @title, @description, 1, @type, 'jellyfin',
        @deleteAfterDays, @visibleOnHome, 0,
        @radarrSettingsId, @sonarrSettingsId, @handledMediaAmount,
        @handledMediaSizeBytes, @totalSizeBytes, @lastDuration, @addDate)`,
  );
  const insMedia = db.prepare(
    `INSERT INTO collection_media
       (collectionId, mediaServerId, addDate, image_path, isManual, includedByRule, sizeBytes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insRuleGroup = db.prepare(
    `INSERT INTO rule_group
       (name, description, libraryId, isActive, collectionId, useRules, dataType)
     VALUES (?, ?, ?, 1, ?, 1, ?)`,
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
      deleteAfterDays: cfg.deleteAfterDays,
      visibleOnHome: cfg.visibleOnHome ? 1 : 0,
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
      insMedia.run(
        colId,
        jellyfinId(),
        daysAgo(age),
        poster(slug),
        0,
        1,
        sizes[i],
      );
    });

    insRuleGroup.run(
      cfg.title,
      cfg.description,
      cfg.libraryId,
      colId,
      cfg.type,
    );
    return { colId, count: cfg.slugs.length, totalSize };
  };

  const results = [
    seedCollection({
      title: "Stale Movies",
      description: "Movies untouched for a while — up for cleanup.",
      libraryId: "jellyfin-movies",
      type: "movie",
      deleteAfterDays: 30,
      visibleOnHome: true,
      slugs: STALE_MOVIES,
      maxAge: 120,
    }),
    seedCollection({
      title: "Unwatched Series",
      description: "Series nobody has started.",
      libraryId: "jellyfin-shows",
      type: "show",
      deleteAfterDays: 90,
      visibleOnHome: true,
      slugs: UNWATCHED_SHOWS,
      maxAge: 200,
    }),
    seedCollection({
      title: "Archive Queue",
      description: "Kept indefinitely (no auto-delete).",
      libraryId: "jellyfin-movies",
      type: "movie",
      deleteAfterDays: null,
      visibleOnHome: false,
      slugs: ARCHIVE_MOVIES,
      maxAge: 365,
    }),
  ];

  return results;
});

const results = run();
const totalItems = results.reduce((a, r) => a + r.count, 0);
console.log(
  `Seeded ${results.length} collections, ${totalItems} media items into ${dbPath}`,
);
console.log("Media server set to Jellyfin; Radarr + Sonarr configured.");
console.log("Restart `yarn dev` and open http://localhost:3000/collections");
db.close();
