import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJellyseerrSettings1740868281450 implements MigrationInterface {
  name = 'AddJellyseerrSettings1740868281450';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE settings ADD COLUMN "jellyseerr_url" varchar',
    );
    await queryRunner.query(
      'ALTER TABLE settings ADD COLUMN "jellyseerr_api_key" varchar',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE settings DROP "jellyseerr_url"`);
    await queryRunner.query(`ALTER TABLE settings DROP "jellyseerr_api_key"`);
  }
}
