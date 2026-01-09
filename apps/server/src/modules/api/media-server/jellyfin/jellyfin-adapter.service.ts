import { Jellyfin, type Api } from '@jellyfin/sdk';
import {
  BaseItemKind,
  ItemFields,
  ItemFilter,
  ItemSortBy,
  SortOrder,
} from '@jellyfin/sdk/lib/generated-client/models';
import {
  getCollectionApi,
  getItemsApi,
  getItemUpdateApi,
  getLibraryApi,
  getSearchApi,
  getSystemApi,
  getUserApi,
} from '@jellyfin/sdk/lib/utils/api';
import {
  MediaServerFeature,
  MediaServerType,
  type CollectionVisibilitySettings,
  type CreateCollectionParams,
  type LibraryQueryOptions,
  type MediaCollection,
  type MediaItem,
  type MediaItemType,
  type MediaLibrary,
  type MediaPlaylist,
  type MediaServerStatus,
  type MediaUser,
  type PagedResult,
  type RecentlyAddedOptions,
  type UpdateCollectionParams,
  type WatchRecord,
} from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../../settings/settings.service';
import cacheManager, { type Cache } from '../../lib/cache';
import { supportsFeature } from '../media-server.constants';
import type { IMediaServerService } from '../media-server.interface';
import {
  JELLYFIN_BATCH_SIZE,
  JELLYFIN_CACHE_KEYS,
  JELLYFIN_CACHE_TTL,
  JELLYFIN_CLIENT_INFO,
  JELLYFIN_DEVICE_INFO,
} from './jellyfin.constants';
import { JellyfinMapper } from './jellyfin.mapper';
import type { JellyfinWatchedCacheEntry } from './jellyfin.types';

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
export class JellyfinAdapterService implements IMediaServerService {
  private api: Api | undefined;
  private initialized = false;
  private readonly logger = new Logger(JellyfinAdapterService.name);
  private readonly cache: Cache;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {
    this.cache = cacheManager.getCache('jellyfin');
  }

  /**
   * Create a Jellyfin API client without modifying adapter state.
   */
  private createApiClient(
    url: string,
    apiKey: string,
    deviceSuffix: string = 'default',
  ): Api {
    const jellyfin = new Jellyfin({
      clientInfo: {
        name: JELLYFIN_CLIENT_INFO.name,
        version: JELLYFIN_CLIENT_INFO.version,
      },
      deviceInfo: {
        name: JELLYFIN_DEVICE_INFO.name,
        id: `${JELLYFIN_DEVICE_INFO.idPrefix}-${deviceSuffix}`,
      },
    });

    return jellyfin.createApi(url, apiKey);
  }

