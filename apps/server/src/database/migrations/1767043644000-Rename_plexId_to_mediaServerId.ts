import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenamePlexIdToMediaServerId1767043644000
  implements MigrationInterface
{
  name = 'RenamePlexIdToMediaServerId1767043644000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Collection table: rename plexId to mediaServerId and change type to varchar
    // First, create the new column
    await queryRunner.query(
      `ALTER TABLE "collection" ADD COLUMN "mediaServerId" varchar`,
    );

    // Copy data from plexId to mediaServerId (convert number to string)
    await queryRunner.query(
      `UPDATE "collection" SET "mediaServerId" = CAST("plexId" AS TEXT) WHERE "plexId" IS NOT NULL`,
    );

    // Drop the old column
    await queryRunner.query(`ALTER TABLE "collection" DROP COLUMN "plexId"`);

    // Add mediaServerType column with default 'plex' for existing collections
    await queryRunner.query(
      `ALTER TABLE "collection" ADD COLUMN "mediaServerType" varchar DEFAULT 'plex'`,
    );

    // CollectionMedia table: rename plexId to mediaServerId and change type to varchar
    // First, create the new column
    await queryRunner.query(
      `ALTER TABLE "collection_media" ADD COLUMN "mediaServerId" varchar`,
    );

    // Copy data from plexId to mediaServerId (convert number to string)
    await queryRunner.query(
      `UPDATE "collection_media" SET "mediaServerId" = CAST("plexId" AS TEXT) WHERE "plexId" IS NOT NULL`,
    );

    // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
    // First, create a new table with the desired schema
    await queryRunner.query(`
      CREATE TABLE "collection_media_new" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "collectionId" integer NOT NULL,
        "mediaServerId" varchar NOT NULL,
        "tmdbId" integer,
        "addDate" datetime NOT NULL,
        "image_path" varchar,
        "isManual" boolean DEFAULT (0),
        CONSTRAINT "FK_collection_media_collection" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // Copy data from old table to new table
    await queryRunner.query(`
      INSERT INTO "collection_media_new" ("id", "collectionId", "mediaServerId", "tmdbId", "addDate", "image_path", "isManual")
      SELECT "id", "collectionId", "mediaServerId", "tmdbId", "addDate", "image_path", "isManual"
      FROM "collection_media"
    `);

    // Drop the old table
    await queryRunner.query(`DROP TABLE "collection_media"`);

    // Rename new table to original name
    await queryRunner.query(
      `ALTER TABLE "collection_media_new" RENAME TO "collection_media"`,
    );

    // Recreate the index
    await queryRunner.query(
      `CREATE INDEX "idx_collection_media_collection_id" ON "collection_media" ("collectionId")`,
    );

    // Exclusion table: rename plexId to mediaServerId and change type to varchar
    // First, create the new column
    await queryRunner.query(
      `ALTER TABLE "exclusion" ADD COLUMN "mediaServerId" varchar`,
    );

    // Copy data from plexId to mediaServerId (convert number to string)
    await queryRunner.query(
      `UPDATE "exclusion" SET "mediaServerId" = CAST("plexId" AS TEXT) WHERE "plexId" IS NOT NULL`,
    );

    // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
    await queryRunner.query(`
      CREATE TABLE "exclusion_new" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "mediaServerId" varchar NOT NULL,
        "ruleGroupId" integer,
        "parent" integer,
        "type" integer
      )
    `);

    // Copy data from old table to new table
    await queryRunner.query(`
      INSERT INTO "exclusion_new" ("id", "mediaServerId", "ruleGroupId", "parent", "type")
      SELECT "id", "mediaServerId", "ruleGroupId", "parent", "type"
      FROM "exclusion"
    `);

    // Drop the old table
    await queryRunner.query(`DROP TABLE "exclusion"`);

    // Rename new table to original name
    await queryRunner.query(
      `ALTER TABLE "exclusion_new" RENAME TO "exclusion"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Collection table: rename mediaServerId back to plexId
    await queryRunner.query(
      `ALTER TABLE "collection" ADD COLUMN "plexId" integer`,
    );

    await queryRunner.query(
      `UPDATE "collection" SET "plexId" = CAST("mediaServerId" AS INTEGER) WHERE "mediaServerId" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "collection" DROP COLUMN "mediaServerId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "collection" DROP COLUMN "mediaServerType"`,
    );

    // CollectionMedia table: recreate with plexId
    await queryRunner.query(`
      CREATE TABLE "collection_media_new" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "collectionId" integer NOT NULL,
        "plexId" integer NOT NULL,
        "tmdbId" integer,
        "addDate" datetime NOT NULL,
        "image_path" varchar,
        "isManual" boolean DEFAULT (0),
        CONSTRAINT "FK_collection_media_collection" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      INSERT INTO "collection_media_new" ("id", "collectionId", "plexId", "tmdbId", "addDate", "image_path", "isManual")
      SELECT "id", "collectionId", CAST("mediaServerId" AS INTEGER), "tmdbId", "addDate", "image_path", "isManual"
      FROM "collection_media"
    `);

    await queryRunner.query(`DROP TABLE "collection_media"`);

    await queryRunner.query(
      `ALTER TABLE "collection_media_new" RENAME TO "collection_media"`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_collection_media_collection_id" ON "collection_media" ("collectionId")`,
    );

    // Exclusion table: recreate with plexId
    await queryRunner.query(`
      CREATE TABLE "exclusion_new" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "plexId" integer NOT NULL,
        "ruleGroupId" integer,
        "parent" integer,
        "type" integer
      )
    `);

    await queryRunner.query(`
      INSERT INTO "exclusion_new" ("id", "plexId", "ruleGroupId", "parent", "type")
      SELECT "id", CAST("mediaServerId" AS INTEGER), "ruleGroupId", "parent", "type"
      FROM "exclusion"
    `);

    await queryRunner.query(`DROP TABLE "exclusion"`);

    await queryRunner.query(
      `ALTER TABLE "exclusion_new" RENAME TO "exclusion"`,
    );
  }
}
