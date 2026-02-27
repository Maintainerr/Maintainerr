import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCollectionTotalSizeBytes1771699988985 implements MigrationInterface {
    name = 'AddCollectionTotalSizeBytes1771699988985'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "temporary_collection" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "libraryId" varchar NOT NULL,
                "title" varchar NOT NULL,
                "description" varchar,
                "isActive" boolean NOT NULL DEFAULT (1),
                "arrAction" integer NOT NULL DEFAULT (0),
                "visibleOnHome" boolean NOT NULL DEFAULT (0),
                "deleteAfterDays" integer,
                "type" varchar NOT NULL DEFAULT ('movie'),
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
                "visibleOnRecommended" boolean NOT NULL DEFAULT (0),
                "sortTitle" varchar,
                "mediaServerId" varchar,
                "mediaServerType" varchar NOT NULL DEFAULT ('plex'),
                "totalSizeBytes" bigint,
                CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
                CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
            )
        `);
        await queryRunner.query(`
            INSERT INTO "temporary_collection"(
                    "id",
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
                    "sonarrSettingsId",
                    "visibleOnRecommended",
                    "sortTitle",
                    "mediaServerId",
                    "mediaServerType"
                )
            SELECT "id",
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
                "sonarrSettingsId",
                "visibleOnRecommended",
                "sortTitle",
                "mediaServerId",
                "mediaServerType"
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

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "collection"
                RENAME TO "temporary_collection"
        `);
        await queryRunner.query(`
            CREATE TABLE "collection" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "libraryId" varchar NOT NULL,
                "title" varchar NOT NULL,
                "description" varchar,
                "isActive" boolean NOT NULL DEFAULT (1),
                "arrAction" integer NOT NULL DEFAULT (0),
                "visibleOnHome" boolean NOT NULL DEFAULT (0),
                "deleteAfterDays" integer,
                "type" varchar NOT NULL DEFAULT ('movie'),
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
                "visibleOnRecommended" boolean NOT NULL DEFAULT (0),
                "sortTitle" varchar,
                "mediaServerId" varchar,
                "mediaServerType" varchar NOT NULL DEFAULT ('plex'),
                CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
                CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
            )
        `);
        await queryRunner.query(`
            INSERT INTO "collection"(
                    "id",
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
                    "sonarrSettingsId",
                    "visibleOnRecommended",
                    "sortTitle",
                    "mediaServerId",
                    "mediaServerType"
                )
            SELECT "id",
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
                "sonarrSettingsId",
                "visibleOnRecommended",
                "sortTitle",
                "mediaServerId",
                "mediaServerType"
            FROM "temporary_collection"
        `);
        await queryRunner.query(`
            DROP TABLE "temporary_collection"
        `);
    }

}
