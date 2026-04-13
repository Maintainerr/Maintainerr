import { MigrationInterface, QueryRunner } from "typeorm";

export class OverlaySchemaGenerated1776053413074 implements MigrationInterface {
    name = 'OverlaySchemaGenerated1776053413074'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "overlay_templates" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "name" varchar(100) NOT NULL,
                "description" varchar(500) NOT NULL DEFAULT (''),
                "mode" varchar(20) NOT NULL,
                "canvasWidth" integer NOT NULL,
                "canvasHeight" integer NOT NULL,
                "elements" text NOT NULL,
                "isDefault" boolean NOT NULL DEFAULT (0),
                "isPreset" boolean NOT NULL DEFAULT (0),
                "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "overlay_settings" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "enabled" boolean NOT NULL DEFAULT (0),
                "posterOverlayText" text NOT NULL,
                "posterOverlayStyle" text NOT NULL,
                "posterFrame" text NOT NULL,
                "titleCardOverlayText" text NOT NULL,
                "titleCardOverlayStyle" text NOT NULL,
                "titleCardFrame" text NOT NULL,
                "cronSchedule" varchar,
                "applyOnAdd" boolean NOT NULL DEFAULT (1)
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "overlay_item_state" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "mediaServerId" varchar NOT NULL,
                "originalPosterPath" varchar,
                "daysLeftShown" integer,
                "processedAt" datetime NOT NULL DEFAULT (datetime('now'))
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_overlay_item_state_collection_media" ON "overlay_item_state" ("collectionId", "mediaServerId")
        `);
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
                "forceSeerr" boolean NOT NULL DEFAULT (0),
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
                "radarrQualityProfileId" integer,
                "sonarrQualityProfileId" integer,
                "overlayEnabled" boolean NOT NULL DEFAULT (0),
                "overlayTemplateId" integer,
                CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
                CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
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
                    "forceSeerr",
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
                    "mediaServerType",
                    "totalSizeBytes",
                    "radarrQualityProfileId",
                    "sonarrQualityProfileId"
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
                "forceSeerr",
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
                "mediaServerType",
                "totalSizeBytes",
                "radarrQualityProfileId",
                "sonarrQualityProfileId"
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
                "forceSeerr" boolean NOT NULL DEFAULT (0),
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
                "radarrQualityProfileId" integer,
                "sonarrQualityProfileId" integer,
                "overlayEnabled" boolean NOT NULL DEFAULT (0),
                "overlayTemplateId" integer,
                CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
                CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
                CONSTRAINT "FK_9d81b59ef584c1072c2bcbcccb7" FOREIGN KEY ("overlayTemplateId") REFERENCES "overlay_templates" ("id") ON DELETE
                SET NULL ON UPDATE NO ACTION
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
                    "forceSeerr",
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
                    "mediaServerType",
                    "totalSizeBytes",
                    "radarrQualityProfileId",
                    "sonarrQualityProfileId",
                    "overlayEnabled",
                    "overlayTemplateId"
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
                "forceSeerr",
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
                "mediaServerType",
                "totalSizeBytes",
                "radarrQualityProfileId",
                "sonarrQualityProfileId",
                "overlayEnabled",
                "overlayTemplateId"
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
            DROP INDEX "IDX_overlay_item_state_collection_media"
        `);
        await queryRunner.query(`
            CREATE TABLE "temporary_overlay_item_state" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "mediaServerId" varchar NOT NULL,
                "originalPosterPath" varchar,
                "daysLeftShown" integer,
                "processedAt" datetime NOT NULL DEFAULT (datetime('now')),
                CONSTRAINT "FK_0cdb2226a8ee24176a22b2421e1" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
        await queryRunner.query(`
            INSERT INTO "temporary_overlay_item_state"(
                    "id",
                    "collectionId",
                    "mediaServerId",
                    "originalPosterPath",
                    "daysLeftShown",
                    "processedAt"
                )
            SELECT "id",
                "collectionId",
                "mediaServerId",
                "originalPosterPath",
                "daysLeftShown",
                "processedAt"
            FROM "overlay_item_state"
        `);
        await queryRunner.query(`
            DROP TABLE "overlay_item_state"
        `);
        await queryRunner.query(`
            ALTER TABLE "temporary_overlay_item_state"
                RENAME TO "overlay_item_state"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_overlay_item_state_collection_media" ON "overlay_item_state" ("collectionId", "mediaServerId")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "IDX_overlay_item_state_collection_media"
        `);
        await queryRunner.query(`
            ALTER TABLE "overlay_item_state"
                RENAME TO "temporary_overlay_item_state"
        `);
        await queryRunner.query(`
            CREATE TABLE "overlay_item_state" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "collectionId" integer NOT NULL,
                "mediaServerId" varchar NOT NULL,
                "originalPosterPath" varchar,
                "daysLeftShown" integer,
                "processedAt" datetime NOT NULL DEFAULT (datetime('now'))
            )
        `);
        await queryRunner.query(`
            INSERT INTO "overlay_item_state"(
                    "id",
                    "collectionId",
                    "mediaServerId",
                    "originalPosterPath",
                    "daysLeftShown",
                    "processedAt"
                )
            SELECT "id",
                "collectionId",
                "mediaServerId",
                "originalPosterPath",
                "daysLeftShown",
                "processedAt"
            FROM "temporary_overlay_item_state"
        `);
        await queryRunner.query(`
            DROP TABLE "temporary_overlay_item_state"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_overlay_item_state_collection_media" ON "overlay_item_state" ("collectionId", "mediaServerId")
        `);
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
                "forceSeerr" boolean NOT NULL DEFAULT (0),
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
                "radarrQualityProfileId" integer,
                "sonarrQualityProfileId" integer,
                "overlayEnabled" boolean NOT NULL DEFAULT (0),
                "overlayTemplateId" integer,
                CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
                CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
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
                    "forceSeerr",
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
                    "mediaServerType",
                    "totalSizeBytes",
                    "radarrQualityProfileId",
                    "sonarrQualityProfileId",
                    "overlayEnabled",
                    "overlayTemplateId"
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
                "forceSeerr",
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
                "mediaServerType",
                "totalSizeBytes",
                "radarrQualityProfileId",
                "sonarrQualityProfileId",
                "overlayEnabled",
                "overlayTemplateId"
            FROM "temporary_collection"
        `);
        await queryRunner.query(`
            DROP TABLE "temporary_collection"
        `);
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
                "forceSeerr" boolean NOT NULL DEFAULT (0),
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
                "radarrQualityProfileId" integer,
                "sonarrQualityProfileId" integer,
                CONSTRAINT "FK_b638046ca16fca4108a7981fd8c" FOREIGN KEY ("sonarrSettingsId") REFERENCES "sonarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
                CONSTRAINT "FK_7b354cc91e78c8e730465f14f69" FOREIGN KEY ("radarrSettingsId") REFERENCES "radarr_settings" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
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
                    "forceSeerr",
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
                    "mediaServerType",
                    "totalSizeBytes",
                    "radarrQualityProfileId",
                    "sonarrQualityProfileId"
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
                "forceSeerr",
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
                "mediaServerType",
                "totalSizeBytes",
                "radarrQualityProfileId",
                "sonarrQualityProfileId"
            FROM "temporary_collection"
        `);
        await queryRunner.query(`
            DROP TABLE "temporary_collection"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_overlay_item_state_collection_media"
        `);
        await queryRunner.query(`
            DROP TABLE "overlay_item_state"
        `);
        await queryRunner.query(`
            DROP TABLE "overlay_settings"
        `);
        await queryRunner.query(`
            DROP TABLE "overlay_templates"
        `);
    }

}
