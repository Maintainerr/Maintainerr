import { MigrationInterface, QueryRunner } from 'typeorm';

export class CollectionPathSelectionAndMediaMetadata1770502400000
  implements MigrationInterface
{
  name = 'CollectionPathSelectionAndMediaMetadata1770502400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const collectionTable = await queryRunner.getTable('collection');
    const collectionMediaTable = await queryRunner.getTable('collection_media');

    if (!collectionTable?.findColumnByName('pathSelectionEnabled')) {
      await queryRunner.query(
        `ALTER TABLE "collection" ADD COLUMN "pathSelectionEnabled" boolean NOT NULL DEFAULT (0)`,
      );
    }

    if (!collectionTable?.findColumnByName('selectedPaths')) {
      await queryRunner.query(
        `ALTER TABLE "collection" ADD COLUMN "selectedPaths" text`,
      );
    }

    if (!collectionMediaTable?.findColumnByName('size')) {
      await queryRunner.query(
        `ALTER TABLE "collection_media" ADD COLUMN "size" bigint`,
      );
    }

    if (!collectionMediaTable?.findColumnByName('title')) {
      await queryRunner.query(
        `ALTER TABLE "collection_media" ADD COLUMN "title" varchar`,
      );
    }

    await queryRunner.query(
      `UPDATE "rule_group" SET "name" = (
        SELECT c."title"
        FROM "collection" c
        WHERE c."id" = "rule_group"."collectionId"
      )
      WHERE "collectionId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const collectionTable = await queryRunner.getTable('collection');
    const collectionMediaTable = await queryRunner.getTable('collection_media');

    if (collectionMediaTable?.findColumnByName('title')) {
      await queryRunner.query(
        `ALTER TABLE "collection_media" DROP COLUMN "title"`,
      );
    }

    if (collectionMediaTable?.findColumnByName('size')) {
      await queryRunner.query(
        `ALTER TABLE "collection_media" DROP COLUMN "size"`,
      );
    }

    if (collectionTable?.findColumnByName('selectedPaths')) {
      await queryRunner.query(
        `ALTER TABLE "collection" DROP COLUMN "selectedPaths"`,
      );
    }

    if (collectionTable?.findColumnByName('pathSelectionEnabled')) {
      await queryRunner.query(
        `ALTER TABLE "collection" DROP COLUMN "pathSelectionEnabled"`,
      );
    }
  }
}
