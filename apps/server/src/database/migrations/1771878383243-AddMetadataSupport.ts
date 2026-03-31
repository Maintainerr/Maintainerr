import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetadataSupport1771878383243 implements MigrationInterface {
  name = 'AddMetadataSupport1771878383243';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "idx_collection_media_collection_id"
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_collection_media" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "mediaServerId" varchar NOT NULL,
                "tmdbId" integer,
                "addDate" datetime NOT NULL,
                "image_path" varchar,
                "isManual" boolean DEFAULT (0),
                "tvdbId" integer,
                CONSTRAINT "FK_604b0cd0f85150923289b7f2c19" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_collection_media"(
                    "id",
                    "collectionId",
                    "mediaServerId",
                    "tmdbId",
                    "addDate",
                    "image_path",
                    "isManual"
                )
            SELECT "id",
                "collectionId",
                "mediaServerId",
                "tmdbId",
                "addDate",
                "image_path",
                "isManual"
            FROM "collection_media"
        `);
    await queryRunner.query(`
            DROP TABLE "collection_media"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_collection_media"
                RENAME TO "collection_media"
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_collection_media_collection_id" ON "collection_media" ("collectionId")
        `);
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
                "seerr_api_key" varchar,
                "tmdb_api_key" varchar,
                "tvdb_api_key" varchar,
                "metadata_provider_preference" varchar NOT NULL DEFAULT ('tmdb_primary')
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_settings"(
                    "id",
                    "clientId",
                    "applicationTitle",
                    "applicationUrl",
                    "apikey",
                    "locale",
                    "plex_name",
                    "plex_hostname",
                    "plex_port",
                    "plex_ssl",
                    "plex_auth_token",
                    "collection_handler_job_cron",
                    "rules_handler_job_cron",
                    "tautulli_url",
                    "tautulli_api_key",
                    "media_server_type",
                    "jellyfin_url",
                    "jellyfin_api_key",
                    "jellyfin_user_id",
                    "jellyfin_server_name",
                    "seerr_url",
                    "seerr_api_key"
                )
            SELECT "id",
                "clientId",
                "applicationTitle",
                "applicationUrl",
                "apikey",
                "locale",
                "plex_name",
                "plex_hostname",
                "plex_port",
                "plex_ssl",
                "plex_auth_token",
                "collection_handler_job_cron",
                "rules_handler_job_cron",
                "tautulli_url",
                "tautulli_api_key",
                "media_server_type",
                "jellyfin_url",
                "jellyfin_api_key",
                "jellyfin_user_id",
                "jellyfin_server_name",
                "seerr_url",
                "seerr_api_key"
            FROM "settings"
        `);
    await queryRunner.query(`
            DROP TABLE "settings"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_settings"
                RENAME TO "settings"
        `);
  }

  // This rollback restores the pre-metadata schema, which necessarily drops
  // metadata-specific settings columns and collection_media.tvdbId data.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "settings"
                RENAME TO "temporary_settings"
        `);
    await queryRunner.query(`
            CREATE TABLE "settings" (
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
            INSERT INTO "settings"(
                    "id",
                    "clientId",
                    "applicationTitle",
                    "applicationUrl",
                    "apikey",
                    "locale",
                    "plex_name",
                    "plex_hostname",
                    "plex_port",
                    "plex_ssl",
                    "plex_auth_token",
                    "collection_handler_job_cron",
                    "rules_handler_job_cron",
                    "tautulli_url",
                    "tautulli_api_key",
                    "media_server_type",
                    "jellyfin_url",
                    "jellyfin_api_key",
                    "jellyfin_user_id",
                    "jellyfin_server_name",
                    "seerr_url",
                    "seerr_api_key"
                )
            SELECT "id",
                "clientId",
                "applicationTitle",
                "applicationUrl",
                "apikey",
                "locale",
                "plex_name",
                "plex_hostname",
                "plex_port",
                "plex_ssl",
                "plex_auth_token",
                "collection_handler_job_cron",
                "rules_handler_job_cron",
                "tautulli_url",
                "tautulli_api_key",
                "media_server_type",
                "jellyfin_url",
                "jellyfin_api_key",
                "jellyfin_user_id",
                "jellyfin_server_name",
                "seerr_url",
                "seerr_api_key"
            FROM "temporary_settings"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_settings"
        `);
    await queryRunner.query(`
            DROP INDEX "idx_collection_media_collection_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "collection_media"
                RENAME TO "temporary_collection_media"
        `);
    await queryRunner.query(`
            CREATE TABLE "collection_media" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "mediaServerId" varchar NOT NULL,
                "tmdbId" integer,
                "addDate" datetime NOT NULL,
                "image_path" varchar,
                "isManual" boolean DEFAULT (0),
                CONSTRAINT "FK_604b0cd0f85150923289b7f2c19" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
    await queryRunner.query(`
            INSERT INTO "collection_media"(
                    "id",
                    "collectionId",
                    "mediaServerId",
                    "tmdbId",
                    "addDate",
                    "image_path",
                    "isManual"
                )
            SELECT "id",
                "collectionId",
                "mediaServerId",
                "tmdbId",
                "addDate",
                "image_path",
                "isManual"
            FROM "temporary_collection_media"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_collection_media"
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_collection_media_collection_id" ON "collection_media" ("collectionId")
        `);
  }
}
