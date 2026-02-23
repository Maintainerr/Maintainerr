import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTmdbApiKey1771867318394 implements MigrationInterface {
  name = 'AddTmdbApiKey1771867318394';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
                "tmdb_api_key" varchar
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
  }
}
