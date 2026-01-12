import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchemaSync1768000720338 implements MigrationInterface {
  name = 'SchemaSync1768000720338';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove orphan collection logs
    await queryRunner.query(`
      DELETE FROM "collection_log"
      WHERE "collectionId" NOT IN (SELECT "id" FROM "collection")
    `);
    await queryRunner.query(`
            CREATE TABLE "temporary_notification_rulegroup" (
                "notificationId" integer NOT NULL,
                "rulegroupId" integer NOT NULL,
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
            CREATE TABLE "temporary_task_running" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "name" varchar NOT NULL,
                "runningSince" datetime,
                "running" boolean NOT NULL DEFAULT (0)
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_task_running"("id", "name", "runningSince", "running")
            SELECT "id",
                "name",
                "runningSince",
                "running"
            FROM "task_running"
        `);
    await queryRunner.query(`
            DROP TABLE "task_running"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_task_running"
                RENAME TO "task_running"
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_settings" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "clientId" varchar,
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
                "jellyseerr_api_key" varchar
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
                    "jellyseerr_api_key"
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
                "jellyseerr_api_key"
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
            CREATE TABLE "temporary_exclusion" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "mediaServerId" varchar NOT NULL,
                "ruleGroupId" integer,
                "parent" integer,
                "type" varchar
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_exclusion"("id", "mediaServerId", "ruleGroupId", "parent", "type")
            SELECT "id",
                "mediaServerId",
                "ruleGroupId",
                "parent",
                "type"
            FROM "exclusion"
        `);
    await queryRunner.query(`
            DROP TABLE "exclusion"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_exclusion"
                RENAME TO "exclusion"
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
            DROP INDEX "IDX_2c70d3feb9b789062bfa14c6b9"
        `);
    await queryRunner.query(`
            DROP INDEX "IDX_dcc3ba7f814ebd3d47facad716"
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_notification_rulegroup" (
                "notificationId" integer NOT NULL,
                "rulegroupId" integer NOT NULL,
                CONSTRAINT "FK_2c70d3feb9b789062bfa14c6b93" FOREIGN KEY ("rulegroupId") REFERENCES "rule_group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
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
            CREATE INDEX "IDX_2c70d3feb9b789062bfa14c6b9" ON "notification_rulegroup" ("rulegroupId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_dcc3ba7f814ebd3d47facad716" ON "notification_rulegroup" ("notificationId")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "IDX_dcc3ba7f814ebd3d47facad716"
        `);
    await queryRunner.query(`
            DROP INDEX "IDX_2c70d3feb9b789062bfa14c6b9"
        `);
    await queryRunner.query(`
            ALTER TABLE "notification_rulegroup"
                RENAME TO "temporary_notification_rulegroup"
        `);
    await queryRunner.query(`
            CREATE TABLE "notification_rulegroup" (
                "notificationId" integer NOT NULL,
                "rulegroupId" integer NOT NULL,
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
            CREATE INDEX "IDX_dcc3ba7f814ebd3d47facad716" ON "notification_rulegroup" ("notificationId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_2c70d3feb9b789062bfa14c6b9" ON "notification_rulegroup" ("rulegroupId")
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
            DROP INDEX "IDX_dcc3ba7f814ebd3d47facad716"
        `);
    await queryRunner.query(`
            DROP INDEX "IDX_2c70d3feb9b789062bfa14c6b9"
        `);
    await queryRunner.query(`
            ALTER TABLE "exclusion"
                RENAME TO "temporary_exclusion"
        `);
    await queryRunner.query(`
            CREATE TABLE "exclusion" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "mediaServerId" varchar NOT NULL,
                "ruleGroupId" integer,
                "parent" integer,
                "type" varchar
            )
        `);
    await queryRunner.query(`
            INSERT INTO "exclusion"("id", "mediaServerId", "ruleGroupId", "parent", "type")
            SELECT "id",
                "mediaServerId",
                "ruleGroupId",
                "parent",
                "type"
            FROM "temporary_exclusion"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_exclusion"
        `);
    await queryRunner.query(`
            ALTER TABLE "settings"
                RENAME TO "temporary_settings"
        `);
    await queryRunner.query(`
            CREATE TABLE "settings" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "clientId" varchar DEFAULT ('db0e0f6e-82b2-40d4-bcb8-5b394ff7f091'),
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
                "jellyseerr_api_key" varchar
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
                    "jellyseerr_api_key"
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
                "jellyseerr_api_key"
            FROM "temporary_settings"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_settings"
        `);
    await queryRunner.query(`
            ALTER TABLE "task_running"
                RENAME TO "temporary_task_running"
        `);
    await queryRunner.query(`
            CREATE TABLE "task_running" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "name" varchar NOT NULL,
                "runningSince" datetime DEFAULT (NULL),
                "running" boolean NOT NULL DEFAULT (0)
            )
        `);
    await queryRunner.query(`
            INSERT INTO "task_running"("id", "name", "runningSince", "running")
            SELECT "id",
                "name",
                "runningSince",
                "running"
            FROM "temporary_task_running"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_task_running"
        `);
    await queryRunner.query(`
            ALTER TABLE "notification_rulegroup"
                RENAME TO "temporary_notification_rulegroup"
        `);
    await queryRunner.query(`
            CREATE TABLE "notification_rulegroup" (
                "notificationId" integer NOT NULL,
                "rulegroupId" integer NOT NULL,
                CONSTRAINT "FK_2c70d3feb9b789062bfa14c6b93" FOREIGN KEY ("rulegroupId") REFERENCES "rule_group" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                CONSTRAINT "FK_dcc3ba7f814ebd3d47facad7168" FOREIGN KEY ("notificationId") REFERENCES "notification" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
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
  }
}
