import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLogSettings1740094282798 implements MigrationInterface {
  name = 'AddLogSettings1740094282798';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const logLevel = process.env.DEBUG == 'true' ? 'debug' : 'info';

    await queryRunner.query(`
            CREATE TABLE "log_settings" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "level" varchar NOT NULL DEFAULT ('info'),
                "max_size" integer NOT NULL DEFAULT (20),
                "max_files" integer NOT NULL DEFAULT (7)
            )
        `);

    await queryRunner.query(`
            INSERT INTO "log_settings"("level", "max_size", "max_files")
            SELECT '${logLevel}',
                20,
                7
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "log_settings"
        `);
  }
}
