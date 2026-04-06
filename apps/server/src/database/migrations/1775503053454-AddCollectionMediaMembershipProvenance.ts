import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectionMediaMembershipProvenance1775503053454 implements MigrationInterface {
  name = 'AddCollectionMediaMembershipProvenance1775503053454';

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
                "includedByRule" boolean,
                "manualMembershipSource" varchar,
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
                    "isManual",
                    "tvdbId",
                    "includedByRule",
                    "manualMembershipSource"
                )
            SELECT "id",
                "collectionId",
                "mediaServerId",
                "tmdbId",
                "addDate",
                "image_path",
                "isManual",
                "tvdbId",
                CASE
                    WHEN "isManual" = 1 THEN 0
                    ELSE 1
                END,
                CASE
                    WHEN "isManual" = 1 THEN 'legacy'
                    ELSE NULL
                END
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
                "tvdbId" integer,
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
                    "isManual",
                    "tvdbId"
                )
            SELECT "id",
                "collectionId",
                "mediaServerId",
                "tmdbId",
                "addDate",
                "image_path",
                "isManual",
                "tvdbId"
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
