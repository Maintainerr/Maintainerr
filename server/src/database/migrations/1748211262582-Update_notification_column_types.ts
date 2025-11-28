import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateNotificationColumnTypes1748211262582 implements MigrationInterface {
  name = 'UpdateNotificationColumnTypes1748211262582';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
                        CREATE TABLE "temporary_notification" (
                                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                                "name" varchar NOT NULL,
                                "agent" varchar NOT NULL,
                                "enabled" boolean NOT NULL DEFAULT (0),
                                "types" text,
                                "options" json NOT NULL,
                                "aboutScale" integer NOT NULL DEFAULT (3)
                        )
                `);

    // Get all records from the notification table
    const notifications = await queryRunner.query(
      'SELECT * FROM "notification"',
    );

    // Insert records into temporary table with parsed JSON for options
    for (const notification of notifications) {
      const parsedOptions = JSON.parse(JSON.parse(notification.options));
      await queryRunner.query(
        `INSERT INTO "temporary_notification"(
                    "id", "name", "agent", "enabled", "types", "options", "aboutScale"
                ) VALUES (?, ?, ?, ?, ?, json(?), ?)`,
        [
          notification.id,
          notification.name,
          notification.agent,
          notification.enabled,
          notification.types,
          JSON.stringify(parsedOptions),
          notification.aboutScale,
        ],
      );
    }

    await queryRunner.query(`DROP TABLE "notification"`);
    await queryRunner.query(`
                        ALTER TABLE "temporary_notification"
                                RENAME TO "notification"
                `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
                        ALTER TABLE "notification"
                                RENAME TO "temporary_notification"
                `);
    await queryRunner.query(`
                        CREATE TABLE "notification" (
                                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                                "name" varchar NOT NULL,
                                "agent" varchar NOT NULL,
                                "enabled" boolean NOT NULL DEFAULT (0),
                                "types" text,
                                "options" text NOT NULL,
                                "aboutScale" integer NOT NULL DEFAULT (3)
                        )
                `);

    // Get all records from the temporary table
    const notifications = await queryRunner.query(
      'SELECT * FROM "temporary_notification"',
    );

    // Insert records back with stringified options
    for (const notification of notifications) {
      await queryRunner.query(
        `INSERT INTO "notification"(
                    "id", "name", "agent", "enabled", "types", "options", "aboutScale"
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          notification.id,
          notification.name,
          notification.agent,
          notification.enabled,
          notification.types,
          JSON.stringify(notification.options),
          notification.aboutScale,
        ],
      );
    }

    await queryRunner.query(`DROP TABLE "temporary_notification"`);
  }
}
