import {
  type BulkMediaItemResult,
  type BulkMediaResponse,
  DELETE_AFTER_MAX_DAYS,
  ECollectionLogType,
  isPerUserProperty,
  leftoverCleanupScope,
  MaintainerrEvent,
  MediaItemType,
  MediaLibrary,
  MediaServerType,
} from '@maintainerr/contracts';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { chunk, cloneDeep } from 'lodash';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { ArrTagItem, ServarrTagService } from '../actions/servarr-tag.service';
import cacheManager from '../api/lib/cache';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { TracearrApiService } from '../api/tracearr-api/tracearr-api.service';
import { CollectionsService } from '../collections/collections.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import {
  AlterableMediaContext,
  CollectionMediaChange,
} from '../collections/interfaces/collection-media.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { Notification } from '../notifications/entities/notification.entities';
import { RadarrSettings } from '../settings/entities/radarr_settings.entities';
import { Settings } from '../settings/entities/settings.entities';
import { SonarrSettings } from '../settings/entities/sonarr_settings.entities';
import { SportarrSettings } from '../settings/entities/sportarr_settings.entities';
import { RuleMigrationService } from '../settings/rule-migration.service';
import {
  Application,
  Property,
  RuleConstants,
  RulePossibility,
  RuleType,
} from './constants/rules.constants';
import { CommunityRule } from './dtos/communityRule.dto';
import { ExclusionContextDto } from './dtos/exclusion.dto';
import { RuleDto } from './dtos/rule.dto';
import { RuleDbDto } from './dtos/ruleDb.dto';
import { RuleUsersService } from './rule-users.service';
import { RuleGroupDto } from './dtos/ruleGroup.dto';
import { CommunityRuleKarma } from './entities/community-rule-karma.entities';
import { Exclusion } from './entities/exclusion.entities';
import { RuleGroup } from './entities/rule-group.entities';
import { Rules } from './entities/rules.entities';
import { unavailableRuleApplications } from './helpers/rule-application-availability.helper';
import { RuleComparatorServiceFactory } from './helpers/rule.comparator.service';
import { RuleYamlService } from './helpers/yaml.service';

export interface ReturnStatus {
  code: 0 | 1;
  result?: string;
  message?: string;
  skipped?: number;
}

// Each excluded item fans out server-side (child cascade + a live metadata
// read per traversed id), so this stays below RULE_EVALUATION_CONCURRENCY to
// avoid over-driving constrained media servers during a bulk run.
export const BULK_EXCLUSION_CONCURRENCY = 5;

@Injectable()
export class RulesService {
  private readonly communityUrl = 'https://community.maintainerr.info';

  ruleConstants: RuleConstants;
  constructor(
    @InjectRepository(Rules)
    private readonly rulesRepository: Repository<Rules>,
    @InjectRepository(RuleGroup)
    private readonly ruleGroupRepository: Repository<RuleGroup>,
    @InjectRepository(CollectionMedia)
    private readonly collectionMediaRepository: Repository<CollectionMedia>,
    @InjectRepository(CommunityRuleKarma)
    private readonly communityRuleKarmaRepository: Repository<CommunityRuleKarma>,
    @InjectRepository(Exclusion)
    private readonly exclusionRepo: Repository<Exclusion>,
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
    @InjectRepository(RadarrSettings)
    private readonly radarrSettingsRepo: Repository<RadarrSettings>,
    @InjectRepository(SonarrSettings)
    private readonly sonarrSettingsRepo: Repository<SonarrSettings>,
    @InjectRepository(SportarrSettings)
    private readonly sportarrSettingsRepo: Repository<SportarrSettings>,
    private readonly collectionService: CollectionsService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly connection: DataSource,
    private readonly ruleYamlService: RuleYamlService,
    private readonly ruleComparatorServiceFactory: RuleComparatorServiceFactory,
    private readonly ruleMigrationService: RuleMigrationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly servarrTagService: ServarrTagService,
    private readonly logger: MaintainerrLogger,
    private readonly tracearrApi: TracearrApiService,
    private readonly ruleUsersService: RuleUsersService,
  ) {
    logger.setContext(RulesService.name);
    this.ruleConstants = new RuleConstants();
  }

  private async getMediaServer(): Promise<IMediaServerService> {
    return this.mediaServerFactory.getService();
  }

  private usesTracearr(rules: Rules[]): boolean {
    return rules.some((rule) => {
      const parsedRule = JSON.parse(rule.ruleJson) as RuleDto;
      return (
        parsedRule.firstVal[0] === Application.TRACEARR ||
        parsedRule.lastVal?.[0] === Application.TRACEARR
      );
    });
  }

  async getRuleConstants(): Promise<RuleConstants> {
    const localConstants = cloneDeep(this.ruleConstants);
    const unavailable = new Set(await this.getUnavailableApplications());

    localConstants.applications = localConstants.applications.filter(
      (application) => !unavailable.has(application.id),
    );

    return localConstants;
  }

  /**
   * Rule Applications that cannot produce a value here - not set up, or not
   * the configured media server's companion. The editor hides them and the
   * executor warns when a group reads one, so both say the same thing.
   */
  async getUnavailableApplications(): Promise<Application[]> {
    const settings = await this.settingsRepo.findOne({ where: {} });

    return unavailableRuleApplications(settings, {
      radarr: await this.radarrSettingsRepo.exists(),
      sonarr: await this.sonarrSettingsRepo.exists(),
      sportarr: await this.sportarrSettingsRepo.exists(),
    });
  }
  async getRules(ruleGroupId: number): Promise<Rules[]> {
    try {
      return await this.connection
        .getRepository(Rules)
        .createQueryBuilder('rules')
        .where('ruleGroupId = :id', { id: ruleGroupId })
        .getMany();
    } catch (error) {
      this.logger.warn('Rules - Action failed');
      this.logger.debug(error);
      return undefined;
    }
  }

  async getRuleGroups(
    activeOnly = false,
    libraryId?: string,
    typeId?: number,
  ): Promise<RuleGroupDto[]> {
    try {
      const queryBuilder = this.connection
        .createQueryBuilder('rule_group', 'rg')
        // leftJoin for rules: allows rule groups without rules (useRules=false)
        .leftJoinAndSelect('rg.rules', 'r')
        // leftJoin for collection: collectionId may be null during media server migration
        .leftJoinAndSelect('rg.collection', 'c')
        .leftJoinAndSelect('rg.notifications', 'n')
        .where(
          activeOnly ? 'rg.isActive = true' : 'rg.isActive in (true, false)',
        );

      if (libraryId !== undefined) {
        queryBuilder.andWhere('rg.libraryId = :libraryId', { libraryId });
      } else if (typeId !== undefined) {
        queryBuilder.andWhere('c.type = :typeId', { typeId });
      } else {
        queryBuilder.andWhere("rg.libraryId != '-1'");
      }

      const rulegroups = await queryBuilder.orderBy('rg.id, r.id').getMany();
      // Ensure rules is always an array for each group
      for (const group of rulegroups) {
        if (!Array.isArray(group.rules)) {
          group.rules = [];
        }
      }
      return rulegroups as RuleGroupDto[];
    } catch (error) {
      this.logger.warn('Rules - Action failed');
      this.logger.debug(error);
      return undefined;
    }
  }

  async getRuleGroupsByIds(ids: number[]): Promise<RuleGroupDto[]> {
    if (ids.length === 0) {
      return [];
    }

    try {
      const rulegroups = await this.connection
        .createQueryBuilder('rule_group', 'rg')
        // leftJoin for rules: allows rule groups without rules (useRules=false)
        .leftJoinAndSelect('rg.rules', 'r')
        // leftJoin for collection: collectionId may be null during media server migration
        .leftJoinAndSelect('rg.collection', 'c')
        .leftJoinAndSelect('rg.notifications', 'n')
        .where('rg.id IN (:...ids)', { ids })
        .orderBy('rg.id, r.id')
        .getMany();
      // Ensure rules is always an array for each group
      for (const group of rulegroups) {
        if (!Array.isArray(group.rules)) {
          group.rules = [];
        }
      }
      return rulegroups as RuleGroupDto[];
    } catch (error) {
      this.logger.warn('Rules - Action failed');
      this.logger.debug(error);
      return undefined;
    }
  }

  async getRuleGroup(id: number): Promise<RuleGroupDto> {
    try {
      const rulegroup = await this.connection
        .createQueryBuilder('rule_group', 'rg')
        // leftJoin for rules: allows rule groups without rules (useRules=false)
        .leftJoinAndSelect('rg.rules', 'r')
        // leftJoin for collection: collectionId may be null during media server migration
        .leftJoinAndSelect('rg.collection', 'c')
        .leftJoinAndSelect('rg.notifications', 'n')
        .andWhere('rg.id = :id', { id })
        .orderBy('r.id')
        .getOne();
      // Ensure rules is always an array
      if (rulegroup && !Array.isArray(rulegroup.rules)) {
        rulegroup.rules = [];
      }
      return rulegroup as RuleGroupDto;
    } catch (error) {
      this.logger.warn('Rules - Action failed');
      this.logger.debug(error);
      return undefined;
    }
  }

  async getRuleGroupCount(): Promise<number> {
    return this.ruleGroupRepository.count();
  }

  async getRuleGroupById(ruleGroupId: number): Promise<RuleGroup> {
    try {
      return await this.ruleGroupRepository.findOne({
        where: { id: ruleGroupId },
        relations: { notifications: true },
      });
    } catch (error) {
      this.logger.warn('Rules - Action failed');
      this.logger.debug(error);
      return undefined;
    }
  }

  async getRuleGroupByCollectionId(id: number) {
    try {
      return await this.ruleGroupRepository.findOne({
        where: { collectionId: id },
        relations: { notifications: true },
      });
    } catch (error) {
      this.logger.warn('Rules - Action failed');
      this.logger.debug(error);
      return undefined;
    }
  }

