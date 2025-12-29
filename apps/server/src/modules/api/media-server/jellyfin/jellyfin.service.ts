import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Jellyfin, type Api } from '@jellyfin/sdk';
import {
  getItemsApi,
  getLibraryApi,
  getUserApi,
  getCollectionApi,
  getSystemApi,
  getSearchApi,
  getPlaylistsApi,
  getUserViewsApi,
} from '@jellyfin/sdk/lib/utils/api';
import {
  BaseItemKind,
  ItemFields,
  ItemFilter,
  ItemSortBy,
  SortOrder,
} from '@jellyfin/sdk/lib/generated-client/models';
import {
  type CollectionVisibilitySettings,
  type CreateCollectionParams,
  EMediaDataType,
  EMediaServerFeature,
  EMediaServerType,
  type LibraryQueryOptions,
  type MediaCollection,
  type MediaItem,
  type MediaLibrary,
  type MediaPlaylist,
  type MediaServerStatus,
  type MediaUser,
  type PagedResult,
  type RecentlyAddedOptions,
  type WatchRecord,
} from '@maintainerr/contracts';
import { SettingsService } from '../../../settings/settings.service';
import type { IMediaServerService } from '../media-server.interface';
import { supportsFeature } from '../media-server.constants';
import { JellyfinMapper } from './jellyfin.mapper';
import {
  JELLYFIN_BATCH_SIZE,
  JELLYFIN_CACHE_KEYS,
  JELLYFIN_CACHE_TTL,
  JELLYFIN_CLIENT_INFO,
  JELLYFIN_DEVICE_INFO,
} from './jellyfin.constants';
import type { JellyfinWatchedCacheEntry } from './jellyfin.types';
import cacheManager, { type Cache } from '../../lib/cache';

/**
 * Jellyfin media server service implementation.
 *
 * Implements IMediaServerService for Jellyfin servers using the official SDK.
 *
 * Key differences from Plex:
 * - Watch history requires iterating over all users (no central endpoint)
 * - Collections are called "BoxSets"
 * - No collection visibility settings
 * - No watchlist API
 * - Uses ticks for duration (1 tick = 100 nanoseconds)
 */
