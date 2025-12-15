import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectionChidrenAndDataType1694102061641 implements MigrationInterface {
  name = 'AddCollectionChidrenAndDataType1694102061641';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rule_group ADD "dataType" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rule_group DROP "dataType"`);
  }
}