  async deleteRuleGroup(ruleGroupId: number): Promise<ReturnStatus> {
    try {
      const group = await this.ruleGroupRepository.findOne({
        where: { id: ruleGroupId },
      });

      if (group) {
        if (group.collectionId) {
          // Behavior A: deleting a tagging group makes every member "leave" -
          // strip their *arr membership tags. The rows this needs are removed
          // by deleteCollection, so read them first but only write to the *arr
          // once the delete has gone through: a refused delete leaves the group
          // standing, and untagging it anyway is damage nothing undoes.
          let leavingMembers:
            { collection: Collection; items: ArrTagItem[] } | undefined;
          try {
            const collection = await this.collectionService.getCollection(
              group.collectionId,
            );
            if (collection?.tagInArr) {
              const members =
                (await this.collectionService.getCollectionMedia(
                  group.collectionId,
                )) ?? [];
              leavingMembers = {
                collection,
                items: members.map((m) => this.toArrTagItem(m)),
              };
            }
          } catch (error) {
            this.logger.debug(error);
          }

          // DB cascade doesn't work.. So do it manually
          const collectionDeleteResult =
            await this.collectionService.deleteCollection(group.collectionId);

          if (collectionDeleteResult.code !== 1) {
            // Plex refusing deletes is a persistent setting, so an opaque
            // failure leaves the group undeletable with no clue why.
            this.logger.warn(
              `Rulegroup ${ruleGroupId} was not deleted: ${collectionDeleteResult.message}`,
            );
            return this.createReturnStatus(
              false,
              collectionDeleteResult.message || 'Delete Failed',
            );
          }

          if (leavingMembers) {
            try {
              await this.servarrTagService.syncMembershipTags(
                leavingMembers.collection,
                [],
                leavingMembers.items,
              );
            } catch (error) {
              this.logger.debug(error);
            }
          }
        }
      }

      await this.exclusionRepo.delete({ ruleGroupId: ruleGroupId });
      await this.ruleGroupRepository.delete(ruleGroupId);

      if (group) {
        this.eventEmitter.emit(MaintainerrEvent.RuleGroup_Deleted, {
          ruleGroup: group,
        });
      }

      this.logger.log(
        `Removed rulegroup with id ${ruleGroupId} from the database`,
      );
      return this.createReturnStatus(true, 'Success');
    } catch (error) {
      this.logger.warn('Rulegroup deletion failed');
      this.logger.debug(error);
      return this.createReturnStatus(false, 'Delete Failed');
    }
  }

  // An id the media server does not know is the caller's mistake, but an empty
  // library list is not: every getLibraries path answers [] when the server is
  // unreachable or unconfigured, so only a list we could actually read proves
  // the id wrong. Blaming the caller for an outage is how a broken connection
  // gets read as a broken rule group.
  private async resolveLibraryOrFail(
    libraryId: string | undefined,
  ): Promise<MediaLibrary> {
    if (!libraryId) {
      throw new BadRequestException('A library is required');
    }

    const mediaServer = await this.getMediaServer();
    const libraries = await mediaServer.getLibraries();

    if (libraries.length === 0) {
      throw new BadGatewayException(
        'No libraries could be read from the media server. Check its connection in the settings.',
      );
    }

    const library = libraries.find((el) => el.id === libraryId);

    if (!library) {
      throw new BadRequestException(
        `Library ${libraryId} does not exist on the media server`,
      );
    }

    return library;
  }

  // Resolve the collection's media type: a movie library is always 'movie';
  // a TV library uses the rule group's selected dataType (show/season/episode),
  // defaulting to 'show'.
  private resolveCollectionType(
    libType: MediaItemType,
    params: RuleGroupDto,
  ): MediaItemType {
    if (libType === 'movie') {
      return 'movie';
    }
    return params.dataType !== undefined ? params.dataType : 'show';
  }

  async setRules(params: RuleGroupDto) {
    try {
      const managerState = this.validateSingleShowManager(params);
      if (managerState.code !== 1) {
        return managerState;
      }
      const windowState = this.validateDeletionWindow(params);
      if (windowState.code !== 1) {
        return windowState;
      }
      let state: ReturnStatus = this.createReturnStatus(true, 'Success');
      const knownUsernames = await this.getKnownUsernames(
        params.rules as RuleDto[],
      );
      for (const [index, rule] of (params.rules as RuleDto[]).entries()) {
        if (state.code === 1 && index > 0 && rule.operator == null) {
          state = this.createReturnStatus(
            false,
            'Operator is required for every rule after the first',
          );
        }
        this.normalizeRuleDiskPath(rule);
        this.normalizeRuleUsername(rule);
        if (state.code === 1) {
          state = this.validateRule(rule);
        }
        if (state.code === 1) {
          state = this.validateRuleServerSelection(
            rule,
            params.radarrSettingsId,
            params.sonarrSettingsId,
            params.sportarrSettingsId,
          );
        }
        if (state.code === 1) {
          state = this.validateRuleDiskPath(rule);
        }
        if (state.code === 1) {
          state = this.validateRuleUsername(rule, knownUsernames);
        }
      }

      if (state.code !== 1) {
        return state;
      }

      const lib = await this.resolveLibraryOrFail(params.libraryId);
      const collectionType = this.resolveCollectionType(lib.type, params);
      const collection = (
        await this.collectionService.createCollection({
          libraryId: params.libraryId,
          type: collectionType,
          title: params.name,
          description: params.description,
          arrAction: params.arrAction ? params.arrAction : 0,
          isActive: params.isActive,
          listExclusions: params.listExclusions ? params.listExclusions : false,
          // Only persist the leftover-folder cleanup opt-in for an action that
          // actually strands a folder. The UI hides the checkbox otherwise, so
          // this drops a value left behind by switching action after ticking
          // it - a destructive option must never end up enabled unseen.
          cleanupLeftoverFolders:
            leftoverCleanupScope(collectionType, params.arrAction ?? 0) !==
              undefined && params.cleanupLeftoverFolders
              ? true
              : false,
          // Force Seerr is unsupported for episode rules (Seerr has no
          // per-episode request granularity), so never persist it enabled. The
          // UI hides the toggle; this also clears the flag on re-save for rules
          // created before it was hidden.
          forceSeerr:
            collectionType !== 'episode' && params.forceSeerr ? true : false,
          tautulliWatchedPercentOverride:
            params.tautulliWatchedPercentOverride ?? null,
          radarrSettingsId: params.radarrSettingsId ?? null,
          sonarrSettingsId: params.sonarrSettingsId ?? null,
          sportarrSettingsId: params.sportarrSettingsId ?? null,
          radarrQualityProfileId: params.radarrQualityProfileId ?? null,
          sonarrQualityProfileId: params.sonarrQualityProfileId ?? null,
          sportarrQualityProfileId: params.sportarrQualityProfileId ?? null,
          tagInArr: params.tagInArr ?? false,
          visibleOnRecommended: params.collection?.visibleOnRecommended,
          visibleOnHome: params.collection?.visibleOnHome,
          deleteAfterDays: params.collection?.deleteAfterDays ?? null,
          manualCollection: params.collection?.manualCollection,
          manualCollectionName: params.collection?.manualCollectionName,
          keepLogsForMonths: params.collection?.keepLogsForMonths ?? 6,
          sortTitle: params.collection?.sortTitle,
          mediaServerSort: params.collection?.mediaServerSort ?? null,
          overlayEnabled: params.collection?.overlayEnabled,
          overlayTemplateId: params.collection?.overlayTemplateId ?? null,
        })
      )?.dbCollection;

      if (!collection) {
        throw new InternalServerErrorException('Failed to create collection');
      }

      const groupId = await this.createOrUpdateGroup(
        params.name,
        params.description,
        params.libraryId,
        collection.id,
        params.useRules !== undefined ? params.useRules : true,
        params.isActive !== undefined ? params.isActive : true,
        params.dataType !== undefined ? params.dataType : undefined,
        undefined,
        params.notifications,
        params.ruleHandlerCronSchedule,
      );

      if (params.useRules) {
        for (const rule of params.rules) {
          const ruleJson = JSON.stringify(rule);
          await this.rulesRepository.save([
            {
              ruleJson: ruleJson,
              ruleGroupId: groupId,
              section: (rule as RuleDbDto).section,
            },
          ]);
        }

        return state;
      }

      return state;
    } catch (error) {
      throw this.asSaveFailure(error);
    }
  }

