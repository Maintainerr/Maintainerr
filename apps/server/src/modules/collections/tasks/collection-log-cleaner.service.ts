import { Injectable } from '@nestjs/common';
import { TasksService } from '../..//tasks/tasks.service';
import { CollectionsService } from '../../collections/collections.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import { TaskBase } from '../../tasks/task.base';

@Injectable()
export class CollectionLogCleanerService extends TaskBase {
  protected name = 'Collection Log Cleaner';
  protected cronSchedule = '45 5 * * *';

  constructor(
    private readonly collectionService: CollectionsService,
    protected readonly taskService: TasksService,
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(CollectionLogCleanerService.name);
    super(taskService, logger);
  }

  protected async executeTask() {
    try {
      // start execution
      // get all collections
      const collections = await this.collectionService.getAllCollections();

      // for each collection
      for (const collection of collections) {
        await this.collectionService.removeOldCollectionLogs(collection);
      }
    } catch (e) {
      this.logger.debug(e);
    }
  }
}