@Injectable()
export class JellyfinService implements IMediaServerService {
  private jellyfin: Jellyfin | undefined;
  private api: Api | undefined;
  private initialized = false;
  private readonly logger = new Logger(JellyfinService.name);
  private readonly cache: Cache;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {
    this.cache = cacheManager.getCache('jellyfin');
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  async initialize(): Promise<void> {
    const settings = await this.settingsService.getSettings();

    if (!settings || !('jellyfin_url' in settings)) {
      throw new Error('Settings not available');
    }

    if (!settings.jellyfin_url || !settings.jellyfin_api_key) {
      throw new Error('Jellyfin settings not configured');
    }

    this.jellyfin = new Jellyfin({
      clientInfo: {
        name: JELLYFIN_CLIENT_INFO.name,
        version: JELLYFIN_CLIENT_INFO.version,
      },
      deviceInfo: {
        name: JELLYFIN_DEVICE_INFO.name,
        id: `${JELLYFIN_DEVICE_INFO.idPrefix}-${settings.clientId || 'default'}`,
      },
    });

    this.api = this.jellyfin.createApi(
      settings.jellyfin_url,
      settings.jellyfin_api_key,
    );

    // Verify connection
    try {
      const systemInfo = await getSystemApi(this.api).getPublicSystemInfo();
      this.initialized = true;
      this.logger.log(
        `Jellyfin connection established: ${systemInfo.data.ServerName} (${systemInfo.data.Version})`,
      );
    } catch (error) {
      this.initialized = false;
      throw new Error(
        `Failed to connect to Jellyfin: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  uninitialize(): void {
    this.initialized = false;
    this.api = undefined;
    this.jellyfin = undefined;
  }

  isSetup(): boolean {
    return this.initialized && this.api !== undefined;
  }

  getServerType(): EMediaServerType {
    return EMediaServerType.JELLYFIN;
  }

  // ============================================================
  // FEATURE DETECTION
  // ============================================================

  supportsFeature(feature: EMediaServerFeature): boolean {
    return supportsFeature(EMediaServerType.JELLYFIN, feature);
  }

  // ============================================================
  // SERVER INFO
  // ============================================================

  async getStatus(): Promise<MediaServerStatus | undefined> {
    if (!this.api) return undefined;

    try {
      if (this.cache.data.has(JELLYFIN_CACHE_KEYS.STATUS)) {
        return this.cache.data.get<MediaServerStatus>(JELLYFIN_CACHE_KEYS.STATUS);
      }

      const response = await getSystemApi(this.api).getPublicSystemInfo();
      const status = JellyfinMapper.toMediaServerStatus(
        response.data.Id || '',
        response.data.Version || '',
        response.data.ServerName,
        response.data.OperatingSystem,
      );

      this.cache.data.set(
        JELLYFIN_CACHE_KEYS.STATUS,
        status,
        JELLYFIN_CACHE_TTL.STATUS,
      );

      return status;
    } catch (error) {
      this.logger.error('Failed to get Jellyfin status', error);
      return undefined;
    }
  }

  // ============================================================
  // USERS
  // ============================================================

  async getUsers(): Promise<MediaUser[]> {
    if (!this.api) return [];

    try {
      if (this.cache.data.has(JELLYFIN_CACHE_KEYS.USERS)) {
        return this.cache.data.get<MediaUser[]>(JELLYFIN_CACHE_KEYS.USERS) || [];
      }

      const response = await getUserApi(this.api).getUsers();
      const users = (response.data || []).map(JellyfinMapper.toMediaUser);

      this.cache.data.set(
        JELLYFIN_CACHE_KEYS.USERS,
        users,
        JELLYFIN_CACHE_TTL.USERS,
      );

      return users;
    } catch (error) {
      this.logger.error('Failed to get Jellyfin users', error);
      return [];
    }
  }

  async getUser(id: string): Promise<MediaUser | undefined> {
    if (!this.api) return undefined;

    try {
      const response = await getUserApi(this.api).getUserById({ userId: id });
      return response.data ? JellyfinMapper.toMediaUser(response.data) : undefined;
    } catch (error) {
      this.logger.warn(`Failed to get Jellyfin user ${id}`, error);
      return undefined;
    }
  }

  // ============================================================
  // LIBRARIES
  // ============================================================

  async getLibraries(): Promise<MediaLibrary[]> {
    if (!this.api) return [];

    try {
      if (this.cache.data.has(JELLYFIN_CACHE_KEYS.LIBRARIES)) {
        return this.cache.data.get<MediaLibrary[]>(JELLYFIN_CACHE_KEYS.LIBRARIES) || [];
      }

      const response = await getLibraryApi(this.api).getMediaFolders();
      const libraries = (response.data.Items || [])
        .filter((item) => 
          item.CollectionType === 'movies' || 
          item.CollectionType === 'tvshows'
        )
        .map(JellyfinMapper.toMediaLibrary);

      this.cache.data.set(
        JELLYFIN_CACHE_KEYS.LIBRARIES,
        libraries,
        JELLYFIN_CACHE_TTL.LIBRARIES,
      );

      return libraries;
    } catch (error) {
      this.logger.error('Failed to get Jellyfin libraries', error);
      return [];
    }
  }

  async getLibraryContents(
    libraryId: string,
    options?: LibraryQueryOptions,
  ): Promise<PagedResult<MediaItem>> {
    if (!this.api) {
      return { items: [], totalSize: 0, offset: 0, limit: 50 };
    }

    try {
      const response = await getItemsApi(this.api).getItems({
        parentId: libraryId,
        recursive: true,
        startIndex: options?.offset || 0,
        limit: options?.limit || JELLYFIN_BATCH_SIZE.DEFAULT_PAGE_SIZE,
        fields: [
          ItemFields.ProviderIds,
          ItemFields.Path,
          ItemFields.DateCreated,
          ItemFields.MediaSources,
          ItemFields.Genres,
          ItemFields.Tags,
          ItemFields.Overview,
          ItemFields.People,
        ],
        includeItemTypes: options?.type
          ? JellyfinMapper.toBaseItemKinds([options.type])
          : [BaseItemKind.Movie, BaseItemKind.Series],
        enableUserData: true,
        sortBy: [options?.sort as ItemSortBy || ItemSortBy.SortName],
        sortOrder: [options?.sortOrder === 'desc' ? SortOrder.Descending : SortOrder.Ascending],
      });

      const items = (response.data.Items || []).map(JellyfinMapper.toMediaItem);

      return {
        items,
        totalSize: response.data.TotalRecordCount || items.length,
        offset: options?.offset || 0,
        limit: options?.limit || JELLYFIN_BATCH_SIZE.DEFAULT_PAGE_SIZE,
      };
    } catch (error) {
      this.logger.error(`Failed to get library contents for ${libraryId}`, error);
      return { items: [], totalSize: 0, offset: 0, limit: 50 };
    }
  }

  async getLibraryContentCount(
    libraryId: string,
    type?: EMediaDataType,
  ): Promise<number> {
    if (!this.api) return 0;

    try {
      const response = await getItemsApi(this.api).getItems({
        parentId: libraryId,
        recursive: true,
        limit: 0,
        includeItemTypes: type
          ? JellyfinMapper.toBaseItemKinds([type])
          : [BaseItemKind.Movie, BaseItemKind.Series],
      });

      return response.data.TotalRecordCount || 0;
    } catch (error) {
      this.logger.error(`Failed to get library count for ${libraryId}`, error);
      return 0;
    }
  }

  async searchLibraryContents(
    libraryId: string,
    query: string,
    type?: EMediaDataType,
  ): Promise<MediaItem[]> {
    if (!this.api) return [];

    try {
      const response = await getItemsApi(this.api).getItems({
        parentId: libraryId,
        recursive: true,
        searchTerm: query,
        fields: [
          ItemFields.ProviderIds,
          ItemFields.Path,
          ItemFields.DateCreated,
          ItemFields.MediaSources,
        ],
        includeItemTypes: type
          ? JellyfinMapper.toBaseItemKinds([type])
          : [BaseItemKind.Movie, BaseItemKind.Series],
        enableUserData: true,
      });

      return (response.data.Items || []).map(JellyfinMapper.toMediaItem);
    } catch (error) {
      this.logger.error(`Failed to search library ${libraryId}`, error);
      return [];
    }
  }

  // ============================================================
  // METADATA
  // ============================================================

  async getMetadata(itemId: string): Promise<MediaItem | undefined> {
    if (!this.api) return undefined;

    try {
      const response = await getItemsApi(this.api).getItems({
        ids: [itemId],
        fields: [
          ItemFields.ProviderIds,
          ItemFields.Path,
          ItemFields.DateCreated,
          ItemFields.MediaSources,
          ItemFields.Genres,
          ItemFields.Tags,
          ItemFields.Overview,
          ItemFields.People,
        ],
        enableUserData: true,
      });

      const item = response.data.Items?.[0];
      return item ? JellyfinMapper.toMediaItem(item) : undefined;
    } catch (error) {
      this.logger.warn(`Failed to get metadata for ${itemId}`, error);
      return undefined;
    }
  }

  async getChildrenMetadata(parentId: string): Promise<MediaItem[]> {
    if (!this.api) return [];

    try {
      const response = await getItemsApi(this.api).getItems({
        parentId,
        fields: [
          ItemFields.ProviderIds,
          ItemFields.Path,
          ItemFields.DateCreated,
        ],
        enableUserData: true,
      });

      return (response.data.Items || []).map(JellyfinMapper.toMediaItem);
    } catch (error) {
      this.logger.error(`Failed to get children for ${parentId}`, error);
      return [];
    }
  }

  async getRecentlyAdded(
    libraryId: string,
    options?: RecentlyAddedOptions,
  ): Promise<MediaItem[]> {
    if (!this.api) return [];

    try {
      const response = await getItemsApi(this.api).getItems({
        parentId: libraryId,
        recursive: true,
        sortBy: [ItemSortBy.DateCreated],
        sortOrder: [SortOrder.Descending],
        limit: options?.limit || 50,
        includeItemTypes: options?.type
          ? JellyfinMapper.toBaseItemKinds([options.type])
          : [BaseItemKind.Movie, BaseItemKind.Series],
        fields: [
          ItemFields.ProviderIds,
          ItemFields.Path,
          ItemFields.DateCreated,
        ],
        enableUserData: true,
      });

      return (response.data.Items || []).map(JellyfinMapper.toMediaItem);
    } catch (error) {
      this.logger.error(`Failed to get recently added for ${libraryId}`, error);
      return [];
    }
  }

  // ============================================================
  // SEARCH
  // ============================================================

  async searchContent(query: string): Promise<MediaItem[]> {
    if (!this.api) return [];

    try {
      const response = await getSearchApi(this.api).getSearchHints({
        searchTerm: query,
        includeItemTypes: [
          BaseItemKind.Movie,
          BaseItemKind.Series,
          BaseItemKind.Episode,
        ],
        limit: 50,
        includeMedia: true,
        includePeople: false,
        includeGenres: false,
        includeStudios: false,
        includeArtists: false,
      });

      return (response.data.SearchHints || [])
        .filter((hint) => hint.Id)
        .map((hint) => ({
          id: hint.Id || '',
          title: hint.Name || '',
          type: JellyfinMapper.toMediaDataType(hint.Type),
          guid: hint.Id || '',
          addedAt: new Date(),
          providerIds: {},
          mediaSources: [],
          library: { id: '', title: '' },
        })) as MediaItem[];
    } catch (error) {
      this.logger.error('Failed to search Jellyfin content', error);
      return [];
    }
  }

  // ============================================================
  // WATCH HISTORY
  // ============================================================

  async getWatchHistory(itemId: string): Promise<WatchRecord[]> {
    if (!this.api) return [];

    try {
      const cacheKey = `${JELLYFIN_CACHE_KEYS.WATCH_HISTORY}:${itemId}`;
      if (this.cache.data.has(cacheKey)) {
        return this.cache.data.get<WatchRecord[]>(cacheKey) || [];
      }

      const users = await this.getUsers();
      const records: WatchRecord[] = [];

      // Batch users to avoid overwhelming the API
      for (let i = 0; i < users.length; i += JELLYFIN_BATCH_SIZE.USER_WATCH_HISTORY) {
        const batch = users.slice(i, i + JELLYFIN_BATCH_SIZE.USER_WATCH_HISTORY);

        const results = await Promise.all(
          batch.map((user) => this.getItemUserData(itemId, user.id)),
        );

        results.forEach((userData, idx) => {
          if (userData?.Played) {
            records.push(
              JellyfinMapper.toWatchRecord(
                batch[idx].id,
                itemId,
                userData.LastPlayedDate
                  ? new Date(userData.LastPlayedDate)
                  : undefined,
                userData.PlayCount || 0,
              ),
            );
          }
        });
      }

      this.cache.data.set(cacheKey, records, JELLYFIN_CACHE_TTL.WATCH_HISTORY);
      return records;
    } catch (error) {
      this.logger.error(`Failed to get watch history for ${itemId}`, error);
      return [];
    }
  }

  async getItemSeenBy(itemId: string): Promise<string[]> {
    const history = await this.getWatchHistory(itemId);
    return history.map((record) => record.userId);
  }

  /**
   * Get user data for a specific item.
   */
  private async getItemUserData(itemId: string, userId: string) {
    if (!this.api) return undefined;

    try {
      const response = await getItemsApi(this.api).getItems({
        userId,
        ids: [itemId],
        enableUserData: true,
      });
      return response.data.Items?.[0]?.UserData;
    } catch {
      return undefined;
    }
  }

  /**
   * Build a watched cache for an entire library.
   * More efficient than querying per-item for bulk operations.
   */
  async buildWatchedCacheForLibrary(libraryId: string): Promise<void> {
    if (!this.api) return;

    const users = await this.getUsers();
    const watchedMap: JellyfinWatchedCacheEntry = {};

    for (const user of users) {
      try {
        const response = await getItemsApi(this.api).getItems({
          userId: user.id,
          parentId: libraryId,
          recursive: true,
          filters: [ItemFilter.IsPlayed],
          fields: [], // Minimal fields
          enableUserData: false,
        });

        for (const item of response.data.Items || []) {
          if (item.Id) {
            const existing = watchedMap[item.Id] || [];
            existing.push(user.id);
            watchedMap[item.Id] = existing;
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to get watched items for user ${user.name}`, error);
      }
    }

    const cacheKey = `${JELLYFIN_CACHE_KEYS.WATCHED_LIBRARY}:${libraryId}`;
    this.cache.data.set(cacheKey, watchedMap, JELLYFIN_CACHE_TTL.WATCHED_LIBRARY);
  }

