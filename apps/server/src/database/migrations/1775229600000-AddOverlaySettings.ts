import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOverlaySettings1775229600000 implements MigrationInterface {
  name = 'AddOverlaySettings1775229600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "overlay_settings" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "enabled" boolean NOT NULL DEFAULT (0),
        "posterOverlayText" text NOT NULL DEFAULT '${JSON.stringify({ overlayText: 'Leaving', useDays: false, textToday: 'today', textDay: 'in 1 day', textDays: 'in {0} days', enableDaySuffix: false, enableUppercase: false, language: 'en-US', dateFormat: 'MMM d' })}',
        "posterOverlayStyle" text NOT NULL DEFAULT '${JSON.stringify({ fontPath: 'Inter-Bold.ttf', fontColor: '#FFFFFF', backColor: '#B20710', fontSize: 5.5, padding: 1.5, backRadius: 3.0, horizontalOffset: 3.0, horizontalAlign: 'left', verticalOffset: 4.0, verticalAlign: 'top', overlayBottomCenter: false })}',
        "posterFrame" text NOT NULL DEFAULT '${JSON.stringify({ useFrame: false, frameColor: '#B20710', frameWidth: 1.5, frameRadius: 2.0, frameInnerRadius: 2.0, frameInnerRadiusMode: 'auto', frameInset: 'outside', dockStyle: 'pill', dockPosition: 'bottom' })}',
        "titleCardOverlayText" text NOT NULL DEFAULT '${JSON.stringify({ overlayText: 'Leaving', useDays: false, textToday: 'today', textDay: 'in 1 day', textDays: 'in {0} days', enableDaySuffix: false, enableUppercase: false, language: 'en-US', dateFormat: 'MMM d' })}',
        "titleCardOverlayStyle" text NOT NULL DEFAULT '${JSON.stringify({ fontPath: 'Inter-Bold.ttf', fontColor: '#FFFFFF', backColor: '#B20710', fontSize: 5.5, padding: 1.5, backRadius: 3.0, horizontalOffset: 3.0, horizontalAlign: 'left', verticalOffset: 4.0, verticalAlign: 'top', overlayBottomCenter: false })}',
        "titleCardFrame" text NOT NULL DEFAULT '${JSON.stringify({ useFrame: false, frameColor: '#B20710', frameWidth: 1.5, frameRadius: 2.0, frameInnerRadius: 2.0, frameInnerRadiusMode: 'auto', frameInset: 'outside', dockStyle: 'pill', dockPosition: 'bottom' })}',
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
        "processedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        CONSTRAINT "FK_overlay_item_state_collection" FOREIGN KEY ("collectionId") REFERENCES "collection" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_overlay_item_state_collection_media"
      ON "overlay_item_state" ("collectionId", "mediaServerId")
    `);

    await queryRunner.query(
      `ALTER TABLE "collection" ADD "overlayEnabled" boolean NOT NULL DEFAULT (0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite doesn't support DROP COLUMN directly, use the standard workaround
    // For simplicity, we recreate without the column only if truly needed.
    // In practice, down migrations for column additions in SQLite are complex.
    // We'll handle the simple cases:

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_overlay_item_state_collection_media"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "overlay_item_state"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "overlay_settings"`);

    // Note: SQLite ALTER TABLE DROP COLUMN is supported in SQLite 3.35.0+
    await queryRunner.query(`ALTER TABLE "collection" DROP COLUMN "overlayEnabled"`);
  }
}
