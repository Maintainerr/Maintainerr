import {
  BasicResponseDto,
  CollectionLogMeta,
  ECollectionLogType,
  isMediaType,
  MaintainerrEvent,
  MediaCollection,
  MediaItem,
  MediaItemType,
  MediaItemWithParent,
  MediaServerFeature,
  MediaServerType,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, LessThan, Repository } from 'typeorm';
import { CollectionLog } from '../../modules/collections/entities/collection_log.entities';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '../api/tmdb-api/interfaces/tmdb.interface';
import { TmdbIdService } from '../api/tmdb-api/tmdb-id.service';
import { TmdbApiService } from '../api/tmdb-api/tmdb.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { SettingsService } from '../settings/settings.service';
import { Collection } from './entities/collection.entities';
import {
  CollectionMedia,
  CollectionMediaWithMetadata,
} from './entities/collection_media.entities';
import {
  AddRemoveCollectionMedia,
  IAlterableMediaDto,
} from './interfaces/collection-media.interface';
import { ICollection } from './interfaces/collection.interface';

interface addCollectionDbResponse {
  id: number;
  mediaServerId?: string;
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
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly settingsService: SettingsService,
    private readonly tmdbApi: TmdbApiService,
    private readonly tmdbIdHelper: TmdbIdService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(CollectionsService.name);
  }

  /**
   * Get the appropriate media server service based on current settings
   */
  private async getMediaServer(): Promise<IMediaServerService> {
    return this.mediaServerFactory.getService();
  }

  /**
   * Get the currently configured media server type
   */
  private async getMediaServerType(): Promise<MediaServerType | null> {
    return this.mediaServerFactory.getConfiguredServerType();
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
    if (id !== undefined) {
      return await this.CollectionMediaRepo.count({
        where: { collectionId: id },
      });
    }
    // No id = count ALL media across all collections
    return await this.CollectionMediaRepo.count();
  }

  public async getCollectionMediaWithServerDataAndPaging(
    id: number,
    { offset = 0, size = 25 }: { offset?: number; size?: number } = {},
  ): Promise<{ totalSize: number; items: CollectionMediaWithMetadata[] }> {
    try {
      const mediaServer = await this.getMediaServer();
      const queryBuilder =
        this.CollectionMediaRepo.createQueryBuilder('collection_media');

      queryBuilder
        .where('collection_media.collectionId = :id', { id })
        .orderBy('collection_media.addDate', 'DESC')
        .skip(offset)
        .take(size);

      const itemCount = await queryBuilder.getCount();
      const { entities } = await queryBuilder.getRawAndEntities();

      const entitiesWithMediaData: CollectionMediaWithMetadata[] = (
        await Promise.all(
          entities.map(async (el) => {
            const mediaItem = await mediaServer.getMetadata(el.mediaServerId);

            if (!mediaItem) {
              this.logger.debug(
                `Missing metadata for collection media ${el.id} (mediaServerId=${el.mediaServerId}); skipping item without deleting`,
              );
              return { ...el, mediaData: undefined };
            }

            // Get parent metadata if needed (for episodes/seasons)
            let parentItem: MediaItem | undefined;
            if (mediaItem.grandparentId) {
              parentItem = await mediaServer.getMetadata(
                mediaItem.grandparentId,
              );
            } else if (mediaItem.parentId) {
              parentItem = await mediaServer.getMetadata(mediaItem.parentId);
            }

            const mediaData: MediaItemWithParent = {
              ...mediaItem,
              parentItem,
            };

            return {
              ...el,
              mediaData,
            };
          }),
        )
      ).filter((el) => el.mediaData !== undefined);

      return {
        totalSize: itemCount,
        items: entitiesWithMediaData ?? [],
      };
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions: ' + err,
      );
      return undefined;
    }
  }

  /**
   * Removes collection_media entries whose mediaServerId no longer exists
   * on the media server. Only call after verifying the server is reachable
   * (e.g., after testConnections() in the maintenance task).
   */
  async removeStaleCollectionMedia(): Promise<void> {
    const allMedia = await this.CollectionMediaRepo.find();
    const mediaServer = await this.getMediaServer();
    let removedCount = 0;

    for (const entry of allMedia) {
      const metadata = await mediaServer.getMetadata(entry.mediaServerId);
      if (!metadata?.id) {
        await this.CollectionMediaRepo.delete(entry.id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.log(
        `Removed ${removedCount} stale collection media entries (items no longer on media server)`,
      );
    }
  }

  public async getCollectionExclusionsWithServerDataAndPaging(
    id: number,
    { offset = 0, size = 25 }: { offset?: number; size?: number } = {},
  ): Promise<{ totalSize: number; items: Exclusion[] }> {
    try {
      const mediaServer = await this.getMediaServer();
      const rulegroup = await this.ruleGroupRepo.findOne({
        where: {
          collectionId: id,
        },
      });

      if (!rulegroup) {
        return { totalSize: 0, items: [] };
      }

      const groupId = rulegroup.id;

      // Determine which exclusion types to show based on collection dataType
      // Parent type exclusions should be shown (show exclusion appears in season collection)
      const validTypes: string[] = [rulegroup.dataType];
      if (rulegroup.dataType === 'season') {
        validTypes.push('show');
      } else if (rulegroup.dataType === 'episode') {
        validTypes.push('show', 'season');
      }

      const queryBuilder = this.exclusionRepo.createQueryBuilder('exclusion');

      queryBuilder
        .where(
          new Brackets((qb) => {
            qb.where('exclusion.ruleGroupId = :groupId', { groupId }).orWhere(
              'exclusion.ruleGroupId is null',
            );
          }),
        )
        .andWhere('exclusion.type IN (:...validTypes)', { validTypes })
        .orderBy('id', 'DESC')
        .skip(offset)
        .take(size);

      const itemCount = await queryBuilder.getCount();
      let { entities } = await queryBuilder.getRawAndEntities();

      entities = (
        await Promise.all(
          entities.map(async (el) => {
            const mediaItem = await mediaServer.getMetadata(
              el.mediaServerId.toString(),
            );

            if (!mediaItem) {
              return { ...el, mediaData: undefined };
            }

            // Get parent metadata if needed (for episodes/seasons)
            let parentItem: MediaItem | undefined;
            if (mediaItem.grandparentId) {
              parentItem = await mediaServer.getMetadata(
                mediaItem.grandparentId,
              );
            } else if (mediaItem.parentId) {
              parentItem = await mediaServer.getMetadata(mediaItem.parentId);
            }

            el.mediaData = {
              ...mediaItem,
              parentItem,
            };
            return el;
          }),
        )
      ).filter((el) => el.mediaData !== undefined);

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

  async getCollections(libraryId?: string, typeId?: MediaItemType) {
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
    dbCollection: addCollectionDbResponse;
  }> {
    try {
      const mediaServer = await this.getMediaServer();
      let mediaCollection: MediaCollection;

      if (
        !empty &&
        (collection.manualCollection == undefined ||
          !collection.manualCollection)
      ) {
        // Create collection via media server abstraction
        mediaCollection = await mediaServer.createCollection({
          libraryId: collection.libraryId,
          title: collection.title,
          summary: collection?.description,
          sortTitle: collection?.sortTitle,
          type: collection.type,
        });

        // Store the media server ID from the created collection
        collection.mediaServerId = mediaCollection.id;

        // Handle visibility settings (Plex-only feature)
        if (
          mediaServer.supportsFeature(MediaServerFeature.COLLECTION_VISIBILITY)
        ) {
          await mediaServer.updateCollectionVisibility({
            libraryId: collection.libraryId,
            collectionId: mediaCollection.id,
            recommended: collection.visibleOnRecommended,
            ownHome: collection.visibleOnHome,
            sharedHome: collection.visibleOnHome,
          });
        }
      }
      // in case of manual, just fetch the collection media server ID
      if (collection.manualCollection) {
        const foundCollection = await this.findMediaServerCollection(
          collection.manualCollectionName,
          collection.libraryId,
        );
        if (foundCollection) {
          // Handle visibility settings (Plex-only feature)
          if (
            mediaServer.supportsFeature(
              MediaServerFeature.COLLECTION_VISIBILITY,
            )
          ) {
            await mediaServer.updateCollectionVisibility({
              libraryId: collection.libraryId,
              collectionId: foundCollection.id,
              recommended: collection.visibleOnRecommended,
              ownHome: collection.visibleOnHome,
              sharedHome: collection.visibleOnHome,
            });
          }

          collection.mediaServerId = foundCollection.id;
        } else {
          this.logger.error(
            `Manual collection not found.. Is the spelling correct? `,
          );
          return undefined;
        }
      }
      // create collection in db
      const collectionDb: addCollectionDbResponse =
        await this.addCollectionToDB(
          collection,
          collection.mediaServerId ? collection.mediaServerId : undefined,
        );
      return { dbCollection: collectionDb };
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
    dbCollection: addCollectionDbResponse;
  }> {
    try {
      const createdCollection = await this.createCollection(collection, false);

      for (const childMedia of media) {
        await this.addChildToCollection(
          {
            mediaServerId:
              createdCollection.dbCollection?.mediaServerId ||
              createdCollection.dbCollection?.id?.toString(),
            dbId: createdCollection.dbCollection.id,
          },
          childMedia.mediaServerId,
        );
      }
      return createdCollection;
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      return undefined;
    }
  }

  async updateCollection(collection: ICollection): Promise<{
    dbCollection?: ICollection;
  }> {
    try {
      const mediaServer = await this.getMediaServer();
      const dbCollection = await this.collectionRepo.findOne({
        where: { id: +collection.id },
      });

      const sanitizedSortTitle =
        collection?.sortTitle && collection.sortTitle.trim() !== ''
          ? collection.sortTitle
          : null;

      if (dbCollection?.mediaServerId) {
        // Verify the media server collection still exists before updating
        const serverColl = await mediaServer.getCollection(
          dbCollection.mediaServerId,
        );

        if (!serverColl) {
          // Collection was deleted from media server - clear the stale link
          this.logger.log(
            `Linked media server collection ${dbCollection.mediaServerId} no longer exists, clearing link`,
          );
          collection.mediaServerId = null;
        } else if (
          // is the type the same & is it an automatic collection, then update
          collection.type === dbCollection.type &&
          !dbCollection.manualCollection &&
          !collection.manualCollection &&
          collection.libraryId === dbCollection.libraryId // Library must match
        ) {
          // Update collection metadata on media server
          try {
            await mediaServer.updateCollection({
              libraryId: collection.libraryId,
              collectionId: dbCollection.mediaServerId,
              title: collection.title,
              summary: collection?.description,
              sortTitle: sanitizedSortTitle ?? undefined,
            });
          } catch (error) {
            this.logger.warn(
              `Failed to update collection metadata on media server: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          // Handle visibility settings (Plex-only feature)
          if (
            mediaServer.supportsFeature(
              MediaServerFeature.COLLECTION_VISIBILITY,
            )
          ) {
            await mediaServer.updateCollectionVisibility({
              libraryId: dbCollection.libraryId,
              collectionId: dbCollection.mediaServerId,
              recommended: collection.visibleOnRecommended,
              ownHome: collection.visibleOnHome,
              sharedHome: collection.visibleOnHome,
            });
          }
        } else {
          // if the type, manual collection, or library changed - reset the media server collection
          if (
            collection.manualCollection !== dbCollection.manualCollection ||
            collection.type !== dbCollection.type ||
            collection.manualCollectionName !==
              dbCollection.manualCollectionName ||
            collection.libraryId !== dbCollection.libraryId
          ) {
            if (!dbCollection.manualCollection) {
              // Don't remove the collections if it was a manual one
              await mediaServer.deleteCollection(dbCollection.mediaServerId);
            }
            collection.mediaServerId = null;
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

      return { dbCollection: dbResp };
    } catch (err) {
      this.logger.warn(
        `An error occurred while performing collection actions: ${err.message || err}`,
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
      const foundColl = await this.findMediaServerCollection(
        collection.manualCollectionName,
        collection.libraryId,
      );
      if (foundColl) {
        collection.mediaServerId = foundColl.id;
        collection = await this.saveCollection(collection);

        await this.addLogRecord(
          { id: collection.id } as Collection,
          'Successfully relinked the manual collection',
          ECollectionLogType.COLLECTION,
        );
      } else {
        this.logger.error(
          'Manual collection not found.. Is it still available in the media server?',
        );
        await this.addLogRecord(
          { id: collection.id } as Collection,
          'Failed to relink the manual collection',
          ECollectionLogType.COLLECTION,
        );
      }
    }
    return collection;
  }

  public async checkAutomaticMediaServerLink(
    collection: Collection,
  ): Promise<Collection> {
    const mediaServer = await this.getMediaServer();
    // checks and fixes automatic collection link
    if (!collection.manualCollection) {
      let serverColl: MediaCollection | undefined = undefined;
      const originalMediaServerId = collection.mediaServerId; // Track if we already had a link

      this.logger.debug(
        `[checkAutomaticMediaServerLink] Collection "${collection.title}" (DB id: ${collection.id}, mediaServerId: ${collection.mediaServerId})`,
      );

      if (collection.mediaServerId) {
        serverColl = await mediaServer.getCollection(collection.mediaServerId);
        this.logger.debug(
          `[checkAutomaticMediaServerLink] getCollection(${collection.mediaServerId}) returned: ${serverColl ? `id=${serverColl.id}, childCount=${serverColl.childCount}` : 'undefined'}`,
        );
      }

      if (!serverColl) {
        const foundColl = await this.findMediaServerCollection(
          collection.title,
          collection.libraryId,
        );

        // Only log if we expected to find it (had a previous link) or if we actually found one
        if (foundColl || collection.mediaServerId) {
          this.logger.debug(
            `[checkAutomaticMediaServerLink] findMediaServerCollection("${collection.title}") returned: ${foundColl ? `id=${foundColl.id}, childCount=${foundColl.childCount}` : 'undefined'}`,
          );
        }

        if (foundColl) {
          collection.mediaServerId = foundColl.id;
          collection = await this.saveCollection(collection);
          serverColl = foundColl;
        }
      }

      // If the collection is empty, remove it. Otherwise issues when adding media.
      // ONLY check this if we already had a mediaServerId when entering this function.
      // If we just linked/found it (originalMediaServerId was null), don't delete it -
      // the media server may not have finished processing recent additions yet.
      //
      // Skip for Jellyfin because API lag causes false positives.
      // Jellyfin natively auto-deletes empty collections, so no manual cleanup needed.
      if (
        this.settingsService.media_server_type === MediaServerType.PLEX &&
        serverColl &&
        collection.mediaServerId !== null &&
        originalMediaServerId !== null
      ) {
        const children = await mediaServer.getCollectionChildren(serverColl.id);
        const actualChildCount = children?.length ?? 0;

        if (actualChildCount <= 0) {
          this.logger.debug(
            `[checkAutomaticMediaServerLink] Deleting empty collection ${serverColl.id} (actualChildCount=${actualChildCount})`,
          );
          await mediaServer.deleteCollection(serverColl.id);
          serverColl = undefined;
        } else {
          this.logger.debug(
            `[checkAutomaticMediaServerLink] Collection ${serverColl.id} has ${actualChildCount} children, keeping it`,
          );
        }
      }

      if (!serverColl) {
        this.logger.debug(
          `[checkAutomaticMediaServerLink] Setting mediaServerId to null`,
        );
        collection.mediaServerId = null;
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
    const mediaServer = await this.getMediaServer();
    const collection =
      collectionDbId !== -1 && collectionDbId !== undefined
        ? await this.collectionRepo.findOne({
            where: { id: collectionDbId },
          })
        : undefined;

    // get media - traverse show -> seasons -> episodes if needed
    const ids = await mediaServer.getAllIdsForContextAction(
      collection?.type,
      { type: context.type, id: String(context.id) },
      media.mediaServerId,
    );
    const handleMedia: AddRemoveCollectionMedia[] = ids.map((id) => ({
      mediaServerId: id,
    }));

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
      const mediaServer = await this.getMediaServer();
      let collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });
      const collectionMedia = await this.CollectionMediaRepo.find({
        where: { collectionId: collectionDbId },
      });

      // filter already existing out
      const newMedia = media.filter(
        (m) =>
          !collectionMedia.find((el) => el.mediaServerId === m.mediaServerId),
      );

      if (collection) {
        collection = await this.checkAutomaticMediaServerLink(collection);

        // Check if we need to create a new media server collection
        // This happens when: 1) we have new items to add, OR 2) we have existing items but no media server collection
        const needsMediaServerCollection =
          !collection.mediaServerId &&
          (newMedia.length > 0 || collectionMedia.length > 0);

        // Check if we need to sync existing items to a newly created collection
        const needsResync =
          !collection.mediaServerId && collectionMedia.length > 0;

        // Create media server collection if needed
        if (needsMediaServerCollection) {
          let newColl: MediaCollection | undefined = undefined;
          if (collection.manualCollection) {
            newColl = await this.findMediaServerCollection(
              collection.manualCollectionName,
              collection.libraryId,
            );
          } else {
            newColl = await mediaServer.createCollection({
              libraryId: collection.libraryId,
              title: collection.title,
              summary: collection.description,
              sortTitle: collection.sortTitle,
              type: collection.type,
            });
          }
          if (newColl?.id) {
            collection = await this.collectionRepo.save({
              ...collection,
              mediaServerId: newColl.id,
            });
            // Handle visibility settings (Plex-only feature)
            if (
              mediaServer.supportsFeature(
                MediaServerFeature.COLLECTION_VISIBILITY,
              )
            ) {
              await mediaServer.updateCollectionVisibility({
                libraryId: collection.libraryId,
                collectionId: collection.mediaServerId,
                recommended: collection.visibleOnRecommended,
                ownHome: collection.visibleOnHome,
                sharedHome: collection.visibleOnHome,
              });
            }

            // If we had existing collection_media items, sync them to the new media server collection
            if (needsResync) {
              this.logger.log(
                `Syncing ${collectionMedia.length} existing items to newly created media server collection`,
              );
              for (const existingMedia of collectionMedia) {
                try {
                  await mediaServer.addToCollection(
                    collection.mediaServerId,
                    existingMedia.mediaServerId,
                  );
                } catch (err) {
                  this.logger.warn(
                    `Failed to sync item ${existingMedia.mediaServerId} to collection: ${err.message}`,
                  );
                }
              }
            }
          } else {
            if (collection.manualCollection) {
              this.logger.warn(
                `Manual Collection '${collection.manualCollectionName}' doesn't exist in media server..`,
              );
            }
          }
        }

        // add new children to collection
        if (newMedia.length > 0 && collection.mediaServerId) {
          for (const childMedia of newMedia) {
            await this.addChildToCollection(
              { mediaServerId: collection.mediaServerId, dbId: collection.id },
              childMedia.mediaServerId,
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
      const mediaServer = await this.getMediaServer();
      let collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });

      if (!collection) {
        this.logger.warn(
          `Collection with id ${collectionDbId} not found, skipping removal`,
        );
        return undefined;
      }

      collection = await this.checkAutomaticMediaServerLink(collection);
      let collectionMedia = await this.CollectionMediaRepo.find({
        where: {
          collectionId: collectionDbId,
        },
      });
      if (collectionMedia.length > 0) {
        for (const childMedia of media) {
          if (
            collectionMedia.find(
              (el) => el.mediaServerId === childMedia.mediaServerId,
            ) !== undefined
          ) {
            await this.removeChildFromCollection(
              { mediaServerId: collection.mediaServerId, dbId: collection.id },
              childMedia.mediaServerId,
              childMedia.reason,
            );

            collectionMedia = collectionMedia.filter(
              (el) => el.mediaServerId !== childMedia.mediaServerId,
            );
          }
        }

        if (
          collectionMedia.length <= 0 &&
          !collection.manualCollection &&
          collection.mediaServerId
        ) {
          try {
            await mediaServer.deleteCollection(collection.mediaServerId);
            collection = await this.collectionRepo.save({
              ...collection,
              mediaServerId: null,
            });
          } catch (err) {
            this.logger.warn(
              `Failed to delete collection from media server: ${err.message}`,
            );
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
      const mediaServer = await this.getMediaServer();
      let collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });

      if (!collection) {
        this.logger.warn(
          `Collection with id ${collectionDbId} not found in database`,
        );
        return undefined;
      }

      collection = await this.checkAutomaticMediaServerLink(collection);

      if (collection.mediaServerId && !collection.manualCollection) {
        try {
          await mediaServer.deleteCollection(collection.mediaServerId);
        } catch (err) {
          this.logger.warn(
            `Failed to delete collection from media server: ${err.message}`,
          );
        }
      }
      return await this.RemoveCollectionFromDB(collection);
    } catch (err) {
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      return undefined;
    }
  }

  public async deactivateCollection(collectionDbId: number) {
    try {
      const mediaServer = await this.getMediaServer();
      const collection = await this.collectionRepo.findOne({
        where: { id: collectionDbId },
      });

      if (!collection.manualCollection && collection.mediaServerId) {
        try {
          await mediaServer.deleteCollection(collection.mediaServerId);
        } catch (err) {
          this.logger.warn(
            `Failed to delete collection from media server: ${err.message}`,
          );
        }
      }

      await this.CollectionMediaRepo.delete({ collectionId: collection.id });
      await this.saveCollection({
        ...collection,
        isActive: false,
        mediaServerId: null,
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
      this.logger.warn(
        'An error occurred while performing collection actions.',
      );
      return undefined;
    }
  }

  private async addChildToCollection(
    collectionIds: { mediaServerId: string; dbId: number },
    childId: string,
    manual = false,
    logMeta?: CollectionLogMeta,
  ) {
    try {
      const mediaServer = await this.getMediaServer();
      this.infoLogger(`Adding media with id ${childId} to collection..`);

      const tmdb = await this.tmdbIdHelper.getTmdbIdFromMediaServerId(childId);

      let tmdbMedia: TmdbTvDetails | TmdbMovieDetails;
      switch (tmdb.type) {
        case 'movie':
          tmdbMedia = await this.tmdbApi.getMovie({ movieId: tmdb.id });
          break;
        case 'tv':
          tmdbMedia = await this.tmdbApi.getTvShow({ tvId: tmdb.id });
          break;
      }

      try {
        await mediaServer.addToCollection(collectionIds.mediaServerId, childId);

        await this.connection
          .createQueryBuilder()
          .insert()
          .into(CollectionMedia)
          .values([
            {
              collectionId: collectionIds.dbId,
              mediaServerId: childId,
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
      } catch (err) {
        this.logger.warn(`Couldn't add media to collection: ${err.message}`);
      }
    } catch (err) {
      this.logger.warn(
        `An error occurred while performing collection actions: ${err}`,
      );
      return undefined;
    }
  }

  public async CollectionLogRecordForChild(
    mediaServerId: string,
    collectionId: number,
    type: 'add' | 'remove' | 'handle' | 'exclude' | 'include',
    logMeta?: CollectionLogMeta,
  ) {
    // log record
    const mediaServer = await this.getMediaServer();
    const mediaData = await mediaServer.getMetadata(mediaServerId); // fetch data from cache
    // if there's no data.. skip logging

    if (mediaData) {
      const subject = isMediaType(mediaData.type, 'episode')
        ? `${mediaData.grandparentTitle} - season ${mediaData.parentIndex} - episode ${mediaData.index}`
        : isMediaType(mediaData.type, 'season')
          ? `${mediaData.parentTitle} - season ${mediaData.index}`
          : mediaData.title;
      await this.addLogRecord(
        { id: collectionId } as Collection,
        `${type === 'add' ? 'Added' : type === 'handle' ? 'Successfully handled' : type === 'exclude' ? 'Added a specific exclusion for' : type === 'include' ? 'Removed specific exclusion of' : 'Removed'} "${subject}"`,
        ECollectionLogType.MEDIA,
        logMeta,
      );
    }
  }

  private async removeChildFromCollection(
    collectionIds: { mediaServerId: string; dbId: number },
    childId: string,
    logMeta?: CollectionLogMeta,
  ) {
    try {
      const mediaServer = await this.getMediaServer();
      this.infoLogger(`Removing media with id ${childId} from collection..`);

      try {
        await mediaServer.removeFromCollection(
          collectionIds.mediaServerId,
          childId,
        );

        await this.connection
          .createQueryBuilder()
          .delete()
          .from(CollectionMedia)
          .where([
            {
              collectionId: collectionIds.dbId,
              mediaServerId: childId,
            },
          ])
          .execute();

        await this.CollectionLogRecordForChild(
          childId,
          collectionIds.dbId,
          'remove',
          logMeta,
        );
      } catch (err) {
        // 404 means media is not in collection, which is fine
        if (!err.message?.includes('404')) {
          this.infoLogger(
            `Couldn't remove media from collection: ${err.message}`,
          );
        }
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
    mediaServerId?: string,
  ): Promise<addCollectionDbResponse> {
    this.infoLogger(`Adding collection to the database..`);
    try {
      const mediaServerType = await this.getMediaServerType();
      const insertResult = await this.connection
        .createQueryBuilder()
        .insert()
        .into(Collection)
        .values([
          {
            title: collection.title,
            description: collection.description,
            mediaServerId: mediaServerId,
            mediaServerType: mediaServerType,
            type: collection.type,
            libraryId: collection.libraryId,
            arrAction: collection.arrAction ? collection.arrAction : 0,
            isActive: collection.isActive,
            visibleOnRecommended: collection.visibleOnRecommended,
            visibleOnHome: collection.visibleOnHome,
            deleteAfterDays: collection.deleteAfterDays,
            listExclusions: collection.listExclusions,
            forceSeerr: collection.forceSeerr,
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
          },
        ])
        .execute();

      // generatedMaps only returns auto-generated columns (like id), not the full row
      // We need to include mediaServerId since it was passed as a parameter
      const generatedId = insertResult.generatedMaps[0] as { id: number };
      const dbCol: addCollectionDbResponse = {
        id: generatedId.id,
        mediaServerId: mediaServerId,
        isActive: collection.isActive,
        visibleOnRecommended: collection.visibleOnRecommended,
        visibleOnHome: collection.visibleOnHome,
        deleteAfterDays: collection.deleteAfterDays,
        manualCollection: collection.manualCollection ?? false,
      };

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

  /**
   * Find a collection in the media server by name
   */
  public async findMediaServerCollection(
    name: string,
    libraryId: string,
  ): Promise<MediaCollection | undefined> {
    // Cannot search for collections without a valid library ID
    if (!libraryId || libraryId === '') {
      this.logger.debug(
        `[findMediaServerCollection] Skipping search - libraryId is empty`,
      );
      return undefined;
    }

    try {
      const mediaServer = await this.getMediaServer();
      const collections = await mediaServer.getCollections(libraryId);
      if (collections) {
        const found = collections.find((coll) => {
          return coll.title.trim() === name.trim() && !coll.smart;
        });
        return found;
      }
    } catch (err) {
      this.logger.warn(
        'An error occurred while searching for a specific collection.',
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
      .where('collection_log.collectionId = :id', { id })
      .orderBy('id', sort)
      .skip(offset)
      .take(size);

    if (search !== undefined) {
      queryBuilder.andWhere('collection_log.message like :search', {
        search: `%${search}%`,
      });
    }
    if (filter !== undefined) {
      queryBuilder.andWhere('collection_log.type like :filter', {
        filter: `%${filter}%`,
      });
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
