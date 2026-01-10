import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTaskRunning1768058840535 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "task_running"`);
  }

  public async down(): Promise<void> {}
}
