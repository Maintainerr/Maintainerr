import { MigrationInterface, QueryRunner } from 'typeorm';

export class CollectionAddSortTitleField1764603599097 implements MigrationInterface {
  name = 'CollectionAddSortTitleField1764603599097';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE collection ADD COLUMN "sortTitle" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE collection DROP "sortTitle"`);
  }
}
