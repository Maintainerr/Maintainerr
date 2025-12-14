import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateTautulliURL1728503476668 implements MigrationInterface {
  name = 'UpdateTautulliURL1728503476668';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE settings SET tautulli_url = rtrim(tautulli_url, '/')`,
    );
  }

  public async down(): Promise<void> {}
}
