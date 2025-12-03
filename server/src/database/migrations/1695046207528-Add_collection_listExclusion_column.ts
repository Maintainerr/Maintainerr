import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectionListExclusionColumn1695046207528 implements MigrationInterface {
  name = 'AddCollectionListExclusionColumn1695046207528';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE collection ADD "listExclusions" boolean NOT NULL default (0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE collection DROP "listExclusions"`);
  }
}
