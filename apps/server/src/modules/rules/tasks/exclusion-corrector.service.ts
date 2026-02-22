import { MediaItemType } from '@maintainerr/contracts';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { Collection } from '../../collections/entities/collection.entities';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import { Exclusion } from '../entities/exclusion.entities';
import { RuleGroup } from '../entities/rule-group.entities';
import { RulesService } from '../rules.service';

/**
 * Map of legacy integer-as-string type values to MediaItemType strings.
 * Used during migration from Plex-only (integer enums) to multi-server (string types).
 */
const LEGACY_INT_TO_MEDIA_TYPE: Record<string, MediaItemType> = {
  '1': 'movie',
  '2': 'show',
  '3': 'season',
  '4': 'episode',
};

@Injectable()
export class ExclusionTypeCorrectorService implements OnModuleInit {
  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly settings: SettingsService,
    private readonly rulesService: RulesService,
    @InjectRepository(Exclusion)
    private readonly exclusionRepo: Repository<Exclusion>,
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(RuleGroup)
    private readonly ruleGroupRepo: Repository<RuleGroup>,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(ExclusionTypeCorrectorService.name);
  }

  async onModuleInit() {
    try {
      // Convert integer-as-string types to MediaItemType strings.
      // This MUST complete before the app accepts requests to prevent
      // the collection-clearing race condition (Bug #2358).
      await this.convertLegacyIntegerTypes();

      // Backfill null exclusion types by fetching metadata from the media server.
      // Only runs work when there are exclusions with null types (typically once
      // after migration). Subsequent startups return immediately.
      const isSetup = await this.settings.testSetup();
      if (isSetup) {
        await this.correctExclusionTypes();
      }
    } catch (e) {
      this.logger.warn(`Exclusion type corrections failed: ${e.message}`);
    }
  }

  /**
   * Converts legacy integer-as-string type values to proper MediaItemType strings.
   * After SQLite migration, integer values (1,2,3,4) become strings ('1','2','3','4')
   * instead of the expected ('movie','show','season','episode').
   * This covers exclusion.type, collection.type, and rule_group.dataType.
   */
  private async convertLegacyIntegerTypes() {
    // Convert exclusion types
    const exclusionsWithLegacyType = await this.exclusionRepo
      .createQueryBuilder('exclusion')
      .where('exclusion.type IN (:...types)', {
        types: Object.keys(LEGACY_INT_TO_MEDIA_TYPE),
      })
      .getMany();

    if (exclusionsWithLegacyType.length > 0) {
      this.logger.log(
        `Converting ${exclusionsWithLegacyType.length} exclusion(s) from legacy integer types`,
      );
      for (const exclusion of exclusionsWithLegacyType) {
        const mapped =
          LEGACY_INT_TO_MEDIA_TYPE[exclusion.type as unknown as string];
        if (mapped) exclusion.type = mapped;
      }
      await this.exclusionRepo.save(exclusionsWithLegacyType);
    }

    // Convert collection types
    const collectionsWithLegacyType = await this.collectionRepo
      .createQueryBuilder('collection')
      .where('collection.type IN (:...types)', {
        types: Object.keys(LEGACY_INT_TO_MEDIA_TYPE),
      })
      .getMany();

    if (collectionsWithLegacyType.length > 0) {
      this.logger.log(
        `Converting ${collectionsWithLegacyType.length} collection(s) from legacy integer types`,
      );
      for (const collection of collectionsWithLegacyType) {
        const mapped =
          LEGACY_INT_TO_MEDIA_TYPE[collection.type as unknown as string];
        if (mapped) collection.type = mapped;
      }
      await this.collectionRepo.save(collectionsWithLegacyType);
    }

    // Convert rule_group dataType
    const ruleGroupsWithLegacyType = await this.ruleGroupRepo
      .createQueryBuilder('rule_group')
      .where('rule_group.dataType IN (:...types)', {
        types: Object.keys(LEGACY_INT_TO_MEDIA_TYPE),
      })
      .getMany();

    if (ruleGroupsWithLegacyType.length > 0) {
      this.logger.log(
        `Converting ${ruleGroupsWithLegacyType.length} rule group(s) from legacy integer dataType`,
      );
      for (const ruleGroup of ruleGroupsWithLegacyType) {
        const mapped =
          LEGACY_INT_TO_MEDIA_TYPE[ruleGroup.dataType as unknown as string];
        if (mapped) ruleGroup.dataType = mapped;
      }
      await this.ruleGroupRepo.save(ruleGroupsWithLegacyType);
    }
  }

  private async correctExclusionTypes() {
    // get all exclusions without a type
    const exclusionsWithoutType = await this.exclusionRepo
      .createQueryBuilder('exclusion')
      .where('type is null')
      .getMany();

    if (exclusionsWithoutType.length === 0) {
      return;
    }

    this.logger.log(
      `Backfilling type for ${exclusionsWithoutType.length} exclusion(s) from media server metadata — this may take a moment on first run`,
    );

    const mediaServer = await this.mediaServerFactory.getService();

    // correct the type
    for (const el of exclusionsWithoutType) {
      const metaData = await mediaServer.getMetadata(el.mediaServerId);
      if (!metaData) {
        // remove record if not in media server
        await this.rulesService.removeExclusion(el.id);
      } else {
        // Assign MediaItemType string directly
        el.type = metaData?.type;
      }
    }

    // save edited data
    await this.exclusionRepo.save(exclusionsWithoutType);

    this.logger.log('Exclusion type backfill complete');
  }
}
