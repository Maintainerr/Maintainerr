import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialMigration1674487252453 implements MigrationInterface {
  name = 'InitialMigration1674487252453';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "settings" (
            "id"	integer NOT NULL,
            "clientId"	varchar DEFAULT ('db0e0f6e-82b2-40d4-bcb8-5b394ff7f091'),
            "applicationTitle"	varchar NOT NULL DEFAULT ('Maintainerr'),
            "applicationUrl"	varchar NOT NULL DEFAULT ('localhost'),
            "apikey"	varchar,
            "overseerr_url"	varchar,
            "locale"	varchar NOT NULL DEFAULT ('en'),
            "cacheImages"	integer NOT NULL DEFAULT (0),
            "plex_name"	varchar,
            "plex_hostname"	varchar,
            "plex_port"	integer DEFAULT (32400),
            "plex_ssl"	integer,
            "plex_auth_token"	varchar,
            "overseerr_api_key"	varchar,
            "radarr_url"	varchar,
            "radarr_api_key"	varchar,
            "sonarr_url"	varchar,
            "sonarr_api_key"	varchar,
            "collection_handler_job_cron"	varchar NOT NULL DEFAULT ('0 0-23/12 * * *'),
            "rules_handler_job_cron"	varchar NOT NULL DEFAULT ('0 0-23/8 * * *'),
            PRIMARY KEY("id" AUTOINCREMENT)
        );`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "community_rule_karma" (
        "id"	integer NOT NULL,
        "community_rule_id"	integer NOT NULL,
        PRIMARY KEY("id" AUTOINCREMENT)
    );`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "exclusion" (
        "id"	integer NOT NULL,
        "plexId"	integer NOT NULL,
        "ruleGroupId"	integer,
        PRIMARY KEY("id" AUTOINCREMENT)
    );`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "collection_media" (
        "id"	integer NOT NULL,
        "collectionId"	integer NOT NULL,
        "plexId"	integer NOT NULL,
        "tmdbId"	integer,
        "addDate"	datetime NOT NULL,
        "image_path"	varchar,
        "isManual"	boolean DEFAULT (0),
        CONSTRAINT "FK_604b0cd0f85150923289b7f2c19" FOREIGN KEY("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        PRIMARY KEY("id" AUTOINCREMENT)
    );`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "rules" (
        "id"	integer NOT NULL,
        "ruleJson"	varchar NOT NULL,
        "ruleGroupId"	integer NOT NULL,
        "section"	integer NOT NULL DEFAULT (0),
        "isActive"	boolean NOT NULL DEFAULT (1),
        CONSTRAINT "FK_bb013935b8859281ad67e311d19" FOREIGN KEY("ruleGroupId") REFERENCES "rule_group"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        PRIMARY KEY("id" AUTOINCREMENT)
    );`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "rule_group" (
        "id"	integer NOT NULL,
        "name"	varchar NOT NULL,
        "description"	varchar,
        "libraryId"	integer NOT NULL,
        "isActive"	boolean NOT NULL DEFAULT (1),
        "collectionId"	integer,
        CONSTRAINT "FK_9c757efe456ec36319ef10e9648" FOREIGN KEY("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "REL_9c757efe456ec36319ef10e964" UNIQUE("collectionId"),
        PRIMARY KEY("id" AUTOINCREMENT)
    );`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "collection" (
        "id"	integer NOT NULL,
        "plexId"	integer,
        "libraryId"	integer NOT NULL,
        "title"	varchar NOT NULL,
        "description"	varchar,
        "isActive"	boolean NOT NULL DEFAULT (1),
        "arrAction"	integer NOT NULL DEFAULT (0),
        "visibleOnHome"	boolean NOT NULL DEFAULT (0),
        "deleteAfterDays"	integer,
        "type"	integer NOT NULL DEFAULT (1),
        PRIMARY KEY("id" AUTOINCREMENT)
    );`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "settings";`);
    await queryRunner.query(`DROP TABLE "community_rule_karma";`);
    await queryRunner.query(`DROP TABLE "exclusion";`);
    await queryRunner.query(`DROP TABLE "collection_media";`);
    await queryRunner.query(`DROP TABLE "rules";`);
    await queryRunner.query(`DROP TABLE "rule_group";`);
    await queryRunner.query(`DROP TABLE "collection";`);
  }
}
