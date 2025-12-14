import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRuleHandlerCronSchedule1764888122429 implements MigrationInterface {
  name = 'AddRuleHandlerCronSchedule1764888122429';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "rule_group" ADD "ruleHandlerCronSchedule" varchar
        `);
    await queryRunner.query(`
            DELETE FROM "task_running" WHERE "name" = 'Rule Handler'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "rule_group" DROP COLUMN "ruleHandlerCronSchedule"
        `);
  }
}
