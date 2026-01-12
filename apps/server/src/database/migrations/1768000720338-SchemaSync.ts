import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchemaSync1768000720338 implements MigrationInterface {
  name = 'SchemaSync1768000720338';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "IDX_dcc3ba7f814ebd3d47facad716"
        `);
    await queryRunner.query(`
            DROP INDEX "IDX_2c70d3feb9b789062bfa14c6b9"
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_notification_rulegroup" (
                "notificationId" integer NOT NULL,
                "rulegroupId" integer NOT NULL,
                CONSTRAINT "FK_dcc3ba7f814ebd3d47facad7168" FOREIGN KEY ("notificationId") REFERENCES "notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
                PRIMARY KEY ("notificationId", "rulegroupId")
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_notification_rulegroup"("notificationId", "rulegroupId")
            SELECT "notificationId",
                "rulegroupId"
            FROM "notification_rulegroup"
        `);
    await queryRunner.query(`
            DROP TABLE "notification_rulegroup"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_notification_rulegroup"
                RENAME TO "notification_rulegroup"
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_dcc3ba7f814ebd3d47facad716" ON "notification_rulegroup" ("notificationId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_2c70d3feb9b789062bfa14c6b9" ON "notification_rulegroup" ("rulegroupId")
        `);
    await queryRunner.query(`
            DROP INDEX "idx_collection_log_collection_id"
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_collection_log" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer,
                "timestamp" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
                "message" varchar NOT NULL,
                "type" integer,
                "meta" text
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_collection_log"(
                    "id",
                    "collectionId",
                    "timestamp",
                    "message",
                    "type",
                    "meta"
                )
            SELECT "id",
                "collectionId",
                "timestamp",
                "message",
                "type",
                "meta"
            FROM "collection_log"
        `);
    await queryRunner.query(`
            DROP TABLE "collection_log"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_collection_log"
                RENAME TO "collection_log"
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_collection_log_collection_id" ON "collection_log" ("collectionId")
        `);
    await queryRunner.query(`
            DROP INDEX "idx_collection_log_collection_id"
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_collection_log" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "timestamp" datetime NOT NULL,
                "message" varchar NOT NULL,
                "type" integer NOT NULL,
                "meta" text
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_collection_log"(
                    "id",
                    "collectionId",
                    "timestamp",
                    "message",
                    "type",
                    "meta"
                )
            SELECT "id",
                "collectionId",
                "timestamp",
                "message",
                "type",
                "meta"
            FROM "collection_log"
        `);
    await queryRunner.query(`
            DROP TABLE "collection_log"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_collection_log"
                RENAME TO "collection_log"
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_collection_log_collection_id" ON "collection_log" ("collectionId")
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_settings" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "clientId" varchar DEFAULT ('718f9807-cd95-4fff-939a-fee4c6b58f63'),
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
            INSERT INTO "temporary_settings"(
                    "id",
                    "clientId",
                    "applicationTitle",
                    "applicationUrl",
                    "apikey",
                    "overseerr_url",
                    "locale",
                    "plex_name",
                    "plex_hostname",
                    "plex_port",
                    "plex_ssl",
                    "plex_auth_token",
                    "overseerr_api_key",
                    "collection_handler_job_cron",
                    "rules_handler_job_cron",
                    "tautulli_url",
                    "tautulli_api_key",
                    "jellyseerr_url",
                    "jellyseerr_api_key",
                    "media_server_type",
                    "jellyfin_url",
                    "jellyfin_api_key",
                    "jellyfin_user_id",
                    "jellyfin_server_name"
                )
            SELECT "id",
                "clientId",
                "applicationTitle",
                "applicationUrl",
                "apikey",
                "overseerr_url",
                "locale",
                "plex_name",
                "plex_hostname",
                "plex_port",
                "plex_ssl",
                "plex_auth_token",
                "overseerr_api_key",
                "collection_handler_job_cron",
                "rules_handler_job_cron",
                "tautulli_url",
                "tautulli_api_key",
                "jellyseerr_url",
                "jellyseerr_api_key",
                "media_server_type",
                "jellyfin_url",
                "jellyfin_api_key",
                "jellyfin_user_id",
                "jellyfin_server_name"
            FROM "settings"
        `);
    await queryRunner.query(`
            DROP TABLE "settings"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_settings"
                RENAME TO "settings"
        `);
    await queryRunner.query(`
            DROP INDEX "idx_collection_log_collection_id"
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_collection_log" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "timestamp" datetime NOT NULL,
                "message" varchar NOT NULL,
                "type" integer NOT NULL,
                "meta" text,
                CONSTRAINT "FK_c70b4409f8834d108a5e845365a" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_collection_log"(
                    "id",
                    "collectionId",
                    "timestamp",
                    "message",
                    "type",
                    "meta"
                )
            SELECT "id",
                "collectionId",
                "timestamp",
                "message",
                "type",
                "meta"
            FROM "collection_log"
        `);
    await queryRunner.query(`
            DROP TABLE "collection_log"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_collection_log"
                RENAME TO "collection_log"
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_collection_log_collection_id" ON "collection_log" ("collectionId")
        `);
    await queryRunner.query(`
            DROP INDEX "IDX_dcc3ba7f814ebd3d47facad716"
        `);
    await queryRunner.query(`
            DROP INDEX "IDX_2c70d3feb9b789062bfa14c6b9"
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_notification_rulegroup" (
                "notificationId" integer NOT NULL,
                "rulegroupId" integer NOT NULL,
                CONSTRAINT "FK_dcc3ba7f814ebd3d47facad7168" FOREIGN KEY ("notificationId") REFERENCES "notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT "FK_2c70d3feb9b789062bfa14c6b93" FOREIGN KEY ("rulegroupId") REFERENCES "rule_group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
                PRIMARY KEY ("notificationId", "rulegroupId")
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_notification_rulegroup"("notificationId", "rulegroupId")
            SELECT "notificationId",
                "rulegroupId"
            FROM "notification_rulegroup"
        `);
    await queryRunner.query(`
            DROP TABLE "notification_rulegroup"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_notification_rulegroup"
                RENAME TO "notification_rulegroup"
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_dcc3ba7f814ebd3d47facad716" ON "notification_rulegroup" ("notificationId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_2c70d3feb9b789062bfa14c6b9" ON "notification_rulegroup" ("rulegroupId")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "IDX_2c70d3feb9b789062bfa14c6b9"
        `);
    await queryRunner.query(`
            DROP INDEX "IDX_dcc3ba7f814ebd3d47facad716"
        `);
    await queryRunner.query(`
            ALTER TABLE "notification_rulegroup"
                RENAME TO "temporary_notification_rulegroup"
        `);
    await queryRunner.query(`
            CREATE TABLE "notification_rulegroup" (
                "notificationId" integer NOT NULL,
                "rulegroupId" integer NOT NULL,
                CONSTRAINT "FK_dcc3ba7f814ebd3d47facad7168" FOREIGN KEY ("notificationId") REFERENCES "notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
                PRIMARY KEY ("notificationId", "rulegroupId")
            )
        `);
    await queryRunner.query(`
            INSERT INTO "notification_rulegroup"("notificationId", "rulegroupId")
            SELECT "notificationId",
                "rulegroupId"
            FROM "temporary_notification_rulegroup"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_notification_rulegroup"
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_2c70d3feb9b789062bfa14c6b9" ON "notification_rulegroup" ("rulegroupId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_dcc3ba7f814ebd3d47facad716" ON "notification_rulegroup" ("notificationId")
        `);
    await queryRunner.query(`
            DROP INDEX "idx_collection_log_collection_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "collection_log"
                RENAME TO "temporary_collection_log"
        `);
    await queryRunner.query(`
            CREATE TABLE "collection_log" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "timestamp" datetime NOT NULL,
                "message" varchar NOT NULL,
                "type" integer NOT NULL,
                "meta" text
            )
        `);
    await queryRunner.query(`
            INSERT INTO "collection_log"(
                    "id",
                    "collectionId",
                    "timestamp",
                    "message",
                    "type",
                    "meta"
                )
            SELECT "id",
                "collectionId",
                "timestamp",
                "message",
                "type",
                "meta"
            FROM "temporary_collection_log"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_collection_log"
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_collection_log_collection_id" ON "collection_log" ("collectionId")
        `);
    await queryRunner.query(`
            ALTER TABLE "settings"
                RENAME TO "temporary_settings"
        `);
    await queryRunner.query(`
            CREATE TABLE "settings" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "clientId" varchar DEFAULT ('a6ba5e30-4456-4da6-9849-8870ff6a3881'),
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
            INSERT INTO "settings"(
                    "id",
                    "clientId",
                    "applicationTitle",
                    "applicationUrl",
                    "apikey",
                    "overseerr_url",
                    "locale",
                    "plex_name",
                    "plex_hostname",
                    "plex_port",
                    "plex_ssl",
                    "plex_auth_token",
                    "overseerr_api_key",
                    "collection_handler_job_cron",
                    "rules_handler_job_cron",
                    "tautulli_url",
                    "tautulli_api_key",
                    "jellyseerr_url",
                    "jellyseerr_api_key",
                    "media_server_type",
                    "jellyfin_url",
                    "jellyfin_api_key",
                    "jellyfin_user_id",
                    "jellyfin_server_name"
                )
            SELECT "id",
                "clientId",
                "applicationTitle",
                "applicationUrl",
                "apikey",
                "overseerr_url",
                "locale",
                "plex_name",
                "plex_hostname",
                "plex_port",
                "plex_ssl",
                "plex_auth_token",
                "overseerr_api_key",
                "collection_handler_job_cron",
                "rules_handler_job_cron",
                "tautulli_url",
                "tautulli_api_key",
                "jellyseerr_url",
                "jellyseerr_api_key",
                "media_server_type",
                "jellyfin_url",
                "jellyfin_api_key",
                "jellyfin_user_id",
                "jellyfin_server_name"
            FROM "temporary_settings"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_settings"
        `);
    await queryRunner.query(`
            DROP INDEX "idx_collection_log_collection_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "collection_log"
                RENAME TO "temporary_collection_log"
        `);
    await queryRunner.query(`
            CREATE TABLE "collection_log" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer,
                "timestamp" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
                "message" varchar NOT NULL,
                "type" integer,
                "meta" text
            )
        `);
    await queryRunner.query(`
            INSERT INTO "collection_log"(
                    "id",
                    "collectionId",
                    "timestamp",
                    "message",
                    "type",
                    "meta"
                )
            SELECT "id",
                "collectionId",
                "timestamp",
                "message",
                "type",
                "meta"
            FROM "temporary_collection_log"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_collection_log"
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_collection_log_collection_id" ON "collection_log" ("collectionId")
        `);
    await queryRunner.query(`
            DROP INDEX "idx_collection_log_collection_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "collection_log"
                RENAME TO "temporary_collection_log"
        `);
    await queryRunner.query(`
            CREATE TABLE "collection_log" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer,
                "timestamp" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
                "message" varchar NOT NULL,
                "type" integer,
                "meta" text,
                CONSTRAINT "FK_c70b4409f8834d108a5e845365a" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
    await queryRunner.query(`
            INSERT INTO "collection_log"(
                    "id",
                    "collectionId",
                    "timestamp",
                    "message",
                    "type",
                    "meta"
                )
            SELECT "id",
                "collectionId",
                "timestamp",
                "message",
                "type",
                "meta"
            FROM "temporary_collection_log"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_collection_log"
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_collection_log_collection_id" ON "collection_log" ("collectionId")
        `);
    await queryRunner.query(`
            DROP INDEX "IDX_2c70d3feb9b789062bfa14c6b9"
        `);
    await queryRunner.query(`
            DROP INDEX "IDX_dcc3ba7f814ebd3d47facad716"
        `);
    await queryRunner.query(`
            ALTER TABLE "notification_rulegroup"
                RENAME TO "temporary_notification_rulegroup"
        `);
    await queryRunner.query(`
            CREATE TABLE "notification_rulegroup" (
                "notificationId" integer NOT NULL,
                "rulegroupId" integer NOT NULL,
                CONSTRAINT "FK_dcc3ba7f814ebd3d47facad7168" FOREIGN KEY ("notificationId") REFERENCES "notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT "FK_2c70d3feb9b789062bfa14c6b93" FOREIGN KEY ("rulegroupId") REFERENCES "rule_group" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
                PRIMARY KEY ("notificationId", "rulegroupId")
            )
        `);
    await queryRunner.query(`
            INSERT INTO "notification_rulegroup"("notificationId", "rulegroupId")
            SELECT "notificationId",
                "rulegroupId"
            FROM "temporary_notification_rulegroup"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_notification_rulegroup"
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_2c70d3feb9b789062bfa14c6b9" ON "notification_rulegroup" ("rulegroupId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_dcc3ba7f814ebd3d47facad716" ON "notification_rulegroup" ("notificationId")
        `);
  }
}