  /**
   * Verify connection to a Jellyfin server and return server info.
   */
  private async verifyConnection(api: Api): Promise<{
    success: boolean;
    serverName?: string;
    version?: string;
    error?: string;
  }> {
    try {
      // First get public system info to check if server is reachable
      const systemInfo = await getSystemApi(api).getPublicSystemInfo();

      // Then verify API key by calling an authenticated endpoint
      try {
        await getUserApi(api).getUsers();
      } catch (authError) {
        return {
          success: false,
          error: 'Invalid API key - authentication failed',
        };
      }

      return {
        success: true,
        serverName: systemInfo.data.ServerName || undefined,
        version: systemInfo.data.Version || undefined,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Connection failed';
      return { success: false, error };
    }
  }

  async initialize(): Promise<void> {
    const settings = await this.settingsService.getSettings();

    if (!settings || !('jellyfin_url' in settings)) {
      throw new Error('Settings not available');
    }

    if (!settings.jellyfin_url || !settings.jellyfin_api_key) {
      throw new Error('Jellyfin settings not configured');
    }

    const api = this.createApiClient(
      settings.jellyfin_url,
      settings.jellyfin_api_key,
      settings.clientId || 'default',
    );

    const result = await this.verifyConnection(api);

    if (!result.success) {
      this.initialized = false;
      throw new Error(`Failed to connect to Jellyfin: ${result.error}`);
    }

    this.api = api;
    this.initialized = true;
    this.logger.log(
      `Jellyfin connection established: ${result.serverName} (${result.version})`,
    );
  }

  uninitialize(): void {
    this.initialized = false;
    this.api = undefined;
    // Clear the cache when uninitializing
    this.cache.flush();
  }

  isSetup(): boolean {
    return this.initialized && this.api !== undefined;
  }

  /**
   * Test connection to a Jellyfin server with provided credentials.
   * This method doesn't require the adapter to be initialized and doesn't
   * modify the adapter's state - useful for testing credentials before saving.
   */
  async testConnection(
    url: string,
    apiKey: string,
  ): Promise<{
    success: boolean;
    serverName?: string;
    version?: string;
    error?: string;
  }> {
    const api = this.createApiClient(url, apiKey, 'test');
    const result = await this.verifyConnection(api);

    if (result.success) {
      this.logger.log(
        `Jellyfin connection test successful: ${result.serverName} (${result.version})`,
      );
    } else {
      this.logger.error(`Jellyfin connection test failed: ${result.error}`);
    }

    return result;
  }

  getServerType(): MediaServerType {
    return MediaServerType.JELLYFIN;
  }

  supportsFeature(feature: MediaServerFeature): boolean {
    return supportsFeature(MediaServerType.JELLYFIN, feature);
  }

  async getStatus(): Promise<MediaServerStatus | undefined> {
    if (!this.api) return undefined;

    try {
      if (this.cache.data.has(JELLYFIN_CACHE_KEYS.STATUS)) {
        return this.cache.data.get<MediaServerStatus>(
          JELLYFIN_CACHE_KEYS.STATUS,
        );
      }

      const response = await getSystemApi(this.api).getPublicSystemInfo();
      const settings = await this.settingsService.getSettings();
      // Extract jellyfin_url if settings is a valid Settings object (not an error response)
      const jellyfinUrl =
        settings && 'jellyfin_url' in settings
          ? settings.jellyfin_url
          : undefined;
      const status = JellyfinMapper.toMediaServerStatus(
        response.data.Id || '',
        response.data.Version || '',
        response.data.ServerName,
        response.data.OperatingSystem,
        jellyfinUrl,
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

  async getUsers(): Promise<MediaUser[]> {
    if (!this.api) return [];

    try {
      if (this.cache.data.has(JELLYFIN_CACHE_KEYS.USERS)) {
        return (
          this.cache.data.get<MediaUser[]>(JELLYFIN_CACHE_KEYS.USERS) || []
        );
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
      return response.data
        ? JellyfinMapper.toMediaUser(response.data)
        : undefined;
    } catch (error) {
      this.logger.warn(`Failed to get Jellyfin user ${id}`, error);
      return undefined;
    }
  }

  async getLibraries(): Promise<MediaLibrary[]> {
    if (!this.api) {
      this.logger.warn('getLibraries() - API not initialized');
      return [];
    }

    try {
      if (this.cache.data.has(JELLYFIN_CACHE_KEYS.LIBRARIES)) {
        return (
          this.cache.data.get<MediaLibrary[]>(JELLYFIN_CACHE_KEYS.LIBRARIES) ||
          []
        );
      }

      const response = await getLibraryApi(this.api).getMediaFolders();
      const libraries = (response.data.Items || [])
        .filter(
          (item) =>
            item.CollectionType === 'movies' ||
            item.CollectionType === 'tvshows',
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
      this.logger.warn('getLibraryContents() - API not initialized');
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
        sortBy: [(options?.sort as ItemSortBy) || ItemSortBy.SortName],
        sortOrder: [
          options?.sortOrder === 'desc'
            ? SortOrder.Descending
            : SortOrder.Ascending,
        ],
      });

      const items = (response.data.Items || []).map(JellyfinMapper.toMediaItem);

      return {
        items,
        totalSize: response.data.TotalRecordCount || items.length,
        offset: options?.offset || 0,
        limit: options?.limit || JELLYFIN_BATCH_SIZE.DEFAULT_PAGE_SIZE,
      };
    } catch (error) {
      // Check if this looks like a migration issue:
      // - Empty/null library ID
      // - Plex-style numeric ID (Jellyfin uses 32-char hex UUIDs)
      const isMigrationIssue =
        !libraryId || libraryId.trim() === '' || /^\d+$/.test(libraryId); // Plex uses numeric IDs like "1", "15"

      if (isMigrationIssue) {
        this.logger.warn(
          `Library '${libraryId || '(empty)'}' appears to be from a different media server. Please update the library setting in your rules.`,
        );
      } else {
        this.logger.error(
          `Failed to get library contents for ${libraryId}`,
          error,
        );
      }
      return { items: [], totalSize: 0, offset: 0, limit: 50 };
    }
  }

  async getLibraryContentCount(
    libraryId: string,
    type?: MediaItemType,
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
      const isMigrationIssue =
        !libraryId || libraryId.trim() === '' || /^\d+$/.test(libraryId);

      if (isMigrationIssue) {
        this.logger.warn(
          `Library '${libraryId || '(empty)'}' appears to be from a different media server. Please update the library setting in your rules.`,
        );
      } else {
        this.logger.error(
          `Failed to get library count for ${libraryId}`,
          error,
        );
      }
      return 0;
    }
  }

  async searchLibraryContents(
    libraryId: string,
    query: string,
    type?: MediaItemType,
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
      const isMigrationIssue =
        !libraryId || libraryId.trim() === '' || /^\d+$/.test(libraryId);

      if (isMigrationIssue) {
        this.logger.warn(
          `Library '${libraryId || '(empty)'}' appears to be from a different media server. Please update the library setting in your rules.`,
        );
      } else {
        this.logger.error(`Failed to search library ${libraryId}`, error);
      }
      return [];
    }
  }

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

  async getChildrenMetadata(
    parentId: string,
    childType?: MediaItemType,
  ): Promise<MediaItem[]> {
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
        // Filter by item type - defaults to all media types if not specified
        includeItemTypes: childType
          ? JellyfinMapper.toBaseItemKinds([childType])
          : [
              BaseItemKind.Movie,
              BaseItemKind.Series,
              BaseItemKind.Season,
              BaseItemKind.Episode,
            ],
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
      const isMigrationIssue =
        !libraryId || libraryId.trim() === '' || /^\d+$/.test(libraryId);

      if (isMigrationIssue) {
        this.logger.warn(
          `Library '${libraryId || '(empty)'}' appears to be from a different media server. Please update the library setting in your rules.`,
        );
      } else {
        this.logger.error(
          `Failed to get recently added for ${libraryId}`,
          error,
        );
      }
      return [];
    }
  }

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
          type: JellyfinMapper.toMediaItemType(hint.Type),
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
      for (
        let i = 0;
        i < users.length;
        i += JELLYFIN_BATCH_SIZE.USER_WATCH_HISTORY
      ) {
        const batch = users.slice(
          i,
          i + JELLYFIN_BATCH_SIZE.USER_WATCH_HISTORY,
        );

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
   * Get total play count for an item across all users.
   * This includes partial/unfinished plays (PlayCount > 0 but Played = false).
   * Only meaningful for Movies and Episodes (Series/Seasons always return 0).
   */
  async getTotalPlayCount(itemId: string): Promise<number> {
    if (!this.api) return 0;

    try {
      const users = await this.getUsers();
      let totalPlayCount = 0;

      // Batch users to avoid overwhelming the API
      for (
        let i = 0;
        i < users.length;
        i += JELLYFIN_BATCH_SIZE.USER_WATCH_HISTORY
      ) {
        const batch = users.slice(
          i,
          i + JELLYFIN_BATCH_SIZE.USER_WATCH_HISTORY,
        );

        const results = await Promise.all(
          batch.map((user) => this.getItemUserData(itemId, user.id)),
        );

        results.forEach((userData) => {
          if (userData?.PlayCount) {
            totalPlayCount += userData.PlayCount;
          }
        });
      }

      return totalPlayCount;
    } catch (error) {
      this.logger.error(`Failed to get play count for ${itemId}`, error);
      return 0;
    }
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
        this.logger.warn(
          `Failed to get watched items for user ${user.name}`,
          error,
        );
      }
    }

    const cacheKey = `${JELLYFIN_CACHE_KEYS.WATCHED_LIBRARY}:${libraryId}`;
    this.cache.data.set(
      cacheKey,
      watchedMap,
      JELLYFIN_CACHE_TTL.WATCHED_LIBRARY,
    );
  }

