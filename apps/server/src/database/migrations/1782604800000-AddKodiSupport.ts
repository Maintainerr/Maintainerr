import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKodiSupport1782604800000 implements MigrationInterface {
  name = 'AddKodiSupport1782604800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Kodi connection settings (HTTP Basic auth — no API key). All nullable, so
    // a plain ADD COLUMN keeps the existing settings row intact.
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "kodi_url" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "kodi_username" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "kodi_password" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "kodi_server_name" varchar`,
    );

    // Shadow index for season/episode collections (Kodi has no writable tag on
    // those item types; movie/show collections are tag-backed on the server).
    await queryRunner.query(`
      CREATE TABLE "kodi_collection" (
        "id" varchar PRIMARY KEY NOT NULL,
        "libraryId" varchar NOT NULL,
        "title" varchar NOT NULL,
        "summary" varchar,
        "addDate" datetime NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "kodi_collection_member" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "collectionId" varchar NOT NULL,
        "itemId" varchar NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_kodi_collection_member_collection_id" ON "kodi_collection_member" ("collectionId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "idx_kodi_collection_member_collection_id"`,
    );
    await queryRunner.query(`DROP TABLE "kodi_collection_member"`);
    await queryRunner.query(`DROP TABLE "kodi_collection"`);
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "kodi_server_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "kodi_password"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "kodi_username"`,
    );
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "kodi_url"`);
  }
}
