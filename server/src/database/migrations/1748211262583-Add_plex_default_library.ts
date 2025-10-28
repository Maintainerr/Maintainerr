import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlexDefaultLibrary1748211262583 implements MigrationInterface {
  name = 'AddPlexDefaultLibrary1748211262583';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "plex_default_library" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "plex_default_library"`,
    );
  }
}
