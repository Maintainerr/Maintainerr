import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectionMediaRuleRemoval1784559977610 implements MigrationInterface {
  name = 'AddCollectionMediaRuleRemoval1784559977610';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "collection_media_rule_removal" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "mediaServerId" varchar NOT NULL
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_collection_media_rule_removal" ON "collection_media_rule_removal" ("collectionId", "mediaServerId")
        `);
    await queryRunner.query(`
            DROP INDEX "idx_collection_media_rule_removal"
        `);
    await queryRunner.query(`
            CREATE TABLE "temporary_collection_media_rule_removal" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "mediaServerId" varchar NOT NULL,
                CONSTRAINT "FK_c02a884605f0fd131c9cd25db90" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
    await queryRunner.query(`
            INSERT INTO "temporary_collection_media_rule_removal"("id", "collectionId", "mediaServerId")
            SELECT "id",
                "collectionId",
                "mediaServerId"
            FROM "collection_media_rule_removal"
        `);
    await queryRunner.query(`
            DROP TABLE "collection_media_rule_removal"
        `);
    await queryRunner.query(`
            ALTER TABLE "temporary_collection_media_rule_removal"
                RENAME TO "collection_media_rule_removal"
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_collection_media_rule_removal" ON "collection_media_rule_removal" ("collectionId", "mediaServerId")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "idx_collection_media_rule_removal"
        `);
    await queryRunner.query(`
            ALTER TABLE "collection_media_rule_removal"
                RENAME TO "temporary_collection_media_rule_removal"
        `);
    await queryRunner.query(`
            CREATE TABLE "collection_media_rule_removal" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "mediaServerId" varchar NOT NULL
            )
        `);
    await queryRunner.query(`
            INSERT INTO "collection_media_rule_removal"("id", "collectionId", "mediaServerId")
            SELECT "id",
                "collectionId",
                "mediaServerId"
            FROM "temporary_collection_media_rule_removal"
        `);
    await queryRunner.query(`
            DROP TABLE "temporary_collection_media_rule_removal"
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_collection_media_rule_removal" ON "collection_media_rule_removal" ("collectionId", "mediaServerId")
        `);
    await queryRunner.query(`
            DROP INDEX "idx_collection_media_rule_removal"
        `);
    await queryRunner.query(`
            DROP TABLE "collection_media_rule_removal"
        `);
  }
}
