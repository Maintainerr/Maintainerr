import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArrSettings1729032933189 implements MigrationInterface {
  name = 'AddArrSettings1729032933189';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "sonarr_settings" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "serverName" varchar NOT NULL,
                "url" varchar,
                "apiKey" varchar,
                "isDefault" boolean NOT NULL DEFAULT (0)
            )
        `);
    await queryRunner.query(`
            INSERT INTO "sonarr_settings" ("serverName", "url", "apiKey", "isDefault")
            SELECT 'Sonarr', "sonarr_url", "sonarr_api_key", 1 FROM "settings"
            WHERE "sonarr_url" IS NOT NULL AND "sonarr_api_key" IS NOT NULL
        `);
    await queryRunner.query(`
            CREATE TABLE "radarr_settings" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "serverName" varchar NOT NULL,
                "url" varchar,
                "apiKey" varchar,
                "isDefault" boolean NOT NULL DEFAULT (0)
            )
        `);
    await queryRunner.query(`
            INSERT INTO "radarr_settings" ("serverName", "url", "apiKey", "isDefault")
            SELECT 'Radarr', "radarr_url", "radarr_api_key", 1 FROM "settings"
            WHERE "radarr_url" IS NOT NULL AND "radarr_api_key" IS NOT NULL
        `);
    await queryRunner.query('ALTER TABLE "settings" DROP COLUMN "radarr_url"');
    await queryRunner.query(
      'ALTER TABLE "settings" DROP COLUMN "radarr_api_key"',
    );
    await queryRunner.query('ALTER TABLE "settings" DROP COLUMN "sonarr_url"');
    await queryRunner.query(
      'ALTER TABLE "settings" DROP COLUMN "sonarr_api_key"',
    );
    await queryRunner.query(`
                CREATE TABLE "temporary_collection" (
                    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                    "plexId" integer,
                    "libraryId" integer NOT NULL,
                    "title" varchar NOT NULL,
                    "description" varchar,
                    "isActive" boolean NOT NULL DEFAULT (1),
                    "arrAction" integer NOT NULL DEFAULT (0),
                    "visibleOnHome" boolean NOT NULL DEFAULT (0),
                    "deleteAfterDays" integer,
                    "type" integer NOT NULL DEFAULT (1),
                    "manualCollection" boolean NOT NULL DEFAULT (0),
                    "manualCollectionName" varchar DEFAULT (''),
                    "listExclusions" boolean NOT NULL DEFAULT (0),
                    "forceOverseerr" boolean NOT NULL DEFAULT (0),
                    "addDate" date DEFAULT (CURRENT_TIMESTAMP),
                    "handledMediaAmount" integer NOT NULL DEFAULT (0),
                    "lastDurationInSeconds" integer NOT NULL DEFAULT (0),
                    "keepLogsForMonths" integer NOT NULL DEFAULT (6),
                    "tautulliWatchedPercentOverride" integer,
                    "radarrSettingsId" integer,
                    "sonarrSettingsId" integer,
                    CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
                    CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
                )
            `);
    await queryRunner.query(`
                INSERT INTO "temporary_collection"(
                        "id",
                        "plexId",
                        "libraryId",
                        "title",
                        "description",
                        "isActive",
                        "arrAction",
                        "visibleOnHome",
                        "deleteAfterDays",
                        "type",
                        "manualCollection",
                        "manualCollectionName",
                        "listExclusions",
                        "forceOverseerr",
                        "addDate",
                        "handledMediaAmount",
                        "lastDurationInSeconds",
                        "keepLogsForMonths",
                        "tautulliWatchedPercentOverride",
                        "radarrSettingsId",
                        "sonarrSettingsId"
                    )
                SELECT "id",
                    "plexId",
                    "libraryId",
                    "title",
                    "description",
                    "isActive",
                    "arrAction",
                    "visibleOnHome",
                    "deleteAfterDays",
                    "type",
                    "manualCollection",
                    "manualCollectionName",
                    "listExclusions",
                    "forceOverseerr",
                    "addDate",
                    "handledMediaAmount",
                    "lastDurationInSeconds",
                    "keepLogsForMonths",
                    "tautulliWatchedPercentOverride",
                    NULL,
                    NULL
                FROM "collection"
            `);
    await queryRunner.query(`
                DROP TABLE "collection"
            `);
    await queryRunner.query(`
                ALTER TABLE "temporary_collection"
                    RENAME TO "collection"
            `);
    await queryRunner.query(`
                UPDATE "collection" SET "sonarrSettingsId" = (SELECT "id" FROM "sonarr_settings" LIMIT 1) WHERE "type" IN (2, 3, 4)
            `);
    await queryRunner.query(`
                UPDATE "collection" SET "radarrSettingsId" = (SELECT "id" FROM "radarr_settings" LIMIT 1) WHERE "type" = 1
            `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE settings ADD COLUMN "radarr_url" varchar',
    );
    await queryRunner.query(
      'ALTER TABLE settings ADD COLUMN "radarr_api_key" varchar',
    );
    await queryRunner.query(
      'ALTER TABLE settings ADD COLUMN "sonarr_url" varchar',
    );
    await queryRunner.query(
      'ALTER TABLE settings ADD COLUMN "sonarr_api_key" varchar',
    );
    await queryRunner.query(
      `UPDATE settings SET radarr_url = (SELECT url FROM radarr_settings WHERE isDefault = 1 LIMIT 1)`,
    );
    await queryRunner.query(
      `UPDATE settings SET radarr_api_key = (SELECT apiKey FROM radarr_settings WHERE isDefault = 1 LIMIT 1)`,
    );
    await queryRunner.query(
      `UPDATE settings SET sonarr_url = (SELECT url FROM sonarr_settings WHERE isDefault = 1 LIMIT 1)`,
    );
    await queryRunner.query(
      `UPDATE settings SET sonarr_api_key = (SELECT apiKey FROM sonarr_settings WHERE isDefault = 1 LIMIT 1)`,
    );
    await queryRunner.query(`
                    DROP TABLE "radarr_settings"
                `);
    await queryRunner.query(`
                    DROP TABLE "sonarr_settings"
                `);
    await queryRunner.query(`
        CREATE TABLE "temporary_collection" (
            "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
            "plexId" integer,
            "libraryId" integer NOT NULL,
            "title" varchar NOT NULL,
            "description" varchar,
            "isActive" boolean NOT NULL DEFAULT (1),
            "arrAction" integer NOT NULL DEFAULT (0),
            "visibleOnHome" boolean NOT NULL DEFAULT (0),
            "deleteAfterDays" integer,
            "type" integer NOT NULL DEFAULT (1),
            "manualCollection" boolean NOT NULL DEFAULT (0),
            "manualCollectionName" varchar DEFAULT (''),
            "listExclusions" boolean NOT NULL DEFAULT (0),
            "forceOverseerr" boolean NOT NULL DEFAULT (0),
            "addDate" date DEFAULT (CURRENT_TIMESTAMP),
            "handledMediaAmount" integer NOT NULL DEFAULT (0),
            "lastDurationInSeconds" integer NOT NULL DEFAULT (0),
            "keepLogsForMonths" integer NOT NULL DEFAULT (6),
            "tautulliWatchedPercentOverride" integer
        )
    `);
    await queryRunner.query(`
        INSERT INTO "temporary_collection"(
                "id",
                "plexId",
                "libraryId",
                "title",
                "description",
                "isActive",
                "arrAction",
                "visibleOnHome",
                "deleteAfterDays",
                "type",
                "manualCollection",
                "manualCollectionName",
                "listExclusions",
                "forceOverseerr",
                "addDate",
                "handledMediaAmount",
                "lastDurationInSeconds",
                "keepLogsForMonths",
                "tautulliWatchedPercentOverride"
            )
        SELECT "id",
            "plexId",
            "libraryId",
            "title",
            "description",
            "isActive",
            "arrAction",
            "visibleOnHome",
            "deleteAfterDays",
            "type",
            "manualCollection",
            "manualCollectionName",
            "listExclusions",
            "forceOverseerr",
            "addDate",
            "handledMediaAmount",
            "lastDurationInSeconds",
            "keepLogsForMonths",
            "tautulliWatchedPercentOverride"
        FROM "collection"
    `);
    await queryRunner.query(`
        DROP TABLE "collection"
    `);
    await queryRunner.query(`
        ALTER TABLE "temporary_collection"
            RENAME TO "collection"
    `);
  }
}
