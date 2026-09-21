import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddOverlayModeToCollection1789161267513
  implements MigrationInterface
{
  name = 'AddOverlayModeToCollection1789161267513';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'collection',
      new TableColumn({
        name: 'overlayMode',
        type: 'varchar',
        isNullable: true,
        default: null,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('collection', 'overlayMode');
  }
}
