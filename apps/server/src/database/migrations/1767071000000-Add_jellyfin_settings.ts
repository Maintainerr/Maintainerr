import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJellyfinSettings1767071000000 implements MigrationInterface {
  name = 'AddJellyfinSettings1767071000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add media_server_type column with default 'plex' for backwards compatibility
    await queryRunner.query(
      `ALTER TABLE settings ADD COLUMN "media_server_type" varchar DEFAULT 'plex'`,
    );

    // Add Jellyfin-specific columns
    await queryRunner.query(
      `ALTER TABLE settings ADD COLUMN "jellyfin_url" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE settings ADD COLUMN "jellyfin_api_key" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE settings ADD COLUMN "jellyfin_user_id" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE settings ADD COLUMN "jellyfin_server_name" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE settings DROP COLUMN "media_server_type"`);
    await queryRunner.query(`ALTER TABLE settings DROP COLUMN "jellyfin_url"`);
    await queryRunner.query(`ALTER TABLE settings DROP COLUMN "jellyfin_api_key"`);
    await queryRunner.query(`ALTER TABLE settings DROP COLUMN "jellyfin_user_id"`);
    await queryRunner.query(`ALTER TABLE settings DROP COLUMN "jellyfin_server_name"`);
  }
}
