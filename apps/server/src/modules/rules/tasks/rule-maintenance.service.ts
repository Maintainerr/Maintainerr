import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { CollectionsService } from '../../collections/collections.service';
import { Collection } from '../../collections/entities/collection.entities';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsOperationsService } from '../../settings/settings-operations.service';
import { TaskBase } from '../../tasks/task.base';
import { TasksService } from '../../tasks/tasks.service';
import { RulesService } from '../rules.service';

@Injectable()
export class RuleMaintenanceService extends TaskBase {
  protected name = 'Rule Maintenance';
  protected cronSchedule = '20 4 * * *';

  constructor(
    protected readonly taskService: TasksService,
    protected readonly logger: MaintainerrLogger,
    private readonly settingsOperationsService: SettingsOperationsService,
    private readonly rulesService: RulesService,
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly collectionsService: CollectionsService,
  ) {
    logger.setContext(RuleMaintenanceService.name);
    super(taskService, logger);
  }

  protected async executeTask() {
    try {
      this.logger.log('Starting maintenance');
      const mediaServerReachable =
        await this.settingsOperationsService.testMediaServerConnection();

      if (mediaServerReachable) {
        // remove media exclusions that are no longer available
        await this.removeLeftoverExclusions();
        // remove collection media entries for items deleted from media server
        await this.collectionsService.removeStaleCollectionMedia();
      } else {
        this.logger.warn(
          'Skipping media server cleanup; media server was not reachable.',
        );
      }

      await this.removeCollectionsWithoutRule();
      this.logger.log('Maintenance done');
    } catch (error) {
      this.logger.error('Rule Maintenance failed');
      this.logger.debug(error);
    }
  }

  private async removeLeftoverExclusions() {
    const exclusions = await this.rulesService.getAllExclusions();
    const mediaServer = await this.mediaServerFactory.getService();
    for (const exclusion of exclusions) {
      // Only drop an exclusion when the media server *confirms* the item is
      // gone. `itemExists` returns false solely on a 404/empty result and
      // throws on an inconclusive check, unlike `getMetadata` which returns
      // undefined for both absent and failed reads - a transient blip must
      // not delete the protection an exclusion provides.
      let exists = true;
      try {
        exists = await mediaServer.itemExists(exclusion.mediaServerId);
      } catch (error) {
        this.logger.debug(error);
      }

      if (!exists) {
        await this.rulesService.removeExclusion(exclusion.id);
      }
    }
  }

  private async removeCollectionsWithoutRule() {
    try {
      const collections = await this.collectionRepo.find(); // get all collections
      const rulegroups = await this.rulesService.getRuleGroups();

      for (const collection of collections) {
        if (
          !rulegroups.find(
            (rulegroup) => rulegroup.collection?.id === collection.id,
          )
        ) {
          await this.collectionRepo.delete({ id: collection.id });
        }
      }
    } catch (error) {
      this.logger.error("Couldn't remove collection without rule");
      this.logger.debug(error);
    }
  }
}
