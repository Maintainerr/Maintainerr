import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRuleHandlerCronSchedule1764888122429 implements MigrationInterface {
  name = 'AddRuleHandlerCronSchedule1764888122429';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "rule_group" ADD "ruleHandlerCronSchedule" varchar
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "rule_group" DROP COLUMN "ruleHandlerCronSchedule"
        `);
  }
}
