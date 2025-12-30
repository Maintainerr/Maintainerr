import { EMediaDataType } from '@maintainerr/contracts';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Timeout } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import { Exclusion } from '../entities/exclusion.entities';
import { RulesService } from '../rules.service';

@Injectable()
export class ExclusionTypeCorrectorService implements OnModuleInit {
  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly settings: SettingsService,
    private readonly rulesService: RulesService,
    @InjectRepository(Exclusion)
    private readonly exclusionRepo: Repository<Exclusion>,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(ExclusionTypeCorrectorService.name);
  }

  onModuleInit() {
    // nothing
  }

  @Timeout(5000)
  private async execute() {
    try {
      const appStatus = await this.settings.testPlex();

      if (appStatus) {
        // remove media exclusions that are no longer available
        await this.correctExclusionTypes();
      }
    } catch (e) {
      this.logger.warn(`Exclusion type corrections failed : ${e.message}`);
    }
  }

  private async correctExclusionTypes() {
    // get all exclusions without a type
    const exclusionsWithoutType = await this.exclusionRepo
      .createQueryBuilder('exclusion')
      .where('type is null')
      .getMany();

    const mediaServer = await this.mediaServerFactory.getService();

    // correct the type
    for (const el of exclusionsWithoutType) {
      const metaData = await mediaServer.getMetadata(el.mediaServerId);
      if (!metaData) {
        // remove record if not in media server
        await this.rulesService.removeExclusion(el.id);
      } else {
        // Map EMediaDataType to the numeric values stored in the database
        el.type = metaData?.type
          ? metaData.type === EMediaDataType.MOVIES
            ? 1
            : metaData.type === EMediaDataType.SHOWS
              ? 2
              : metaData.type === EMediaDataType.SEASONS
                ? 3
                : metaData.type === EMediaDataType.EPISODES
                  ? 4
                  : undefined
          : undefined;
      }
    }

    // save edited data
    await this.exclusionRepo.save(exclusionsWithoutType);
  }
}
