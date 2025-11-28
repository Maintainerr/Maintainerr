import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTautulliWatchedPercentOverride1727516980165 implements MigrationInterface {
  name = 'AddTautulliWatchedPercentOverride1727516980165';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE collection ADD COLUMN "tautulliWatchedPercentOverride" integer',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE collection DROP "tautulliWatchedPercentOverride"`,
    );
  }
}