  async getCollections(libraryId: string): Promise<MediaCollection[]> {
    if (!this.api) return [];

    try {
      // Get all BoxSets system-wide - Jellyfin collections can contain items
      // from any library, so we can't filter by parentId
      const response = await getItemsApi(this.api).getItems({
        includeItemTypes: [BaseItemKind.BoxSet],
        recursive: true,
        fields: [
          ItemFields.Overview,
          ItemFields.DateCreated,
          ItemFields.ChildCount,
        ],
      });

      return (response.data.Items || []).map(JellyfinMapper.toMediaCollection);
    } catch (error) {
      this.logger.error(`Failed to get collections for ${libraryId}`, error);
      return [];
    }
  }

  async getCollection(
    collectionId: string,
  ): Promise<MediaCollection | undefined> {
    if (!this.api) return undefined;

    try {
      const response = await getItemsApi(this.api).getItems({
        ids: [collectionId],
        fields: [
          ItemFields.Overview,
          ItemFields.DateCreated,
          ItemFields.ChildCount,
        ],
      });

      const item = response.data.Items?.[0];
      return item ? JellyfinMapper.toMediaCollection(item) : undefined;
    } catch (error) {
      this.logger.warn(`Failed to get collection ${collectionId}`, error);
      return undefined;
    }
  }

