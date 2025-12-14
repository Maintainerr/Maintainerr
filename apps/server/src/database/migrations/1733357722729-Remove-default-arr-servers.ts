import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDefaultArrServers1733357722729 implements MigrationInterface {
  name = 'RemoveDefaultArrServers1733357722729';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "temporary_sonarr_settings" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "serverName" varchar NOT NULL,
                "url" varchar,
                "apiKey" varchar
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_sonarr_settings"("id", "serverName", "url", "apiKey")
            SELECT "id",
                "serverName",
                "url",
                "apiKey"
            FROM "sonarr_settings"
        `);
    await queryRunner.query(`
            DROP TABLE "sonarr_settings"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_sonarr_settings"
                RENAME TO "sonarr_settings"
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_radarr_settings" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "serverName" varchar NOT NULL,
                "url" varchar,
                "apiKey" varchar
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_radarr_settings"("id", "serverName", "url", "apiKey")
            SELECT "id",
                "serverName",
                "url",
                "apiKey"
            FROM "radarr_settings"
        `);
    await queryRunner.query(`
            DROP TABLE "radarr_settings"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_radarr_settings"
                RENAME TO "radarr_settings"
        `);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(queryRunner: QueryRunner): Promise<void> {}
}