  async updateRules(params: RuleGroupDto) {
    try {
      // Without one there is nothing to update, and TypeORM drops an undefined
      // id from the where clause rather than rejecting it.
      if (params.id == null) {
        throw new BadRequestException('A rule group id is required');
      }

      const managerState = this.validateSingleShowManager(params);
      if (managerState.code !== 1) {
        return managerState;
      }
      const windowState = this.validateDeletionWindow(params);
      if (windowState.code !== 1) {
        return windowState;
      }
      let state: ReturnStatus = this.createReturnStatus(true, 'Success');
      // Same gate getKnownUsernames applies internally: no rule names a user,
      // so nothing consults the list and neither read is needed.
      const knownUsernames = (params.rules as RuleDto[]).some((rule) =>
        rule.username?.trim(),
      )
        ? [
            ...(await this.getKnownUsernames(params.rules as RuleDto[])),
            ...(await this.getSavedUsernames(params.id)),
          ]
        : [];
      for (const [index, rule] of (params.rules as RuleDto[]).entries()) {
        if (state.code === 1 && index > 0 && rule.operator == null) {
          state = this.createReturnStatus(
            false,
            'Operator is required for every rule after the first',
          );
        }
        this.normalizeRuleDiskPath(rule);
        this.normalizeRuleUsername(rule);
        if (state.code === 1) {
          state = this.validateRule(rule);
        }
        if (state.code === 1) {
          state = this.validateRuleServerSelection(
            rule,
            params.radarrSettingsId,
            params.sonarrSettingsId,
            params.sportarrSettingsId,
          );
        }
        if (state.code === 1) {
          state = this.validateRuleDiskPath(rule);
        }
        if (state.code === 1) {
          state = this.validateRuleUsername(rule, knownUsernames);
        }
      }

      if (state.code === 1) {
        // get current group
        const group = await this.ruleGroupRepository.findOne({
          where: { id: params.id },
        });

        if (!group) {
          throw new NotFoundException('Rule group not found');
        }

        // Resolved before the crucial-setting wipe below, not after it: a
        // library we cannot accept must not cost the collection its members
        // on the way to being rejected.
        const lib = await this.resolveLibraryOrFail(params.libraryId);

        const dbCollection = group.collectionId
          ? await this.collectionService.getCollection(group.collectionId)
          : null;

        // Behavior A: if a tagging-enabled collection is about to have its members
        // wiped below (crucial-setting change) and tagInArr is being turned off in
        // the same save, capture the members first so the toggle reconcile can
        // still untag them (otherwise the rows - and our only record of them - are
        // gone before the reconcile runs).
        let preDeleteMembers: CollectionMedia[] | undefined;

        // if datatype or manual collection settings changed then remove the collection media and specific exclusions. The Plex collection will be removed later by updateCollection()
        // Only check if there's an existing collection
        if (
          dbCollection &&
          (group.dataType !== params.dataType ||
            (params.collection?.manualCollection ??
              dbCollection.manualCollection) !==
              dbCollection.manualCollection ||
            (params.collection?.manualCollectionName ??
              dbCollection.manualCollectionName) !==
              dbCollection.manualCollectionName ||
            params.libraryId !== dbCollection.libraryId)
        ) {
          this.logger.log(
            `A crucial setting of Rulegroup '${params.name}' was changed. Removed all media & specific exclusions`,
          );
          if (dbCollection.tagInArr) {
            preDeleteMembers =
              (await this.collectionService.getCollectionMedia(
                group.collectionId,
              )) ?? [];
          }
          await this.collectionMediaRepository.delete({
            collectionId: group.collectionId,
          });

          // Clean up the media server collection if it exists, then clear mediaServerId.
          // For Jellyfin: removes only items from this library, keeps the collection
          //   if other libraries still have items in it (shared manual collections).
          // For Plex: collections are per-library, so the entire collection is deleted.
          if (dbCollection.mediaServerId) {
            const mediaServer = await this.getMediaServer();
            try {
              // Use the OLD library ID - we're cleaning up items that belonged
              // to the previous library, not the one the rule is moving to.
              await mediaServer.cleanupCollectionForLibrary(
                dbCollection.mediaServerId,
                dbCollection.libraryId,
                !!dbCollection.manualCollection,
              );
            } catch (error) {
              // The link is dropped below either way, so a failure here leaves
              // a collection behind that Maintainerr no longer tracks. Say so:
              // it has to be removed by hand.
              this.logger.warn(
                `Failed to clean up media server collection ${dbCollection.mediaServerId} for '${dbCollection.title}' - it may need to be removed manually`,
              );
              this.logger.debug(error);
            }
          }
          await this.collectionService.saveCollection({
            ...dbCollection,
            mediaServerId: null,
          });

          await this.collectionService.addLogRecord(
            { id: group.collectionId } as Collection,
            'A crucial setting of the collection was updated. As a result all media and specific exclusions were removed',
            ECollectionLogType.COLLECTION,
          );

          await this.exclusionRepo.delete({ ruleGroupId: params.id });
        }

        // update or create the collection
        const collectionType = this.resolveCollectionType(lib.type, params);
        const collectionData = {
          libraryId: params.libraryId,
          type: collectionType,
          title: params.name,
          description: params.description,
          arrAction: params.arrAction ? params.arrAction : 0,
          isActive: params.isActive,
          listExclusions: params.listExclusions ? params.listExclusions : false,
          // Only persist the leftover-folder cleanup opt-in for an action that
          // actually strands a folder. The UI hides the checkbox otherwise, so
          // this drops a value left behind by switching action after ticking
          // it - a destructive option must never end up enabled unseen.
          cleanupLeftoverFolders:
            leftoverCleanupScope(collectionType, params.arrAction ?? 0) !==
              undefined && params.cleanupLeftoverFolders
              ? true
              : false,
          // Force Seerr is unsupported for episode rules (Seerr has no
          // per-episode request granularity), so never persist it enabled. The
          // UI hides the toggle; this also clears the flag on re-save for rules
          // created before it was hidden.
          forceSeerr:
            collectionType !== 'episode' && params.forceSeerr ? true : false,
          tautulliWatchedPercentOverride:
            params.tautulliWatchedPercentOverride ?? null,
          radarrSettingsId: params.radarrSettingsId ?? null,
          sonarrSettingsId: params.sonarrSettingsId ?? null,
          sportarrSettingsId: params.sportarrSettingsId ?? null,
          radarrQualityProfileId: params.radarrQualityProfileId ?? null,
          sonarrQualityProfileId: params.sonarrQualityProfileId ?? null,
          sportarrQualityProfileId: params.sportarrQualityProfileId ?? null,
          tagInArr: params.tagInArr ?? false,
          // If the collection block is left out of an update, keep the saved
          // values instead of sending undefined - otherwise we'd unlink a manual
          // collection or switch off Plex visibility.
          visibleOnRecommended:
            params.collection?.visibleOnRecommended ??
            dbCollection?.visibleOnRecommended,
          visibleOnHome:
            params.collection?.visibleOnHome ?? dbCollection?.visibleOnHome,
          deleteAfterDays: params.collection?.deleteAfterDays ?? null,
          manualCollection:
            params.collection?.manualCollection ??
            dbCollection?.manualCollection,
          manualCollectionName:
            params.collection?.manualCollectionName ??
            dbCollection?.manualCollectionName,
          keepLogsForMonths: params.collection?.keepLogsForMonths ?? 6,
          sortTitle: params.collection?.sortTitle,
          mediaServerSort: params.collection?.mediaServerSort ?? null,
          overlayEnabled: params.collection?.overlayEnabled,
          overlayTemplateId: params.collection?.overlayTemplateId ?? null,
        };

        // If there's no existing collection (e.g., after rule migration), create a new one
        // Otherwise, update the existing collection
        let collectionId: number | undefined;
        let savedCollection: Collection | undefined;
        if (group.collectionId) {
          const result = await this.collectionService.updateCollection({
            id: group.collectionId,
            ...collectionData,
          });
          savedCollection = result?.dbCollection as Collection | undefined;
          collectionId = savedCollection?.id;
        } else {
          const result =
            await this.collectionService.createCollection(collectionData);
          savedCollection = result?.dbCollection as Collection | undefined;
          collectionId = savedCollection?.id;
        }

        if (!collectionId) {
          throw new InternalServerErrorException(
            'Failed to create/update collection',
          );
        }

        // Apply collection sort immediately when it is newly enabled or changed.
        // The executor still reapplies on membership changes during normal cycles;
        // this covers save-time sort changes without otherwise touching contents.
        const previousSort = dbCollection?.mediaServerSort ?? null;
        const newSort = collectionData.mediaServerSort ?? null;
        if (newSort && previousSort !== newSort && savedCollection) {
          await this.collectionService.applyCollectionSort(savedCollection);
        }

        // Behavior A: one-time *arr membership-tag reconcile on a tagInArr toggle
        // - enabling tags current members, disabling untags them (ongoing changes
        // are handled by the executor's per-run deltas). Best-effort; awaited so
        // the backfill completes before the save returns.
        if (
          savedCollection &&
          (dbCollection?.tagInArr ?? false) !== savedCollection.tagInArr
        ) {
          await this.reconcileMembershipTagsOnToggle(
            dbCollection,
            savedCollection,
            preDeleteMembers,
          );
        }

        // update or create group
        const groupId = await this.createOrUpdateGroup(
          params.name,
          params.description,
          params.libraryId,
          collectionId,
          params.useRules !== undefined ? params.useRules : true,
          params.isActive !== undefined ? params.isActive : true,
          params.dataType !== undefined ? params.dataType : undefined,
          group.id,
          params.notifications,
          params.ruleHandlerCronSchedule,
        );

        // remove previous rules
        await this.rulesRepository.delete({
          ruleGroupId: groupId,
        });

        // create rules
        if (params.useRules) {
          for (const rule of params.rules) {
            const ruleJson = JSON.stringify(rule);
            await this.rulesRepository.save([
              {
                ruleJson: ruleJson,
                ruleGroupId: groupId,
                section: (rule as RuleDbDto).section,
              },
            ]);
          }
        }

        this.logger.log(`Successfully updated rulegroup '${params.name}'.`);
        return state;
      } else {
        return state;
      }
    } catch (error) {
      throw this.asSaveFailure(error);
    }
  }

  // A rule group that could not be saved answers with a status the caller can
  // act on, not a 201 carrying a failure in the body. Anything already
  // classified (the group is gone, the collection could not be written) keeps
  // its own status; only an unclassified fault becomes a 500.
  private asSaveFailure(error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    this.logger.error('Failed to save the rule group');
    this.logger.debug(error);
    return new InternalServerErrorException('Failed to save the rule group');
  }

  // A collection_media row reduced to the fields ServarrTagService needs to
  // resolve an item to its *arr entity (id + provider-id fallbacks).
  private toArrTagItem(m: CollectionMedia) {
    return {
      mediaServerId: m.mediaServerId,
      tmdbId: m.tmdbId,
      tvdbId: m.tvdbId,
    };
  }

  // Behavior A: reconcile *arr membership tags after a tagInArr toggle
  // (best-effort, off the save response path). Enabling tags all current members;
  // disabling untags them using the previous collection (still tagInArr=true, with
  // its old title) so the correct label is removed even if renamed in the same save.
  // `preDeleteMembers` covers the disable case where a crucial-setting change in the
  // same save already wiped the rows - pass the snapshot taken before the wipe.
  private async reconcileMembershipTagsOnToggle(
    previous: Collection | undefined,
    saved: Collection,
    preDeleteMembers?: CollectionMedia[],
  ): Promise<void> {
    try {
      if (saved.tagInArr) {
        const members =
          (await this.collectionService.getCollectionMedia(saved.id)) ?? [];
        await this.servarrTagService.syncMembershipTags(
          saved,
          members.map((m) => this.toArrTagItem(m)),
          [],
        );
      } else if (previous) {
        const members =
          preDeleteMembers ??
          (await this.collectionService.getCollectionMedia(saved.id)) ??
          [];
        await this.servarrTagService.syncMembershipTags(
          previous,
          [],
          members.map((m) => this.toArrTagItem(m)),
        );
      }
    } catch (error) {
      this.logger.debug(error);
    }
  }

