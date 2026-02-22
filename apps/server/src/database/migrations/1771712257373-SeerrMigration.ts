import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeerrMigration1771712257373 implements MigrationInterface {
  name = 'SeerrMigration1771712257373';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === 1. Settings table: rename overseerr/jellyseerr columns → seerr, drop clientId default ===

    // Recreate settings with new schema, copying data in a single step.
    // COALESCE prefers overseerr values, falling back to jellyseerr values.
    await queryRunner.query(`
      CREATE TABLE "temporary_settings" (
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
        "seerr_api_key" varchar
      )
    `);

    await queryRunner.query(`
      INSERT INTO "temporary_settings" (
        "id", "clientId", "applicationTitle", "applicationUrl", "apikey",
        "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl",
        "plex_auth_token", "collection_handler_job_cron", "rules_handler_job_cron",
        "tautulli_url", "tautulli_api_key", "media_server_type",
        "jellyfin_url", "jellyfin_api_key", "jellyfin_user_id", "jellyfin_server_name",
        "seerr_url", "seerr_api_key"
      )
      SELECT
        "id", "clientId", "applicationTitle", "applicationUrl", "apikey",
        "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl",
        "plex_auth_token", "collection_handler_job_cron", "rules_handler_job_cron",
        "tautulli_url", "tautulli_api_key", "media_server_type",
        "jellyfin_url", "jellyfin_api_key", "jellyfin_user_id", "jellyfin_server_name",
        COALESCE("overseerr_url", "jellyseerr_url"),
        COALESCE("overseerr_api_key", "jellyseerr_api_key")
      FROM "settings"
    `);

    await queryRunner.query(`DROP TABLE "settings"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_settings" RENAME TO "settings"`,
    );

    // === 2. Collection table: rename forceOverseerr → forceSeerr ===

    await queryRunner.query(`
      CREATE TABLE "temporary_collection" (
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
        CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      INSERT INTO "temporary_collection" (
        "id", "libraryId", "title", "description", "isActive", "arrAction",
        "visibleOnHome", "deleteAfterDays", "type", "manualCollection",
        "manualCollectionName", "listExclusions", "forceSeerr", "addDate",
        "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths",
        "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId",
        "visibleOnRecommended", "sortTitle", "mediaServerId", "mediaServerType"
      )
      SELECT
        "id", "libraryId", "title", "description", "isActive", "arrAction",
        "visibleOnHome", "deleteAfterDays", "type", "manualCollection",
        "manualCollectionName", "listExclusions", "forceOverseerr", "addDate",
        "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths",
        "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId",
        "visibleOnRecommended", "sortTitle", "mediaServerId", "mediaServerType"
      FROM "collection"
    `);

    await queryRunner.query(`DROP TABLE "collection"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection" RENAME TO "collection"`,
    );

    // === 3. Rules table: migrate JELLYSEERR (application=5) → SEERR (application=3) in ruleJson ===

    // ruleJson stores JSON with firstVal: [appId, propId] and lastVal: [appId, propId]
    // JELLYSEERR was Application enum value 5, SEERR is 3
    await queryRunner.query(`
      UPDATE "rules"
      SET "ruleJson" = REPLACE("ruleJson", '"firstVal":[5,', '"firstVal":[3,')
      WHERE "ruleJson" LIKE '%"firstVal":[5,%'
    `);

    await queryRunner.query(`
      UPDATE "rules"
      SET "ruleJson" = REPLACE("ruleJson", '"lastVal":[5,', '"lastVal":[3,')
      WHERE "ruleJson" LIKE '%"lastVal":[5,%'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // === 1. Rules table: revert SEERR (3) → JELLYSEERR (5) is not possible ===
    // We cannot reliably distinguish rules that were originally JELLYSEERR vs OVERSEERR,
    // so we leave them as SEERR (3) which maps to the same app in the old schema (OVERSEERR = 3).

    // === 2. Collection table: rename forceSeerr → forceOverseerr ===

    await queryRunner.query(`
      CREATE TABLE "temporary_collection" (
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
        "forceOverseerr" boolean NOT NULL DEFAULT (0),
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
        CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      INSERT INTO "temporary_collection" (
        "id", "libraryId", "title", "description", "isActive", "arrAction",
        "visibleOnHome", "deleteAfterDays", "type", "manualCollection",
        "manualCollectionName", "listExclusions", "forceOverseerr", "addDate",
        "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths",
        "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId",
        "visibleOnRecommended", "sortTitle", "mediaServerId", "mediaServerType"
      )
      SELECT
        "id", "libraryId", "title", "description", "isActive", "arrAction",
        "visibleOnHome", "deleteAfterDays", "type", "manualCollection",
        "manualCollectionName", "listExclusions", "forceSeerr", "addDate",
        "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths",
        "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId",
        "visibleOnRecommended", "sortTitle", "mediaServerId", "mediaServerType"
      FROM "collection"
    `);

    await queryRunner.query(`DROP TABLE "collection"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection" RENAME TO "collection"`,
    );

    // === 3. Settings table: restore overseerr/jellyseerr columns, copy seerr → overseerr ===

    await queryRunner.query(`
      CREATE TABLE "temporary_settings" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "clientId" varchar DEFAULT ('4b1f6130-6799-49e3-9eba-9d647b5528b2'),
        "applicationTitle" varchar NOT NULL DEFAULT ('Maintainerr'),
        "applicationUrl" varchar NOT NULL DEFAULT ('localhost'),
        "apikey" varchar,
        "overseerr_url" varchar,
        "locale" varchar NOT NULL DEFAULT ('en'),
        "plex_name" varchar,
        "plex_hostname" varchar,
        "plex_port" integer DEFAULT (32400),
        "plex_ssl" integer,
        "plex_auth_token" varchar,
        "overseerr_api_key" varchar,
        "collection_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/12 * * *'),
        "rules_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/8 * * *'),
        "tautulli_url" varchar,
        "tautulli_api_key" varchar,
        "jellyseerr_url" varchar,
        "jellyseerr_api_key" varchar,
        "media_server_type" varchar,
        "jellyfin_url" varchar,
        "jellyfin_api_key" varchar,
        "jellyfin_user_id" varchar,
        "jellyfin_server_name" varchar
      )
    `);

    await queryRunner.query(`
      INSERT INTO "temporary_settings" (
        "id", "clientId", "applicationTitle", "applicationUrl", "apikey",
        "overseerr_url", "locale", "plex_name", "plex_hostname", "plex_port",
        "plex_ssl", "plex_auth_token", "overseerr_api_key",
        "collection_handler_job_cron", "rules_handler_job_cron",
        "tautulli_url", "tautulli_api_key",
        "jellyseerr_url", "jellyseerr_api_key",
        "media_server_type", "jellyfin_url", "jellyfin_api_key",
        "jellyfin_user_id", "jellyfin_server_name"
      )
      SELECT
        "id", "clientId", "applicationTitle", "applicationUrl", "apikey",
        "seerr_url", "locale", "plex_name", "plex_hostname", "plex_port",
        "plex_ssl", "plex_auth_token", "seerr_api_key",
        "collection_handler_job_cron", "rules_handler_job_cron",
        "tautulli_url", "tautulli_api_key",
        NULL, NULL,
        "media_server_type", "jellyfin_url", "jellyfin_api_key",
        "jellyfin_user_id", "jellyfin_server_name"
      FROM "settings"
    `);

    await queryRunner.query(`DROP TABLE "settings"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_settings" RENAME TO "settings"`,
    );
  }
}
