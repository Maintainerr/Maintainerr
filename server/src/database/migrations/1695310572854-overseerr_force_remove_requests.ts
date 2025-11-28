import { MigrationInterface, QueryRunner } from 'typeorm';

export class overseerrForceRemoveRequests1695310572854 implements MigrationInterface {
  name = 'overseerrForceRemoveRequests1695310572854';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE collection ADD "forceOverseerr" boolean NOT NULL default (0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE collection DROP "forceOverseerr"`);
  }
}