  // ============================================================
  // COLLECTIONS
  // ============================================================

  async getCollections(libraryId: string): Promise<MediaCollection[]> {
    if (!this.api) return [];

    try {
      const response = await getItemsApi(this.api).getItems({
        parentId: libraryId,
        includeItemTypes: [BaseItemKind.BoxSet],
        recursive: false,
        fields: [ItemFields.Overview, ItemFields.DateCreated],
      });

      return (response.data.Items || []).map(JellyfinMapper.toMediaCollection);
    } catch (error) {
      this.logger.error(`Failed to get collections for ${libraryId}`, error);
      return [];
    }
  }

  async getCollection(collectionId: string): Promise<MediaCollection | undefined> {
    if (!this.api) return undefined;

    try {
      const response = await getItemsApi(this.api).getItems({
        ids: [collectionId],
        fields: [ItemFields.Overview, ItemFields.DateCreated],
      });

      const item = response.data.Items?.[0];
      return item ? JellyfinMapper.toMediaCollection(item) : undefined;
    } catch (error) {
      this.logger.warn(`Failed to get collection ${collectionId}`, error);
      return undefined;
    }
  }

  async createCollection(params: CreateCollectionParams): Promise<MediaCollection> {
    if (!this.api) {
      throw new Error('Jellyfin not initialized');
    }

    try {
      const response = await getCollectionApi(this.api).createCollection({
        name: params.title,
        parentId: params.libraryId,
        isLocked: true,
      });

      // Fetch full collection data
      const collectionId = response.data.Id;
      if (!collectionId) {
        throw new Error('Collection created but no ID returned');
      }

      const collection = await this.getCollection(collectionId);
      if (!collection) {
        throw new Error('Failed to fetch created collection');
      }

      return collection;
    } catch (error) {
      this.logger.error('Failed to create Jellyfin collection', error);
      throw error;
    }
  }