  // The provider ids cached on a collection_media row, used as *arr tag
  // resolution fallbacks (Behavior B) so an item resolves even when its
  // media-server metadata omits tmdb/tvdb. Returns nulls when not found.
  private async getCollectionMediaProviderIds(
    collectionId: number,
    mediaServerId: string,
  ): Promise<{ tmdbId?: number | null; tvdbId?: number | null }> {
    const row = await this.collectionMediaRepository.findOne({
      where: { collectionId, mediaServerId },
    });
    return { tmdbId: row?.tmdbId ?? null, tvdbId: row?.tvdbId ?? null };
  }

  // Behavior B: resolve the single configured *arr instance for a GLOBAL
  // exclusion (no collection). Skipped (null) when none or several instances of
  // the item's type exist, since the tag target would then be ambiguous.
  private async resolveGlobalExclusionInstance(
    type: MediaItemType | undefined,
  ): Promise<{ radarrSettingsId?: number; sonarrSettingsId?: number } | null> {
    if (type === 'movie') {
      const all = await this.radarrSettingsRepo.find();
      return all.length === 1 ? { radarrSettingsId: all[0].id } : null;
    }
    if (type === 'show') {
      const all = await this.sonarrSettingsRepo.find();
      return all.length === 1 ? { sonarrSettingsId: all[0].id } : null;
    }
    return null;
  }

  // Behavior B: apply or remove the protective *arr tag for one excluded
  // top-level item, shared by every exclusion entry/exit path (scoped + global,
  // POST + DELETE). The settings gate is checked by the caller. A scoped exclusion
  // takes its instance and (authoritative, non-null) type from the rule group's
  // collection; a global one resolves the single configured instance. Removal is
  // conservative and must run AFTER the rows are deleted: it leaves the tag in
  // place if any exclusion for the item survives (another rule group or a global
  // one), so a still-excluded item keeps its protection - last-exclusion-wins.
  private async syncExclusionTag(
    mode: 'add' | 'remove',
    item: { mediaServerId: string; type: MediaItemType | undefined },
    collectionId: number | undefined,
  ): Promise<void> {
    let instance: {
      radarrSettingsId?: number | null;
      sonarrSettingsId?: number | null;
    } | null;
    let type = item.type;
    let hints: { tmdbId?: number | null; tvdbId?: number | null } = {};

    if (collectionId) {
      const collection =
        await this.collectionService.getCollection(collectionId);
      if (!collection) {
        return;
      }
      instance = {
        radarrSettingsId: collection.radarrSettingsId,
        sonarrSettingsId: collection.sonarrSettingsId,
      };
      // collection.type is always set; prefer it over the exclusion row's nullable
      // type (old rows predate the type column) so the right service is chosen.
      type = collection.type ?? item.type;
      hints = await this.getCollectionMediaProviderIds(
        collectionId,
        item.mediaServerId,
      );
    } else {
      instance = await this.resolveGlobalExclusionInstance(item.type);
      if (!instance) {
        return;
      }
    }

    if (mode === 'remove') {
      const remaining = await this.exclusionRepo.count({
        where: { mediaServerId: item.mediaServerId },
      });
      if (remaining > 0) {
        return;
      }
    }

    const target = { mediaServerId: item.mediaServerId, type, ...hints };
    if (mode === 'add') {
      await this.servarrTagService.applyExclusionTag(target, instance);
    } else {
      await this.servarrTagService.removeExclusionTag(target, instance);
    }
  }

