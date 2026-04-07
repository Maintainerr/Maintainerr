import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOverlayTemplates1775400000000 implements MigrationInterface {
  name = 'AddOverlayTemplates1775400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "overlay_templates" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar(100) NOT NULL,
        "description" varchar(500) NOT NULL DEFAULT '',
        "mode" varchar(20) NOT NULL,
        "canvasWidth" integer NOT NULL,
        "canvasHeight" integer NOT NULL,
        "elements" text NOT NULL DEFAULT '[]',
        "isDefault" boolean NOT NULL DEFAULT (0),
        "isPreset" boolean NOT NULL DEFAULT (0),
        "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )
    `);

    // Add overlayTemplateId FK to collection table
    await queryRunner.query(
      `ALTER TABLE "collection" ADD "overlayTemplateId" integer DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite 3.35.0+ supports DROP COLUMN
    await queryRunner.query(
      `ALTER TABLE "collection" DROP COLUMN "overlayTemplateId"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "overlay_templates"`);
  }
}
