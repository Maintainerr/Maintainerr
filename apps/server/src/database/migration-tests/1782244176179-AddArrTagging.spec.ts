import { DataSource } from 'typeorm';
import { AddArrTagging1782244176179 } from '../migrations/1782244176179-AddArrTagging';

describe('AddArrTagging migration', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
      entities: [],
    });
    await dataSource.initialize();

    // Minimal stubs for the FK targets the collection rebuild references (the
    // driver enforces foreign keys), so the rebuild works without the full graph.
    await dataSource.query(
      `CREATE TABLE "radarr_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)`,
    );
    await dataSource.query(
      `CREATE TABLE "sonarr_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)`,
    );
    await dataSource.query(
      `CREATE TABLE "overlay_templates" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)`,
    );

    // Pre-migration `collection` table (matches the migration's down() schema —
    // no `tagInArr`).
    await dataSource.query(
      `CREATE TABLE "collection" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "libraryId" varchar NOT NULL,
        "title" varchar NOT NULL,
        "description" varchar,
        "isActive" boolean NOT NULL DEFAULT (1),
        "arrAction" integer NOT NULL DEFAULT (0),
        "visibleOnHome" boolean NOT NULL DEFAULT (0),
        "deleteAfterDays" integer,
        "type" varchar NOT NULL DEFAULT ('movie'),
        "manualCollection" boolean NOT NULL DEFAULT (0),
        "manualCollectionName" varchar DEFAULT (''),
        "listExclusions" boolean NOT NULL DEFAULT (0),
        "forceSeerr" boolean NOT NULL DEFAULT (0),
        "addDate" date DEFAULT (CURRENT_TIMESTAMP),
        "handledMediaAmount" integer NOT NULL DEFAULT (0),
        "lastDurationInSeconds" integer NOT NULL DEFAULT (0),
        "keepLogsForMonths" integer NOT NULL DEFAULT (6),
        "tautulliWatchedPercentOverride" integer,
        "radarrSettingsId" integer,
        "sonarrSettingsId" integer,
        "visibleOnRecommended" boolean NOT NULL DEFAULT (0),
        "sortTitle" varchar,
        "mediaServerId" varchar,
        "mediaServerType" varchar NOT NULL DEFAULT ('plex'),
        "totalSizeBytes" bigint,
        "radarrQualityProfileId" integer,
        "sonarrQualityProfileId" integer,
        "overlayEnabled" boolean NOT NULL DEFAULT (0),
        "overlayTemplateId" integer,
        "handledMediaSizeBytes" bigint NOT NULL DEFAULT (0),
        "mediaServerSort" varchar
      )`,
    );

    // Pre-migration `settings` table (no arr_* columns).
    await dataSource.query(
      `CREATE TABLE "settings" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "clientId" varchar,
        "applicationTitle" varchar NOT NULL DEFAULT ('Maintainerr'),
        "applicationUrl" varchar NOT NULL DEFAULT ('localhost'),
        "apikey" varchar,
        "locale" varchar NOT NULL DEFAULT ('en'),
        "plex_name" varchar,
        "plex_hostname" varchar,
        "plex_port" integer DEFAULT (32400),
        "plex_ssl" integer,
        "plex_auth_token" varchar,
        "collection_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/12 * * *'),
        "rules_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/8 * * *'),
        "tautulli_url" varchar,
        "tautulli_api_key" varchar,
        "media_server_type" varchar,
        "jellyfin_url" varchar,
        "jellyfin_api_key" varchar,
        "jellyfin_user_id" varchar,
        "jellyfin_server_name" varchar,
        "seerr_url" varchar,
        "seerr_api_key" varchar,
        "tmdb_api_key" varchar,
        "tvdb_api_key" varchar,
        "metadata_provider_preference" varchar NOT NULL DEFAULT ('tmdb_primary'),
        "plex_machine_id" varchar,
        "plex_manual_mode" integer DEFAULT (0),
        "emby_url" varchar,
        "emby_api_key" varchar,
        "emby_user_id" varchar,
        "emby_server_name" varchar,
        "streamystats_url" varchar,
        "download_client_url" varchar,
        "download_client_username" varchar,
        "download_client_password" varchar,
        "download_client_delete_data" boolean DEFAULT (1),
        "download_client_fallback_ratio" float NOT NULL DEFAULT (0.5)
      )`,
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  const runUp = async () => {
    const queryRunner = dataSource.createQueryRunner();
    try {
      await new AddArrTagging1782244176179().up(queryRunner);
    } finally {
      await queryRunner.release();
    }
  };

  const runDown = async () => {
    const queryRunner = dataSource.createQueryRunner();
    try {
      await new AddArrTagging1782244176179().down(queryRunner);
    } finally {
      await queryRunner.release();
    }
  };

  const columnNames = async (table: string): Promise<string[]> => {
    const rows: Array<{ name: string }> = await dataSource.query(
      `PRAGMA table_info("${table}")`,
    );
    return rows.map((r) => r.name);
  };

  it('adds collection.tagInArr (default false) and the arr exclusion settings', async () => {
    await dataSource.query(
      `INSERT INTO "collection" ("id", "libraryId", "title") VALUES (1, 'lib-1', 'My Group')`,
    );
    await dataSource.query(
      `INSERT INTO "settings" ("id", "applicationTitle") VALUES (1, 'Maintainerr')`,
    );

    await runUp();

    expect(await columnNames('collection')).toContain('tagInArr');
    expect(await columnNames('settings')).toEqual(
      expect.arrayContaining([
        'radarr_tag_exclusions',
        'radarr_exclusion_tag',
        'radarr_untag_on_unexclude',
        'sonarr_tag_exclusions',
        'sonarr_exclusion_tag',
        'sonarr_untag_on_unexclude',
      ]),
    );

    const [coll] = await dataSource.query(
      `SELECT "tagInArr" FROM "collection" WHERE "id" = 1`,
    );
    expect(coll.tagInArr).toBe(0);

    const [setting] = await dataSource.query(
      `SELECT "radarr_tag_exclusions", "radarr_exclusion_tag", "radarr_untag_on_unexclude", "sonarr_tag_exclusions", "sonarr_exclusion_tag", "sonarr_untag_on_unexclude" FROM "settings" WHERE "id" = 1`,
    );
    // Both services default to off, label "dnd", removal off.
    expect(setting.radarr_tag_exclusions).toBe(0);
    expect(setting.radarr_exclusion_tag).toBe('dnd');
    expect(setting.radarr_untag_on_unexclude).toBe(0);
    expect(setting.sonarr_tag_exclusions).toBe(0);
    expect(setting.sonarr_exclusion_tag).toBe('dnd');
    expect(setting.sonarr_untag_on_unexclude).toBe(0);
  });

  it('preserves existing rows through both table rebuilds', async () => {
    await dataSource.query(
      `INSERT INTO "collection" ("id", "libraryId", "title", "radarrQualityProfileId") VALUES (1, 'lib-1', 'Keep Me', 4)`,
    );
    await dataSource.query(
      `INSERT INTO "settings" ("id", "applicationTitle", "tautulli_url") VALUES (1, 'My Maintainerr', 'http://localhost:8181')`,
    );

    await runUp();

    const [coll] = await dataSource.query(
      `SELECT "title", "radarrQualityProfileId" FROM "collection" WHERE "id" = 1`,
    );
    expect(coll.title).toBe('Keep Me');
    expect(coll.radarrQualityProfileId).toBe(4);

    const [setting] = await dataSource.query(
      `SELECT "applicationTitle", "tautulli_url" FROM "settings" WHERE "id" = 1`,
    );
    expect(setting.applicationTitle).toBe('My Maintainerr');
    expect(setting.tautulli_url).toBe('http://localhost:8181');
  });

  it('removes the added columns on revert', async () => {
    await runUp();
    await runDown();

    expect(await columnNames('collection')).not.toContain('tagInArr');
    const settingsCols = await columnNames('settings');
    for (const col of [
      'radarr_tag_exclusions',
      'radarr_exclusion_tag',
      'radarr_untag_on_unexclude',
      'sonarr_tag_exclusions',
      'sonarr_exclusion_tag',
      'sonarr_untag_on_unexclude',
    ]) {
      expect(settingsCols).not.toContain(col);
    }
  });
});
