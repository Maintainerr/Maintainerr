import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectionLogMeta1741477145504 implements MigrationInterface {
  name = 'AddCollectionLogMeta1741477145504';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "collection_log" ADD COLUMN "meta" text',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collection_log" DROP "meta"`);
  }
}
