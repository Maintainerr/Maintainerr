import { TaskStatusDto } from '@maintainerr/contracts';
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('/api/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get(':id/status')
  async getTaskStatus(@Param('id') id: string): Promise<TaskStatusDto> {
    const task = await this.tasksService.getTask(id);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return {
      time: new Date(),
      running: await this.tasksService.isRunning(id),
      runningSince: await this.tasksService.getRunningSince(id),
    };
  }
}
