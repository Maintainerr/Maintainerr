import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddServerExclusionTag1790451181555 implements MigrationInterface {
  name = 'AddServerExclusionTag1790451181555';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_radarr_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "serverName" varchar NOT NULL, "url" varchar, "apiKey" varchar, "tagExclusions" boolean NOT NULL DEFAULT (0), "exclusionTag" varchar NOT NULL DEFAULT ('dnd'), "untagOnUnexclude" boolean NOT NULL DEFAULT (0))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_radarr_settings"("id", "serverName", "url", "apiKey") SELECT "id", "serverName", "url", "apiKey" FROM "radarr_settings"`,
    );
    await queryRunner.query(`DROP TABLE "radarr_settings"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_radarr_settings" RENAME TO "radarr_settings"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_sonarr_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "serverName" varchar NOT NULL, "url" varchar, "apiKey" varchar, "tagExclusions" boolean NOT NULL DEFAULT (0), "exclusionTag" varchar NOT NULL DEFAULT ('dnd'), "untagOnUnexclude" boolean NOT NULL DEFAULT (0))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_sonarr_settings"("id", "serverName", "url", "apiKey") SELECT "id", "serverName", "url", "apiKey" FROM "sonarr_settings"`,
    );
    await queryRunner.query(`DROP TABLE "sonarr_settings"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_sonarr_settings" RENAME TO "sonarr_settings"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sonarr_settings" RENAME TO "temporary_sonarr_settings"`,
    );
    await queryRunner.query(
      `CREATE TABLE "sonarr_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "serverName" varchar NOT NULL, "url" varchar, "apiKey" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "sonarr_settings"("id", "serverName", "url", "apiKey") SELECT "id", "serverName", "url", "apiKey" FROM "temporary_sonarr_settings"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_sonarr_settings"`);
    await queryRunner.query(
      `ALTER TABLE "radarr_settings" RENAME TO "temporary_radarr_settings"`,
    );
    await queryRunner.query(
      `CREATE TABLE "radarr_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "serverName" varchar NOT NULL, "url" varchar, "apiKey" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "radarr_settings"("id", "serverName", "url", "apiKey") SELECT "id", "serverName", "url", "apiKey" FROM "temporary_radarr_settings"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_radarr_settings"`);
  }
}
