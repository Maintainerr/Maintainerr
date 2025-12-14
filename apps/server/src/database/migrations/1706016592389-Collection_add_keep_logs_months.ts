import { MigrationInterface, QueryRunner } from 'typeorm';

export class CollectionAddKeepLogsMonths1706016592389 implements MigrationInterface {
  name = 'CollectionAddKeepLogsMonths1706016592389';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE collection ADD COLUMN "keepLogsForMonths" INTEGER NOT NULL DEFAULT 6',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE collection DROP "keepLogsForMonths"`);
  }
}
