import {
  IComparisonStatistics,
  MaintainerrEvent,
  RuleHandlerFinishedEventDto,
  RuleHandlerProgressedEventDto,
  RuleHandlerStartedEventDto,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import cacheManager from '../../api/lib/cache';
import { EPlexDataType } from '../../api/plex-api/enums/plex-data-type-enum';
import { PlexLibraryItem } from '../../api/plex-api/interfaces/library.interfaces';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { CollectionsService } from '../../collections/collections.service';
import { Collection } from '../../collections/entities/collection.entities';
import { AddRemoveCollectionMedia } from '../../collections/interfaces/collection-media.interface';
import {
  CollectionMediaAddedDto,
  CollectionMediaRemovedDto,
  RuleHandlerFailedDto,
} from '../../events/events.dto';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import { TaskBase } from '../../tasks/task.base';
import { TasksService } from '../../tasks/tasks.service';
import { RuleConstants } from '../constants/rules.constants';
import { RulesDto } from '../dtos/rules.dto';
import { RuleGroup } from '../entities/rule-group.entities';
import { RuleComparatorServiceFactory } from '../helpers/rule.comparator.service';
import { RulesService } from '../rules.service';

interface PlexData {
  page: number;
  finished: boolean;
  data: PlexLibraryItem[];
}

@Injectable()
export class RuleExecutorService extends TaskBase {
  protected name = 'Rule Handler';
  protected cronSchedule = ''; // overriden in onBootstrapHook

  ruleConstants: RuleConstants;
  userId: string;
  plexData: PlexData;
  plexDataType: EPlexDataType;
  workerData: PlexLibraryItem[];
  resultData: PlexLibraryItem[];
  statisticsData: IComparisonStatistics[];
  Data: PlexLibraryItem[];

  startTime: Date;

  constructor(
    private readonly rulesService: RulesService,
    private readonly plexApi: PlexApiService,
    private readonly collectionService: CollectionsService,
    protected readonly taskService: TasksService,
    private readonly settings: SettingsService,
    private readonly comparatorFactory: RuleComparatorServiceFactory,
    private readonly eventEmitter: EventEmitter2,
    protected readonly logger: MaintainerrLogger,
  ) {
    super(taskService, logger);
    logger.setContext(RuleExecutorService.name);
    this.ruleConstants = new RuleConstants();
    this.plexData = { page: 1, finished: false, data: [] };
  }

  protected onBootstrapHook(): void {
    this.cronSchedule = this.settings.rules_handler_job_cron;
  }

  public async execute() {
    // check if another instance of this task is already running
    if (await this.isRunning()) {
      this.logger.log(
        `Another instance of the ${this.name} task is currently running. Skipping this execution`,
      );
      return;
    }

    this.eventEmitter.emit(
      MaintainerrEvent.RuleHandler_Started,
      new RuleHandlerStartedEventDto('Started execution of all active rules'),
    );

    await super.execute();

    try {
      this.logger.log('Starting execution of all active rules');
      const appStatus = await this.settings.testConnections();

      // reset API caches, make sure latest data is used
      cacheManager.flushAll();

      if (appStatus) {
        const ruleGroups = await this.getAllActiveRuleGroups();
        if (ruleGroups) {
          const comparator = this.comparatorFactory.create();

          let totalEvaluations = 0;
          const ruleGroupTotals: { [key: string]: number } = {};
          for (const rulegroup of ruleGroups) {
            const mediaItemCount = await this.plexApi.getLibraryContentCount(
              rulegroup.libraryId,
              rulegroup.dataType,
            );

            totalEvaluations += mediaItemCount * rulegroup.rules.length;
            ruleGroupTotals[rulegroup.id] = mediaItemCount;
          }

          const progressedEvent = new RuleHandlerProgressedEventDto();
          const emitProgressedEvent = () => {
            progressedEvent.time = new Date();
            this.eventEmitter.emit(
              MaintainerrEvent.CollectionHandler_Progressed,
              progressedEvent,
            );
          };
          progressedEvent.totalRuleGroups = ruleGroups.length;
          progressedEvent.totalEvaluations = totalEvaluations;

          for (let i = 0; i < ruleGroups.length; i++) {
            const rulegroup = ruleGroups[i];

            progressedEvent.processingRuleGroup = {
              name: rulegroup.name,
              number: i + 1,
              processedEvaluations: 0,
              totalEvaluations:
                ruleGroupTotals[rulegroup.id] * rulegroup.rules.length,
            };
            emitProgressedEvent();

            if (rulegroup.useRules) {
              this.logger.log(`Executing rules for '${rulegroup.name}'`);
              this.startTime = new Date();

              // reset Plex cache if group uses a rule that requires it (collection rules for example)
              await this.rulesService.resetPlexCacheIfgroupUsesRuleThatRequiresIt(
                rulegroup,
              );

              // prepare
              this.workerData = [];
              this.resultData = [];
              this.statisticsData = [];
              this.plexData = { page: 0, finished: false, data: [] };

              this.plexDataType = rulegroup.dataType
                ? rulegroup.dataType
                : undefined;

              // Run rules data chunks of 50
              while (!this.plexData.finished) {
                await this.getPlexData(rulegroup.libraryId);

                const ruleResult = await comparator.executeRulesWithData(
                  rulegroup,
                  this.plexData.data,
                  () => {
                    progressedEvent.processedEvaluations +=
                      this.plexData.data.length;
                    progressedEvent.processingRuleGroup.processedEvaluations +=
                      this.plexData.data.length;
                    emitProgressedEvent();
                  },
                );

                if (ruleResult) {
                  this.statisticsData.push(...ruleResult.stats);
                  this.resultData.push(...ruleResult.data);
                }
              }

              await this.handleCollection(
                await this.rulesService.getRuleGroupById(rulegroup.id), // refetch to get latest changes
              );

              this.logger.log(
                `Execution of rules for '${rulegroup.name}' done.`,
              );
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

        this.eventEmitter.emit(MaintainerrEvent.RuleHandler_Failed);
      }
    } catch (err) {
      this.logger.log('Error running rules executor.');
      this.logger.debug(err);

      this.eventEmitter.emit(MaintainerrEvent.RuleHandler_Failed);
    }

    // clean up
    await this.finish();

    this.eventEmitter.emit(
      MaintainerrEvent.RuleHandler_Finished,
      new RuleHandlerFinishedEventDto('Finished execution of all active rules'),
    );
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
                  [
                    {
                      plexId: +child.ratingKey,
                      reason: {
                        type: 'media_added_manually',
                      },
                    },
                  ],
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
                  [
                    {
                      plexId: +media.plexId,
                      reason: {
                        type: 'media_removed_manually',
                      },
                    },
                  ] satisfies AddRemoveCollectionMedia[],
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

        const mediaToAdd = data.filter(
          (el) => !currentCollectionData.includes(el),
        );

        const dataToAdd: AddRemoveCollectionMedia[] = this.prepareDataAmendment(
          mediaToAdd.map((el) => {
            return {
              plexId: +el,
              reason: {
                type: 'media_added_by_rule',
                data: this.statisticsData.find((stat) => el == stat.plexId),
              },
            } satisfies AddRemoveCollectionMedia;
          }),
        );

        const mediaToRemove = currentCollectionData.filter(
          (el) => !data.includes(el),
        );

        const dataToRemove: AddRemoveCollectionMedia[] =
          this.prepareDataAmendment(
            mediaToRemove.map((el) => {
              return {
                plexId: +el,
                reason: {
                  type: 'media_removed_by_rule',
                  data: this.statisticsData.find((stat) => el == stat.plexId),
                },
              } satisfies AddRemoveCollectionMedia;
            }),
          );

        if (dataToRemove.length > 0) {
          this.logger.log(
            `Removing ${dataToRemove.length} media items from '${
              collection.manualCollection
                ? collection.manualCollectionName
                : collection.title
            }'.`,
          );

          this.eventEmitter.emit(
            MaintainerrEvent.CollectionMedia_Removed,
            new CollectionMediaRemovedDto(
              dataToRemove,
              collection.title,
              {
                type: 'rulegroup',
                value: rulegroup.id,
              },
              collection.deleteAfterDays,
            ),
          );
        }

        if (dataToAdd.length > 0) {
          this.logger.log(
            `Adding ${dataToAdd.length} media items to '${
              collection.manualCollection
                ? collection.manualCollectionName
                : collection.title
            }'.`,
          );

          this.eventEmitter.emit(
            MaintainerrEvent.CollectionMedia_Added,
            new CollectionMediaAddedDto(
              dataToAdd,
              collection.title,
              { type: 'rulegroup', value: rulegroup.id },
              collection.deleteAfterDays,
            ),
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

        // add the run duration to the collection
        await this.AddCollectionRunDuration(collection);

        return collection;
      } else {
        this.logger.log(
          `collection not found with id ${rulegroup.collectionId}`,
        );

        this.eventEmitter.emit(
          MaintainerrEvent.RuleHandler_Failed,
          new RuleHandlerFailedDto(collection.title, {
            type: 'rulegroup',
            value: rulegroup.id,
          }),
        );
      }
    } catch (err) {
      this.logger.warn(
        `Execption occurred whild handling rule: ${err.message}`,
      );

      this.eventEmitter.emit(
        MaintainerrEvent.RuleHandler_Failed,
        new RuleHandlerFailedDto(rulegroup.collection?.title, {
          type: 'rulegroup',
          value: rulegroup.id,
        }),
      );
    }
  }

  private async getAllActiveRuleGroups(): Promise<RulesDto[]> {
    return await this.rulesService.getRuleGroups(true);
  }

  private prepareDataAmendment(
    arr: AddRemoveCollectionMedia[],
  ): AddRemoveCollectionMedia[] {
    const uniqueArr: AddRemoveCollectionMedia[] = [];
    arr.filter(
      (item) =>
        !uniqueArr.find((el) => el.plexId === item.plexId) &&
        uniqueArr.push(item),
    );
    return uniqueArr;
  }

  private async AddCollectionRunDuration(collection: Collection) {
    // add the run duration to the collection
    collection.lastDurationInSeconds = Math.floor(
      (new Date().getTime() - this.startTime.getTime()) / 1000,
    );

    await this.collectionService.saveCollection(collection);
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
}