  async createCollection(
    params: CreateCollectionParams,
  ): Promise<MediaCollection> {
    if (!this.api) {
      throw new Error('Jellyfin not initialized');
    }

    try {
      const response = await getCollectionApi(this.api).createCollection({
        name: params.title,
        parentId: params.libraryId,
        // isLocked enables composite image generation from collection items
        isLocked: true,
      });

      const collectionId = response.data.Id;
      if (!collectionId) {
        throw new Error('Collection created but no ID returned');
      }

      // Note: No refresh needed - Jellyfin auto-generates composite images
      // when items are added (as long as isLocked: true, which we set above).

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
      // Get admin user ID from settings - Jellyfin BoxSets require userId to return their children
      const settings = await this.settingsService.getSettings();
      const userId =
        settings && 'jellyfin_user_id' in settings
          ? settings.jellyfin_user_id
          : undefined;

      // For BoxSets in Jellyfin, we need to use the Items endpoint
      // with the collection's ID as parentId AND a userId
      const response = await getItemsApi(this.api).getItems({
        userId: userId,
        parentId: collectionId,
        fields: [
          ItemFields.ProviderIds,
          ItemFields.Path,
          ItemFields.DateCreated,
        ],
        enableUserData: true,
        recursive: false,
      });

      // If parentId approach returns nothing, try recursive search
      if (!response.data.Items?.length) {
        const itemsResponse = await getItemsApi(this.api).getItems({
          userId: userId,
          parentId: collectionId,
          recursive: true,
          includeItemTypes: [
            BaseItemKind.Movie,
            BaseItemKind.Series,
            BaseItemKind.Season,
            BaseItemKind.Episode,
          ],
          fields: [
            ItemFields.ProviderIds,
            ItemFields.Path,
            ItemFields.DateCreated,
          ],
          enableUserData: true,
        });

        if (itemsResponse.data.Items?.length) {
          return (itemsResponse.data.Items || []).map(
            JellyfinMapper.toMediaItem,
          );
        }
      }

      return (response.data.Items || []).map(JellyfinMapper.toMediaItem);
    } catch (error) {
      this.logger.error(
        `Failed to get collection children for ${collectionId}`,
        error,
      );
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
      this.logger.error(
        `Failed to add ${itemId} to collection ${collectionId}`,
        error,
      );
      throw error;
    }
  }

