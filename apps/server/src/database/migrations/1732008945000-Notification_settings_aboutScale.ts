import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationSettingsAboutScale1732008945000 implements MigrationInterface {
  name = 'NotificationSettingsAboutScale1732008945000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification" ADD COLUMN "aboutScale" INTEGER NOT NULL DEFAULT 3;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification" DROP COLUMN "aboutScale";
    `);
  }
}