  async deleteCollection(collectionId: string): Promise<void> {
    if (!this.api) return;

    try {
      await getLibraryApi(this.api).deleteItem({ itemId: collectionId });
    } catch (error) {
      this.logger.error(`Failed to delete collection ${collectionId}`, error);
      throw error;
    }
  }

  async getCollectionChildren(collectionId: string): Promise<MediaItem[]> {
    if (!this.api) return [];

    try {
      const response = await getItemsApi(this.api).getItems({
        parentId: collectionId,
        fields: [
          ItemFields.ProviderIds,
          ItemFields.Path,
          ItemFields.DateCreated,
        ],
        enableUserData: true,
      });

      return (response.data.Items || []).map(JellyfinMapper.toMediaItem);
    } catch (error) {
      this.logger.error(`Failed to get collection children for ${collectionId}`, error);
      return [];
    }
  }

  async addToCollection(collectionId: string, itemId: string): Promise<void> {
    if (!this.api) return;

    try {
      await getCollectionApi(this.api).addToCollection({
        collectionId,
        ids: [itemId],
      });
    } catch (error) {
      this.logger.error(`Failed to add ${itemId} to collection ${collectionId}`, error);
      throw error;
    }
  }

  async removeFromCollection(collectionId: string, itemId: string): Promise<void> {
    if (!this.api) return;

    try {
      await getCollectionApi(this.api).removeFromCollection({
        collectionId,
        ids: [itemId],
      });
    } catch (error) {
      this.logger.error(`Failed to remove ${itemId} from collection ${collectionId}`, error);
      throw error;
    }
  }

