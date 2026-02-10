import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddQualityProfileChangeAction1770595335913 implements MigrationInterface {
  name = 'AddQualityProfileChangeAction1770595335913';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'collection',
      new TableColumn({
        name: 'radarrQualityProfileId',
        type: 'integer',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'collection',
      new TableColumn({
        name: 'sonarrQualityProfileId',
        type: 'integer',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('collection', 'radarrQualityProfileId');
    await queryRunner.dropColumn('collection', 'sonarrQualityProfileId');
  }
}
