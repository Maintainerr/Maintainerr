import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOverlayModeToItemState1789161267514 implements MigrationInterface {
  name = 'AddOverlayModeToItemState1789161267514';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "overlay_item_state" ADD COLUMN "overlayMode" varchar NOT NULL DEFAULT ('poster')`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_overlay_item_state_collection_media"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_overlay_item_state_collection_media_mode" ON "overlay_item_state" ("collectionId", "mediaServerId", "overlayMode")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_overlay_item_state_collection_media_mode"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_overlay_item_state_collection_media" ON "overlay_item_state" ("collectionId", "mediaServerId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "overlay_item_state" DROP COLUMN "overlayMode"`,
    );
  }
}
