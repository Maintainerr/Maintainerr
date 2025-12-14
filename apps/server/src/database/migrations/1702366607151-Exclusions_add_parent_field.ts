import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExclusionsAddParentField1702366607151 implements MigrationInterface {
  name = 'ExclusionsAddParentField1702366607151';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE exclusion ADD "parent" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE exclusion DROP "parent"`);
  }
}
