import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ExecutionLockService } from './execution-lock.service';
import { StatusService } from './status.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [TasksService, StatusService, ExecutionLockService],
  exports: [TasksService, ExecutionLockService],
  controllers: [TasksController],
})
export class TasksModule {}
