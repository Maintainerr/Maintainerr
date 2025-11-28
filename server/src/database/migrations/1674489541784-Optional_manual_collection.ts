import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptionalManualCollection1674489541784 implements MigrationInterface {
  name = 'OptionalManualCollection1674489541784';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE collection ADD "manualCollection" boolean NOT NULL DEFAULT (0)`,
    );

    await queryRunner.query(
      `ALTER TABLE collection ADD "manualCollectionName" varchar(255) DEFAULT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE rule_group ADD "useRules" boolean NOT NULL DEFAULT (1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE collection DROP COLUMN manualCollection;`,
    );

    await queryRunner.query(
      `ALTER TABLE collection DROP COLUMN manualCollectionName;`,
    );

    await queryRunner.query(`ALTER TABLE rule_group DROP COLUMN useRules;`);
  }
}
