import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTautulliSettings1727097172777 implements MigrationInterface {
  name = 'AddTautulliSettings1727097172777';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE settings ADD COLUMN "tautulli_url" varchar',
    );
    await queryRunner.query(
      'ALTER TABLE settings ADD COLUMN "tautulli_api_key" varchar',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE settings DROP "tautulli_url"`);
    await queryRunner.query(`ALTER TABLE settings DROP "tautulli_api_key"`);
  }
}