  async removeFromCollection(
    collectionId: string,
    itemId: string,
  ): Promise<void> {
    if (!this.api) return;

    try {
      await getCollectionApi(this.api).removeFromCollection({
        collectionId,
        ids: [itemId],
      });
    } catch (error) {
      this.logger.error(
        `Failed to remove ${itemId} from collection ${collectionId}`,
        error,
      );
      throw error;
    }
  }

  // COLLECTION METADATA UPDATE

  async updateCollection(
    params: UpdateCollectionParams,
  ): Promise<MediaCollection> {
    if (!this.api) {
      throw new Error('Jellyfin client not initialized');
    }

    try {
      // First, get the existing collection to preserve all properties
      const existingResponse = await getItemsApi(this.api).getItems({
        ids: [params.collectionId],
        includeItemTypes: [BaseItemKind.BoxSet],
        fields: [
          ItemFields.Overview,
          ItemFields.DateCreated,
          ItemFields.ChildCount,
          ItemFields.Tags,
          ItemFields.Genres,
          ItemFields.Studios,
          ItemFields.People,
        ],
      });

      const existingCollection = existingResponse.data.Items?.[0];
      if (!existingCollection) {
        throw new Error(`Collection ${params.collectionId} not found`);
      }

      // Update collection metadata using ItemUpdateApi
      // We must include array properties to avoid null reference errors in Jellyfin
      await getItemUpdateApi(this.api).updateItem({
        itemId: params.collectionId,
        baseItemDto: {
          // Preserve existing properties
          ...existingCollection,
          // Update only the fields we want to change
          Name: params.title,
          Overview: params.summary,
          ForcedSortName: params.sortTitle,
          // Jellyfin's updateItem API requires array properties to be provided
          Tags: existingCollection.Tags ?? [],
          Genres: existingCollection.Genres ?? [],
          Studios: existingCollection.Studios ?? [],
          People: existingCollection.People ?? [],
          GenreItems: existingCollection.GenreItems ?? [],
          RemoteTrailers: existingCollection.RemoteTrailers ?? [],
          ProviderIds: existingCollection.ProviderIds ?? {},
          LockedFields: existingCollection.LockedFields ?? [],
        },
      });

      // Return updated collection info
      const response = await getItemsApi(this.api).getItems({
        ids: [params.collectionId],
        includeItemTypes: [BaseItemKind.BoxSet],
        fields: [
          ItemFields.Overview,
          ItemFields.DateCreated,
          ItemFields.ChildCount,
        ],
      });

      const collection = response.data.Items?.[0];
      if (!collection) {
        throw new Error(`Collection ${params.collectionId} not found`);
      }

      return JellyfinMapper.toMediaCollection(collection);
    } catch (error) {
      this.logger.error(
        `Failed to update Jellyfin collection ${params.collectionId}`,
        error,
      );
      throw error;
    }
  }

  async updateCollectionVisibility(
    settings: CollectionVisibilitySettings,
  ): Promise<void> {
    this.logger.warn(
      `Attempted to update collection visibility for collection ${settings.collectionId} in library ${settings.libraryId}, ` +
        'but Jellyfin does not support hub/recommendation visibility features.',
    );
    throw new Error(
      'Collection visibility settings are not supported on Jellyfin. ' +
        'Jellyfin does not have hub/recommendation visibility features.',
    );
  }

  // OPTIONAL: SERVER-SPECIFIC FEATURES (Not supported)

  // getWatchlistForUser is not implemented for Jellyfin
  // as it doesn't have a watchlist API

