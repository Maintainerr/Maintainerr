import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveEmptyRules1768073131263 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DELETE FROM "rules"
            WHERE TRIM("ruleJson") = (char(34) || char(34))
        `);
  }

  public async down(): Promise<void> {}
}
