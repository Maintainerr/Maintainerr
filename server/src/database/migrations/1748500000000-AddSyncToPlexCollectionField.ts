import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSyncToPlexCollectionField1748500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'collection',
      new TableColumn({
        name: 'syncToPlexCollection',
        type: 'boolean',
        default: true,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('collection', 'syncToPlexCollection');
  }
}
