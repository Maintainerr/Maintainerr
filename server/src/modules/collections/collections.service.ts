import { CollectionLogMeta, ECollectionLogType } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { CollectionLog } from '../../modules/collections/entities/collection_log.entities';
import { BasicResponseDto } from '../api/plex-api/dto/basic-response.dto';
import {
  CreateUpdateCollection,
  PlexCollection,
} from '../api/plex-api/interfaces/collection.interface';
import { PlexApiService } from '../api/plex-api/plex-api.service';
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
    private readonly tmdbApi: TmdbApiService,
    private readonly tmdbIdHelper: TmdbIdService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(CollectionsService.name);
  }

  async getCollection(id?: number, title?: string) {
    try {
      if (title) {
        return await this.collectionRepo.findOne({ where: { title: title } });
      } else {
        return await this.collectionRepo.findOne({ where: { id: id } });
      }
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      return undefined;
    }
  }

  async getCollectionMedia(id: number) {
    try {
      return await this.CollectionMediaRepo.find({
        where: { collectionId: id },
      });
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions: ' + err,
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
      const queryBuilder =
        this.CollectionMediaRepo.createQueryBuilder('collection_media');

      queryBuilder
        .where('collection_media.collectionId = :id', { id })
        .orderBy('collection_media.addDate', 'DESC')
        .skip(offset)
        .take(size);

      const itemCount = await queryBuilder.getCount();
      const { entities } = await queryBuilder.getRawAndEntities();

      const entitiesWithPlexData: CollectionMediaWithPlexData[] = (
        await Promise.all(
          entities.map(async (el) => {
            const plexData = await this.plexApi.getMetadata(
              el.plexId.toString(),
            );

            if (plexData?.type === 'episode' && plexData.grandparentRatingKey) {
              plexData.parentData = await this.plexApi.getMetadata(
                plexData.grandparentRatingKey.toString(),
              );
            } else if (
              plexData?.type === 'season' &&
              plexData.parentRatingKey
            ) {
              plexData.parentData = await this.plexApi.getMetadata(
                plexData.parentRatingKey.toString(),
              );
            }
            return {
              ...el,
              plexData,
            };
          }),
        )
      ).filter((el) => el.plexData !== undefined);

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
            if (
              el.plexData?.type === 'episode' &&
              el.plexData.grandparentRatingKey
            ) {
              el.plexData.parentData = await this.plexApi.getMetadata(
                el.plexData.grandparentRatingKey.toString(),
              );
            } else if (
              el.plexData?.type === 'season' &&
              el.plexData.parentRatingKey
            ) {
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

      return await Promise.all(
        collections.map(async (col) => {
          const colls = await this.CollectionMediaRepo.find({
            where: {
              collectionId: +col.id,
            },
          });
          return {
            ...col,
            media: colls,
          };
        }),
      );
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  async getAllCollections() {
    try {
      return await this.collectionRepo.find();
    } catch (err) {
      this.logger.warn('An error occurred while fetching collections.');
      this.logger.debug(err);
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
        `An error occurred while creating or fetching a collection: ${err}`,
      );
      this.logger.debug(err);
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

      if (dbCollection?.plexId) {
        const collectionObj: CreateUpdateCollection = {
          libraryId: collection.libraryId.toString(),
          title: collection.title,
          type: collection.type,
          collectionId: +dbCollection.plexId,
          summary: collection?.description,
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
            dbCollection.plexId = null;
          }
        }
      }

      const dbResp: ICollection = await this.collectionRepo.save({
        ...dbCollection,
        ...collection,
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
    return await this.collectionRepo.save({
      ...collection,
    });
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
      this.logger.warn(
        `An error occurred while removing media from collection with internal id ${collectionDbId}`,
      );
      this.logger.debug(err);
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
      await this.collectionRepo.save({
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

      await this.collectionRepo.save({
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
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      return undefined;
    }
  }

  private async addChildToCollection(
    collectionIds: { plexId: number; dbId: number },
    childId: number,
    manual = false,
    logMeta?: CollectionLogMeta,
  ) {
    try {
      this.infoLogger(`Adding media with id ${childId} to collection..`);

      const tmdb = await this.tmdbIdHelper.getTmdbIdFromPlexRatingKey(
        childId.toString(),
      );

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
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  private async addCollectionToDB(
    collection: ICollection,
    plexId?: number,
  ): Promise<addCollectionDbResponse> {
    try {
      this.infoLogger(`Adding collection to the Database..`);
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
        // Log error
        this.infoLogger(
          `Something went wrong creating the collection in the Database..`,
        );
        this.logger.debug(err);
      }
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  private async RemoveCollectionFromDB(
    collection: ICollection,
  ): Promise<BasicResponseDto> {
    try {
      this.infoLogger(`Removing collection from Database..`);
      try {
        await this.CollectionMediaRepo.delete({ collectionId: collection.id }); // cascade delete doesn't work for some reason..
        await this.CollectionLogRepo.delete({ collection: collection }); // cascade delete doesn't work for some reason..
        await this.collectionRepo.delete(collection.id);

        await this.addLogRecord(
          { id: collection.id } as Collection,
          'Collection Removed',
          ECollectionLogType.COLLECTION,
        );

        return { status: 'OK', code: 1, message: 'Success' };
      } catch (err) {
        this.infoLogger(
          `Something went wrong deleting the collection from the Database..`,
        );
        this.logger.debug(err);
        return { status: 'NOK', code: 0, message: 'Removing from DB failed' };
      }
    } catch (err) {
      this.logger.debug(err);
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
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      this.logger.debug(err);
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
      this.logger.warn(
        'An error occurred while searching for a specific Plex collection.',
      );
      this.logger.debug(err);

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
      this.logger.warn(
        'An error occurred while searching for a specific Plex collection.',
      );
      this.logger.debug(err);
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
}
