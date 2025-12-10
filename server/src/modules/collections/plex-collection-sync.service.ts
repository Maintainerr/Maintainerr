import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BasicResponseDto } from '../api/plex-api/dto/basic-response.dto';
import {
  CreateUpdateCollection,
  PlexCollection,
} from '../api/plex-api/interfaces/collection.interface';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';
import { CollectionLog } from './entities/collection_log.entities';

/**
 * Service responsible for synchronizing Maintainerr collections with Plex collections.
 * This service encapsulates all Plex-specific collection operations, following the
 * Single Responsibility Principle by separating Plex sync concerns from general
 * collection management.
 */
@Injectable()
export class PlexCollectionSyncService {
  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(CollectionMedia)
    private readonly collectionMediaRepo: Repository<CollectionMedia>,
    @InjectRepository(CollectionLog)
    private readonly collectionLogRepo: Repository<CollectionLog>,
    private readonly connection: DataSource,
    private readonly plexApi: PlexApiService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(PlexCollectionSyncService.name);
  }

  /**
   * Creates a Plex collection based on the provided collection data.
   * Only called when syncToPlexCollection is true.
   */
  async createPlexCollection(
    collectionData: CreateUpdateCollection,
  ): Promise<PlexCollection> {
    try {
      this.logger.log(`Creating collection in Plex..`);
      const resp = await this.plexApi.createCollection(collectionData);
      if (resp?.ratingKey) {
        return resp;
      } else {
        return resp[0];
      }
    } catch (err) {
      this.logger.warn(
        'An error occurred while creating Plex collection.',
        err,
      );
      return undefined;
    }
  }

  /**
   * Updates a Plex collection's metadata.
   * Only called when syncToPlexCollection is true.
   */
  async updatePlexCollection(
    collectionObj: CreateUpdateCollection,
  ): Promise<PlexCollection> {
    try {
      return await this.plexApi.updateCollection(collectionObj);
    } catch (err) {
      this.logger.warn(
        'An error occurred while updating Plex collection.',
        err,
      );
      return undefined;
    }
  }

  /**
   * Updates Plex collection visibility settings.
   * Only called when syncToPlexCollection is true.
   */
  async updatePlexCollectionSettings(params: {
    libraryId: number;
    collectionId: number;
    recommended: boolean;
    ownHome: boolean;
    sharedHome: boolean;
  }): Promise<void> {
    try {
      await this.plexApi.UpdateCollectionSettings(params);
    } catch (err) {
      this.logger.warn(
        'An error occurred while updating Plex collection settings.',
        err,
      );
    }
  }

  /**
   * Deletes a Plex collection.
   * Only called when syncToPlexCollection is true and the collection is not manual.
   */
  async deletePlexCollection(plexId: string): Promise<BasicResponseDto> {
    try {
      return await this.plexApi.deleteCollection(plexId);
    } catch (err) {
      this.logger.warn(
        'An error occurred while deleting Plex collection.',
        err,
      );
      return { status: 'NOK', code: 0, message: 'Failed to delete' };
    }
  }

  /**
   * Finds a Plex collection by name within a library.
   * Only called when syncToPlexCollection is true.
   */
  async findPlexCollection(
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
        err,
      );
      return undefined;
    }
  }

  /**
   * Finds a Plex collection by its ID.
   * Only called when syncToPlexCollection is true.
   */
  async findPlexCollectionByID(id: number): Promise<PlexCollection> {
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
        err,
      );
      return undefined;
    }
  }

  /**
   * Adds a child (media item) to a Plex collection.
   * Only called when syncToPlexCollection is true.
   */
  async addChildToPlexCollection(
    collectionPlexId: string,
    childPlexId: string,
  ): Promise<PlexCollection | BasicResponseDto> {
    try {
      return await this.plexApi.addChildToCollection(
        collectionPlexId,
        childPlexId,
      );
    } catch (err) {
      this.logger.warn(
        'An error occurred while adding child to Plex collection.',
        err,
      );
      return undefined;
    }
  }

  /**
   * Removes a child (media item) from a Plex collection.
   * Only called when syncToPlexCollection is true.
   */
  async removeChildFromPlexCollection(
    collectionPlexId: string,
    childPlexId: string,
  ): Promise<BasicResponseDto> {
    try {
      return await this.plexApi.deleteChildFromCollection(
        collectionPlexId,
        childPlexId,
      );
    } catch (err) {
      this.logger.warn(
        'An error occurred while removing child from Plex collection.',
        err,
      );
      return { status: 'NOK', code: 0, message: 'Failed to remove' };
    }
  }

  /**
   * Gets children (media items) from a Plex collection.
   * Used for syncing manual collections.
   */
  async getPlexCollectionChildren(
    collectionPlexId: string,
    withGuids = false,
  ): Promise<any[]> {
    try {
      return await this.plexApi.getCollectionChildren(
        collectionPlexId,
        withGuids,
      );
    } catch (err) {
      this.logger.warn(
        'An error occurred while getting Plex collection children.',
        err,
      );
      return [];
    }
  }

  /**
   * Checks if the automatic Plex link is valid and fixes it if needed.
   * Only called when syncToPlexCollection is true.
   */
  async checkAutomaticPlexLink(collection: Collection): Promise<Collection> {
    // Skip if syncing is disabled
    if (!collection.syncToPlexCollection) {
      return collection;
    }

    // Skip if manual collection
    if (collection.manualCollection) {
      return collection;
    }

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
        collection = await this.collectionRepo.save(collection);
      }
    }

    // If the collection is empty in Plex, remove it. Otherwise issues when adding media
    if (plexColl && collection.plexId !== null && +plexColl.childCount <= 0) {
      await this.deletePlexCollection(plexColl.ratingKey);
      plexColl = undefined;
    }

    if (!plexColl) {
      collection.plexId = null;
      collection = await this.collectionRepo.save(collection);
    }

    return collection;
  }

  /**
   * Relinks a manual Plex collection by finding it and updating the plexId.
   * Only called when syncToPlexCollection is true.
   */
  async relinkManualCollection(collection: Collection): Promise<Collection> {
    // Skip if syncing is disabled
    if (!collection.syncToPlexCollection) {
      return collection;
    }

    // Only for manual collections
    if (!collection.manualCollection) {
      return collection;
    }

    const plexColl = await this.findPlexCollection(
      collection.manualCollectionName,
      +collection.libraryId,
    );

    if (plexColl) {
      collection.plexId = +plexColl.ratingKey;
      collection = await this.collectionRepo.save(collection);
      this.logger.log('Successfully relinked the manual Plex collection');
    } else {
      this.logger.error(
        'Manual Plex collection not found.. Is it still available in Plex?',
      );
    }

    return collection;
  }

  /**
   * Determines if Plex syncing should be performed for a collection.
   */
  shouldSyncToPlex(collection: Collection): boolean {
    return collection.syncToPlexCollection === true;
  }
}
