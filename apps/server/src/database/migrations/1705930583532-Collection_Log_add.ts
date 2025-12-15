import { MigrationInterface, QueryRunner } from 'typeorm';

export class CollectionLogAdd1705930583532 implements MigrationInterface {
  name = 'CollectionLogAdd1705930583532';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "collection_log" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "timestamp" datetime NOT NULL,
                "message" varchar NOT NULL,
                "type" integer NOT NULL
            )   
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_collection_log_collection_id" ON "collection_log" ("collectionId")
        `);

    await queryRunner.query(`
        CREATE INDEX "idx_collection_media_collection_id" ON "collection_media" ("collectionId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
    DROP INDEX "idx_collection_log_collection_id"
    `);
    await queryRunner.query(`
    DROP INDEX "idx_collection_media_collection_id"
    `);
    await queryRunner.query(`
    DROP TABLE "collection_log"
`);
  }
}
