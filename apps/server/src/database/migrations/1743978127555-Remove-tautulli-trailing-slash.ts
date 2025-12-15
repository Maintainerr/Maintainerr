import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTautulliTrailingSlash1743978127555 implements MigrationInterface {
  name = 'RemoveTautulliTrailingSlash1743978127555';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE settings SET tautulli_url = rtrim(tautulli_url, '/')`,
    );
  }

  public async down(): Promise<void> {}
}
