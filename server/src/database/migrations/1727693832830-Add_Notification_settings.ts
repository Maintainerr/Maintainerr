import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationSettings1727693832830 implements MigrationInterface {
  name = 'AddNotificationSettings1727693832830';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create notification table
    await queryRunner.query(`
      CREATE TABLE "notification" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" VARCHAR NOT NULL,
        "agent" VARCHAR NOT NULL,
        "enabled" BOOLEAN DEFAULT false,
        "types" TEXT,
        "options" TEXT NOT NULL
      );
    `);

    // Create notification_rulegroup table with foreign key constraints directly
    await queryRunner.query(`
      CREATE TABLE "notification_rulegroup" (
        "notificationId" INTEGER NOT NULL,
        "rulegroupId" INTEGER NOT NULL,
        PRIMARY KEY ("notificationId", "rulegroupId"),
        FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE CASCADE,
        FOREIGN KEY ("rulegroupId") REFERENCES "rule_group"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the tables in reverse order
    await queryRunner.query(`DROP TABLE "notification_rulegroup"`);
    await queryRunner.query(`DROP TABLE "notification"`);
  }
}
