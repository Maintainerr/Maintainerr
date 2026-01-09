import { MigrationInterface, QueryRunner } from 'typeorm';

export class JellyfinSupport1767576516009 implements MigrationInterface {
  name = 'JellyfinSupport1767576516009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_notification_rulegroup" ("notificationId" integer NOT NULL, "rulegroupId" integer NOT NULL, PRIMARY KEY ("notificationId", "rulegroupId"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_notification_rulegroup"("notificationId", "rulegroupId") SELECT "notificationId", "rulegroupId" FROM "notification_rulegroup"`,
    );
    await queryRunner.query(`DROP TABLE "notification_rulegroup"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_notification_rulegroup" RENAME TO "notification_rulegroup"`,
    );
    await queryRunner.query(`DROP INDEX "idx_collection_media_collection_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_media" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "collectionId" integer NOT NULL, "mediaServerId" integer NOT NULL, "tmdbId" integer, "addDate" datetime NOT NULL, "image_path" varchar, "isManual" boolean DEFAULT (0), CONSTRAINT "FK_604b0cd0f85150923289b7f2c19" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_media"("id", "collectionId", "mediaServerId", "tmdbId", "addDate", "image_path", "isManual") SELECT "id", "collectionId", "plexId", "tmdbId", "addDate", "image_path", "isManual" FROM "collection_media"`,
    );
    await queryRunner.query(`DROP TABLE "collection_media"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_media" RENAME TO "collection_media"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_collection_media_collection_id" ON "collection_media" ("collectionId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_collection" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "libraryId" integer NOT NULL, "title" varchar NOT NULL, "description" varchar, "isActive" boolean NOT NULL DEFAULT (1), "arrAction" integer NOT NULL DEFAULT (0), "visibleOnHome" boolean NOT NULL DEFAULT (0), "deleteAfterDays" integer, "type" integer NOT NULL DEFAULT (1), "manualCollection" boolean NOT NULL DEFAULT (0), "manualCollectionName" varchar DEFAULT (''), "listExclusions" boolean NOT NULL DEFAULT (0), "forceOverseerr" boolean NOT NULL DEFAULT (0), "addDate" date DEFAULT (CURRENT_TIMESTAMP), "handledMediaAmount" integer NOT NULL DEFAULT (0), "lastDurationInSeconds" integer NOT NULL DEFAULT (0), "keepLogsForMonths" integer NOT NULL DEFAULT (6), "tautulliWatchedPercentOverride" integer, "radarrSettingsId" integer, "sonarrSettingsId" integer, "visibleOnRecommended" boolean NOT NULL DEFAULT (0), "sortTitle" varchar, CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection"("id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle") SELECT "id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle" FROM "collection"`,
    );
    await queryRunner.query(`DROP TABLE "collection"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection" RENAME TO "collection"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_exclusion" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ruleGroupId" integer, "parent" integer, "type" integer DEFAULT (NULL))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_exclusion"("id", "ruleGroupId", "parent", "type") SELECT "id", "ruleGroupId", "parent", "type" FROM "exclusion"`,
    );
    await queryRunner.query(`DROP TABLE "exclusion"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_exclusion" RENAME TO "exclusion"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_collection" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "libraryId" integer NOT NULL, "title" varchar NOT NULL, "description" varchar, "isActive" boolean NOT NULL DEFAULT (1), "arrAction" integer NOT NULL DEFAULT (0), "visibleOnHome" boolean NOT NULL DEFAULT (0), "deleteAfterDays" integer, "type" integer NOT NULL DEFAULT (1), "manualCollection" boolean NOT NULL DEFAULT (0), "manualCollectionName" varchar DEFAULT (''), "listExclusions" boolean NOT NULL DEFAULT (0), "forceOverseerr" boolean NOT NULL DEFAULT (0), "addDate" date DEFAULT (CURRENT_TIMESTAMP), "handledMediaAmount" integer NOT NULL DEFAULT (0), "lastDurationInSeconds" integer NOT NULL DEFAULT (0), "keepLogsForMonths" integer NOT NULL DEFAULT (6), "tautulliWatchedPercentOverride" integer, "radarrSettingsId" integer, "sonarrSettingsId" integer, "visibleOnRecommended" boolean NOT NULL DEFAULT (0), "sortTitle" varchar, "mediaServerId" varchar, "mediaServerType" varchar NOT NULL DEFAULT ('plex'), CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection"("id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle") SELECT "id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle" FROM "collection"`,
    );
    await queryRunner.query(`DROP TABLE "collection"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection" RENAME TO "collection"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "clientId" varchar DEFAULT ('db0e0f6e-82b2-40d4-bcb8-5b394ff7f091'), "applicationTitle" varchar NOT NULL DEFAULT ('Maintainerr'), "applicationUrl" varchar NOT NULL DEFAULT ('localhost'), "apikey" varchar, "overseerr_url" varchar, "locale" varchar NOT NULL DEFAULT ('en'), "plex_name" varchar, "plex_hostname" varchar, "plex_port" integer DEFAULT (32400), "plex_ssl" integer, "plex_auth_token" varchar, "overseerr_api_key" varchar, "collection_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/12 * * *'), "rules_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/8 * * *'), "tautulli_url" varchar, "tautulli_api_key" varchar, "jellyseerr_url" varchar, "jellyseerr_api_key" varchar, "media_server_type" varchar, "jellyfin_url" varchar, "jellyfin_api_key" varchar, "jellyfin_user_id" varchar, "jellyfin_server_name" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_settings"("id", "clientId", "applicationTitle", "applicationUrl", "apikey", "overseerr_url", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "overseerr_api_key", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "jellyseerr_url", "jellyseerr_api_key") SELECT "id", "clientId", "applicationTitle", "applicationUrl", "apikey", "overseerr_url", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "overseerr_api_key", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "jellyseerr_url", "jellyseerr_api_key" FROM "settings"`,
    );
    await queryRunner.query(`DROP TABLE "settings"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_settings" RENAME TO "settings"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_exclusion" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ruleGroupId" integer, "parent" integer, "type" integer DEFAULT (NULL), "mediaServerId" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_exclusion"("id", "ruleGroupId", "parent", "type") SELECT "id", "ruleGroupId", "parent", "type" FROM "exclusion"`,
    );
    await queryRunner.query(`DROP TABLE "exclusion"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_exclusion" RENAME TO "exclusion"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_task_running" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "runningSince" datetime DEFAULT (CURRENT_TIMESTAMP), "running" boolean NOT NULL DEFAULT (0))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_task_running"("id", "name", "runningSince", "running") SELECT "id", "name", "runningSince", "running" FROM "task_running"`,
    );
    await queryRunner.query(`DROP TABLE "task_running"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_task_running" RENAME TO "task_running"`,
    );
    await queryRunner.query(`DROP INDEX "idx_collection_log_collection_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "collectionId" integer, "timestamp" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "message" varchar NOT NULL, "type" integer, "meta" text)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_log"("id", "collectionId", "timestamp", "message", "type", "meta") SELECT "id", "collectionId", "timestamp", "message", "type", "meta" FROM "collection_log"`,
    );
    await queryRunner.query(`DROP TABLE "collection_log"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_log" RENAME TO "collection_log"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_collection_log_collection_id" ON "collection_log" ("collectionId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_rule_group" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "description" varchar, "libraryId" varchar NOT NULL, "isActive" boolean NOT NULL DEFAULT (1), "collectionId" integer, "useRules" boolean NOT NULL DEFAULT (1), "dataType" varchar, "ruleHandlerCronSchedule" varchar, CONSTRAINT "REL_9c757efe456ec36319ef10e964" UNIQUE ("collectionId"), CONSTRAINT "FK_9c757efe456ec36319ef10e9648" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_rule_group"("id", "name", "description", "libraryId", "isActive", "collectionId", "useRules", "dataType", "ruleHandlerCronSchedule") SELECT "id", "name", "description", "libraryId", "isActive", "collectionId", "useRules", "dataType", "ruleHandlerCronSchedule" FROM "rule_group"`,
    );
    await queryRunner.query(`DROP TABLE "rule_group"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_rule_group" RENAME TO "rule_group"`,
    );
    await queryRunner.query(`DROP INDEX "idx_collection_media_collection_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_media" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "collectionId" integer NOT NULL, "mediaServerId" varchar NOT NULL, "tmdbId" integer, "addDate" datetime NOT NULL, "image_path" varchar, "isManual" boolean DEFAULT (0), CONSTRAINT "FK_604b0cd0f85150923289b7f2c19" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_media"("id", "collectionId", "mediaServerId", "tmdbId", "addDate", "image_path", "isManual") SELECT "id", "collectionId", "mediaServerId", "tmdbId", "addDate", "image_path", "isManual" FROM "collection_media"`,
    );
    await queryRunner.query(`DROP TABLE "collection_media"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_media" RENAME TO "collection_media"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_collection_media_collection_id" ON "collection_media" ("collectionId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_collection" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "libraryId" varchar NOT NULL, "title" varchar NOT NULL, "description" varchar, "isActive" boolean NOT NULL DEFAULT (1), "arrAction" integer NOT NULL DEFAULT (0), "visibleOnHome" boolean NOT NULL DEFAULT (0), "deleteAfterDays" integer, "type" varchar NOT NULL DEFAULT ('movie'), "manualCollection" boolean NOT NULL DEFAULT (0), "manualCollectionName" varchar DEFAULT (''), "listExclusions" boolean NOT NULL DEFAULT (0), "forceOverseerr" boolean NOT NULL DEFAULT (0), "addDate" date DEFAULT (CURRENT_TIMESTAMP), "handledMediaAmount" integer NOT NULL DEFAULT (0), "lastDurationInSeconds" integer NOT NULL DEFAULT (0), "keepLogsForMonths" integer NOT NULL DEFAULT (6), "tautulliWatchedPercentOverride" integer, "radarrSettingsId" integer, "sonarrSettingsId" integer, "visibleOnRecommended" boolean NOT NULL DEFAULT (0), "sortTitle" varchar, "mediaServerId" varchar, "mediaServerType" varchar NOT NULL DEFAULT ('plex'), CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection"("id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle", "mediaServerId", "mediaServerType") SELECT "id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle", "mediaServerId", "mediaServerType" FROM "collection"`,
    );
    await queryRunner.query(`DROP TABLE "collection"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection" RENAME TO "collection"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "clientId" varchar DEFAULT ('a6ba5e30-4456-4da6-9849-8870ff6a3881'), "applicationTitle" varchar NOT NULL DEFAULT ('Maintainerr'), "applicationUrl" varchar NOT NULL DEFAULT ('localhost'), "apikey" varchar, "overseerr_url" varchar, "locale" varchar NOT NULL DEFAULT ('en'), "plex_name" varchar, "plex_hostname" varchar, "plex_port" integer DEFAULT (32400), "plex_ssl" integer, "plex_auth_token" varchar, "overseerr_api_key" varchar, "collection_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/12 * * *'), "rules_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/8 * * *'), "tautulli_url" varchar, "tautulli_api_key" varchar, "jellyseerr_url" varchar, "jellyseerr_api_key" varchar, "media_server_type" varchar, "jellyfin_url" varchar, "jellyfin_api_key" varchar, "jellyfin_user_id" varchar, "jellyfin_server_name" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_settings"("id", "clientId", "applicationTitle", "applicationUrl", "apikey", "overseerr_url", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "overseerr_api_key", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "jellyseerr_url", "jellyseerr_api_key", "media_server_type", "jellyfin_url", "jellyfin_api_key", "jellyfin_user_id", "jellyfin_server_name") SELECT "id", "clientId", "applicationTitle", "applicationUrl", "apikey", "overseerr_url", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "overseerr_api_key", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "jellyseerr_url", "jellyseerr_api_key", "media_server_type", "jellyfin_url", "jellyfin_api_key", "jellyfin_user_id", "jellyfin_server_name" FROM "settings"`,
    );
    await queryRunner.query(`DROP TABLE "settings"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_settings" RENAME TO "settings"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_exclusion" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ruleGroupId" integer, "parent" integer, "type" varchar, "mediaServerId" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_exclusion"("id", "ruleGroupId", "parent", "type", "mediaServerId") SELECT "id", "ruleGroupId", "parent", "type", "mediaServerId" FROM "exclusion"`,
    );
    await queryRunner.query(`DROP TABLE "exclusion"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_exclusion" RENAME TO "exclusion"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2c70d3feb9b789062bfa14c6b9" ON "notification_rulegroup" ("rulegroupId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dcc3ba7f814ebd3d47facad716" ON "notification_rulegroup" ("notificationId") `,
    );
    await queryRunner.query(`DROP INDEX "idx_collection_log_collection_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_collection_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "collectionId" integer, "timestamp" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "message" varchar NOT NULL, "type" integer, "meta" text, CONSTRAINT "FK_c70b4409f8834d108a5e845365a" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_collection_log"("id", "collectionId", "timestamp", "message", "type", "meta") SELECT "id", "collectionId", "timestamp", "message", "type", "meta" FROM "collection_log"`,
    );
    await queryRunner.query(`DROP TABLE "collection_log"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_collection_log" RENAME TO "collection_log"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_collection_log_collection_id" ON "collection_log" ("collectionId") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_2c70d3feb9b789062bfa14c6b9"`);
    await queryRunner.query(`DROP INDEX "IDX_dcc3ba7f814ebd3d47facad716"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_notification_rulegroup" ("notificationId" integer NOT NULL, "rulegroupId" integer NOT NULL, CONSTRAINT "FK_2c70d3feb9b789062bfa14c6b93" FOREIGN KEY ("rulegroupId") REFERENCES "rule_group" ("id") ON DELETE NO ACTION ON UPDATE CASCADE, CONSTRAINT "FK_dcc3ba7f814ebd3d47facad7168" FOREIGN KEY ("notificationId") REFERENCES "notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("notificationId", "rulegroupId"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_notification_rulegroup"("notificationId", "rulegroupId") SELECT "notificationId", "rulegroupId" FROM "notification_rulegroup"`,
    );
    await queryRunner.query(`DROP TABLE "notification_rulegroup"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_notification_rulegroup" RENAME TO "notification_rulegroup"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2c70d3feb9b789062bfa14c6b9" ON "notification_rulegroup" ("rulegroupId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dcc3ba7f814ebd3d47facad716" ON "notification_rulegroup" ("notificationId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_dcc3ba7f814ebd3d47facad716"`);
    await queryRunner.query(`DROP INDEX "IDX_2c70d3feb9b789062bfa14c6b9"`);
    await queryRunner.query(
      `ALTER TABLE "notification_rulegroup" RENAME TO "temporary_notification_rulegroup"`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification_rulegroup" ("notificationId" integer NOT NULL, "rulegroupId" integer NOT NULL, PRIMARY KEY ("notificationId", "rulegroupId"))`,
    );
    await queryRunner.query(
      `INSERT INTO "notification_rulegroup"("notificationId", "rulegroupId") SELECT "notificationId", "rulegroupId" FROM "temporary_notification_rulegroup"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_notification_rulegroup"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_dcc3ba7f814ebd3d47facad716" ON "notification_rulegroup" ("notificationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2c70d3feb9b789062bfa14c6b9" ON "notification_rulegroup" ("rulegroupId") `,
    );
    await queryRunner.query(`DROP INDEX "idx_collection_log_collection_id"`);
    await queryRunner.query(
      `ALTER TABLE "collection_log" RENAME TO "temporary_collection_log"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "collectionId" integer, "timestamp" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "message" varchar NOT NULL, "type" integer, "meta" text)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_log"("id", "collectionId", "timestamp", "message", "type", "meta") SELECT "id", "collectionId", "timestamp", "message", "type", "meta" FROM "temporary_collection_log"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_log"`);
    await queryRunner.query(
      `CREATE INDEX "idx_collection_log_collection_id" ON "collection_log" ("collectionId") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_dcc3ba7f814ebd3d47facad716"`);
    await queryRunner.query(`DROP INDEX "IDX_2c70d3feb9b789062bfa14c6b9"`);
    await queryRunner.query(
      `ALTER TABLE "exclusion" RENAME TO "temporary_exclusion"`,
    );
    await queryRunner.query(
      `CREATE TABLE "exclusion" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ruleGroupId" integer, "parent" integer, "type" integer DEFAULT (NULL), "mediaServerId" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "exclusion"("id", "ruleGroupId", "parent", "type", "mediaServerId") SELECT "id", "ruleGroupId", "parent", "type", "mediaServerId" FROM "temporary_exclusion"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_exclusion"`);
    await queryRunner.query(
      `ALTER TABLE "settings" RENAME TO "temporary_settings"`,
    );
    await queryRunner.query(
      `CREATE TABLE "settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "clientId" varchar DEFAULT ('db0e0f6e-82b2-40d4-bcb8-5b394ff7f091'), "applicationTitle" varchar NOT NULL DEFAULT ('Maintainerr'), "applicationUrl" varchar NOT NULL DEFAULT ('localhost'), "apikey" varchar, "overseerr_url" varchar, "locale" varchar NOT NULL DEFAULT ('en'), "plex_name" varchar, "plex_hostname" varchar, "plex_port" integer DEFAULT (32400), "plex_ssl" integer, "plex_auth_token" varchar, "overseerr_api_key" varchar, "collection_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/12 * * *'), "rules_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/8 * * *'), "tautulli_url" varchar, "tautulli_api_key" varchar, "jellyseerr_url" varchar, "jellyseerr_api_key" varchar, "media_server_type" varchar, "jellyfin_url" varchar, "jellyfin_api_key" varchar, "jellyfin_user_id" varchar, "jellyfin_server_name" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "settings"("id", "clientId", "applicationTitle", "applicationUrl", "apikey", "overseerr_url", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "overseerr_api_key", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "jellyseerr_url", "jellyseerr_api_key", "media_server_type", "jellyfin_url", "jellyfin_api_key", "jellyfin_user_id", "jellyfin_server_name") SELECT "id", "clientId", "applicationTitle", "applicationUrl", "apikey", "overseerr_url", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "overseerr_api_key", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "jellyseerr_url", "jellyseerr_api_key", "media_server_type", "jellyfin_url", "jellyfin_api_key", "jellyfin_user_id", "jellyfin_server_name" FROM "temporary_settings"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_settings"`);
    await queryRunner.query(
      `ALTER TABLE "collection" RENAME TO "temporary_collection"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "libraryId" integer NOT NULL, "title" varchar NOT NULL, "description" varchar, "isActive" boolean NOT NULL DEFAULT (1), "arrAction" integer NOT NULL DEFAULT (0), "visibleOnHome" boolean NOT NULL DEFAULT (0), "deleteAfterDays" integer, "type" integer NOT NULL DEFAULT (1), "manualCollection" boolean NOT NULL DEFAULT (0), "manualCollectionName" varchar DEFAULT (''), "listExclusions" boolean NOT NULL DEFAULT (0), "forceOverseerr" boolean NOT NULL DEFAULT (0), "addDate" date DEFAULT (CURRENT_TIMESTAMP), "handledMediaAmount" integer NOT NULL DEFAULT (0), "lastDurationInSeconds" integer NOT NULL DEFAULT (0), "keepLogsForMonths" integer NOT NULL DEFAULT (6), "tautulliWatchedPercentOverride" integer, "radarrSettingsId" integer, "sonarrSettingsId" integer, "visibleOnRecommended" boolean NOT NULL DEFAULT (0), "sortTitle" varchar, "mediaServerId" varchar, "mediaServerType" varchar NOT NULL DEFAULT ('plex'), CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection"("id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle", "mediaServerId", "mediaServerType") SELECT "id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle", "mediaServerId", "mediaServerType" FROM "temporary_collection"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection"`);
    await queryRunner.query(`DROP INDEX "idx_collection_media_collection_id"`);
    await queryRunner.query(
      `ALTER TABLE "collection_media" RENAME TO "temporary_collection_media"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_media" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "collectionId" integer NOT NULL, "mediaServerId" integer NOT NULL, "tmdbId" integer, "addDate" datetime NOT NULL, "image_path" varchar, "isManual" boolean DEFAULT (0), CONSTRAINT "FK_604b0cd0f85150923289b7f2c19" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_media"("id", "collectionId", "mediaServerId", "tmdbId", "addDate", "image_path", "isManual") SELECT "id", "collectionId", "mediaServerId", "tmdbId", "addDate", "image_path", "isManual" FROM "temporary_collection_media"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_media"`);
    await queryRunner.query(
      `CREATE INDEX "idx_collection_media_collection_id" ON "collection_media" ("collectionId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "rule_group" RENAME TO "temporary_rule_group"`,
    );
    await queryRunner.query(
      `CREATE TABLE "rule_group" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "description" varchar, "libraryId" integer NOT NULL, "isActive" boolean NOT NULL DEFAULT (1), "collectionId" integer, "useRules" boolean NOT NULL DEFAULT (1), "dataType" integer, "ruleHandlerCronSchedule" varchar, CONSTRAINT "REL_9c757efe456ec36319ef10e964" UNIQUE ("collectionId"), CONSTRAINT "FK_9c757efe456ec36319ef10e9648" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "rule_group"("id", "name", "description", "libraryId", "isActive", "collectionId", "useRules", "dataType", "ruleHandlerCronSchedule") SELECT "id", "name", "description", "libraryId", "isActive", "collectionId", "useRules", "dataType", "ruleHandlerCronSchedule" FROM "temporary_rule_group"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_rule_group"`);
    await queryRunner.query(`DROP INDEX "idx_collection_log_collection_id"`);
    await queryRunner.query(
      `ALTER TABLE "collection_log" RENAME TO "temporary_collection_log"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "collectionId" integer NOT NULL, "timestamp" datetime NOT NULL, "message" varchar NOT NULL, "type" integer NOT NULL, "meta" text)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_log"("id", "collectionId", "timestamp", "message", "type", "meta") SELECT "id", "collectionId", "timestamp", "message", "type", "meta" FROM "temporary_collection_log"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_log"`);
    await queryRunner.query(
      `CREATE INDEX "idx_collection_log_collection_id" ON "collection_log" ("collectionId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "task_running" RENAME TO "temporary_task_running"`,
    );
    await queryRunner.query(
      `CREATE TABLE "task_running" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "runningSince" datetime DEFAULT (NULL), "running" boolean NOT NULL DEFAULT (0))`,
    );
    await queryRunner.query(
      `INSERT INTO "task_running"("id", "name", "runningSince", "running") SELECT "id", "name", "runningSince", "running" FROM "temporary_task_running"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_task_running"`);
    await queryRunner.query(
      `ALTER TABLE "exclusion" RENAME TO "temporary_exclusion"`,
    );
    await queryRunner.query(
      `CREATE TABLE "exclusion" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ruleGroupId" integer, "parent" integer, "type" integer DEFAULT (NULL))`,
    );
    await queryRunner.query(
      `INSERT INTO "exclusion"("id", "ruleGroupId", "parent", "type") SELECT "id", "ruleGroupId", "parent", "type" FROM "temporary_exclusion"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_exclusion"`);
    await queryRunner.query(
      `ALTER TABLE "settings" RENAME TO "temporary_settings"`,
    );
    await queryRunner.query(
      `CREATE TABLE "settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "clientId" varchar DEFAULT ('db0e0f6e-82b2-40d4-bcb8-5b394ff7f091'), "applicationTitle" varchar NOT NULL DEFAULT ('Maintainerr'), "applicationUrl" varchar NOT NULL DEFAULT ('localhost'), "apikey" varchar, "overseerr_url" varchar, "locale" varchar NOT NULL DEFAULT ('en'), "plex_name" varchar, "plex_hostname" varchar, "plex_port" integer DEFAULT (32400), "plex_ssl" integer, "plex_auth_token" varchar, "overseerr_api_key" varchar, "collection_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/12 * * *'), "rules_handler_job_cron" varchar NOT NULL DEFAULT ('0 0-23/8 * * *'), "tautulli_url" varchar, "tautulli_api_key" varchar, "jellyseerr_url" varchar, "jellyseerr_api_key" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "settings"("id", "clientId", "applicationTitle", "applicationUrl", "apikey", "overseerr_url", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "overseerr_api_key", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "jellyseerr_url", "jellyseerr_api_key") SELECT "id", "clientId", "applicationTitle", "applicationUrl", "apikey", "overseerr_url", "locale", "plex_name", "plex_hostname", "plex_port", "plex_ssl", "plex_auth_token", "overseerr_api_key", "collection_handler_job_cron", "rules_handler_job_cron", "tautulli_url", "tautulli_api_key", "jellyseerr_url", "jellyseerr_api_key" FROM "temporary_settings"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_settings"`);
    await queryRunner.query(
      `ALTER TABLE "collection" RENAME TO "temporary_collection"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "libraryId" integer NOT NULL, "title" varchar NOT NULL, "description" varchar, "isActive" boolean NOT NULL DEFAULT (1), "arrAction" integer NOT NULL DEFAULT (0), "visibleOnHome" boolean NOT NULL DEFAULT (0), "deleteAfterDays" integer, "type" integer NOT NULL DEFAULT (1), "manualCollection" boolean NOT NULL DEFAULT (0), "manualCollectionName" varchar DEFAULT (''), "listExclusions" boolean NOT NULL DEFAULT (0), "forceOverseerr" boolean NOT NULL DEFAULT (0), "addDate" date DEFAULT (CURRENT_TIMESTAMP), "handledMediaAmount" integer NOT NULL DEFAULT (0), "lastDurationInSeconds" integer NOT NULL DEFAULT (0), "keepLogsForMonths" integer NOT NULL DEFAULT (6), "tautulliWatchedPercentOverride" integer, "radarrSettingsId" integer, "sonarrSettingsId" integer, "visibleOnRecommended" boolean NOT NULL DEFAULT (0), "sortTitle" varchar, CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection"("id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle") SELECT "id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle" FROM "temporary_collection"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection"`);
    await queryRunner.query(
      `ALTER TABLE "exclusion" RENAME TO "temporary_exclusion"`,
    );
    await queryRunner.query(
      `CREATE TABLE "exclusion" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "plexId" integer NOT NULL, "ruleGroupId" integer, "parent" integer, "type" integer DEFAULT (NULL))`,
    );
    await queryRunner.query(
      `INSERT INTO "exclusion"("id", "ruleGroupId", "parent", "type") SELECT "id", "ruleGroupId", "parent", "type" FROM "temporary_exclusion"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_exclusion"`);
    await queryRunner.query(
      `ALTER TABLE "collection" RENAME TO "temporary_collection"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "plexId" integer, "libraryId" integer NOT NULL, "title" varchar NOT NULL, "description" varchar, "isActive" boolean NOT NULL DEFAULT (1), "arrAction" integer NOT NULL DEFAULT (0), "visibleOnHome" boolean NOT NULL DEFAULT (0), "deleteAfterDays" integer, "type" integer NOT NULL DEFAULT (1), "manualCollection" boolean NOT NULL DEFAULT (0), "manualCollectionName" varchar DEFAULT (''), "listExclusions" boolean NOT NULL DEFAULT (0), "forceOverseerr" boolean NOT NULL DEFAULT (0), "addDate" date DEFAULT (CURRENT_TIMESTAMP), "handledMediaAmount" integer NOT NULL DEFAULT (0), "lastDurationInSeconds" integer NOT NULL DEFAULT (0), "keepLogsForMonths" integer NOT NULL DEFAULT (6), "tautulliWatchedPercentOverride" integer, "radarrSettingsId" integer, "sonarrSettingsId" integer, "visibleOnRecommended" boolean NOT NULL DEFAULT (0), "sortTitle" varchar, CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection"("id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle") SELECT "id", "libraryId", "title", "description", "isActive", "arrAction", "visibleOnHome", "deleteAfterDays", "type", "manualCollection", "manualCollectionName", "listExclusions", "forceOverseerr", "addDate", "handledMediaAmount", "lastDurationInSeconds", "keepLogsForMonths", "tautulliWatchedPercentOverride", "radarrSettingsId", "sonarrSettingsId", "visibleOnRecommended", "sortTitle" FROM "temporary_collection"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection"`);
    await queryRunner.query(`DROP INDEX "idx_collection_media_collection_id"`);
    await queryRunner.query(
      `ALTER TABLE "collection_media" RENAME TO "temporary_collection_media"`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_media" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "collectionId" integer NOT NULL, "plexId" integer NOT NULL, "tmdbId" integer, "addDate" datetime NOT NULL, "image_path" varchar, "isManual" boolean DEFAULT (0), CONSTRAINT "FK_604b0cd0f85150923289b7f2c19" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "collection_media"("id", "collectionId", "plexId", "tmdbId", "addDate", "image_path", "isManual") SELECT "id", "collectionId", "mediaServerId", "tmdbId", "addDate", "image_path", "isManual" FROM "temporary_collection_media"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_collection_media"`);
    await queryRunner.query(
      `CREATE INDEX "idx_collection_media_collection_id" ON "collection_media" ("collectionId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_rulegroup" RENAME TO "temporary_notification_rulegroup"`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification_rulegroup" ("notificationId" integer NOT NULL, "rulegroupId" integer NOT NULL, CONSTRAINT "FK_2c70d3feb9b789062bfa14c6b93" FOREIGN KEY ("rulegroupId") REFERENCES "rule_group" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_dcc3ba7f814ebd3d47facad7168" FOREIGN KEY ("notificationId") REFERENCES "notification" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, PRIMARY KEY ("notificationId", "rulegroupId"))`,
    );
    await queryRunner.query(
      `INSERT INTO "notification_rulegroup"("notificationId", "rulegroupId") SELECT "notificationId", "rulegroupId" FROM "temporary_notification_rulegroup"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_notification_rulegroup"`);
  }
}
