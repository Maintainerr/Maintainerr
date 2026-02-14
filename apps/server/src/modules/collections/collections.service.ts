import {
  CollectionLogMeta,
  ECollectionLogType,
  MaintainerrEvent,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { CollectionLog } from '../../modules/collections/entities/collection_log.entities';
import { BasicResponseDto } from '../api/plex-api/dto/basic-response.dto';
import { EPlexDataType } from '../api/plex-api/enums/plex-data-type-enum';
import { PlexMetadata } from '../api/plex-api/interfaces/media.interface';
import {
  CreateUpdateCollection,
  PlexCollection,
} from '../api/plex-api/interfaces/collection.interface';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { ServarrService } from '../api/servarr-api/servarr.service';
import {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '../api/tmdb-api/interfaces/tmdb.interface';
import { TmdbIdService } from '../api/tmdb-api/tmdb-id.service';
import { TmdbApiService } from '../api/tmdb-api/tmdb.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { Collection } from './entities/collection.entities';
import {
  CollectionMedia,
  CollectionMediaWithPlexData,
} from './entities/collection_media.entities';
import {
  AddRemoveCollectionMedia,
  IAlterableMediaDto,
} from './interfaces/collection-media.interface';
import { ICollection } from './interfaces/collection.interface';

interface addCollectionDbResponse {
  id: number;
  isActive: boolean;
  visibleOnRecommended: boolean;
  visibleOnHome: boolean;
  deleteAfterDays: number;
  manualCollection: boolean;
}

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(CollectionMedia)
    private readonly CollectionMediaRepo: Repository<CollectionMedia>,
    @InjectRepository(CollectionLog)
    private readonly CollectionLogRepo: Repository<CollectionLog>,
    @InjectRepository(RuleGroup)
    private readonly ruleGroupRepo: Repository<RuleGroup>,
    @InjectRepository(Exclusion)
    private readonly exclusionRepo: Repository<Exclusion>,
    private readonly connection: DataSource,
    private readonly plexApi: PlexApiService,
    private readonly servarrService: ServarrService,
    private readonly tmdbApi: TmdbApiService,
    private readonly tmdbIdHelper: TmdbIdService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(CollectionsService.name);
  }

  async getCollection(id?: number, title?: string) {
    try {
      const buildCollectionWithRuleName = async (
        collection: Collection | null,
      ) => {
        if (!collection) {
          return collection;
        }

        const ruleGroup = await this.ruleGroupRepo
          .createQueryBuilder('rg')
          .select('rg.name', 'name')
          .where('rg.collectionId = :collectionId', {
            collectionId: collection.id,
          })
          .getRawOne<{ name: string }>();

        return {
          ...collection,
          ruleName: ruleGroup?.name,
        };
      };

      if (title) {
        return await buildCollectionWithRuleName(
          await this.collectionRepo.findOne({ where: { title: title } }),
        );
      } else {
        return await buildCollectionWithRuleName(
          await this.collectionRepo.findOne({ where: { id: id } }),
        );
      }
    } catch (err) {
      this.logger.error(
        'An error occurred while performing collection actions.',
        err,
      );
      return undefined;
    }
  }

  async getCollectionMedia(id: number) {
    try {
      const media = await this.CollectionMediaRepo.find({
        where: { collectionId: id },
      });
      const collection = await this.collectionRepo.findOne({
        where: { id },
      });
      await this.hydrateMissingCollectionMediaDetails(media, collection);
      return media;
    } catch (err) {
      this.logger.error(
        'An error occurred while performing collection actions',
        err,
      );
      return undefined;
    }
  }

  public async getCollectionMediaCount(id?: number) {
    return await this.CollectionMediaRepo.count({
      where: { collectionId: id },
    });
  }

  public async getCollectionMediaWitPlexDataAndhPaging(
    id: number,
    { offset = 0, size = 25 }: { offset?: number; size?: number } = {},
  ): Promise<{ totalSize: number; items: CollectionMediaWithPlexData[] }> {
    try {
      const queryBuilder = this.CollectionMediaRepo.createQueryBuilder(
        'collection_media',
      );

      queryBuilder
        .where('collection_media.collectionId = :id', { id })
        .orderBy('collection_media.addDate', 'DESC')
        .skip(offset)
        .take(size);

      let itemCount = await queryBuilder.getCount();
      const { entities } = await queryBuilder.getRawAndEntities();

      const resolvedEntities = await Promise.all(
        entities.map(async (el) => {
          const plexData = await this.plexApi.getMetadata(el.plexId.toString());

          if (!plexData) {
            return { entity: el, plexData: undefined };
          }

          if (plexData.grandparentRatingKey) {
            plexData.parentData = await this.plexApi.getMetadata(
              plexData.grandparentRatingKey.toString(),
            );
          } else if (plexData.parentRatingKey) {
            plexData.parentData = await this.plexApi.getMetadata(
              plexData.parentRatingKey.toString(),
            );
          }

          return { entity: el, plexData };
        }),
      );

      const staleEntityIds = resolvedEntities
        .filter((el) => el.plexData === undefined)
        .map((el) => el.entity.id);

      if (staleEntityIds.length > 0) {
        await this.CollectionMediaRepo.delete(staleEntityIds);
        itemCount = await this.CollectionMediaRepo.count({
          where: { collectionId: id },
        });
      }

      const entitiesWithPlexData: CollectionMediaWithPlexData[] =
        resolvedEntities
          .filter((el) => el.plexData !== undefined)
          .map((el) => ({
            ...el.entity,
            plexData: el.plexData,
          }));

      return {
        totalSize: itemCount,
        items: entitiesWithPlexData ?? [],
      };
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions: ' + err,
      );
      return undefined;
    }
  }

  public async getCollectionExclusionsWithPlexDataAndhPaging(
    id: number,
    { offset = 0, size = 25 }: { offset?: number; size?: number } = {},
  ): Promise<{ totalSize: number; items: Exclusion[] }> {
    try {
      const rulegroup = await this.ruleGroupRepo.findOne({
        where: {
          collectionId: id,
        },
      });

      const groupId = rulegroup.id;

      const queryBuilder = this.exclusionRepo.createQueryBuilder('exclusion');

      queryBuilder
        .where(`exclusion.ruleGroupId = ${groupId}`)
        .orWhere(`exclusion.ruleGroupId is null`)
        .andWhere(`exclusion.type = ${rulegroup.dataType}`)
        .orderBy('id', 'DESC')
        .skip(offset)
        .take(size);

      const itemCount = await queryBuilder.getCount();
      let { entities } = await queryBuilder.getRawAndEntities();

      entities = (
        await Promise.all(
          entities.map(async (el) => {
            el.plexData = await this.plexApi.getMetadata(el.plexId.toString());
            if (el.plexData?.grandparentRatingKey) {
              el.plexData.parentData = await this.plexApi.getMetadata(
                el.plexData.grandparentRatingKey.toString(),
              );
            } else if (el.plexData?.parentRatingKey) {
              el.plexData.parentData = await this.plexApi.getMetadata(
                el.plexData.parentRatingKey.toString(),
              );
            }
            return el;
          }),
        )
      ).filter((el) => el.plexData !== undefined);

      return {
        totalSize: itemCount,
        items: entities ?? [],
      };
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions: ' + err,
      );
      return undefined;
    }
  }

  async getCollections(libraryId?: number, typeId?: 1 | 2 | 3 | 4) {
    try {
      const collections = await this.collectionRepo.find(
        libraryId
          ? { where: { libraryId: libraryId } }
          : typeId
            ? { where: { type: typeId } }
            : undefined,
      );
      const ruleGroups = await this.ruleGroupRepo
        .createQueryBuilder('rg')
        .select('rg.collectionId', 'collectionId')
        .addSelect('rg.name', 'name')
        .getRawMany<{ collectionId: number | null; name: string }>();
      const ruleNamesByCollectionId = new Map<number, string>(
        ruleGroups
          .filter((group) => group.collectionId != null)
          .map((group) => [group.collectionId, group.name]),
      );

      return await Promise.all(
        collections.map(async (col) => {
          const colls = await this.CollectionMediaRepo.find({
            where: {
              collectionId: +col.id,
            },
          });
          await this.hydrateMissingCollectionMediaDetails(colls, col);
          return {
            ...col,
            ruleName: ruleNamesByCollectionId.get(col.id),
            media: colls,
          };
        }),
      );
    } catch (err) {
      this.logger.error(
        'An error occurred while performing collection actions.',
        err,
      );
      return undefined;
    }
  }

  async getAllCollections() {
    try {
      return await this.collectionRepo.find();
    } catch (err) {
      this.logger.error('An error occurred while fetching collections.', err);
      return [];
    }
  }

  async createCollection(
    collection: ICollection,
    empty = true,
  ): Promise<{
    plexCollection?: PlexCollection;
    dbCollection: addCollectionDbResponse;
  }> {
    try {
      let plexCollection: PlexCollection;
      if (
        !empty &&
        (collection.manualCollection == undefined ||
          !collection.manualCollection)
      ) {
        const collectionObj: CreateUpdateCollection = {
          libraryId: collection.libraryId.toString(),
          type: collection.type,
          title: collection.title,
          summary: collection?.description,
          sortTitle: collection?.sortTitle,
        };
        plexCollection = await this.createPlexCollection(collectionObj);
        await this.plexApi.UpdateCollectionSettings({
          libraryId: collectionObj.libraryId,
          collectionId: plexCollection.ratingKey,
          recommended: collection.visibleOnRecommended,
          ownHome: collection.visibleOnHome,
          sharedHome: collection.visibleOnHome,
        });
      }
      // in case of manual, just fetch the collection plex ID
      if (collection.manualCollection) {
        plexCollection = await this.findPlexCollection(
          collection.manualCollectionName,
          collection.libraryId,
        );
        if (plexCollection && plexCollection.ratingKey) {
          await this.plexApi.UpdateCollectionSettings({
            libraryId: collection.libraryId,
            collectionId: plexCollection.ratingKey,
            recommended: collection.visibleOnRecommended,
            ownHome: collection.visibleOnHome,
            sharedHome: collection.visibleOnHome,
          });

          collection.plexId = +plexCollection.ratingKey;
        } else {
          this.logger.error(
            `Manual Plex collection not found.. Is the spelling correct? `,
          );
          return undefined;
        }
      }
      // create collection in db
      const collectionDb: addCollectionDbResponse =
        await this.addCollectionToDB(
          collection,
          collection.plexId ? collection.plexId : undefined,
        );
      if (empty && !collection.manualCollection)
        return { dbCollection: collectionDb };
      else
        return { plexCollection: plexCollection, dbCollection: collectionDb };
    } catch (err) {
      this.logger.error(
        `An error occurred while creating or fetching a collection`,
        err,
      );
      return undefined;
    }
  }

  async createCollectionWithChildren(
    collection: ICollection,
    media?: AddRemoveCollectionMedia[],
  ): Promise<{
    plexCollection: PlexCollection;
    dbCollection: addCollectionDbResponse;
  }> {
    try {
      const createdCollection = await this.createCollection(collection, false);

      for (const childMedia of media) {
        await this.addChildToCollection(
          {
            plexId: +createdCollection.plexCollection.ratingKey,
            dbId: createdCollection.dbCollection.id,
          },
          childMedia.plexId,
        );
      }
      return createdCollection as {
        plexCollection: PlexCollection;
        dbCollection: addCollectionDbResponse;
      };
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      return undefined;
    }
  }

  async updateCollection(collection: ICollection): Promise<{
    plexCollection?: PlexCollection;
    dbCollection?: ICollection;
  }> {
    try {
      const dbCollection = await this.collectionRepo.findOne({
        where: { id: +collection.id },
      });

      let plexColl: PlexCollection;
      const sanitizedSortTitle =
        collection?.sortTitle && collection.sortTitle.trim() !== ''
          ? collection.sortTitle
          : null;

      if (dbCollection?.plexId) {
        const collectionObj: CreateUpdateCollection = {
          libraryId: collection.libraryId.toString(),
          title: collection.title,
          type: collection.type,
          collectionId: +dbCollection.plexId,
          summary: collection?.description,
          sortTitle: sanitizedSortTitle ?? undefined,
        };

        // is the type the same & is it an automatic collection, then update
        if (
          collection.type === dbCollection.type &&
          !dbCollection.manualCollection &&
          !collection.manualCollection
        ) {
          plexColl = await this.plexApi.updateCollection(collectionObj);
          await this.plexApi.UpdateCollectionSettings({
            libraryId: dbCollection.libraryId,
            collectionId: dbCollection.plexId,
            recommended: collection.visibleOnRecommended,
            ownHome: collection.visibleOnHome,
            sharedHome: collection.visibleOnHome,
          });
        } else {
          // if the type changed, or the manual collection changed
          if (
            collection.manualCollection !== dbCollection.manualCollection ||
            collection.type !== dbCollection.type ||
            collection.manualCollectionName !==
              dbCollection.manualCollectionName
          ) {
            if (!dbCollection.manualCollection) {
              // Don't remove the collections if it was a manual one
              await this.plexApi.deleteCollection(
                dbCollection.plexId.toString(),
              );
            }
            collection.plexId = null;
          }
        }
      }

      const dbResp: ICollection = await this.saveCollection({
        ...dbCollection,
        ...collection,
        sortTitle: sanitizedSortTitle,
      });

      await this.addLogRecord(
        { id: dbResp.id } as Collection,
        "Successfully updated the collection's settings",
        ECollectionLogType.COLLECTION,
      );

      return { plexCollection: plexColl, dbCollection: dbResp };
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      await this.addLogRecord(
        { id: collection.id } as Collection,
        "Failed to update the collection's settings",
        ECollectionLogType.COLLECTION,
      );
      return undefined;
    }
  }

  public async saveCollection(collection: Collection): Promise<Collection> {
    if (collection.id) {
      const oldCollection = await this.collectionRepo.findOne({
        where: { id: collection.id },
      });

      const response = await this.collectionRepo.save(collection);

      this.eventEmitter.emit(MaintainerrEvent.Collection_Updated, {
        collection: response,
        oldCollection: oldCollection,
      });

      return response;
    } else {
      const response = await this.collectionRepo.save(collection);

      this.eventEmitter.emit(MaintainerrEvent.Collection_Created, {
        collection: response,
      });

      return response;
    }
  }

  public async relinkManualCollection(
    collection: Collection,
  ): Promise<Collection> {
    // refetch manual collection, in case it's ID changed
    if (collection.manualCollection) {
      const plexColl = await this.findPlexCollection(
        collection.manualCollectionName,
        +collection.libraryId,
      );
      if (plexColl) {
        collection.plexId = +plexColl.ratingKey;
        collection = await this.saveCollection(collection);

        await this.addLogRecord(
          { id: collection.id } as Collection,
          'Successfully relinked the manual Plex collection',
          ECollectionLogType.COLLECTION,
        );
      } else {
        this.logger.error(
          'Manual Plex collection not found.. Is it still available in Plex?',
        );
        await this.addLogRecord(
          { id: collection.id } as Collection,
          'Failed to relink the manual Plex collection',
          ECollectionLogType.COLLECTION,
        );
      }
    }
    return collection;
  }

  public async checkAutomaticPlexLink(
    collection: Collection,
  ): Promise<Collection> {
    // checks and fixes automatic collection link
    if (!collection.manualCollection) {
      let plexColl: PlexCollection = undefined;

      if (collection.plexId) {
        plexColl = await this.findPlexCollectionByID(collection.plexId);
      }

      if (!plexColl) {
        plexColl = await this.findPlexCollection(
          collection.title,
          +collection.libraryId,
        );

        if (plexColl) {
          collection.plexId = +plexColl.ratingKey;
          collection = await this.saveCollection(collection);
        }
      }

      // If the collection is empty in Plex, remove it. Otherwise issues when adding media
      if (plexColl && collection.plexId !== null && +plexColl.childCount <= 0) {
        await this.plexApi.deleteCollection(plexColl.ratingKey);
        plexColl = undefined;
      }

      if (!plexColl) {
        collection.plexId = null;
        collection = await this.saveCollection(collection);
      }
    }
    return collection;
  }

  async MediaCollectionActionWithContext(
    collectionDbId: number,
    context: IAlterableMediaDto,
    media: AddRemoveCollectionMedia,
    action: 'add' | 'remove',
  ): Promise<Collection> {
    const collection =
      collectionDbId !== -1 && collectionDbId !== undefined
        ? await this.collectionRepo.findOne({
            where: { id: collectionDbId },
          })
        : undefined;

    // get media
    const handleMedia: AddRemoveCollectionMedia[] =
      (await this.plexApi.getAllIdsForContextAction(
        collection ? collection.type : undefined,
        context,
        media,
      )) as unknown as AddRemoveCollectionMedia[];

    if (handleMedia) {
      if (action === 'add') {
        return this.addToCollection(collectionDbId, handleMedia, true);
      } else if (action === 'remove') {
        if (collectionDbId) {
          return this.removeFromCollection(collectionDbId, handleMedia);
        } else {
          await this.removeFromAllCollections(handleMedia);
        }
      }
    }
  }

  async addToCollection(
    collectionDbId: number,
    media: AddRemoveCollectionMedia[],
    manual = false,
  ): Promise<Collection> {
    try {
      let collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });
      const collectionMedia = await this.CollectionMediaRepo.find({
        where: { collectionId: collectionDbId },
      });

      // filter already existing out
      media = media.filter(
        (m) => !collectionMedia.find((el) => el.plexId === m.plexId),
      );

      if (collection) {
        collection = await this.checkAutomaticPlexLink(collection);
        if (media.length > 0) {
          if (!collection.plexId) {
            let newColl: PlexCollection = undefined;
            if (collection.manualCollection) {
              newColl = await this.findPlexCollection(
                collection.manualCollectionName,
                +collection.libraryId,
              );
            } else {
              newColl = await this.createPlexCollection({
                libraryId: collection.libraryId.toString(),
                type: collection.type,
                title: collection.title,
                summary: collection.description,
                sortTitle: collection.sortTitle,
              });
            }
            if (newColl) {
              collection = await this.collectionRepo.save({
                ...collection,
                plexId: +newColl.ratingKey,
              });
              await this.plexApi.UpdateCollectionSettings({
                libraryId: collection.libraryId,
                collectionId: collection.plexId,
                recommended: collection.visibleOnRecommended,
                ownHome: collection.visibleOnHome,
                sharedHome: collection.visibleOnHome,
              });
            } else {
              if (collection.manualCollection) {
                this.logger.warn(
                  `Manual Collection '${collection.manualCollectionName}' doesn't exist in Plex..`,
                );
              }
            }
          }
          // add children to collection
          for (const childMedia of media) {
            await this.addChildToCollection(
              { plexId: +collection.plexId, dbId: collection.id },
              childMedia.plexId,
              manual,
              childMedia.reason,
              collection,
            );
          }
        }
        return collection;
      } else {
        this.logger.warn("Collection doesn't exist.");
      }
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      return undefined;
    }
  }

  async removeFromCollection(
    collectionDbId: number,
    media: AddRemoveCollectionMedia[],
  ) {
    try {
      let collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });
      collection = await this.checkAutomaticPlexLink(collection);
      let collectionMedia = await this.CollectionMediaRepo.find({
        where: {
          collectionId: collectionDbId,
        },
      });
      if (collectionMedia.length > 0) {
        for (const childMedia of media) {
          if (
            collectionMedia.find((el) => +el.plexId === +childMedia.plexId) !==
            undefined
          ) {
            await this.removeChildFromCollection(
              { plexId: +collection.plexId, dbId: collection.id },
              childMedia.plexId,
              childMedia.reason,
            );

            collectionMedia = collectionMedia.filter(
              (el) => +el.plexId !== +childMedia.plexId,
            );
          }
        }

        if (
          collectionMedia.length <= 0 &&
          !collection.manualCollection &&
          collection.plexId
        ) {
          const resp = await this.plexApi.deleteCollection(
            collection.plexId.toString(),
          );

          if (resp.code === 1) {
            collection = await this.collectionRepo.save({
              ...collection,
              plexId: null,
            });
          } else {
            this.logger.warn(resp.message);
          }
        }
      }
      return collection;
    } catch (err) {
      this.logger.error(
        `An error occurred while removing media from collection with internal id ${collectionDbId}`,
        err,
      );
      return undefined;
    }
  }

  async removeFromAllCollections(media: AddRemoveCollectionMedia[]) {
    try {
      const collections = await this.collectionRepo.find();
      for (const collection of collections) {
        await this.removeFromCollection(collection.id, media);
      }
      return { status: 'OK', code: 1, message: 'Success' };
    } catch (e) {
      this.logger.warn(
        `An error occurred while removing media from all collections : ${e}`,
      );
      return { status: 'NOK', code: 0, message: 'Failed' };
    }
  }

  async deleteCollection(collectionDbId: number) {
    try {
      let collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });
      collection = await this.checkAutomaticPlexLink(collection);

      let status = { code: 1, status: 'OK' };
      if (collection.plexId && !collection.manualCollection) {
        status = await this.plexApi.deleteCollection(
          collection.plexId.toString(),
        );
      }
      if (status.status === 'OK') {
        return await this.RemoveCollectionFromDB(collection);
      } else {
        this.logger.warn('An error occurred while deleting the collection.');
      }
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      return undefined;
    }
  }

  public async deactivateCollection(collectionDbId: number) {
    try {
      const collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });

      if (!collection.manualCollection) {
        await this.plexApi.deleteCollection(collection.plexId.toString());
      }

      await this.CollectionMediaRepo.delete({ collectionId: collection.id });
      await this.saveCollection({
        ...collection,
        isActive: false,
        plexId: null,
      });

      await this.addLogRecord(
        { id: collectionDbId } as Collection,
        'Collection deactivated',
        ECollectionLogType.COLLECTION,
      );

      const rulegroup = await this.ruleGroupRepo.findOne({
        where: {
          collectionId: collection.id,
        },
      });
      if (rulegroup) {
        await this.ruleGroupRepo.save({
          ...rulegroup,
          isActive: false,
        });
      }
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      return undefined;
    }
  }

  public async activateCollection(collectionDbId: number) {
    try {
      const collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });

      await this.saveCollection({
        ...collection,
        isActive: true,
      });

      await this.addLogRecord(
        { id: collectionDbId } as Collection,
        'Collection activated',
        ECollectionLogType.COLLECTION,
      );

      const rulegroup = await this.ruleGroupRepo.findOne({
        where: {
          collectionId: collection.id,
        },
      });
      if (rulegroup) {
        await this.ruleGroupRepo.save({
          ...rulegroup,
          isActive: true,
        });
      }
    } catch (err) {
      this.logger.error(
        'An error occurred while performing collection actions.',
        err,
      );
      return undefined;
    }
  }

  private async addChildToCollection(
    collectionIds: { plexId: number; dbId: number },
    childId: number,
    manual = false,
    logMeta?: CollectionLogMeta,
    collection?: Collection,
  ) {
    try {
      this.infoLogger(`Adding media with id ${childId} to collection..`);

      const tmdb = await this.tmdbIdHelper.getTmdbIdFromPlexRatingKey(
        childId.toString(),
      );
      const activeCollection =
        collection ??
        (await this.collectionRepo.findOne({
          where: { id: collectionIds.dbId },
        }));
      const mediaSize = await this.getManagedMediaSizeBytes(
        activeCollection,
        childId,
      );
      const plexMetadata = await this.plexApi.getMetadata(childId.toString());
      const mediaTitle = this.getPlexMediaTitle(plexMetadata);

      let tmdbMedia: TmdbTvDetails | TmdbMovieDetails;
      switch (tmdb.type) {
        case 'movie':
          tmdbMedia = await this.tmdbApi.getMovie({ movieId: tmdb.id });
          break;
        case 'tv':
          tmdbMedia = await this.tmdbApi.getTvShow({ tvId: tmdb.id });
          break;
      }

      const responseColl: PlexCollection | BasicResponseDto =
        await this.plexApi.addChildToCollection(
          collectionIds.plexId.toString(),
          childId.toString(),
        );

      if ('ratingKey' in responseColl) {
        await this.connection
          .createQueryBuilder()
          .insert()
          .into(CollectionMedia)
          .values([
            {
              collectionId: collectionIds.dbId,
              plexId: childId,
              addDate: new Date().toDateString(),
              tmdbId: tmdbMedia?.id,
              image_path: tmdbMedia?.poster_path,
              title: mediaTitle,
              size: mediaSize,
              isManual: manual,
            },
          ])
          .execute();

        // log record
        await this.CollectionLogRecordForChild(
          childId,
          collectionIds.dbId,
          'add',
          logMeta,
        );
      } else {
        this.logger.warn(
          `Couldn't add media to collection: 
          ${responseColl.message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `An error occurred while performing collection actions: ${err}`,
      );
      return undefined;
    }
  }

  public async CollectionLogRecordForChild(
    plexId: number,
    collectionId: number,
    type: 'add' | 'remove' | 'handle' | 'exclude' | 'include',
    logMeta?: CollectionLogMeta,
  ) {
    // log record
    const plexData = await this.plexApi.getMetadata(plexId.toString()); // fetch data from cache
    // if there's no data.. skip logging

    if (plexData) {
      const subject =
        plexData.type === 'episode'
          ? `${plexData.grandparentTitle} - season ${plexData.parentIndex} - episode ${plexData.index}`
          : plexData.type === 'season'
            ? `${plexData.parentTitle} - season ${plexData.index}`
            : plexData.title;
      await this.addLogRecord(
        { id: collectionId } as Collection,
        `${type === 'add' ? 'Added' : type === 'handle' ? 'Successfully handled' : type === 'exclude' ? 'Added a specific exclusion for' : type === 'include' ? 'Removed specific exclusion of' : 'Removed'} "${subject}"`,
        ECollectionLogType.MEDIA,
        logMeta,
      );
    }
  }

  private async removeChildFromCollection(
    collectionIds: { plexId: number; dbId: number },
    childId: number,
    logMeta?: CollectionLogMeta,
  ) {
    try {
      this.infoLogger(`Removing media with id ${childId} from collection..`);

      const responseColl: BasicResponseDto =
        await this.plexApi.deleteChildFromCollection(
          collectionIds.plexId.toString(),
          childId.toString(),
        );
      if (
        responseColl.status === 'OK' ||
        responseColl.message.includes('404') // if media is not in collection
      ) {
        await this.connection
          .createQueryBuilder()
          .delete()
          .from(CollectionMedia)
          .where([
            {
              collectionId: collectionIds.dbId,
              plexId: childId,
            },
          ])
          .execute();

        await this.CollectionLogRecordForChild(
          childId,
          collectionIds.dbId,
          'remove',
          logMeta,
        );
      } else {
        this.infoLogger(
          `Couldn't remove media from collection: ` + responseColl.message,
        );
      }
    } catch (err) {
      this.logger.error(
        'An error occurred while performing collection actions.',
        err,
      );
      return undefined;
    }
  }

  private async addCollectionToDB(
    collection: ICollection,
    plexId?: number,
  ): Promise<addCollectionDbResponse> {
    this.infoLogger(`Adding collection to the database..`);
    try {
      const dbCol = (
        await this.connection
          .createQueryBuilder()
          .insert()
          .into(Collection)
          .values([
            {
              title: collection.title,
              description: collection.description,
              plexId: plexId,
              type: collection.type,
              libraryId: collection.libraryId,
              arrAction: collection.arrAction ? collection.arrAction : 0,
              isActive: collection.isActive,
              visibleOnRecommended: collection.visibleOnRecommended,
              visibleOnHome: collection.visibleOnHome,
              deleteAfterDays: collection.deleteAfterDays,
              listExclusions: collection.listExclusions,
              forceOverseerr: collection.forceOverseerr,
              keepLogsForMonths: collection.keepLogsForMonths,
              tautulliWatchedPercentOverride:
                collection.tautulliWatchedPercentOverride ?? null,
              manualCollection:
                collection.manualCollection !== undefined
                  ? collection.manualCollection
                  : false,
              manualCollectionName:
                collection.manualCollectionName !== undefined
                  ? collection.manualCollectionName
                  : '',
              sonarrSettingsId: collection.sonarrSettingsId,
              radarrSettingsId: collection.radarrSettingsId,
              sortTitle: collection.sortTitle,
              pathSelectionEnabled:
                collection.pathSelectionEnabled ?? false,
              selectedPaths: collection.selectedPaths ?? [],
            },
          ])
          .execute()
      ).generatedMaps[0] as addCollectionDbResponse;

      await this.addLogRecord(
        dbCol as Collection,
        'Collection Created',
        ECollectionLogType.COLLECTION,
      );
      return dbCol;
    } catch (err) {
      this.logger.error(
        `Something went wrong creating the collection in the database..`,
        err,
      );
      return undefined;
    }
  }

  private async RemoveCollectionFromDB(
    collection: ICollection,
  ): Promise<BasicResponseDto> {
    this.infoLogger(`Removing collection from database..`);
    try {
      await this.collectionRepo.delete(collection.id);

      this.eventEmitter.emit(MaintainerrEvent.Collection_Deleted, {
        collection,
      });

      this.infoLogger(
        `Collection with id ${collection.id} has been removed from the database.`,
      );

      return { status: 'OK', code: 1, message: 'Success' };
    } catch (err) {
      this.logger.error(
        `Something went wrong deleting the collection from the database..`,
        err,
      );
      return { status: 'NOK', code: 0, message: 'Removing from DB failed' };
    }
  }

  private async createPlexCollection(
    collectionData: CreateUpdateCollection,
  ): Promise<PlexCollection> {
    try {
      this.infoLogger(`Creating collection in Plex..`);
      const resp = await this.plexApi.createCollection(collectionData);
      if (resp?.ratingKey) {
        return resp;
      } else {
        return resp[0];
      }
    } catch (err) {
      this.logger.error(
        'An error occurred while performing collection actions.',
        err,
      );
      return undefined;
    }
  }

  public async findPlexCollection(
    name: string,
    libraryId: number,
  ): Promise<PlexCollection> {
    try {
      const resp = await this.plexApi.getCollections(libraryId.toString());
      if (resp) {
        const found = resp.find((coll) => {
          return coll.title.trim() === name.trim() && !coll.smart;
        });

        return found?.ratingKey !== undefined ? found : undefined;
      }
    } catch (err) {
      this.logger.error(
        'An error occurred while searching for a specific Plex collection.',
        err,
      );

      return undefined;
    }
  }

  public async findPlexCollectionByID(id: number): Promise<PlexCollection> {
    try {
      const result = await this.plexApi.getCollection(id);

      if (result?.smart) {
        this.logger.warn(
          `Plex collection ${id} is a smart collection which is not supported.`,
        );
        return undefined;
      }

      return result;
    } catch (err) {
      this.logger.error(
        'An error occurred while searching for a specific Plex collection.',
        err,
      );
      return undefined;
    }
  }

  async getCollectionLogsWithPaging(
    id: number,
    { offset = 0, size = 25 }: { offset?: number; size?: number } = {},
    search: string = undefined,
    sort: 'ASC' | 'DESC' = 'DESC',
    filter: ECollectionLogType = undefined,
  ) {
    const queryBuilder =
      this.CollectionLogRepo.createQueryBuilder('collection_log');

    queryBuilder
      .where(`collection_log.collectionId = ${id}`)
      .orderBy('id', sort)
      .skip(offset)
      .take(size);

    if (search !== undefined) {
      queryBuilder.andWhere(`collection_log.message like '%${search}%'`);
    }
    if (filter !== undefined) {
      queryBuilder.andWhere(`collection_log.type like '%${filter}%'`);
    }

    const itemCount = await queryBuilder.getCount();
    const { entities } = await queryBuilder.getRawAndEntities();

    return {
      totalSize: itemCount,
      items: entities ?? [],
    };
  }

  public async addLogRecord(
    collection: Collection,
    message: string,
    type: ECollectionLogType,
    meta?: CollectionLogMeta,
  ) {
    await this.connection
      .createQueryBuilder()
      .insert()
      .into(CollectionLog)
      .values([
        {
          collection,
          timestamp: new Date(),
          message,
          type,
          meta,
        },
      ])
      .execute();
  }

  public async removeAllCollectionLogs(collectionId: number) {
    const collection = await this.collectionRepo.findOne({
      where: { id: collectionId },
    });
    await this.CollectionLogRepo.delete({ collection: collection });
  }

  /**
   * Remove old collection logs based on the provided collection ID and months.
   *
   * @param {number} collectionId - The ID of the collection to remove logs from
   * @param {number} months - The number of months to go back for log removal
   */
  async removeOldCollectionLogs(collection: Collection) {
    try {
      // If keepLogsForMonths is 0, no need to remove logs. User explicitly configured it to keep logs forever
      if (collection.keepLogsForMonths !== 0) {
        const currentDate = new Date();
        const configuredMonths = new Date(currentDate);

        // Calculate the target month and year
        let targetMonth = currentDate.getMonth() - collection.keepLogsForMonths;
        let targetYear = currentDate.getFullYear();

        // Adjust for negative months
        while (targetMonth < 0) {
          targetMonth += 12;
          targetYear -= 1;
        }

        // Ensure the day is within bounds for the target month
        const targetDay = Math.min(
          currentDate.getDate(),
          new Date(targetYear, targetMonth + 1, 0).getDate(),
        );

        configuredMonths.setMonth(targetMonth);
        configuredMonths.setFullYear(targetYear);
        configuredMonths.setDate(targetDay);

        // get all logs older than param
        const logs = await this.CollectionLogRepo.find({
          where: {
            collection: collection,
            timestamp: LessThan(configuredMonths),
          },
        });

        if (logs.length > 0) {
          // delete all old logs
          await this.CollectionLogRepo.remove(logs);
          this.infoLogger(
            `Removed ${logs.length} old collection log ${logs.length === 1 ? 'record' : 'records'} from collection '${collection.title}'`,
          );
          await this.addLogRecord(
            collection,
            `Removed ${logs.length} log ${logs.length === 1 ? 'record' : 'records'} older than ${collection.keepLogsForMonths} months`,
            ECollectionLogType.COLLECTION,
          );
        }
      }
    } catch (e) {
      this.logger.warn(
        `An error occurred while removing old collection logs for collection '${collection?.title}'`,
      );
      this.logger.debug(e);
    }
  }

  private infoLogger(message: string) {
    this.logger.log(message);
  }

  private getPlexMediaTitle(metadata?: PlexMetadata): string | null {
    const title = metadata?.title?.trim();
    if (!title) {
      return null;
    }

    if (metadata?.type === 'season') {
      const showTitle = metadata.parentTitle?.trim();
      if (showTitle) {
        return `${showTitle}: ${title}`;
      }
    }

    return title;
  }

  private async hydrateMissingCollectionMediaDetails(
    mediaRows: CollectionMedia[],
    collection?: Collection,
  ): Promise<void> {
    const rowsMissingDetails = mediaRows.filter(
      (row) =>
        row.size === null ||
        row.size === undefined ||
        row.title === null ||
        row.title === undefined ||
        row.title.trim() === '',
    );

    if (rowsMissingDetails.length === 0) {
      return;
    }

    const activeCollection =
      collection ??
      (await this.collectionRepo.findOne({
        where: { id: mediaRows[0]?.collectionId },
      }));

    await Promise.all(
      rowsMissingDetails.map(async (row) => {
        try {
          const updatePayload: Partial<CollectionMedia> = {};
          const size = await this.getManagedMediaSizeBytes(
            activeCollection,
            row.plexId,
          );

          if (
            (row.size === null || row.size === undefined) &&
            size !== null
          ) {
            row.size = size;
            updatePayload.size = size;
          }

          if (
            row.title === null ||
            row.title === undefined ||
            row.title === ''
          ) {
            const metadata = await this.plexApi.getMetadata(row.plexId.toString());
            const title = this.getPlexMediaTitle(metadata);
            if (title !== null) {
              row.title = title;
              updatePayload.title = title;
            }
          }

          if (Object.keys(updatePayload).length > 0) {
            await this.CollectionMediaRepo.update({ id: row.id }, updatePayload);
          }
        } catch (error) {
          this.logger.debug(
            `Unable to hydrate media details for plexId ${row.plexId}: ${error}`,
          );
        }
      }),
    );
  }

  private async getManagedMediaSizeBytes(
    collection: Collection | null | undefined,
    plexId: number,
  ): Promise<number | null> {
    if (!collection) {
      return null;
    }

    if (
      collection.type === EPlexDataType.MOVIES &&
      collection.radarrSettingsId !== null &&
      collection.radarrSettingsId !== undefined
    ) {
      return await this.getRadarrManagedSizeBytes(
        plexId,
        collection.radarrSettingsId,
      );
    }

    if (
      collection.sonarrSettingsId === null ||
      collection.sonarrSettingsId === undefined
    ) {
      return null;
    }

    return await this.getSonarrManagedSizeBytes(
      plexId,
      collection.sonarrSettingsId,
    );
  }

  private async getRadarrManagedSizeBytes(
    plexId: number,
    radarrSettingsId: number,
  ): Promise<number | null> {
    const tmdb = await this.tmdbIdHelper.getTmdbIdFromPlexRatingKey(
      plexId.toString(),
    );
    if (!tmdb?.id) {
      return null;
    }

    const radarrApiClient = await this.servarrService.getRadarrApiClient(
      radarrSettingsId,
    );
    const movie = await radarrApiClient.getMovieByTmdbId(tmdb.id);

    return movie?.sizeOnDisk ?? movie?.movieFile?.size ?? null;
  }

  private async getSonarrManagedSizeBytes(
    plexId: number,
    sonarrSettingsId: number,
  ): Promise<number | null> {
    const sonarrApiClient = await this.servarrService.getSonarrApiClient(
      sonarrSettingsId,
    );
    const metadata = await this.plexApi.getMetadata(plexId.toString());
    if (!metadata) {
      return null;
    }

    let showMetadata = metadata;
    let seasonNumber: number | undefined;
    let episodeNumber: number | undefined;

    if (metadata.type === 'season') {
      seasonNumber = metadata.index;
      if (metadata.parentRatingKey) {
        showMetadata = await this.plexApi.getMetadata(metadata.parentRatingKey);
      }
    } else if (metadata.type === 'episode') {
      seasonNumber = metadata.parentIndex;
      episodeNumber = metadata.index;
      if (metadata.grandparentRatingKey) {
        showMetadata = await this.plexApi.getMetadata(
          metadata.grandparentRatingKey,
        );
      }
    }

    if (!showMetadata) {
      return null;
    }

    const tvdbId = await this.findTvdbIdFromPlexMetadata(showMetadata);
    if (!tvdbId) {
      return null;
    }

    const series = await sonarrApiClient.getSeriesByTvdbId(tvdbId);
    if (!series?.id) {
      return null;
    }

    if (episodeNumber !== undefined && seasonNumber !== undefined) {
      const episodes = await sonarrApiClient.getEpisodes(series.id, seasonNumber, [
        episodeNumber,
      ]);
      const episode = episodes?.[0];
      if (!episode?.episodeFileId) {
        return null;
      }
      const episodeFile = await sonarrApiClient.getEpisodeFile(
        episode.episodeFileId,
      );
      return episodeFile?.size ?? null;
    }

    if (seasonNumber !== undefined) {
      const season = series.seasons?.find((el) => el.seasonNumber === seasonNumber);
      return season?.statistics?.sizeOnDisk ?? null;
    }

    return series.statistics?.sizeOnDisk ?? null;
  }

  private async findTvdbIdFromPlexMetadata(
    metadata: PlexMetadata,
  ): Promise<number | null> {
    const fromGuid = this.extractGuidId(metadata, 'tvdb');
    if (fromGuid) {
      return fromGuid;
    }

    const tmdb = await this.tmdbIdHelper.getTmdbIdFromPlexData(metadata);
    if (!tmdb?.id) {
      return null;
    }

    const tmdbShow = await this.tmdbApi.getTvShow({ tvId: tmdb.id });
    return tmdbShow?.external_ids?.tvdb_id ?? null;
  }

  private extractGuidId(
    metadata: PlexMetadata,
    provider: 'tvdb' | 'tmdb' | 'imdb',
  ): number | null {
    if (metadata.Guid?.length) {
      const guid = metadata.Guid.find((el) => el.id.includes(provider))?.id;
      if (guid) {
        const parsed = Number(guid.split('://')[1]);
        return Number.isNaN(parsed) ? null : parsed;
      }
    }

    if (metadata.guid?.includes(provider)) {
      const parsed = Number(metadata.guid.split('://')[1]?.split('?')[0]);
      return Number.isNaN(parsed) ? null : parsed;
    }

    return null;
  }
}
