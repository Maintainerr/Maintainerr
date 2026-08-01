import {
  CollectionVisibilitySettings,
  CreateCollectionParams,
  LibraryQueryOptions,
  MediaCollection,
  MediaItem,
  MediaItemType,
  MediaLibrary,
  MediaPlaylist,
  MediaServerFeature,
  MediaServerStatus,
  MediaServerType,
  MediaUser,
  PagedResult,
  RecentlyAddedOptions,
  UpdateCollectionParams,
  WatchRecord,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { EPlexDataType } from '../../plex-api/enums/plex-data-type-enum';
import { PlexLibraryItem } from '../../plex-api/interfaces/library.interfaces';
import { PLEX_PAGE_SIZE } from '../../plex-api/plex-api.constants';
import { PlexApiService } from '../../plex-api/plex-api.service';
import {
  isBlankMediaServerId,
  isForeignServerId,
} from '../media-server-id.utils';
import { resolveContextActionIds } from '../context-action.util';
import { supportsFeature } from '../media-server.constants';
import {
  IMediaServerService,
  type MediaWatchState,
} from '../media-server.interface';
import { PLEX_BATCH_SIZE, toPlexSort } from './plex.constants';
import { PlexMapper } from './plex.mapper';

/**
 * Adapter that wraps PlexApiService to implement IMediaServerService.
 *
 * This adapter:
 * - Translates MediaItem/MediaLibrary types to/from Plex-specific types
 * - Provides feature detection for Plex-specific capabilities
 */
@Injectable()
export class PlexAdapterService implements IMediaServerService {
  constructor(
    private readonly plexApi: PlexApiService,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(PlexAdapterService.name);
  }

  async initialize(): Promise<void> {
    await this.plexApi.initialize();
  }

  uninitialize(): void {
    this.plexApi.uninitialize();
  }

  isSetup(): boolean {
    return this.plexApi.isPlexSetup();
  }

  getServerType(): MediaServerType {
    return MediaServerType.PLEX;
  }

  supportsFeature(feature: MediaServerFeature): boolean {
    return supportsFeature(MediaServerType.PLEX, feature);
  }

  async getStatus(): Promise<MediaServerStatus | undefined> {
    const status = await this.plexApi.getStatus();
    if (!status) return undefined;
    return PlexMapper.toMediaServerStatus(status);
  }

  async getUsers(): Promise<MediaUser[]> {
    const users = await this.plexApi.getUsers();
    if (!users) return [];
    return users.map(PlexMapper.toMediaUser);
  }

  async getUser(id: string): Promise<MediaUser | undefined> {
    const user = await this.plexApi.getUser(parseInt(id, 10));
    if (!user) return undefined;
    return PlexMapper.toMediaUser(user);
  }

  async getLibraries(): Promise<MediaLibrary[]> {
    const libraries = await this.plexApi.getLibraries();
    if (!libraries) return [];
    return libraries
      .filter(PlexMapper.isSupportedLibrary)
      .map(PlexMapper.toMediaLibrary);
  }

  async getLibrariesStorage(): Promise<Map<string, number>> {
    return this.plexApi.getLibrariesStorage();
  }

  async computeLibraryStorageSizes(): Promise<Map<string, number>> {
    const sizeBytesByLibrary = new Map<string, number>();
    const libraries = await this.getLibraries();

    for (const library of libraries) {
      sizeBytesByLibrary.set(
        library.id,
        await this.sumLibraryItemSizes(library),
      );
    }

    return sizeBytesByLibrary;
  }

  async getLibraryContents(
    libraryId: string,
    options?: LibraryQueryOptions,
  ): Promise<PagedResult<MediaItem>> {
    if (isForeignServerId(MediaServerType.PLEX, libraryId)) {
      this.logger.warn(
        `Library '${libraryId || '(empty)'}' appears to be from a different media server. Please update the library setting in your rules.`,
      );
      return {
        items: [],
        totalSize: 0,
        offset: 0,
        limit: PLEX_PAGE_SIZE.DEFAULT,
      };
    }

    const plexType = options?.type
      ? PlexMapper.toPlexDataType(options.type)
      : undefined;

    const response = await this.plexApi.getLibraryContents(
      libraryId,
      {
        offset: options?.offset ?? 0,
        size: options?.limit ?? PLEX_PAGE_SIZE.DEFAULT,
        sort: toPlexSort(options?.sort, options?.sortOrder),
      },
      plexType,
    );

    // plexApi.getLibraryContents throws on a failed read; a fabricated empty
    // page here would truncate rule evaluation and mass-remove the
    // unevaluated tail from collections (#3307).
    const items = response.items.map(PlexMapper.toMediaItem);

    return {
      items,
      totalSize: response.totalSize ?? items.length,
      offset: options?.offset ?? 0,
      limit: options?.limit ?? PLEX_PAGE_SIZE.DEFAULT,
    };
  }

  async getLibraryContentCount(
    libraryId: string,
    type?: MediaItemType,
  ): Promise<number> {
    const plexType = type ? PlexMapper.toPlexDataType(type) : undefined;
    const count = await this.plexApi.getLibraryContentCount(
      libraryId,
      plexType,
    );
    return count ?? 0;
  }

  async searchLibraryContents(
    libraryId: string,
    query: string,
    type?: MediaItemType,
  ): Promise<MediaItem[]> {
    const plexType = type ? PlexMapper.toPlexDataType(type) : undefined;
    const results = await this.plexApi.searchLibraryContents(
      libraryId,
      query,
      plexType,
    );

    if (!results) return [];

    return results.map(PlexMapper.toMediaItem);
  }

  async getMetadata(itemId: string): Promise<MediaItem | undefined> {
    const metadata = await this.plexApi.getMetadata(itemId);
    if (!metadata) return undefined;
    return PlexMapper.metadataToMediaItem(metadata);
  }

  async itemExists(itemId: string): Promise<boolean> {
    return this.plexApi.itemExists(itemId);
  }

  async getChildrenMetadata(
    parentId: string,
    childType?: MediaItemType,
    throwOnError = false,
  ): Promise<MediaItem[]> {
    // Plex children are unambiguous - a show's are seasons, a season's are
    // episodes - so childType is not needed to pick an endpoint.
    void childType;

    const children = await this.plexApi.getChildrenMetadata(parentId);
    if (!children) {
      if (throwOnError) {
        throw new Error(`Could not read the children of Plex item ${parentId}`);
      }
      return [];
    }
    return children.map(PlexMapper.metadataToMediaItem);
  }

  async getRecentlyAdded(
    libraryId: string,
    options?: RecentlyAddedOptions,
  ): Promise<MediaItem[]> {
    // PlexApiService.getRecentlyAdded uses addedAt timestamp, not limit/type
    // We'll use the default (items added in last hour)
    const results = await this.plexApi.getRecentlyAdded(libraryId);

    if (!results) return [];

    const limited = options?.limit ? results.slice(0, options.limit) : results;
    return limited.map(PlexMapper.toMediaItem);
  }

  async searchContent(query: string): Promise<MediaItem[]> {
    const results = await this.plexApi.searchContent(query);
    if (!results) return [];
    return results.map(PlexMapper.metadataToMediaItem);
  }

  async prefetchWatchHistory({
    libraryId,
    abortSignal,
  }: {
    libraryId: string;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    await this.plexApi.prefetchWatchHistory(libraryId, abortSignal);
  }

  async getWatchHistory(itemId: string): Promise<WatchRecord[]> {
    const history = await this.plexApi.getWatchHistory(itemId);
    return history.map(PlexMapper.toWatchRecord);
  }

  async getWatchState(
    itemId: string,
    nativeViewCount?: number,
  ): Promise<MediaWatchState> {
    // Read live: something watched moments ago must not be judged from a
    // stale snapshot, and a failed read has to throw rather than pass for a
    // confirmed never-watched. Deliberately not served from the run's
    // watch-history snapshot (#3352) - this is the current-state read that
    // feeds deletions, and stale watched state was the defect that PR fixed.
    const history = await this.plexApi.getWatchHistory(itemId, false);

    // Plex writes no history row when an item is marked watched without a
    // play event (a "mark as played", a Trakt scrobble), so the item's own
    // count is the only record of those views. History stays the floor: it
    // covers every account on the server, while the item's count only covers
    // the account whose token Maintainerr holds.
    const viewCount = Math.max(history.length, nativeViewCount ?? 0);

    return { viewCount, isWatched: viewCount > 0 };
  }

  async getItemSeenBy(itemId: string): Promise<string[]> {
    const history = await this.getWatchHistory(itemId);
    const userIds = new Set(history.map((record) => record.userId));
    return Array.from(userIds);
  }

  async getActiveSessions(): Promise<Set<string>> {
    const sessions = await this.plexApi.getActiveSessions();
    const playing = new Set<string>();
    for (const session of sessions) {
      // A collection can track an episode at any level, so protect the
      // episode and its season and show (movies only carry ratingKey).
      if (session.ratingKey) playing.add(session.ratingKey);
      if (session.parentRatingKey) playing.add(session.parentRatingKey);
      if (session.grandparentRatingKey)
        playing.add(session.grandparentRatingKey);
    }
    return playing;
  }

  async getCollections(
    libraryId: string,
    useCache = true,
  ): Promise<MediaCollection[]> {
    const collections = await this.plexApi.getCollections(
      libraryId,
      undefined,
      useCache,
    );
    return collections.map(PlexMapper.toMediaCollection);
  }

  async getCollection(
    collectionId: string,
    throwOnError = false,
  ): Promise<MediaCollection | undefined> {
    try {
      const collection = await this.plexApi.getCollection(collectionId);
      if (!collection) return undefined;
      return PlexMapper.toMediaCollection(collection);
    } catch (error) {
      this.logger.warn(`Failed to get collection ${collectionId}`);
      this.logger.debug(error);

      if (throwOnError) {
        throw error;
      }

      return undefined;
    }
  }

  async createCollection(
    params: CreateCollectionParams,
  ): Promise<MediaCollection> {
    const plexType = PlexMapper.toPlexDataType(params.type);
    const result = await this.plexApi.createCollection({
      libraryId: params.libraryId,
      type: plexType,
      title: params.title,
      summary: params.summary,
      sortTitle: params.sortTitle,
    });

    if (!result) {
      this.logger.error(
        `Failed to create collection "${params.title}" in library ${params.libraryId}`,
      );
      throw new Error(
        `Failed to create collection "${params.title}" in library ${params.libraryId}`,
      );
    }

    return PlexMapper.toMediaCollection(result);
  }

  async deleteCollection(collectionId: string): Promise<void> {
    try {
      // plexApi reports a refused delete as a NOK result, not a throw (Plex
      // answers 403 when "allow media deletion" is off). Resolving anyway told
      // callers the collection was gone and they dropped the link (#3344).
      this.ensureMutationSucceeded(
        await this.plexApi.deleteCollection(collectionId),
        `Failed to delete collection ${collectionId}`,
      );
    } catch (error) {
      // A delete that failed because the collection is already gone is the
      // outcome the caller wanted. Only a confirmed 404 reads as gone here -
      // getCollection throws when it cannot tell - so an unreachable server
      // still propagates.
      if (!(await this.collectionStillExists(collectionId))) {
        this.logger.debug(`Plex collection ${collectionId} is already gone`);
        return;
      }

      this.logger.error(`Failed to delete collection ${collectionId}`);
      this.logger.debug(error);
      throw error;
    }
  }

  private async collectionStillExists(collectionId: string): Promise<boolean> {
    try {
      return Boolean(await this.plexApi.getCollection(collectionId));
    } catch {
      // Existence unknown: assume it is still there so the delete failure is
      // reported rather than silently swallowed.
      return true;
    }
  }

  async setCollectionImage(
    collectionId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    // Plex collections share the /library/metadata/{id}/posters upload-and-
    // select dance with regular items; setThumb already handles the
    // upload/diff/select retry loop and content-addressed dedup edge cases.
    await this.plexApi.setThumb(collectionId, buffer, contentType);
  }

  private async sumLibraryItemSizes(library: MediaLibrary): Promise<number> {
    if (library.type === 'show') {
      return this.sumShowLibraryItemSizes(library.id);
    }

    const limit = PLEX_PAGE_SIZE.DEFAULT;
    let offset = 0;
    let total = 0;

    while (true) {
      let page: PagedResult<MediaItem>;

      try {
        page = await this.getLibraryContents(library.id, {
          offset,
          limit,
          type: library.type,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to compute Plex library size for library ${library.id}`,
        );
        this.logger.debug(error);
        return total;
      }

      for (const item of page.items) {
        total += await this.sumMediaItemSizes(item);
      }

      offset += page.items.length;
      if (page.items.length === 0 || offset >= page.totalSize) {
        break;
      }
    }

    return total;
  }

  private async sumShowLibraryItemSizes(libraryId: string): Promise<number> {
    const leaves = await this.plexApi.getLibraryLeaves(libraryId);
    if (!leaves) {
      this.logger.warn(
        `Failed to compute Plex show library size via allLeaves for library ${libraryId}`,
      );
      return 0;
    }

    return this.sumMediaItems(leaves.map(PlexMapper.toMediaItem));
  }

  private async sumMediaItems(items: MediaItem[]): Promise<number> {
    let total = 0;

    for (const item of items) {
      total += await this.sumMediaItemSizes(item);
    }

    return total;
  }

  private async sumMediaItemSizes(item: MediaItem): Promise<number> {
    const directSize = this.sumMediaSources(item);
    if (directSize > 0) {
      return directSize;
    }

    if (item.type === 'movie' || item.type === 'episode') {
      return this.sumMetadataMediaSources(item.id);
    }

    return 0;
  }

  private async sumMetadataMediaSources(itemId: string): Promise<number> {
    try {
      const metadata = await this.getMetadata(itemId);
      return this.sumMediaSources(metadata);
    } catch (error) {
      this.logger.warn(
        `Failed to load Plex metadata while computing size for ${itemId}`,
      );
      this.logger.debug(error);
      return 0;
    }
  }

  private sumMediaSources(item: MediaItem | undefined): number {
    if (!item?.mediaSources?.length) {
      return 0;
    }

    return item.mediaSources.reduce(
      (sum, source) => sum + (source.sizeBytes ?? 0),
      0,
    );
  }

  private hasUsableProviderIds(mediaItem: MediaItem | undefined): boolean {
    if (!mediaItem) {
      return false;
    }

    return Object.values(mediaItem.providerIds ?? {}).some((values) =>
      Array.isArray(values) ? values.length > 0 : false,
    );
  }

  async getCollectionChildren(collectionId: string): Promise<MediaItem[]> {
    // Throws on enumeration failure (plexApi rethrows) - [] would read as a
    // confirmed-empty collection downstream.
    const children = await this.plexApi.getCollectionChildren(collectionId);

    const mappedChildren = children.map(PlexMapper.toMediaItem);
    const incompleteChildren = mappedChildren.filter(
      (child) => !this.hasUsableProviderIds(child),
    );

    if (incompleteChildren.length === 0) {
      return mappedChildren;
    }

    const refreshedMetadataResults = await Promise.allSettled(
      incompleteChildren.map(async (child) => ({
        id: child.id,
        mediaItem: await this.getMetadata(child.id),
      })),
    );

    const refreshedMetadataById = new Map<string, MediaItem>();

    refreshedMetadataResults.forEach((result, index) => {
      const child = incompleteChildren[index];

      if (result.status === 'fulfilled' && result.value.mediaItem) {
        refreshedMetadataById.set(result.value.id, result.value.mediaItem);
        return;
      }

      this.logger.debug(
        `Failed to refresh complete metadata for Plex collection child ${child?.id}`,
      );

      if (result.status === 'rejected') {
        this.logger.debug(result.reason);
      }
    });

    return mappedChildren.map(
      (child) => refreshedMetadataById.get(child.id) ?? child,
    );
  }

  private ensureMutationSucceeded(
    result: { status?: string; code?: number; message?: string } | undefined,
    fallbackMessage: string,
  ): void {
    if (!result) {
      throw new Error(fallbackMessage);
    }

    if (result.status === 'NOK') {
      throw new Error(result.message || fallbackMessage);
    }

    if (result.status === 'OK') {
      return;
    }

    if (result.code === 0) {
      throw new Error(result.message || fallbackMessage);
    }
  }

  private async addToCollectionInternal(
    collectionId: string,
    itemId: string,
    logFailure: boolean,
  ): Promise<void> {
    try {
      const result = await this.plexApi.addChildToCollection(
        collectionId,
        itemId,
      );
      this.ensureMutationSucceeded(
        result as { status?: string; code?: number; message?: string },
        `Failed to add item ${itemId} to collection ${collectionId}`,
      );
    } catch (error) {
      if (logFailure) {
        this.logger.error(
          `Failed to add item ${itemId} to collection ${collectionId}`,
        );
        this.logger.debug(error);
      }
      throw error;
    }
  }

  async addToCollection(collectionId: string, itemId: string): Promise<void> {
    await this.addToCollectionInternal(collectionId, itemId, true);
  }

  async addBatchToCollection(
    collectionId: string,
    itemIds: string[],
  ): Promise<string[]> {
    const failedItemIds: string[] = [];
    let usedFallback = false;

    for (
      let index = 0;
      index < itemIds.length;
      index += PLEX_BATCH_SIZE.COLLECTION_MUTATION
    ) {
      const chunk = itemIds.slice(
        index,
        index + PLEX_BATCH_SIZE.COLLECTION_MUTATION,
      );

      try {
        const result = await this.plexApi.addChildrenToCollection(
          collectionId,
          chunk,
        );
        this.ensureMutationSucceeded(
          result as { status?: string; code?: number; message?: string },
          `Failed to add ${chunk.length} items to collection ${collectionId}`,
        );
        continue;
      } catch (error) {
        usedFallback = true;

        // Fall back to per-item mutations to preserve precise failed item reporting.
      }

      for (const itemId of chunk) {
        try {
          await this.addToCollectionInternal(collectionId, itemId, false);
        } catch {
          failedItemIds.push(itemId);
        }
      }
    }

    if (usedFallback && failedItemIds.length > 0) {
      this.logger.warn(
        `Plex batch add fallback left ${failedItemIds.length} failed item(s) for collection ${collectionId}`,
      );
    }

    return failedItemIds;
  }

  async cleanupCollectionForLibrary(
    collectionId: string,
    libraryId: string,
    isManualCollection: boolean,
  ): Promise<void> {
    void libraryId;

    // A manual collection belongs to the user, not to Maintainerr - the rule
    // group only points at it, so moving the rule group away must leave it
    // standing. Mirrors the manual guard in updateCollection/deleteCollection.
    if (isManualCollection) {
      return;
    }

    // Plex collections are per-library, so no cross-library sharing occurs.
    await this.deleteCollection(collectionId);
  }

  async removeFromCollection(
    collectionId: string,
    itemId: string,
  ): Promise<void> {
    try {
      const result = await this.plexApi.deleteChildFromCollection(
        collectionId,
        itemId,
      );
      this.ensureMutationSucceeded(
        result,
        `Failed to remove item ${itemId} from collection ${collectionId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove item ${itemId} from collection ${collectionId}`,
      );
      this.logger.debug(error);
      throw error;
    }
  }

  async removeBatchFromCollection(
    collectionId: string,
    itemIds: string[],
  ): Promise<string[]> {
    const failedItemIds: string[] = [];

    for (const itemId of itemIds) {
      try {
        await this.removeFromCollection(collectionId, itemId);
      } catch (error) {
        // An item Plex no longer holds is the outcome the caller wanted. Match
        // the status the message ends with, not "404" anywhere in it - the
        // message carries the request URL, so a ratingKey like 1404 matched.
        if (
          error instanceof Error &&
          error.message.endsWith('response code: 404')
        ) {
          continue;
        }

        failedItemIds.push(itemId);
      }
    }

    return failedItemIds;
  }

  // PLEX-SPECIFIC: COLLECTION UPDATE & VISIBILITY

  async updateCollection(
    params: UpdateCollectionParams,
  ): Promise<MediaCollection> {
    const result = await this.plexApi.updateCollection({
      libraryId: params.libraryId,
      collectionId: params.collectionId,
      type: EPlexDataType.MOVIES, // Type is required but not used for updates
      title: params.title,
      summary: params.summary,
      sortTitle: params.sortTitle,
    });

    if (!result) {
      this.logger.error(
        `Failed to update collection ${params.collectionId} in library ${params.libraryId}`,
      );
      throw new Error(
        `Failed to update collection ${params.collectionId} in library ${params.libraryId}`,
      );
    }

    return PlexMapper.toMediaCollection(result);
  }

  async updateCollectionVisibility(
    settings: CollectionVisibilitySettings,
  ): Promise<void> {
    const result = await this.plexApi.UpdateCollectionSettings({
      libraryId: settings.libraryId,
      collectionId: settings.collectionId,
      recommended: settings.recommended ?? false,
      ownHome: settings.ownHome ?? false,
      sharedHome: settings.sharedHome ?? false,
    });

    if (!result) {
      this.logger.error(
        `Failed to update collection visibility for ${settings.collectionId}`,
      );
      throw new Error(
        `Failed to update collection visibility for ${settings.collectionId}`,
      );
    }
  }

  async reorderCollectionItems(
    collectionId: string,
    orderedItemIds: string[],
  ): Promise<void> {
    if (orderedItemIds.length === 0) {
      return;
    }

    // Short-circuit when the collection is already in the requested order:
    // skip both the prefs PUT and every move PUT. A failed read only skips
    // the short-circuit; the reorder itself still proceeds.
    let currentChildren: PlexLibraryItem[] = [];
    try {
      currentChildren = await this.plexApi.getCollectionChildren(collectionId);
    } catch (error) {
      this.logger.debug(error);
    }
    const currentOrder =
      currentChildren?.map((child) => child.ratingKey?.toString() ?? '') ?? [];
    if (
      currentOrder.length === orderedItemIds.length &&
      currentOrder.every((id, index) => id === orderedItemIds[index])
    ) {
      return;
    }

    await this.plexApi.setCollectionCustomSort(collectionId);

    // Continue past per-item failures so a single rejected move doesn't
    // leave the rest of the collection partially sorted.
    const failedItemIds: string[] = [];
    let previousId: string | undefined = undefined;
    for (const itemId of orderedItemIds) {
      try {
        await this.plexApi.moveCollectionItem(collectionId, itemId, previousId);
        previousId = itemId;
      } catch (error) {
        failedItemIds.push(itemId);
        this.logger.debug(error);
      }
    }

    if (failedItemIds.length > 0) {
      this.logger.warn(
        `Reorder of collection ${collectionId} completed with ${failedItemIds.length} failed move(s); ` +
          `failed item ids: ${failedItemIds.join(', ')}`,
      );
    }
  }

  async getWatchlistForUser(userId: string): Promise<string[]> {
    // PlexApiService.getWatchlistIdsForUser requires both userId and username
    // but returns PlexCommunityWatchList[] with id, key, title, type
    // For now, we can't call this without username - log for debugging
    this.logger.debug(
      `getWatchlistForUser called for user ${userId}, but this method requires username which is not available`,
    );
    return [];
  }

  async getPlaylists(libraryId: string): Promise<MediaPlaylist[]> {
    const playlists = await this.plexApi.getPlaylists(libraryId);
    if (!playlists) return [];
    return playlists.map(PlexMapper.toMediaPlaylist);
  }

  async deleteFromDisk(itemId: string): Promise<void> {
    if (!itemId || itemId.trim() === '') {
      throw new Error(
        'deleteFromDisk called with empty itemId - aborting to prevent unintended deletion',
      );
    }

    try {
      await this.plexApi.deleteMediaFromDisk(itemId);
      this.logger.log(`Successfully deleted Plex item ${itemId} from disk`);
    } catch (error) {
      this.logger.error(`Failed to delete item ${itemId} from disk`);
      this.logger.debug(error);
      throw error;
    }
  }

  async getAllIdsForContextAction(
    collectionType: MediaItemType | undefined,
    context: { type: MediaItemType; id: string },
    mediaId: string,
  ): Promise<string[]> {
    // Plex children are unambiguous - a show's are seasons, a season's are
    // episodes - so the type argument is not needed here.
    return resolveContextActionIds(
      collectionType,
      context,
      mediaId,
      // Throwing: a swallowed read reads as "no children", which silently
      // drops the expansion and reports the action as done.
      (parentId) => this.getChildrenMetadata(parentId, undefined, true),
      (message) => this.logger.warn(message),
    );
  }

  resetMetadataCache(itemId?: string): void {
    if (itemId) {
      this.plexApi.resetMetadataCache(itemId);
    }
    // Note: PlexApiService doesn't support full cache flush through this method
    // Only individual item cache reset is supported
  }

  async refreshItemMetadata(itemId: string): Promise<void> {
    if (isBlankMediaServerId(itemId)) {
      throw new Error(
        'refreshItemMetadata called with empty itemId - aborting metadata refresh request',
      );
    }

    await this.plexApi.refreshMediaMetadata(itemId);
  }
}
