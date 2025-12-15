import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExclusionsAddTypeField1705399208460 implements MigrationInterface {
  name = 'ExclusionsAddTypeField1705399208460';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE exclusion ADD COLUMN "type" INTEGER CHECK("type" IS NULL OR "type" IN (1, 2, 3, 4)) DEFAULT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE exclusion DROP "type"`);
  }
}