  /**
   * Ids a context action applies to. The walk reads the media server, so a
   * failure means we do not know what to act on - reported as a failed status
   * rather than swallowed into "nothing to do".
   */
  private async resolveContextActionIdsOrFail(
    mediaServer: IMediaServerService,
    collectionType: MediaItemType | undefined,
    context: { type: MediaItemType; id: string },
    mediaId: string,
  ): Promise<CollectionMediaChange[] | undefined> {
    try {
      const ids = await mediaServer.getAllIdsForContextAction(
        collectionType,
        context,
        mediaId,
      );
      return ids.map((id) => ({ mediaServerId: id }));
    } catch (error) {
      this.logger.warn(
        `Could not resolve which items to act on for media ${mediaId}`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  /**
   * `handledIds` names the ids the exclusion resolved to. A caller pairing a
   * collection drop with the exclusion has to use them: a season or episode
   * collection holds those children, not the show the selection entered
   * through, so dropping the entry point matches nothing.
   */
  async setExclusion(
    data: ExclusionContextDto,
  ): Promise<ReturnStatus & { handledIds?: string[] }> {
    const mediaServer = await this.getMediaServer();
    let handleMedia: CollectionMediaChange[] = [];
    // The top-level excluded item's type (movie/show/…) drives Behavior B below.
    let topLevelType: MediaItemType | undefined;

    if (data.collectionId) {
      const group = await this.ruleGroupRepository.findOne({
        where: {
          collectionId: data.collectionId,
        },
      });
      // A collection created outside a rule group has nothing to scope to.
      if (!group) {
        this.logger.warn(
          `Collection ${data.collectionId} has no rule group, cannot set a scoped exclusion`,
        );
        return this.createReturnStatus(false, 'Failed - no rule group');
      }
      // The selection's own type, not the collection's: a show reaching a
      // season collection has to traverse down to its seasons. Naming it a
      // season instead makes the traversal stop and write a row for the show.
      const metaData = await mediaServer.getMetadata(String(data.mediaId));
      if (!metaData?.type) {
        this.logger.warn(
          `No metadata found for media ${data.mediaId}, cannot set exclusion`,
        );
        return this.createReturnStatus(false, 'Failed - no metadata');
      }

      // get media - traverse show -> seasons -> episodes if needed
      const resolved = await this.resolveContextActionIdsOrFail(
        mediaServer,
        group.dataType,
        data.context
          ? { type: data.context.type, id: String(data.context.id) }
          : { type: metaData.type, id: String(data.mediaId) },
        String(data.mediaId),
      );
      if (!resolved) {
        return this.createReturnStatus(
          false,
          'Failed - media server unreadable',
        );
      }
      handleMedia = resolved;
      data.ruleGroupId = group.id;
      topLevelType = metaData.type;
    } else {
      // get type from metadata
      const metaData = await mediaServer.getMetadata(String(data.mediaId));
      if (!metaData?.type) {
        this.logger.warn(
          `No metadata found for media ${data.mediaId}, cannot set exclusion`,
        );
        return this.createReturnStatus(false, 'Failed - no metadata');
      }

      // get media - traverse show -> seasons -> episodes if needed
      const resolved = await this.resolveContextActionIdsOrFail(
        mediaServer,
        undefined,
        data.context
          ? { type: data.context.type, id: String(data.context.id) }
          : { type: metaData.type, id: String(data.mediaId) },
        String(data.mediaId),
      );
      if (!resolved) {
        return this.createReturnStatus(
          false,
          'Failed - media server unreadable',
        );
      }
      handleMedia = resolved;
      topLevelType = metaData.type;
    }
    try {
      // add all items
      for (const media of handleMedia) {
        const metaData = await mediaServer.getMetadata(media.mediaServerId);

        // Global subsumes scoped: skip a rule-group exclusion when the item is
        // already globally excluded (an item is global or scoped, never both).
        if (data.ruleGroupId !== undefined) {
          const existingGlobal = await this.exclusionRepo.findOne({
            where: {
              mediaServerId: media.mediaServerId,
              ruleGroupId: IsNull(),
            },
          });
          if (existingGlobal) {
            this.logger.log(
              `Media ${media.mediaServerId} is already globally excluded; skipped rule group ${data.ruleGroupId} exclusion`,
            );
            continue;
          }
        }

        const old = await this.exclusionRepo.findOne({
          where: {
            mediaServerId: media.mediaServerId,
            ...(data.ruleGroupId !== undefined
              ? { ruleGroupId: data.ruleGroupId }
              : { ruleGroupId: IsNull() }),
          },
        });

        await this.exclusionRepo.save([
          {
            ...old,
            mediaServerId: media.mediaServerId,
            // ruleGroupId is only set if it's available
            ...(data.ruleGroupId !== undefined
              ? { ruleGroupId: data.ruleGroupId }
              : { ruleGroupId: null }),
            // set parent
            parent: data.mediaId ? data.mediaId : null,
            // set media type
            type: metaData?.type,
          },
        ]);

        // Global subsumes scoped: a new global exclusion drops the item's
        // now-redundant rule-group exclusions.
        if (data.ruleGroupId === undefined) {
          await this.exclusionRepo.delete({
            mediaServerId: media.mediaServerId,
            ruleGroupId: Not(IsNull()),
          });
        }

        // add collection log record if needed
        if (data.collectionId) {
          await this.collectionService.CollectionLogRecordForChild(
            media.mediaServerId,
            data.collectionId,
            'exclude',
          );
        }

        this.logger.log(
          `Added ${
            data.ruleGroupId === undefined ? 'global ' : ''
          }exclusion for media with id ${media.mediaServerId} ${
            data.ruleGroupId !== undefined
              ? `and rulegroup id ${data.ruleGroupId}`
              : ''
          } `,
        );
      }

      // Behavior B (https://features.maintainerr.info/posts/81): apply the
      // protective *arr tag to the top-level excluded item once (data.mediaId),
      // not each traversed season/episode id. Covers both collection-scoped and
      // global exclusions (a global exclusion resolves the single configured *arr
      // instance). Best-effort; never blocks the exclusion.
      if (this.servarrTagService.anyExclusionTaggingEnabled()) {
        await this.syncExclusionTag(
          'add',
          { mediaServerId: String(data.mediaId), type: topLevelType },
          data.collectionId,
        );
      }

      return {
        ...this.createReturnStatus(true, 'Success'),
        handledIds: handleMedia.map((media) => media.mediaServerId),
      };
    } catch (error) {
      this.logger.warn(
        `Adding exclusion for media ID ${data.mediaId} and rulegroup id ${data.ruleGroupId} failed.`,
      );
      this.logger.debug(error);
      return this.createReturnStatus(false, 'Failed');
    }
  }

  async setBulkExclusions(
    mediaIds: string[],
    collectionId?: number,
    context?: AlterableMediaContext,
  ): Promise<BulkMediaResponse> {
    const uniqueMediaIds = [...new Set(mediaIds)];

    // Collapse ids nested under another selected id (a show plus one of its
    // seasons/episodes): excluding both concurrently races setExclusion's
    // find-then-save on the same row, and the exclusion table has no unique
    // constraint to stop the duplicate. The ancestor's cascade already covers
    // the child, so the child just reports the ancestor's outcome. This runs
    // for a scoped request too: a season collection expands a selected show to
    // its seasons, which is the same row a separately selected season writes.
    const coveredBy = new Map<string, string>();
    const idSet = new Set(uniqueMediaIds);
    const mediaServer = await this.getMediaServer();
    for (const batch of chunk(uniqueMediaIds, BULK_EXCLUSION_CONCURRENCY)) {
      await Promise.all(
        batch.map(async (mediaId) => {
          const metadata = await mediaServer.getMetadata(mediaId);
          const ancestorId = [metadata?.parentId, metadata?.grandparentId].find(
            (id) => id !== undefined && id !== mediaId && idSet.has(id),
          );
          if (ancestorId) {
            coveredBy.set(mediaId, ancestorId);
          }
        }),
      );
    }

    const resultById = new Map<string, BulkMediaItemResult>();
    const handledByRoot = new Map<string, string[]>();
    const rootIds = uniqueMediaIds.filter((id) => !coveredBy.has(id));

    for (const batch of chunk(rootIds, BULK_EXCLUSION_CONCURRENCY)) {
      await Promise.all(
        batch.map(async (mediaId) => {
          try {
            const { handledIds, ...result } = await this.setExclusion({
              mediaId,
              collectionId,
              context,
            });

            if (handledIds) {
              handledByRoot.set(mediaId, handledIds);
            }

            resultById.set(mediaId, {
              mediaId,
              code: result.code,
              ...(result.message ? { message: result.message } : {}),
            });
          } catch (error) {
            this.logger.warn(`Bulk exclusion failed for media ${mediaId}`);
            this.logger.debug(error);
            resultById.set(mediaId, {
              mediaId,
              code: 0,
              message: 'Failed - see server logs',
            });
          }
        }),
      );
    }

    // Excluding also drops the items from the collections it covers, the
    // pairing the per-item action performs. After the exclusions, so a failed
    // one never silently removes its item. The drop names the ids the exclusion
    // resolved to, which is what the collection holds.
    const excludedIds = rootIds.filter(
      (mediaId) => resultById.get(mediaId)?.code === 1,
    );
    const members = [
      ...new Set(
        excludedIds.flatMap((mediaId) => handledByRoot.get(mediaId) ?? []),
      ),
    ].map((mediaServerId) => ({ mediaServerId }));

    if (members.length > 0) {
      // A global exclusion says the items belong in no collection at all.
      const removed =
        collectionId === undefined
          ? (await this.collectionService.removeFromAllCollections(members))
              .code === 1
          : Boolean(
              await this.collectionService.removeFromCollection(
                collectionId,
                members,
              ),
            );

      if (!removed) {
        for (const mediaId of excludedIds) {
          resultById.set(mediaId, {
            mediaId,
            code: 0,
            message:
              collectionId === undefined
                ? 'Excluded, but not removed from every collection'
                : 'Excluded, but not removed from the collection',
          });
        }
      }
    }

    const results = uniqueMediaIds.map((mediaId): BulkMediaItemResult => {
      let rootId = mediaId;
      while (coveredBy.has(rootId)) {
        rootId = coveredBy.get(rootId);
      }
      return { ...resultById.get(rootId), mediaId };
    });

    return { results };
  }

  /**
   * Scoped like `setBulkExclusions`: a collection means "stop excluding these
   * from that collection", no collection means every exclusion they carry.
   * Removal goes per row through `removeExclusion`, so the collection log and
   * the *arr tag sync stay exactly as the single-item path.
   */
  async removeBulkExclusions(
    mediaIds: string[],
    collectionId?: number,
    context?: AlterableMediaContext,
  ): Promise<BulkMediaResponse> {
    const uniqueMediaIds = [...new Set(mediaIds)];
    let ruleGroupId: number | undefined;
    let collectionType: MediaItemType | undefined;

    if (collectionId !== undefined) {
      const group = await this.ruleGroupRepository.findOne({
        where: { collectionId },
      });
      if (!group) {
        this.logger.warn(
          `Collection ${collectionId} has no rule group, cannot remove scoped exclusions`,
        );
        return {
          results: uniqueMediaIds.map((mediaId) => ({
            mediaId,
            code: 0 as const,
            message: 'Failed - no rule group',
          })),
        };
      }
      ruleGroupId = group.id;
      collectionType = group.dataType;
    }

    // A narrowed request names the one season or episode to stop excluding, so
    // it matches only what that narrowing resolves to. The entry point stays
    // excluded, exactly as the single-item path behaves.
    const narrowedIds = context
      ? await this.resolveContextActionIdsOrFail(
          await this.getMediaServer(),
          collectionType,
          { type: context.type, id: String(context.id) },
          // The schema admits a context only alongside a single media id.
          uniqueMediaIds[0],
        )
      : undefined;

    if (context && !narrowedIds) {
      return {
        results: uniqueMediaIds.map((mediaId) => ({
          mediaId,
          code: 0 as const,
          message: 'Failed - media server unreadable',
        })),
      };
    }

    // `parent` records the entry point of the original exclusion request, so
    // matching it too picks up the rows an excluded show cascaded to its
    // seasons and episodes. Without it they survive the removal and keep the
    // item excluded while the caller is told it succeeded.
    const selectedIds = new Set(uniqueMediaIds);
    const exclusions = await this.exclusionRepo.find({
      where: narrowedIds
        ? { mediaServerId: In(narrowedIds.map((media) => media.mediaServerId)) }
        : [
            { mediaServerId: In(uniqueMediaIds) },
            { parent: In(uniqueMediaIds) },
          ],
    });
    // An item is either globally excluded or scoped-excluded, never both, so
    // the row keeping it out of this collection is whichever one exists.
    const rowIdsByMediaId = new Map<string, number[]>();
    for (const exclusion of exclusions) {
      if (
        ruleGroupId !== undefined &&
        exclusion.ruleGroupId != null &&
        exclusion.ruleGroupId !== ruleGroupId
      ) {
        continue;
      }
      // A cascaded row reports under the id that was selected, not its own. A
      // narrowed request reached every row it matched through its one
      // selection, whatever entry point originally wrote them.
      let coveringId = uniqueMediaIds[0];
      if (!narrowedIds) {
        coveringId = selectedIds.has(exclusion.mediaServerId)
          ? exclusion.mediaServerId
          : String(exclusion.parent);
      }
      const rowIds = rowIdsByMediaId.get(coveringId) ?? [];
      rowIds.push(exclusion.id);
      rowIdsByMediaId.set(coveringId, rowIds);
    }

    const resultById = new Map<string, BulkMediaItemResult>();

    for (const batch of chunk(uniqueMediaIds, BULK_EXCLUSION_CONCURRENCY)) {
      await Promise.all(
        batch.map(async (mediaId) => {
          try {
            // Nothing excluding it here already is the requested end state.
            let result: ReturnStatus = { code: 1, message: 'Success' };
            for (const exclusionId of rowIdsByMediaId.get(mediaId) ?? []) {
              const rowResult = await this.removeExclusion(exclusionId);
              if (rowResult.code !== 1) {
                result = rowResult;
              }
            }

            resultById.set(mediaId, {
              mediaId,
              code: result.code,
              ...(result.message ? { message: result.message } : {}),
            });
          } catch (error) {
            this.logger.warn(
              `Bulk exclusion removal failed for media ${mediaId}`,
            );
            this.logger.debug(error);
            resultById.set(mediaId, {
              mediaId,
              code: 0,
              message: 'Failed - see server logs',
            });
          }
        }),
      );
    }

    return {
      results: uniqueMediaIds.map((mediaId): BulkMediaItemResult => ({
        ...resultById.get(mediaId),
        mediaId,
      })),
    };
  }

  async removeExclusion(id: number) {
    try {
      const exclcusion = await this.exclusionRepo.findOne({
        where: {
          id: id,
        },
      });

      if (!exclcusion) {
        this.logger.debug(`Exclusion with id ${id} not found, already removed`);
        return this.createReturnStatus(true, 'Success');
      }

      // global exclusions (null ruleGroupId) have no rule group to log against
      let scopedCollectionId: number | undefined;
      if (exclcusion.ruleGroupId != null) {
        const rulegroup = await this.ruleGroupRepository.findOne({
          where: {
            id: exclcusion.ruleGroupId,
          },
        });
        // add collection log record
        if (rulegroup) {
          scopedCollectionId = rulegroup.collectionId;
          await this.collectionService.CollectionLogRecordForChild(
            exclcusion.mediaServerId,
            rulegroup.collectionId,
            'include',
          );
        }
      }

      // do delete
      await this.exclusionRepo.delete(id);

      // Behavior B (https://features.maintainerr.info/posts/81): opt-in removal of
      // the protective *arr tag on un-exclude, for both scoped and global
      // exclusions. Conservative by default (off) so a manually-set tag is never
      // stripped; only ever touches the configured label. Runs after the delete so
      // the shared-tag guard can see that no other exclusion still wants the tag.
      if (this.servarrTagService.anyExclusionUntaggingEnabled()) {
        await this.syncExclusionTag(
          'remove',
          { mediaServerId: exclcusion.mediaServerId, type: exclcusion.type },
          scopedCollectionId,
        );
      }

      this.logger.log(
        `Removed exclusion ${id} for media ${exclcusion.mediaServerId} (${
          exclcusion.ruleGroupId != null
            ? `rule group ${exclcusion.ruleGroupId}`
            : 'global'
        })`,
      );
      return this.createReturnStatus(true, 'Success');
    } catch (error) {
      this.logger.warn(`Removing exclusion with id ${id} failed.`);
      this.logger.debug(error);
      return this.createReturnStatus(false, 'Failed');
    }
  }

  async removeExclusionWitData(data: ExclusionContextDto) {
    const mediaServer = await this.getMediaServer();
    let handleMedia: CollectionMediaChange[] = [];
    let topLevelType: MediaItemType | undefined;

    if (data.collectionId) {
      const group = await this.ruleGroupRepository.findOne({
        where: {
          collectionId: data.collectionId,
        },
      });
      // Same as setExclusion: no rule group means no scope to remove from.
      if (!group) {
        this.logger.warn(
          `Collection ${data.collectionId} has no rule group, cannot remove a scoped exclusion`,
        );
        return this.createReturnStatus(false, 'Failed - no rule group');
      }

      data.ruleGroupId = group.id;
      // The selection's own type, as setExclusion resolves it: naming the entry
      // point after the collection makes the traversal stop on the entry point.
      const metaData = await mediaServer.getMetadata(String(data.mediaId));
      if (!metaData?.type) {
        this.logger.warn(
          `No metadata found for media ${data.mediaId}, cannot remove exclusion`,
        );
        return this.createReturnStatus(false, 'Failed - no metadata');
      }

      topLevelType = metaData.type;
      // get media - traverse show -> seasons -> episodes if needed
      const resolved = await this.resolveContextActionIdsOrFail(
        mediaServer,
        group.dataType,
        data.context
          ? { type: data.context.type, id: String(data.context.id) }
          : { type: metaData.type, id: String(data.mediaId) },
        String(data.mediaId),
      );
      if (!resolved) {
        return this.createReturnStatus(
          false,
          'Failed - media server unreadable',
        );
      }
      handleMedia = resolved;
    } else {
      // Without a context the entry point removes its own rows, typed like
      // setExclusion writes them (a bare global un-exclude, API-only today).
      let entryPoint = data.context
        ? { type: data.context.type, id: String(data.context.id) }
        : undefined;
      if (!entryPoint) {
        const metaData = await mediaServer.getMetadata(String(data.mediaId));
        if (!metaData?.type) {
          this.logger.warn(
            `No metadata found for media ${data.mediaId}, cannot remove exclusion`,
          );
          return this.createReturnStatus(false, 'Failed - no metadata');
        }
        topLevelType = metaData.type;
        entryPoint = { type: metaData.type, id: String(data.mediaId) };
      }
      // get media - traverse show -> seasons -> episodes if needed
      const resolved = await this.resolveContextActionIdsOrFail(
        mediaServer,
        undefined,
        entryPoint,
        String(data.mediaId),
      );
      if (!resolved) {
        return this.createReturnStatus(
          false,
          'Failed - media server unreadable',
        );
      }
      handleMedia = resolved;
    }

    try {
      for (const media of handleMedia) {
        await this.exclusionRepo.delete({
          mediaServerId: media.mediaServerId,
          ...(data.ruleGroupId !== undefined
            ? { ruleGroupId: data.ruleGroupId }
            : {}),
        });

        // add collection log record if needed
        if (data.collectionId) {
          await this.collectionService.CollectionLogRecordForChild(
            media.mediaServerId,
            data.collectionId,
            'include',
          );
        }
        this.logger.log(
          `Removed ${
            data.ruleGroupId === undefined ? 'global ' : ''
          }exclusion for media with id ${media.mediaServerId} ${
            data.ruleGroupId !== undefined
              ? `and rulegroup id ${data.ruleGroupId}`
              : ''
          } `,
        );
      }

      // Behavior B (https://features.maintainerr.info/posts/81): opt-in removal of
      // the protective *arr tag on un-exclude - this is the POST /rules/exclusion
      // remove path used by the media modal. Untag the top-level item once, after
      // its rows are deleted so the shared-tag guard is accurate.
      if (this.servarrTagService.anyExclusionUntaggingEnabled()) {
        const type =
          topLevelType ??
          (await mediaServer.getMetadata(String(data.mediaId)))?.type;
        await this.syncExclusionTag(
          'remove',
          { mediaServerId: String(data.mediaId), type },
          data.collectionId,
        );
      }

      return this.createReturnStatus(true, 'Success');
    } catch (error) {
      this.logger.warn(
        `Removing exclusion for media with id ${data.mediaId} failed.`,
      );
      this.logger.debug(error);
      return this.createReturnStatus(false, 'Failed');
    }
  }

  async removeAllExclusion(mediaServerId: string) {
    const mediaServer = await this.getMediaServer();
    // get type from metadata
    let handleMedia: CollectionMediaChange[] = [];

    const metaData = await mediaServer.getMetadata(mediaServerId);
    if (!metaData?.type) {
      this.logger.warn(
        `No metadata found for media ${mediaServerId}, cannot remove exclusions`,
      );
      return this.createReturnStatus(false, 'Failed - no metadata');
    }

    // get media - traverse show -> seasons -> episodes if needed
    const ids = await mediaServer.getAllIdsForContextAction(
      undefined,
      { type: metaData.type, id: mediaServerId },
      mediaServerId,
    );
    handleMedia = ids.map((id) => ({ mediaServerId: id }));

    try {
      for (const media of handleMedia) {
        await this.exclusionRepo.delete({ mediaServerId: media.mediaServerId });
      }

      // Behavior B (https://features.maintainerr.info/posts/81): opt-in removal of
      // the protective *arr tag once every exclusion for the item is cleared.
      // Global instance resolution; the guard always passes (no rows remain).
      // Known limitation: with multiple *arr instances the global resolver is
      // ambiguous (skips), so a scoped-excluded item's tag may linger here.
      if (this.servarrTagService.anyExclusionUntaggingEnabled()) {
        await this.syncExclusionTag(
          'remove',
          { mediaServerId, type: metaData.type },
          undefined,
        );
      }

      return this.createReturnStatus(true, 'Success');
    } catch (error) {
      this.logger.warn(
        `Removing all exclusions with mediaServerId ${mediaServerId} failed.`,
      );
      this.logger.debug(error);
      return this.createReturnStatus(false, 'Failed');
    }
  }

  async getExclusions(
    rulegroupId?: number,
    mediaServerId?: string,
  ): Promise<Exclusion[]> {
    try {
      if (rulegroupId || mediaServerId) {
        let exclusions: Exclusion[] = [];
        if (rulegroupId) {
          exclusions = await this.exclusionRepo.find({
            where: { ruleGroupId: rulegroupId },
          });
        } else {
          exclusions = await this.exclusionRepo
            .createQueryBuilder('exclusion')
            .where(
              'exclusion.mediaServerId = :mediaServerId OR exclusion.parent = :mediaServerId',
              {
                mediaServerId,
              },
            )
            .getMany();
        }

        return rulegroupId
          ? exclusions.concat(
              await this.exclusionRepo.find({
                where: {
                  ruleGroupId: IsNull(),
                },
              }),
            )
          : exclusions;
      }
      return [];
    } catch (error) {
      this.logger.warn('Rules - Action failed');
      this.logger.debug(error);
      return undefined;
    }
  }

  async getAllExclusions(): Promise<Exclusion[]> {
    try {
      return await this.exclusionRepo.find();
    } catch (error) {
      this.logger.warn('Rules - Action failed');
      this.logger.debug(error);
      return [];
    }
  }

  private validateRule(rule: RuleDto): ReturnStatus {
    try {
      const val1: Property = this.ruleConstants.applications
        .find((el) => el.id === rule.firstVal?.[0])
        ?.props.find((el) => el.id === rule.firstVal?.[1]);
      // Guard against a first value whose application/property no longer exists
      // (e.g. an imported rule referencing an unconfigured service). Returning a
      // clean status beats throwing a TypeError that surfaces as a generic
      // "Unexpected error occurred".
      if (!val1) {
        return this.createReturnStatus(
          false,
          'First value is not available for this server',
        );
      }
      if (
        [RulePossibility.EXISTS, RulePossibility.NOT_EXISTS].includes(
          +rule.action,
        )
      ) {
        return val1.type.possibilities.includes(+rule.action)
          ? this.createReturnStatus(true, 'Success')
          : this.createReturnStatus(false, 'Action is not supported on type');
      }

      if (rule.lastVal) {
        const val2: Property = this.ruleConstants.applications
          .find((el) => el.id === rule.lastVal[0])
          ?.props.find((el) => el.id === rule.lastVal[1]);
        if (!val2) {
          return this.createReturnStatus(
            false,
            'Second value is not available for this server',
          );
        }
        if (
          val1.type === val2.type ||
          ([RuleType.TEXT_LIST, RuleType.TEXT].includes(val1.type) &&
            [RuleType.TEXT_LIST, RuleType.TEXT].includes(val2.type))
        ) {
          if (val1.type.possibilities.includes(+rule.action)) {
            return this.createReturnStatus(true, 'Success');
          } else {
            return this.createReturnStatus(
              false,
              'Action is not supported on type',
            );
          }
        } else {
          return this.createReturnStatus(false, "Types don't match");
        }
      } else if (rule.customVal) {
        // Same reason as the first-value guard: a custom value without a rule
        // type threw a TypeError below, which surfaced as the catch-all
        // "Unexpected error occurred" instead of naming what was wrong.
        if (rule.customVal.ruleTypeId == null) {
          return this.createReturnStatus(
            false,
            'Custom value is missing a rule type',
          );
        }
        if (
          val1.type.toString() === rule.customVal.ruleTypeId.toString() ||
          (val1.type === RuleType.DATE &&
            rule.customVal.ruleTypeId === +RuleType.NUMBER) ||
          (val1.type === RuleType.TEXT_LIST &&
            rule.customVal.ruleTypeId === +RuleType.NUMBER &&
            [
              RulePossibility.COUNT_EQUALS,
              RulePossibility.COUNT_NOT_EQUALS,
              RulePossibility.COUNT_BIGGER,
              RulePossibility.COUNT_SMALLER,
            ].includes(+rule.action)) ||
          (val1.type == RuleType.TEXT_LIST &&
            rule.customVal.ruleTypeId.toString() == RuleType.TEXT.toString())
        ) {
          if (val1.type.possibilities.includes(+rule.action)) {
            return this.createReturnStatus(true, 'Success');
          } else {
            return this.createReturnStatus(
              false,
              'Action is not supported on type',
            );
          }
        }
        return this.createReturnStatus(false, 'Validation failed');
      } else {
        return this.createReturnStatus(false, 'No second value found');
      }
    } catch (error) {
      this.logger.error('Unexpected error occurred while validating a rule');
      this.logger.debug(error);
      return this.createReturnStatus(false, 'Unexpected error occurred');
    }
  }

  private validateApplicationServerSelection(
    appId: number,
    radarrSettingsId: number | undefined,
    sonarrSettingsId: number | undefined,
    sportarrSettingsId: number | undefined,
  ): ReturnStatus | null {
    // Check if rule references Radarr without a server
    if (
      appId === Application.RADARR &&
      (radarrSettingsId === undefined || radarrSettingsId === null)
    ) {
      return this.createReturnStatus(
        false,
        'Radarr rules require a Radarr server to be selected',
      );
    }

    // Check if rule references Sonarr without a server
    if (
      appId === Application.SONARR &&
      (sonarrSettingsId === undefined || sonarrSettingsId === null)
    ) {
      return this.createReturnStatus(
        false,
        'Sonarr rules require a Sonarr server to be selected',
      );
    }

    // Check if rule references Sportarr without a server
    if (
      appId === Application.SPORTARR &&
      (sportarrSettingsId === undefined || sportarrSettingsId === null)
    ) {
      return this.createReturnStatus(
        false,
        'Sportarr rules require a Sportarr server to be selected',
      );
    }

    return null;
  }

  // A show-library collection is managed by exactly one of Sonarr/Sportarr.
  // The UI enforces this via the "Managed by" selector; this guards the raw
  // API path, where a payload with both set would otherwise dispatch the
  // Sonarr handler against a sports library.
  private validateSingleShowManager(params: RuleGroupDto): ReturnStatus {
    if (params.sonarrSettingsId != null && params.sportarrSettingsId != null) {
      return this.createReturnStatus(
        false,
        'A collection can be managed by either Sonarr or Sportarr, not both',
      );
    }
    return this.createReturnStatus(true, 'Success');
  }

  /**
   * The overlay countdown turns this window into a real date, so a value past
   * Date range would draw "Leaving Invalid Date" on the artwork (#3549). The
   * rule-group body is not schema-validated, so the bound is checked here as
   * well as in the form.
   */
  private validateDeletionWindow(params: RuleGroupDto): ReturnStatus {
    const days = params.collection?.deleteAfterDays;
    if (
      days != null &&
      (!Number.isInteger(days) || days < 0 || days > DELETE_AFTER_MAX_DAYS)
    ) {
      return this.createReturnStatus(
        false,
        `Take action after days must be a whole number between 0 and ${DELETE_AFTER_MAX_DAYS}`,
      );
    }
    return this.createReturnStatus(true, 'Success');
  }

  private validateRuleServerSelection(
    rule: RuleDto,
    radarrSettingsId?: number,
    sonarrSettingsId?: number,
    sportarrSettingsId?: number,
  ): ReturnStatus {
    // Check first value
    const firstValResult = this.validateApplicationServerSelection(
      rule.firstVal[0],
      radarrSettingsId,
      sonarrSettingsId,
      sportarrSettingsId,
    );
    if (firstValResult) {
      return firstValResult;
    }

    // Check second value if it exists
    if (rule.lastVal) {
      const lastValResult = this.validateApplicationServerSelection(
        rule.lastVal[0],
        radarrSettingsId,
        sonarrSettingsId,
        sportarrSettingsId,
      );
      if (lastValResult) {
        return lastValResult;
      }
    }

    return this.createReturnStatus(true, 'Success');
  }

  private normalizeRuleUsername(rule: RuleDto) {
    if (rule.username == null) {
      return;
    }

    const username = rule.username.trim();
    rule.username = username.length > 0 ? username : undefined;
  }

  /**
   * Resolved once per save, and only when a rule names a user: imports and API
   * clients never see the editor's picker.
   */
  private async getKnownUsernames(rules: RuleDto[]): Promise<string[]> {
    return rules.some((rule) => rule.username?.trim())
      ? await this.ruleUsersService.getUsernames()
      : [];
  }

  /**
   * Users this group already reads. An account that has since been renamed or
   * deleted leaves the rule paused at execution time, which is the point - but
   * it must not block every later edit to the group it sits in.
   */
  private async getSavedUsernames(ruleGroupId: number): Promise<string[]> {
    const rules = (await this.getRules(ruleGroupId)) ?? [];

    return rules.reduce((usernames, rule) => {
      try {
        const username = (
          JSON.parse(rule.ruleJson) as RuleDto
        ).username?.trim();
        if (username) {
          usernames.push(username);
        }
      } catch {
        // A rule row that no longer parses is the executor's problem, not this
        // validation's.
      }
      return usernames;
    }, [] as string[]);
  }

  /** Rejected here rather than skipping every item at execution time. */
  private validateRuleUsername(
    rule: RuleDto,
    knownUsernames: string[],
  ): ReturnStatus {
    const usesPerUserProperty = [rule.firstVal, rule.lastVal].some((value) =>
      isPerUserProperty(this.findRuleProperty(value)?.name),
    );

    if (usesPerUserProperty && !rule.username) {
      return this.createReturnStatus(
        false,
        'Select a user for properties that are scoped to one user',
      );
    }

    if (!usesPerUserProperty && rule.username) {
      return this.createReturnStatus(
        false,
        'A user can only be selected for properties that are scoped to one user',
      );
    }

    // An empty list means the media server could not be reached, which must not
    // block a save; a populated one that lacks the user means the rule would
    // skip every item, so reject it here instead.
    if (
      rule.username &&
      knownUsernames.length > 0 &&
      !knownUsernames.includes(rule.username)
    ) {
      return this.createReturnStatus(
        false,
        `The media server has no user named '${rule.username}'`,
      );
    }

    return this.createReturnStatus(true, 'Success');
  }

  private findRuleProperty(value?: [number, number]): Property | undefined {
    if (!value) {
      return undefined;
    }

    return this.ruleConstants.applications
      .find((el) => el.id === value[0])
      ?.props.find((el) => el.id === value[1]);
  }

  private normalizeRuleDiskPath(rule: RuleDto) {
    if (rule.arrDiskPath == null) {
      return;
    }

    const path = rule.arrDiskPath.trim();
    rule.arrDiskPath = path.length > 0 ? path : undefined;
  }

  private validateRuleDiskPath(rule: RuleDto): ReturnStatus {
    if (!rule.arrDiskPath) {
      return this.createReturnStatus(true, 'Success');
    }

    const firstValApp = this.ruleConstants.applications.find(
      (el) => el.id === rule.firstVal[0],
    );
    const firstValProperty = firstValApp?.props.find(
      (el) => el.id === rule.firstVal[1],
    );

    const isArrDiskspaceRule =
      (firstValApp?.id === Application.RADARR ||
        firstValApp?.id === Application.SONARR) &&
      (firstValProperty?.name === 'diskspace_remaining_gb' ||
        firstValProperty?.name === 'diskspace_total_gb');

    if (!isArrDiskspaceRule) {
      return this.createReturnStatus(
        false,
        'Disk target path is only supported for Radarr/Sonarr disk space rules',
      );
    }

    return this.createReturnStatus(true, 'Success');
  }

  private createReturnStatus(success: boolean, result: string): ReturnStatus {
    return { code: success ? 1 : 0, result: result, message: result };
  }

  private async createOrUpdateGroup(
    name: string,
    description: string,
    libraryId: string,
    collectionId: number,
    useRules = true,
    isActive = true,
    dataType = undefined,
    id?: number,
    notifications?: Notification[],
    ruleHandlerCronSchedule?: string | null,
  ): Promise<number> {
    try {
      const values = {
        name: name,
        description: description,
        libraryId: libraryId,
        collectionId: +collectionId,
        isActive: isActive,
        useRules: useRules,
        dataType: dataType,
        ruleHandlerCronSchedule: ruleHandlerCronSchedule,
      };
      const connection = this.connection.createQueryBuilder();

      if (!id) {
        const groupId = await connection
          .insert()
          .into(RuleGroup)
          .values(values)
          .execute();

        id = groupId.identifiers[0].id;

        this.eventEmitter.emit(MaintainerrEvent.RuleGroup_Created, {
          ruleGroup: {
            id: id,
            ...values,
          },
        });
      } else {
        const oldRuleGroup = await this.getRuleGroupById(id);

        await connection
          .update(RuleGroup)
          .set(values)
          .where({ id: id })
          .execute();

        this.eventEmitter.emit(MaintainerrEvent.RuleGroup_Updated, {
          oldRuleGroup,
          ruleGroup: {
            id: id,
            ...values,
          },
        });
      }

      // Remove all existing notifications from the RuleGroup
      await connection
        .relation(RuleGroup, 'notifications')
        .of(id)
        .remove(
          await connection
            .relation(RuleGroup, 'notifications')
            .of(id)
            .loadMany(),
        );

      // Associate new notifications to the RuleGroup. Guard against an
      // empty/omitted list: `.add(undefined)` (when `notifications` is omitted
      // by an API/import client) inserts a join row with a null notificationId
      // and fails the whole rule-group create.
      const notificationIds = notifications?.map(
        (notification) => notification.id,
      );
      if (notificationIds?.length) {
        await connection
          .relation(RuleGroup, 'notifications')
          .of(id)
          .add(notificationIds);
      }

      return id;
    } catch (error) {
      this.logger.warn('Rules - Action failed');
      this.logger.debug(error);
      return undefined;
    }
  }

  async getCommunityRules(): Promise<CommunityRule[] | ReturnStatus> {
    return await axios
      .get<{ rules: CommunityRule[] }>(this.communityUrl)
      .then((response) => {
        return response.data.rules as CommunityRule[];
      })
      .catch((error) => {
        this.logger.warn('Loading community rules failed');
        this.logger.debug(error);
        return this.createReturnStatus(false, 'Failed');
      });
  }

  public async getCommunityRuleCount(): Promise<number> {
    const response = await this.getCommunityRules();

    return Array.isArray(response) ? response.length : 0;
  }

  /**
   * The community list is public and shared between installs, so a rule leaves
   * without the user it was scoped to: that name identifies someone's
   * household, and it would resolve to nobody on the install that imports it.
   * The importer picks their own user, which the editor already demands.
   */
  private withoutLocalUsers(rules: CommunityRule['JsonRules']) {
    if (!Array.isArray(rules)) {
      return rules;
    }

    return rules.map((rule) => {
      if (!rule || typeof rule !== 'object' || !('username' in rule)) {
        return rule;
      }
      const withoutUser: RuleDto = { ...(rule as RuleDto) };
      delete withoutUser.username;
      return withoutUser;
    });
  }

  public async addToCommunityRules(rule: CommunityRule): Promise<ReturnStatus> {
    const rules = await this.getCommunityRules();
    const appVersion = process.env.npm_package_version
      ? process.env.npm_package_version
      : '0.0.0';

    if (!Array.isArray(rules)) {
      this.logger.warn(`Unable to get community rules before adding a new one`);
      return this.createReturnStatus(false, 'Connection failed');
    }

    if (rules.find((r) => r.name === rule.name)) {
      this.logger.log(`Duplicate rule name detected. This is not allowed.`);
      return this.createReturnStatus(false, 'Name already exists');
    }
    const hasRules = Array.isArray(rule.JsonRules) && rule.JsonRules.length > 0;

    return axios
      .patch(this.communityUrl, [
        {
          op: 'add',
          path: '/rules/-',
          value: {
            id: rules.length,
            karma: 5,
            appVersion: appVersion,
            hasRules,
            ...rule,
            JsonRules: this.withoutLocalUsers(rule.JsonRules),
          },
        },
      ])
      .then(() => {
        this.logger.log(`Successfully saved community rule`);
        return this.createReturnStatus(true, 'Success');
      })
      .catch((error) => {
        this.logger.warn('Saving community rule failed');
        this.logger.debug(error);
        return this.createReturnStatus(false, 'Saving community rule failed');
      });
  }

  public async getCommunityRuleKarmaHistory(): Promise<CommunityRuleKarma[]> {
    return await this.communityRuleKarmaRepository.find();
  }

  public async updateCommunityRuleKarma(
    id: number,
    karma: number,
  ): Promise<ReturnStatus> {
    const rules = await this.getCommunityRules();
    if (!Array.isArray(rules)) {
      this.logger.warn(`Unable to get community rules before adding karma`);
      return this.createReturnStatus(false, 'Connection failed');
    }

    const ruleIndex = rules.findIndex((r) => r.id === id);
    if (ruleIndex === -1) {
      this.logger.log(`Rule with ID ${id} not found`);
      return this.createReturnStatus(false, 'Rule not found');
    }

    // Check karma history to prevent multiple updates
    const history = await this.communityRuleKarmaRepository.find({
      where: { community_rule_id: id },
    });

    if (history.length > 0) {
      this.logger.log(`You can only update Karma of a rule once`);
      return this.createReturnStatus(
        false,
        'Already updated Karma for this rule',
      );
    }

    // Ensure the karma value doesn't exceed max limit
    if (karma > 990) {
      this.logger.log(`Max Karma reached (990) for rule with id: ${id}`);
      return this.createReturnStatus(
        true,
        'Success, but Max Karma reached for this rule.',
      );
    }

    // Update the rule's karma
    return axios
      .patch(this.communityUrl, [
        {
          op: 'replace',
          id: id,
          value: { karma },
        },
      ])
      .then(async () => {
        this.logger.log(`Successfully updated community rule karma`);

        // Save to karma history to prevent multiple updates
        await this.communityRuleKarmaRepository.save([
          { community_rule_id: id },
        ]);

        return this.createReturnStatus(true, 'Success');
      })
      .catch((error) => {
        this.logger.warn('Updating community rule karma failed');
        this.logger.debug(error);
        return this.createReturnStatus(
          false,
          'Updating community rule karma failed',
        );
      });
  }

  public encodeToYaml(
    rules: RuleDto[],
    mediaType: MediaItemType,
  ): ReturnStatus {
    return this.ruleYamlService.encode(rules, mediaType);
  }

  public async decodeFromYaml(
    yaml: string,
    mediaType: MediaItemType,
  ): Promise<ReturnStatus> {
    const result = this.ruleYamlService.decode(yaml, mediaType);

    // Migrate decoded rules to the configured media server
    if (result.code === 1 && result.result) {
      const parsed = JSON.parse(result.result);
      const beforeMigrate = parsed.rules.length;
      const migrationResult = await this.migrateRules(parsed.rules);
      if (migrationResult.code === 1 && migrationResult.result) {
        parsed.rules = JSON.parse(migrationResult.result);
      }
      // Combine rules dropped by decode (unresolved identifier) and by
      // migration (no equivalent on the target server) into the single
      // top-level skipped count so the UI reads it the same way as export.
      result.skipped =
        (result.skipped ?? 0) + (beforeMigrate - parsed.rules.length);
      result.result = JSON.stringify(parsed);
    }

    return result;
  }

  /**
   * Migrate imported rules to match the configured media server type.
   * Used for community and YAML rule imports to convert Plex ↔ Jellyfin rules.
   */
  public async migrateRules(rules: RuleDto[]): Promise<ReturnStatus> {
    const serverType = await this.mediaServerFactory.getConfiguredServerType();

    if (!serverType) {
      return {
        code: 1,
        result: JSON.stringify(rules),
        message: 'No migration needed - no media server configured',
      };
    }

    const migration = this.ruleMigrationService.migrateImportedRuleDtos(
      rules,
      serverType,
    );

    if (migration.migratedRules > 0) {
      this.logger.log(
        `Migrated ${migration.migratedRules} rule(s) to ${serverType}`,
      );
    }

    return {
      code: 1,
      result: JSON.stringify(migration.rules),
      message: `Migrated ${migration.migratedRules} rules, skipped ${migration.skippedRules}`,
    };
  }

  public async testRuleGroupWithData(
    rulegroupId: number,
    mediaId: string,
  ): Promise<any> {
    const group = await this.getRuleGroupById(rulegroupId);

    if (!group) {
      return { code: 0, result: 'Rule group not found' };
    }

    if (!group.useRules) {
      return { code: 0, result: 'Rule group does not use rules' };
    }

    // flush caches
    const mediaServer = await this.getMediaServer();
    mediaServer.resetMetadataCache(mediaId);
    cacheManager.getCache('seerr').data.flushAll();
    // Drop the run-scoped Seerr request index too, so a single-item test rebuilds
    // it from a fresh /request sweep and agrees with a full run (#3152).
    cacheManager.getCache('seerrrequests').data.flushAll();
    cacheManager.getCache('tautulli').data.flushAll();
    cacheManager.getCache('streamystats').data.flushAll();
    cacheManager
      .getCachesByType('radarr')
      .forEach((cache) => cache.data.flushAll());
    cacheManager
      .getCachesByType('sonarr')
      .forEach((cache) => cache.data.flushAll());
    cacheManager
      .getCachesByType('sportarr')
      .forEach((cache) => cache.data.flushAll());

    const mediaResp = await mediaServer.getMetadata(mediaId);

    if (mediaResp) {
      group.rules = await this.getRules(group.id);
      const ruleComparator = this.ruleComparatorServiceFactory.create();
      try {
        if (group.rules && this.usesTracearr(group.rules)) {
          // The same refresh a rule run does, which resumes at the newest known
          // play. Discarding the snapshot instead re-read the whole history on
          // every test (#3465).
          await this.tracearrApi.prefetchHistory();
        }
        const result = await ruleComparator.executeRulesWithData(
          group as RuleGroupDto,
          [mediaResp],
        );
        return { code: 1, result: result.stats };
      } catch (error) {
        this.logger.debug(error);
        return { code: 0, result: 'An error occurred executing rules' };
      }
    }

    return { code: 0, result: 'Invalid input' };
  }

  /**
   * Reset the media server cache if any rule in the rule group requires it.
   *
   * @param {RuleGroupDto} rulegroup - The rule group to check for cache reset requirement.
   * @return {Promise<boolean>} Whether the media server cache was reset.
   */
  public async resetCacheIfGroupUsesRuleThatRequiresIt(
    rulegroup: RuleGroupDto,
  ): Promise<boolean> {
    try {
      let result = false;
      const constant = await this.getRuleConstants();

      // for all rules in group
      for (const rule of rulegroup.rules) {
        const parsedRule = JSON.parse((rule as RuleDbDto).ruleJson) as RuleDto;

        const firstValApplication = constant.applications.find(
          (x) => x.id === parsedRule.firstVal[0],
        );

        //test first value
        const first = firstValApplication.props.find(
          (x) => x.id == parsedRule.firstVal[1],
        );

        result = first.cacheReset ? true : result;

        const secondValApplication = parsedRule.lastVal
          ? constant.applications.find((x) => x.id === parsedRule.lastVal[0])
          : undefined;

        // test second value
        const second = secondValApplication?.props.find(
          (x) => x.id == parsedRule.lastVal[1],
        );

        result = second?.cacheReset ? true : result;
      }

      // if any rule requires a cache reset
      if (result) {
        const serverType =
          await this.mediaServerFactory.getConfiguredServerType();

        if (serverType === MediaServerType.JELLYFIN) {
          cacheManager.getCache('jellyfin').flush();
          cacheManager.getCache('jellyfinwatchhistory').flush();
          this.logger.log(
            `Flushed Jellyfin cache because a rule in the group required it`,
          );
        } else if (serverType === MediaServerType.PLEX) {
          cacheManager.getCache('plextv').flush();
          cacheManager.getCache('plexguid').flush();
          cacheManager.getCache('plexwatchhistory').flush();
          this.logger.log(
            `Flushed Plex cache because a rule in the group required it`,
          );
        } else if (serverType === MediaServerType.EMBY) {
          cacheManager.getCache('emby').flush();
          this.logger.log(
            `Flushed Emby cache because a rule in the group required it`,
          );
        }
      }

      return result;
    } catch (error) {
      this.logger.warn(
        `Couldn't determine if rulegroup with id ${rulegroup.id} requires a cache reset`,
      );
      this.logger.debug(error);
      return false;
    }
  }
}
