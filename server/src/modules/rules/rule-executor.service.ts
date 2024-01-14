import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import _ from 'lodash';
import { PlexLibraryItem } from '../api/plex-api/interfaces/library.interfaces';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { CollectionsService } from '../collections/collections.service';
import { AddCollectionMedia } from '../collections/interfaces/collection-media.interface';
import { SettingsService } from '../settings/settings.service';
import { TasksService } from '../tasks/tasks.service';
import { RuleConstants } from './constants/rules.constants';

import { RulesDto } from './dtos/rules.dto';
import { RuleGroup } from './entities/rule-group.entities';
import { RulesService } from './rules.service';
import { EPlexDataType } from '../api/plex-api/enums/plex-data-type-enum';
import cacheManager, { Cache } from '../api/lib/cache';
import { RuleComparatorService } from './helpers/rule.comparator.service';

interface PlexData {
  page: number;
  finished: boolean;
  data: PlexLibraryItem[];
}

@Injectable()
export class RuleExecutorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RuleExecutorService.name);
  private jobCreationAttempts = 0;

  ruleConstants: RuleConstants;
  userId: string;
  plexData: PlexData;
  plexDataType: EPlexDataType;
  workerData: PlexLibraryItem[];
  resultData: PlexLibraryItem[];
  constructor(
    private readonly rulesService: RulesService,
    private readonly plexApi: PlexApiService,
    private readonly collectionService: CollectionsService,
    private readonly taskService: TasksService,
    private readonly settings: SettingsService,
    private readonly comparator: RuleComparatorService,
  ) {
    this.ruleConstants = new RuleConstants();
    this.plexData = { page: 1, finished: false, data: [] };
  }

  onApplicationBootstrap() {
    this.jobCreationAttempts++;
    const state = this.taskService.createJob(
      'RuleHandler',
      this.settings.rules_handler_job_cron,
      this.executeAllRules.bind(this),
    );
    if (state.code === 0) {
      if (this.jobCreationAttempts <= 3) {
        this.logger.log(
          'Creation of job RuleHandler failed. Retrying in 10s..',
        );
        setTimeout(() => {
          this.onApplicationBootstrap();
        }, 10000);
      } else {
        this.logger.error(`Creation of job RuleHandler failed.`);
      }
    }
  }

  public updateJob(cron: string) {
    return this.taskService.updateJob(
      'RuleHandler',
      cron,
      this.executeAllRules.bind(this),
    );
  }

  public async executeAllRules() {
    this.logger.log('Starting Execution of all active rules.');
    const appStatus = await this.settings.testConnections();

    // reset API caches, make sure latest data is used
    for (const [key, value] of Object.entries(cacheManager.getAllCaches())) {
      value.flush();
    }

    if (appStatus) {
      const ruleGroups = await this.getAllActiveRuleGroups();
      if (ruleGroups) {
        for (const rulegroup of ruleGroups) {
          if (rulegroup.useRules) {
            this.logger.log(`Executing rules for '${rulegroup.name}'`);

            // prepare
            this.workerData = [];
            this.resultData = [];
            this.plexData = { page: 0, finished: false, data: [] };

            this.plexDataType = rulegroup.dataType
              ? rulegroup.dataType
              : undefined;

            // Run rules data shunks of 50
            while (!this.plexData.finished) {
              await this.getPlexData(rulegroup.libraryId);
              const ruleResult = await this.comparator.executeRulesWithData(
                rulegroup,
                this.plexData.data,
              );
              if (ruleResult) {
                this.resultData.push(...ruleResult?.data);
              }
            }
            await this.handleCollection(
              await this.rulesService.getRuleGroupById(rulegroup.id), // refetch to get latest changes
            );
            this.logger.log(`Execution of rules for '${rulegroup.name}' done.`);
          }
          await this.syncManualPlexMediaToCollectionDB(
            await this.rulesService.getRuleGroupById(rulegroup.id), // refetch to get latest changes
          );
        }
      }
    } else {
      this.logger.log(
        'Not all applications are reachable.. Skipped rule execution.',
      );
    }
  }

  private async syncManualPlexMediaToCollectionDB(rulegroup: RuleGroup) {
    if (rulegroup && rulegroup.collectionId) {
      let collection = await this.collectionService.getCollection(
        rulegroup.collectionId,
      );

      collection =
        await this.collectionService.relinkManualCollection(collection);

      if (collection && collection.plexId) {
        const collectionMedia = await this.collectionService.getCollectionMedia(
          rulegroup.collectionId,
        );

        const children = await this.plexApi.getCollectionChildren(
          collection.plexId.toString(),
        );

        // Handle manually added
        if (children && children.length > 0) {
          children.forEach(async (child) => {
            if (child && child.ratingKey)
              if (
                !collectionMedia.find((e) => {
                  return +e.plexId === +child.ratingKey;
                })
              ) {
                await this.collectionService.addToCollection(
                  collection.id,
                  [{ plexId: +child.ratingKey }] as AddCollectionMedia[],
                  true,
                );
              }
          });
        }

        // Handle manually removed
        if (collectionMedia && collectionMedia.length > 0) {
          collectionMedia.forEach(async (media) => {
            if (media && media.plexId) {
              if (
                !children ||
                !children.find((e) => +media.plexId === +e.ratingKey)
              ) {
                await this.collectionService.removeFromCollection(
                  collection.id,
                  [{ plexId: +media.plexId }] as AddCollectionMedia[],
                );
              }
            }
          });
        }

        this.logger.log(
          `Synced collection '${
            collection.manualCollection
              ? collection.manualCollectionName
              : collection.title
          }' with Plex`,
        );
      }
    }
  }

  private async handleCollection(rulegroup: RuleGroup) {
    try {
      let collection = await this.collectionService.getCollection(
        rulegroup?.collectionId,
      );

      const exclusions = await this.rulesService.getExclusions(rulegroup.id);

      // keep a record of parent/child ratingKeys for seasons & episodes
      const collectionMediaCHildren: [{ parent: number; child: number }] =
        undefined;

      // filter exclusions out of results & get correct ratingKey
      const data = this.resultData
        .filter((el) => !exclusions.find((e) => +e.plexId === +el.ratingKey))
        .map((el) => {
          return +el.ratingKey;
        });

      if (collection) {
        const collMediaData = await this.collectionService.getCollectionMedia(
          collection.id,
        );

        // check Plex collection link
        if (collMediaData.length > 0 && collection.plexId) {
          collection =
            await this.collectionService.checkAutomaticPlexLink(collection);
          // if collection was removed while it should be available.. resync current data
          if (!collection.plexId) {
            collection = await this.collectionService.addToCollection(
              collection.id,
              collMediaData,
              collection.manualCollection,
            );
            if (collection) {
              collection =
                await this.collectionService.saveCollection(collection);
            }
          }
        }

        // Add manually added media to data
        const manualData = collMediaData
          .filter((el) => el.isManual === true)
          .map((e) => e.plexId);

        data.push(...manualData);

        let currentCollectionData = collMediaData.map((e) => {
          return e.plexId;
        });

        currentCollectionData = currentCollectionData
          ? currentCollectionData
          : [];

        const dataToAdd = this.deDupe(
          data
            .filter((el) => !currentCollectionData.includes(el))
            .map((el) => {
              return { plexId: +el };
            }),
        );

        const dataToRemove = this.deDupe(
          currentCollectionData
            .filter((el) => !data.includes(el))
            .map((el) => {
              return { plexId: +el };
            }),
        );

        if (dataToRemove.length > 0) {
          this.logInfo(
            `Removing ${dataToRemove.length} media items from '${
              collection.manualCollection
                ? collection.manualCollectionName
                : collection.title
            }'.`,
          );
        }

        if (dataToAdd.length > 0) {
          this.logInfo(
            `Adding ${dataToAdd.length} media items to '${
              collection.manualCollection
                ? collection.manualCollectionName
                : collection.title
            }'.`,
          );
        }

        collection =
          await this.collectionService.relinkManualCollection(collection);

        collection = await this.collectionService.addToCollection(
          collection.id,
          dataToAdd,
        );

        collection = await this.collectionService.removeFromCollection(
          collection.id,
          dataToRemove,
        );

        return collection;
      } else {
        this.logInfo(`collection not found with id ${rulegroup.collectionId}`);
      }
    } catch (err) {
      this.logger.warn(`Execption occurred whild handling rule: `, err);
    }
  }

  private async getAllActiveRuleGroups(): Promise<RulesDto[]> {
    return await this.rulesService.getRuleGroups(true);
  }

  private deDupe(arr: { plexId: number }[]): { plexId: number }[] {
    const uniqueArr = [];
    arr.filter(
      (item) =>
        !uniqueArr.find((el) => el.plexId === item.plexId) &&
        uniqueArr.push({ plexId: item.plexId }),
    );
    return uniqueArr;
  }

  private async getPlexData(libraryId: number): Promise<void> {
    const size = 50;
    const response = await this.plexApi.getLibraryContents(
      libraryId.toString(),
      {
        offset: +this.plexData.page * size,
        size: size,
      },
      this.plexDataType,
    );
    if (response) {
      this.plexData.data = response.items ? response.items : [];

      if ((+this.plexData.page + 1) * size >= response.totalSize) {
        this.plexData.finished = true;
      }
    } else {
      this.plexData.finished = true;
    }
    this.plexData.page++;
  }

  private async logInfo(message: string) {
    this.logger.log(message);
  }
}
