import { MigrationInterface, QueryRunner } from 'typeorm';

export class CollectionAddInfoFields1705919105309 implements MigrationInterface {
  name = 'CollectionAddInfoFields1705919105309';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE collection ADD COLUMN "addDate" datetime',
    ); // for postgress: ALTER TABLE collection ADD COLUMN "addDate" timestamp with(out) time zone NOT NULL DEFAULT now()

    await queryRunner.query(
      'ALTER TABLE collection ADD COLUMN "handledMediaAmount" INTEGER NOT NULL DEFAULT 0',
    );

    await queryRunner.query(
      'ALTER TABLE collection ADD COLUMN "lastDurationInSeconds" INTEGER NOT NULL DEFAULT 0',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE collection DROP "addDate"`);
    await queryRunner.query(`ALTER TABLE collection DROP "handledMediaAmount"`);
    await queryRunner.query(
      `ALTER TABLE collection DROP "lastDurationInSeconds"`,
    );
  }
}
