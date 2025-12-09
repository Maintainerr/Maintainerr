import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskRunning } from '../tasks/entities/task_running.entities';
import { ExecutionLockService } from './execution-lock.service';
import { StatusService } from './status.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([TaskRunning])],
  providers: [TasksService, StatusService, ExecutionLockService],
  exports: [TasksService, ExecutionLockService],
  controllers: [TasksController],
})
export class TasksModule {}