  async getPlaylists(libraryId: string): Promise<MediaPlaylist[]> {
    if (!this.api) return [];

    try {
      // Jellyfin playlists are not library-specific, but we filter by parentId
      // to maintain consistency with the interface contract
      const response = await getItemsApi(this.api).getItems({
        parentId: libraryId,
        includeItemTypes: [BaseItemKind.Playlist],
        recursive: true,
        fields: [ItemFields.Overview, ItemFields.DateCreated],
      });

      return (response.data.Items || []).map(JellyfinMapper.toMediaPlaylist);
    } catch (error) {
      this.logger.error(
        `Failed to get Jellyfin playlists for library ${libraryId}`,
        error,
      );
      return [];
    }
  }

  async getAllIdsForContextAction(
    collectionType: MediaItemType | undefined,
    context: { type: MediaItemType; id: string },
    mediaId: string,
  ): Promise<string[]> {
    // Handle -1 sentinel value (meaning "all" from UI) - just return the mediaId
    if (context.id === '-1') {
      return [mediaId];
    }

    const handleMedia: string[] = [];

    // If we have a collection type, use it to determine what IDs to return
    if (collectionType) {
      switch (collectionType) {
        // When collection type is seasons
        case 'season':
          switch (context.type) {
            // and context type is seasons - return just the season
            case 'season':
              handleMedia.push(context.id);
              break;
            // and context type is episodes - not allowed
            case 'episode':
              this.logger.warn(
                'Tried to add episodes to a collection of type season. This is not allowed.',
              );
              break;
            // and context type is show - return all seasons
            default:
              const seasons = await this.getChildrenMetadata(mediaId, 'season');
              handleMedia.push(...seasons.map((s) => s.id));
              break;
          }
          break;

        // When collection type is episodes
        case 'episode':
          switch (context.type) {
            // and context type is seasons - return all episodes in season
            case 'season':
              const eps = await this.getChildrenMetadata(context.id, 'episode');
              handleMedia.push(...eps.map((ep) => ep.id));
              break;
            // and context type is episodes - return just the episode
            case 'episode':
              handleMedia.push(context.id);
              break;
            // and context type is show - return all episodes in show
            default:
              const allSeasons = await this.getChildrenMetadata(
                mediaId,
                'season',
              );
              for (const season of allSeasons) {
                const episodes = await this.getChildrenMetadata(
                  season.id,
                  'episode',
                );
                handleMedia.push(...episodes.map((ep) => ep.id));
              }
              break;
          }
          break;

        // When collection type is show or movie - just return the media item
        default:
          handleMedia.push(mediaId);
          break;
      }
    }
    // For global exclusions (no collection type), return hierarchically
    else {
      switch (context.type) {
        case 'show':
          // For shows, add the show + all seasons + all episodes
          handleMedia.push(mediaId);
          const showSeasons = await this.getChildrenMetadata(mediaId, 'season');
          for (const season of showSeasons) {
            handleMedia.push(season.id);
            const episodes = await this.getChildrenMetadata(
              season.id,
              'episode',
            );
            handleMedia.push(...episodes.map((ep) => ep.id));
          }
          break;
        case 'season':
          // For seasons, add the season + all its episodes
          handleMedia.push(context.id);
          const seasonEps = await this.getChildrenMetadata(
            context.id,
            'episode',
          );
          handleMedia.push(...seasonEps.map((ep) => ep.id));
          break;
        case 'episode':
          // Just the episode
          handleMedia.push(context.id);
          break;
        default:
          // Movies or unknown - just the item
          handleMedia.push(mediaId);
          break;
      }
    }

    return handleMedia;
  }

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

  resetMetadataCache(itemId?: string): void {
    if (itemId) {
      this.cache.data.del(`${JELLYFIN_CACHE_KEYS.WATCH_HISTORY}:${itemId}`);
    } else {
      // Clear all Jellyfin cache
      this.cache.data.flushAll();
    }
  }
}
