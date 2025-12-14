import { MigrationInterface, QueryRunner } from 'typeorm';

export class TasksAddTaskRunningTable1706275100801 implements MigrationInterface {
  name = 'TasksAddTaskRunningTable1706275100801';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "task_running" (
                "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                "name" varchar NOT NULL,
                "runningSince" datetime DEFAULT NULL,
                "running" boolean NOT NULL DEFAULT (0)
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "task_running"
        `);
  }
}