  // ============================================================
  // OPTIONAL: PLEX-SPECIFIC FEATURES (Not supported)
  // ============================================================

  // updateCollectionVisibility is not implemented for Jellyfin
  // as it doesn't support collection visibility settings

  // getWatchlistForUser is not implemented for Jellyfin
  // as it doesn't have a watchlist API

  // ============================================================
  // PLAYLISTS
  // ============================================================

  async getPlaylists(libraryId: string): Promise<MediaPlaylist[]> {
    if (!this.api) return [];

    try {
      const response = await getItemsApi(this.api).getItems({
        includeItemTypes: [BaseItemKind.Playlist],
        recursive: true,
        fields: [ItemFields.Overview, ItemFields.DateCreated],
      });

      return (response.data.Items || []).map(JellyfinMapper.toMediaPlaylist);
    } catch (error) {
      this.logger.error('Failed to get Jellyfin playlists', error);
      return [];
    }
  }

  // ============================================================
  // ACTIONS
  // ============================================================

  async deleteFromDisk(itemId: string): Promise<void> {
    if (!this.api) return;

    try {
      await getLibraryApi(this.api).deleteItem({ itemId });
      this.logger.log(`Deleted item ${itemId} from disk`);
    } catch (error) {
      this.logger.error(`Failed to delete item ${itemId} from disk`, error);
      throw error;
    }
  }

  // ============================================================
  // CACHE MANAGEMENT
  // ============================================================

  resetMetadataCache(itemId?: string): void {
    if (itemId) {
      this.cache.data.del(`${JELLYFIN_CACHE_KEYS.WATCH_HISTORY}:${itemId}`);
    } else {
      // Clear all Jellyfin cache
      this.cache.data.flushAll();
    }
  }
}
