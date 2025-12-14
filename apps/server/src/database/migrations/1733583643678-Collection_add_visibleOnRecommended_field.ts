import { MigrationInterface, QueryRunner } from 'typeorm';

export class CollectionAddVisibleOnRecommendedField1733583643678 implements MigrationInterface {
  name = 'CollectionAddVisibleOnRecommendedField1733583643678';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE collection ADD COLUMN "visibleOnRecommended" boolean NOT NULL DEFAULT (0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE collection DROP "visibleOnRecommended"`,
    );
  }
}
