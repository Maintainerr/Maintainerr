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
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import axios, { type AxiosInstance, AxiosError } from 'axios';
import { formatConnectionFailureMessage } from '../../../../utils/connection-error';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { SettingsService } from '../../../settings/settings.service';
import cacheManager, { type Cache } from '../../lib/cache';
import { supportsFeature } from '../media-server.constants';
import type {
  IMediaServerService,
  MediaWatchState,
} from '../media-server.interface';
import {
  EMBY_BATCH_SIZE,
  EMBY_CACHE_KEYS,
  EMBY_CACHE_TTL,
  EMBY_CLIENT_INFO,
  EMBY_DEVICE_INFO,
} from './emby.constants';
import { EmbyMapper } from './emby.mapper';
import type {
  EmbyAuthenticationResult,
  EmbyBaseItemDto,
  EmbyItemsQueryResponse,
  EmbySystemInfo,
  EmbyUserDto,
} from './emby.types';

/**
 * Emby media server adapter.
 *
 * Implements IMediaServerService against Emby's HTTP API (https://dev.emby.media/).
 * Emby and Jellyfin share a common API ancestor (Jellyfin forked Emby in 2018),
 * so endpoint shapes are largely identical. Key Emby-specific differences:
 * - X-MediaBrowser-Authorization header requires Version="1.0.0" (pinned).
 * - Recently-added uses /Users/{userId}/Items/Latest (vs Jellyfin /Items/Latest).
 * - Admin validation is stricter at setup.
 *
 * Methods marked with TODO(emby-server-test) have not been verified against a
 * live Emby server and require validation before production use.
 */
@Injectable()
export class EmbyAdapterService implements IMediaServerService {
  private http: AxiosInstance | undefined;
  private initialized = false;
  private embyUrl: string | undefined;
  private embyApiKey: string | undefined;
  private embyUserId: string | undefined;
  private deviceId: string;
  private readonly cache: Cache;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(EmbyAdapterService.name);
    this.cache = cacheManager.getCache('emby');
    this.deviceId = `${EMBY_DEVICE_INFO.idPrefix}-${this.randomToken(12)}`;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    const url = this.settings.emby_url;
    const apiKey = this.settings.emby_api_key;
    const userId = this.settings.emby_user_id;

    if (!url || !apiKey) {
      this.logger.debug(
        'Emby settings incomplete — skipping initialize (url or api_key missing)',
      );
      this.initialized = false;
      this.http = undefined;
      return;
    }

    let cleanUrl = url;
    while (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    this.embyUrl = cleanUrl;
    this.embyApiKey = apiKey;
    this.embyUserId = userId || undefined;

    this.http = axios.create({
      baseURL: this.embyUrl,
      timeout: 30000,
      headers: {
        'X-Emby-Token': apiKey,
        'X-MediaBrowser-Token': apiKey,
        'X-Emby-Authorization': this.buildAuthHeader(),
        Accept: 'application/json',
      },
    });

    try {
      const info = await this.http.get<EmbySystemInfo>('/System/Info');
      this.initialized = true;
      this.logger.log(
        `Emby connection established to ${info.data.ServerName ?? this.embyUrl} (v${info.data.Version ?? 'unknown'})`,
      );
    } catch (error) {
      this.initialized = false;
      this.logger.warn(
        `Failed to initialize Emby connection: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
    }
  }

  uninitialize(): void {
    this.http = undefined;
    this.initialized = false;
    this.embyUrl = undefined;
    this.embyApiKey = undefined;
    this.embyUserId = undefined;
    this.cache.flush();
  }

  isSetup(): boolean {
    return this.initialized && this.http !== undefined;
  }

  getServerType(): MediaServerType {
    return MediaServerType.EMBY;
  }

  supportsFeature(feature: MediaServerFeature): boolean {
    return supportsFeature(MediaServerType.EMBY, feature);
  }

  // ============================================================================
  // Server / Users
  // ============================================================================

  async getStatus(): Promise<MediaServerStatus | undefined> {
    if (!this.http) return undefined;
    try {
      const cached = this.cache.data.get<EmbySystemInfo>(
        EMBY_CACHE_KEYS.STATUS,
      );
      const info = cached
        ? cached
        : (await this.http.get<EmbySystemInfo>('/System/Info')).data;
      if (!cached) {
        this.cache.data.set(
          EMBY_CACHE_KEYS.STATUS,
          info,
          EMBY_CACHE_TTL.STATUS,
        );
      }
      return EmbyMapper.toMediaServerStatus(
        info.Id || '',
        info.Version || 'unknown',
        info.ServerName,
        info.OperatingSystem,
        this.embyUrl,
      );
    } catch (error) {
      this.logger.debug(
        `Emby getStatus failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return undefined;
    }
  }

  async getUsers(): Promise<MediaUser[]> {
    if (!this.http) return [];
    try {
      const cached = this.cache.data.get<EmbyUserDto[]>(EMBY_CACHE_KEYS.USERS);
      const users = cached
        ? cached
        : (await this.http.get<EmbyUserDto[]>('/Users')).data;
      if (!cached) {
        this.cache.data.set(EMBY_CACHE_KEYS.USERS, users, EMBY_CACHE_TTL.USERS);
      }
      return users.map(EmbyMapper.toMediaUser);
    } catch (error) {
      this.logger.debug(
        `Emby getUsers failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  async getUser(id: string): Promise<MediaUser | undefined> {
    if (!this.http) return undefined;
    try {
      const { data } = await this.http.get<EmbyUserDto>(`/Users/${id}`);
      return EmbyMapper.toMediaUser(data);
    } catch (error) {
      this.logger.debug(
        `Emby getUser(${id}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return undefined;
    }
  }

  // ============================================================================
  // Libraries
  // ============================================================================

  async getLibraries(): Promise<MediaLibrary[]> {
    if (!this.http) return [];
    try {
      const cached = this.cache.data.get<EmbyBaseItemDto[]>(
        EMBY_CACHE_KEYS.LIBRARIES,
      );
      const folders = cached ? cached : await this.fetchLibraryFolders();
      if (!cached) {
        this.cache.data.set(
          EMBY_CACHE_KEYS.LIBRARIES,
          folders,
          EMBY_CACHE_TTL.LIBRARIES,
        );
      }
      return folders
        .filter((f) =>
          ['movies', 'tvshows'].includes(
            (f.CollectionType ?? '').toLowerCase(),
          ),
        )
        .map(EmbyMapper.toMediaLibrary);
    } catch (error) {
      this.logger.warn(
        `Emby getLibraries failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  private async fetchLibraryFolders(): Promise<EmbyBaseItemDto[]> {
    if (!this.http) return [];
    // /Library/VirtualFolders returns the configured libraries.
    // /Users/{id}/Views returns the user-visible libraries; prefer the latter
    // when we have a user context.
    const path = this.embyUserId
      ? `/Users/${this.embyUserId}/Views`
      : '/Library/MediaFolders';
    const { data } = await this.http.get<EmbyItemsQueryResponse>(path);
    return data.Items ?? [];
  }

  async getLibrariesStorage(): Promise<Map<string, number>> {
    // TODO(emby-server-test): Emby doesn't expose per-library byte totals
    // through a single cheap endpoint. Return empty map; callers fall back to
    // computeLibraryStorageSizes() for the slow path.
    return new Map();
  }

  async computeLibraryStorageSizes(): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (!this.http) return result;

    const libraries = await this.getLibraries();
    for (const lib of libraries) {
      try {
        const { data } = await this.http.get<EmbyItemsQueryResponse>(`/Items`, {
          params: {
            ParentId: lib.id,
            Recursive: true,
            IncludeItemTypes: 'Movie,Episode',
            Fields: 'MediaSources',
            Limit: 0,
          },
        });
        // Some Emby versions return aggregated stats via separate endpoints.
        // TODO(emby-server-test): verify whether /Items?Recursive&Fields=Size
        // returns Size as an aggregate or per item; for now we treat 0 as
        // unknown rather than reporting a misleading value.
        const total = (data.Items ?? []).reduce(
          (sum, item) =>
            sum +
            (item.MediaSources?.reduce((s, src) => s + (src.Size ?? 0), 0) ??
              0),
          0,
        );
        if (total > 0) result.set(lib.id, total);
      } catch (error) {
        this.logger.debug(
          `Emby computeLibraryStorageSizes(${lib.id}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
        );
      }
    }
    return result;
  }

  async getLibraryContents(
    libraryId: string,
    options?: LibraryQueryOptions,
  ): Promise<PagedResult<MediaItem>> {
    if (!this.http) {
      return { items: [], totalSize: 0, offset: 0, limit: 0 };
    }
    const limit = options?.limit ?? EMBY_BATCH_SIZE.DEFAULT_PAGE_SIZE;
    const offset = options?.offset ?? 0;

    try {
      const { data } = await this.http.get<EmbyItemsQueryResponse>('/Items', {
        params: {
          ParentId: libraryId,
          Recursive: true,
          IncludeItemTypes: options?.type
            ? EmbyMapper.toEmbyItemKind(options.type)
            : 'Movie,Series',
          Fields: 'ProviderIds,DateCreated,Overview,Tags',
          SortBy: this.toEmbySortBy(options?.sort),
          SortOrder: options?.sortOrder === 'desc' ? 'Descending' : 'Ascending',
          StartIndex: offset,
          Limit: limit,
          ...this.libraryQueryDefaults(),
        },
      });
      return {
        items: (data.Items ?? []).map(EmbyMapper.toMediaItem),
        totalSize: data.TotalRecordCount ?? data.Items?.length ?? 0,
        offset,
        limit,
      };
    } catch (error) {
      this.logger.warn(
        `Emby getLibraryContents(${libraryId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return { items: [], totalSize: 0, offset, limit };
    }
  }

  async getLibraryContentCount(
    libraryId: string,
    type?: MediaItemType,
  ): Promise<number> {
    if (!this.http) return 0;
    try {
      const { data } = await this.http.get<EmbyItemsQueryResponse>('/Items', {
        params: {
          ParentId: libraryId,
          Recursive: true,
          IncludeItemTypes: type
            ? EmbyMapper.toEmbyItemKind(type)
            : 'Movie,Series',
          Limit: 0,
          EnableTotalRecordCount: true,
        },
      });
      return data.TotalRecordCount ?? 0;
    } catch (error) {
      this.logger.debug(
        `Emby getLibraryContentCount(${libraryId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return 0;
    }
  }

  async searchLibraryContents(
    libraryId: string,
    query: string,
    type?: MediaItemType,
  ): Promise<MediaItem[]> {
    if (!this.http) return [];
    try {
      const { data } = await this.http.get<EmbyItemsQueryResponse>('/Items', {
        params: {
          ParentId: libraryId,
          Recursive: true,
          SearchTerm: query,
          IncludeItemTypes: type
            ? EmbyMapper.toEmbyItemKind(type)
            : 'Movie,Series',
          Fields: 'ProviderIds,DateCreated,Overview',
          Limit: EMBY_BATCH_SIZE.DEFAULT_PAGE_SIZE,
        },
      });
      return (data.Items ?? []).map(EmbyMapper.toMediaItem);
    } catch (error) {
      this.logger.debug(
        `Emby searchLibraryContents failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  // ============================================================================
  // Metadata
  // ============================================================================

  async getMetadata(itemId: string): Promise<MediaItem | undefined> {
    if (!this.http) return undefined;
    try {
      // Emby's /Users/{userId}/Items/{itemId} returns user-specific data.
      // When no user context, fall back to /Items/{itemId}.
      const path = this.embyUserId
        ? `/Users/${this.embyUserId}/Items/${itemId}`
        : `/Items/${itemId}`;
      const { data } = await this.http.get<EmbyBaseItemDto>(path, {
        params: {
          Fields:
            'ProviderIds,DateCreated,Overview,Tags,MediaSources,Genres,People',
        },
      });
      return EmbyMapper.toMediaItem(data);
    } catch (error) {
      this.logger.debug(
        `Emby getMetadata(${itemId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return undefined;
    }
  }

  async getChildrenMetadata(parentId: string): Promise<MediaItem[]> {
    if (!this.http) return [];
    try {
      const { data } = await this.http.get<EmbyItemsQueryResponse>('/Items', {
        params: {
          ParentId: parentId,
          Fields: 'ProviderIds,DateCreated,Overview,Tags',
          Limit: EMBY_BATCH_SIZE.MAX_PAGE_SIZE,
        },
      });
      return (data.Items ?? []).map(EmbyMapper.toMediaItem);
    } catch (error) {
      this.logger.debug(
        `Emby getChildrenMetadata(${parentId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  async getRecentlyAdded(
    libraryId: string,
    options?: RecentlyAddedOptions,
  ): Promise<MediaItem[]> {
    if (!this.http) return [];
    // Emby uses /Users/{userId}/Items/Latest (per Jellyseerr precedent),
    // whereas Jellyfin exposes /Items/Latest. The user-scoped endpoint is the
    // documented path for Emby.
    if (!this.embyUserId) {
      this.logger.warn(
        'Emby getRecentlyAdded requires a configured user ID — none set',
      );
      return [];
    }
    try {
      const { data } = await this.http.get<EmbyBaseItemDto[]>(
        `/Users/${this.embyUserId}/Items/Latest`,
        {
          params: {
            ParentId: libraryId,
            IncludeItemTypes: options?.type
              ? EmbyMapper.toEmbyItemKind(options.type)
              : 'Movie,Episode',
            Fields: 'ProviderIds,DateCreated,Overview',
            Limit: options?.limit ?? 20,
          },
        },
      );
      return (Array.isArray(data) ? data : []).map(EmbyMapper.toMediaItem);
    } catch (error) {
      this.logger.debug(
        `Emby getRecentlyAdded(${libraryId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  async searchContent(query: string): Promise<MediaItem[]> {
    if (!this.http) return [];
    try {
      const { data } = await this.http.get<EmbyItemsQueryResponse>('/Items', {
        params: {
          Recursive: true,
          SearchTerm: query,
          IncludeItemTypes: 'Movie,Series,Episode',
          Fields: 'ProviderIds,DateCreated,Overview',
          Limit: EMBY_BATCH_SIZE.DEFAULT_PAGE_SIZE,
        },
      });
      return (data.Items ?? []).map(EmbyMapper.toMediaItem);
    } catch (error) {
      this.logger.debug(
        `Emby searchContent failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  async refreshItemMetadata(itemId: string): Promise<void> {
    if (!this.http) return;
    try {
      await this.http.post(`/Items/${itemId}/Refresh`, null, {
        params: {
          Recursive: false,
          ImageRefreshMode: 'Default',
          MetadataRefreshMode: 'FullRefresh',
          ReplaceAllImages: false,
          ReplaceAllMetadata: false,
        },
      });
    } catch (error) {
      this.logger.debug(
        `Emby refreshItemMetadata(${itemId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
    }
  }

  // ============================================================================
  // Watch State
  // ============================================================================
  // TODO(emby-server-test): Emby lacks a central watch-history endpoint; per
  // Jellyseerr precedent, iterate over users via /Users/{id}/Items with
  // IsPlayed=true filter. The implementations below mirror the Jellyfin
  // adapter's shape but use Emby endpoint paths.

  async getWatchHistory(itemId: string): Promise<WatchRecord[]> {
    if (!this.http) return [];
    try {
      const users = await this.getUsers();
      const records: WatchRecord[] = [];
      for (const user of users) {
        try {
          const { data } = await this.http.get<EmbyBaseItemDto>(
            `/Users/${user.id}/Items/${itemId}`,
          );
          if (data.UserData?.Played) {
            records.push(
              EmbyMapper.toWatchRecord(
                user.id,
                itemId,
                data.UserData.LastPlayedDate
                  ? new Date(data.UserData.LastPlayedDate)
                  : undefined,
              ),
            );
          }
        } catch {
          // Some users may not have access to this item — skip silently.
        }
      }
      return records;
    } catch (error) {
      this.logger.debug(
        `Emby getWatchHistory(${itemId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  async getWatchState(
    itemId: string,
    nativeViewCount?: number,
  ): Promise<MediaWatchState> {
    const history = await this.getWatchHistory(itemId);
    const viewCount = history.length;
    const isWatched =
      viewCount > 0 || (nativeViewCount !== undefined && nativeViewCount > 0);
    return { viewCount, isWatched };
  }

  async getItemSeenBy(itemId: string): Promise<string[]> {
    const history = await this.getWatchHistory(itemId);
    return history.map((r) => r.userId);
  }

  // ============================================================================
  // Collections
  // ============================================================================

  async getCollections(libraryId: string): Promise<MediaCollection[]> {
    if (!this.http) return [];
    try {
      const { data } = await this.http.get<EmbyItemsQueryResponse>('/Items', {
        params: {
          ParentId: libraryId,
          IncludeItemTypes: 'BoxSet',
          Recursive: true,
          Fields: 'DateCreated,Overview,ChildCount',
          Limit: EMBY_BATCH_SIZE.MAX_PAGE_SIZE,
        },
      });
      return (data.Items ?? []).map(EmbyMapper.toMediaCollection);
    } catch (error) {
      this.logger.debug(
        `Emby getCollections(${libraryId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  async getCollection(
    collectionId: string,
    throwOnError = false,
  ): Promise<MediaCollection | undefined> {
    if (!this.http) return undefined;
    try {
      const path = this.embyUserId
        ? `/Users/${this.embyUserId}/Items/${collectionId}`
        : `/Items/${collectionId}`;
      const { data } = await this.http.get<EmbyBaseItemDto>(path);
      return EmbyMapper.toMediaCollection(data);
    } catch (error) {
      if (throwOnError) throw error;
      this.logger.debug(
        `Emby getCollection(${collectionId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return undefined;
    }
  }

  async createCollection(
    params: CreateCollectionParams,
  ): Promise<MediaCollection> {
    if (!this.http) throw new Error('Emby not initialized');
    try {
      const { data } = await this.http.post<EmbyBaseItemDto>(
        '/Collections',
        null,
        {
          params: {
            Name: params.title,
            ParentId: params.libraryId,
          },
        },
      );
      const collection = EmbyMapper.toMediaCollection(data);
      if (params.summary) {
        try {
          await this.updateCollection({
            libraryId: params.libraryId,
            collectionId: collection.id,
            summary: params.summary,
            sortTitle: params.sortTitle,
          });
        } catch (error) {
          this.logger.warn(
            `Emby createCollection metadata follow-up failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
          );
        }
      }
      return collection;
    } catch (error) {
      const message = formatConnectionFailureMessage(
        error,
        'Connection failed',
      );
      this.logger.warn(`Emby createCollection failed: ${message}`);
      throw new Error(`Failed to create Emby collection: ${message}`);
    }
  }

  async deleteCollection(collectionId: string): Promise<void> {
    if (!this.http) throw new Error('Emby not initialized');
    try {
      await this.http.delete(`/Items/${collectionId}`);
    } catch (error) {
      const message = formatConnectionFailureMessage(
        error,
        'Connection failed',
      );
      throw new Error(`Failed to delete Emby collection: ${message}`);
    }
  }

  async cleanupCollectionForLibrary(
    collectionId: string,
    libraryId: string,
    isManualCollection: boolean,
  ): Promise<void> {
    if (!this.http) return;
    const children = await this.getCollectionChildren(collectionId);
    const fromLibrary = children.filter((c) => c.library?.id === libraryId);
    if (fromLibrary.length === 0) return;
    await this.removeBatchFromCollection(
      collectionId,
      fromLibrary.map((c) => c.id),
    );
    const remaining = await this.getCollectionChildren(collectionId);
    if (remaining.length === 0 && !isManualCollection) {
      await this.deleteCollection(collectionId);
    }
  }

  async getCollectionChildren(collectionId: string): Promise<MediaItem[]> {
    if (!this.http) return [];
    try {
      const { data } = await this.http.get<EmbyItemsQueryResponse>('/Items', {
        params: {
          ParentId: collectionId,
          Fields: 'ProviderIds,DateCreated,Overview',
          Limit: EMBY_BATCH_SIZE.MAX_PAGE_SIZE,
        },
      });
      return (data.Items ?? []).map(EmbyMapper.toMediaItem);
    } catch (error) {
      this.logger.debug(
        `Emby getCollectionChildren(${collectionId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  async addToCollection(collectionId: string, itemId: string): Promise<void> {
    await this.addBatchToCollection(collectionId, [itemId]);
  }

  async addBatchToCollection(
    collectionId: string,
    itemIds: string[],
  ): Promise<string[]> {
    if (!this.http || itemIds.length === 0) return itemIds;
    const failed: string[] = [];
    for (const chunk of this.chunked(
      itemIds,
      EMBY_BATCH_SIZE.COLLECTION_MUTATION,
    )) {
      try {
        await this.http.post(`/Collections/${collectionId}/Items`, null, {
          params: { Ids: chunk.join(',') },
        });
      } catch (error) {
        this.logger.warn(
          `Emby addBatchToCollection chunk failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
        );
        failed.push(...chunk);
      }
    }
    return failed;
  }

  async removeFromCollection(
    collectionId: string,
    itemId: string,
  ): Promise<void> {
    await this.removeBatchFromCollection(collectionId, [itemId]);
  }

  async removeBatchFromCollection(
    collectionId: string,
    itemIds: string[],
  ): Promise<string[]> {
    if (!this.http || itemIds.length === 0) return itemIds;
    const failed: string[] = [];
    for (const chunk of this.chunked(
      itemIds,
      EMBY_BATCH_SIZE.COLLECTION_MUTATION,
    )) {
      try {
        await this.http.delete(`/Collections/${collectionId}/Items`, {
          params: { Ids: chunk.join(',') },
        });
      } catch (error) {
        this.logger.warn(
          `Emby removeBatchFromCollection chunk failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
        );
        failed.push(...chunk);
      }
    }
    return failed;
  }

  async updateCollection(
    params: UpdateCollectionParams,
  ): Promise<MediaCollection> {
    if (!this.http) throw new Error('Emby not initialized');
    try {
      // Emby's POST /Items/{id} expects the full updated item. Fetch, mutate, send.
      const { data: current } = await this.http.get<EmbyBaseItemDto>(
        `/Items/${params.collectionId}`,
      );
      const updated: EmbyBaseItemDto = {
        ...current,
        Name: params.title ?? current.Name,
        Overview: params.summary ?? current.Overview,
      };
      await this.http.post(`/Items/${params.collectionId}`, updated);
      const refreshed = await this.getCollection(params.collectionId);
      if (!refreshed) {
        throw new Error('Collection vanished after update');
      }
      return refreshed;
    } catch (error) {
      const message = formatConnectionFailureMessage(
        error,
        'Connection failed',
      );
      throw new Error(`Failed to update Emby collection: ${message}`);
    }
  }

  async updateCollectionVisibility(
    settings: CollectionVisibilitySettings,
  ): Promise<void> {
    void settings;
    throw new Error(
      'updateCollectionVisibility is not supported on Emby (Plex-only feature)',
    );
  }

  async reorderCollectionItems(
    collectionId: string,
    orderedItemIds: string[],
  ): Promise<void> {
    if (!this.http) throw new Error('Emby not initialized');
    // TODO(emby-server-test): Emby retains POST /Items/{collectionId}/Items/{itemId}/Move?NewIndex={n}
    // from before the Jellyfin fork. Verify endpoint shape against current
    // Emby docs; until then leave guarded behind supportsFeature(COLLECTION_SORT).
    if (!this.supportsFeature(MediaServerFeature.COLLECTION_SORT)) {
      throw new Error('Collection sort not enabled for Emby');
    }
    for (let i = 0; i < orderedItemIds.length; i++) {
      try {
        await this.http.post(
          `/Items/${collectionId}/Items/${orderedItemIds[i]}/Move`,
          null,
          { params: { NewIndex: i } },
        );
      } catch (error) {
        this.logger.warn(
          `Emby reorder move(${orderedItemIds[i]}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
        );
      }
    }
  }

  async setCollectionImage(
    collectionId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    if (!this.http) throw new Error('Emby not initialized');
    try {
      // Emby accepts POST /Items/{id}/Images/{type} with base64-encoded body
      // and a Content-Type header on the body matching the image MIME type.
      const base64 = buffer.toString('base64');
      await this.http.post(`/Items/${collectionId}/Images/Primary`, base64, {
        headers: { 'Content-Type': contentType },
      });
    } catch (error) {
      const message = formatConnectionFailureMessage(
        error,
        'Connection failed',
      );
      throw new Error(`Failed to upload Emby collection image: ${message}`);
    }
  }

  // ============================================================================
  // Playlists
  // ============================================================================

  async getPlaylists(libraryId: string): Promise<MediaPlaylist[]> {
    if (!this.http) return [];
    try {
      const { data } = await this.http.get<EmbyItemsQueryResponse>('/Items', {
        params: {
          ParentId: libraryId,
          IncludeItemTypes: 'Playlist',
          Recursive: true,
          Fields: 'DateCreated,Overview,ChildCount',
          Limit: EMBY_BATCH_SIZE.MAX_PAGE_SIZE,
        },
      });
      return (data.Items ?? []).map(EmbyMapper.toMediaPlaylist);
    } catch (error) {
      this.logger.debug(
        `Emby getPlaylists(${libraryId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  // ============================================================================
  // Destructive
  // ============================================================================

  async deleteFromDisk(itemId: string): Promise<void> {
    if (!this.http) throw new Error('Emby not initialized');
    try {
      await this.http.delete(`/Items/${itemId}`);
    } catch (error) {
      const message = formatConnectionFailureMessage(
        error,
        'Connection failed',
      );
      throw new Error(`Failed to delete Emby item from disk: ${message}`);
    }
  }

  // ============================================================================
  // Context-action ID resolution
  // ============================================================================

  async getAllIdsForContextAction(
    collectionType: MediaItemType | undefined,
    context: { type: MediaItemType; id: string },
    mediaId: string,
  ): Promise<string[]> {
    // Match Jellyfin's semantics: when the collection type matches the context
    // type, return [mediaId]. Otherwise traverse parent/child relationships
    // appropriately. Episodes vs. shows are the most common case.
    if (!collectionType || collectionType === context.type) {
      return [mediaId];
    }
    if (collectionType === 'show' && context.type === 'episode') {
      const ep = await this.getMetadata(context.id);
      const seriesId = ep?.grandparentId;
      return seriesId ? [seriesId] : [];
    }
    if (collectionType === 'episode' && context.type === 'show') {
      const children = await this.getChildrenMetadata(context.id);
      // Children of a series are seasons; need to descend further for episodes.
      const episodeIds: string[] = [];
      for (const season of children) {
        const eps = await this.getChildrenMetadata(season.id);
        episodeIds.push(...eps.map((e) => e.id));
      }
      return episodeIds;
    }
    return [mediaId];
  }

  // ============================================================================
  // Cache management
  // ============================================================================

  resetMetadataCache(_itemId?: string): void {
    // The Emby cache only stores library/server-wide aggregates, never
    // per-item entries, so per-item invalidation collapses to a full flush.
    // Mirrors the Jellyfin adapter, which keeps the same cache shape.
    void _itemId;
    this.cache.flush();
  }

  // ============================================================================
  // Connection testing (used by settings UI before save)
  // ============================================================================

  async testConnection(
    url: string,
    apiKey: string,
  ): Promise<{
    success: boolean;
    serverName?: string;
    version?: string;
    error?: string;
    users?: Array<{ id: string; name: string }>;
  }> {
    let cleanUrl = url;
    while (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    const probe = axios.create({
      baseURL: cleanUrl,
      timeout: 15000,
      headers: {
        'X-Emby-Token': apiKey,
        'X-MediaBrowser-Token': apiKey,
        'X-Emby-Authorization': this.buildAuthHeader(),
        Accept: 'application/json',
      },
    });
    try {
      const [info, users] = await Promise.all([
        probe.get<EmbySystemInfo>('/System/Info'),
        probe.get<EmbyUserDto[]>('/Users'),
      ]);
      return {
        success: true,
        serverName: info.data.ServerName,
        version: info.data.Version,
        users: (users.data ?? [])
          .filter((u) => u.Policy?.IsAdministrator)
          .map((u) => ({ id: u.Id, name: u.Name ?? '' })),
      };
    } catch (error) {
      return {
        success: false,
        error: formatConnectionFailureMessage(error, 'Connection failed'),
      };
    }
  }

  /**
   * Authenticate against Emby with username/password and return the resulting
   * access token. Used by the settings flow that mirrors Plex's login dance.
   */
  async loginWithCredentials(
    url: string,
    username: string,
    password: string,
  ): Promise<{
    success: boolean;
    token?: string;
    userId?: string;
    serverName?: string;
    error?: string;
    users?: Array<{ id: string; name: string }>;
    libraries?: Array<{ id: string; name: string; type: string }>;
  }> {
    let cleanUrl = url;
    while (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    const probe = axios.create({
      baseURL: cleanUrl,
      timeout: 15000,
      headers: {
        'X-Emby-Authorization': this.buildAuthHeader(),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    try {
      const { data } = await probe.post<EmbyAuthenticationResult>(
        '/Users/AuthenticateByName',
        { Username: username, Pw: password },
      );
      if (!data.User?.Policy?.IsAdministrator) {
        return {
          success: false,
          error:
            'User authenticated but is not an administrator on this Emby server',
        };
      }
      const authed = axios.create({
        baseURL: cleanUrl,
        timeout: 15000,
        headers: {
          'X-Emby-Token': data.AccessToken,
          'X-MediaBrowser-Token': data.AccessToken,
          'X-Emby-Authorization': this.buildAuthHeader(),
          Accept: 'application/json',
        },
      });
      const [info, libs, users] = await Promise.all([
        authed.get<EmbySystemInfo>('/System/Info'),
        authed.get<EmbyItemsQueryResponse>(`/Users/${data.User.Id}/Views`),
        authed.get<EmbyUserDto[]>('/Users'),
      ]);
      return {
        success: true,
        token: data.AccessToken,
        userId: data.User.Id,
        serverName: info.data.ServerName,
        users: (users.data ?? []).map((u) => ({
          id: u.Id,
          name: u.Name ?? '',
        })),
        libraries: (libs.data.Items ?? []).map((l) => ({
          id: l.Id,
          name: l.Name ?? '',
          type: l.CollectionType ?? 'unknown',
        })),
      };
    } catch (error) {
      const ax = error as AxiosError;
      return {
        success: false,
        error:
          ax.response?.status === 401
            ? 'Invalid Emby username or password'
            : formatConnectionFailureMessage(error, 'Connection failed'),
      };
    }
  }

  // ============================================================================
  // Internal helpers
  // ============================================================================

  private buildAuthHeader(): string {
    return `MediaBrowser Client="${EMBY_CLIENT_INFO.name}", Device="${EMBY_DEVICE_INFO.name}", DeviceId="${this.deviceId}", Version="${EMBY_CLIENT_INFO.version}"`;
  }

  private toEmbySortBy(sort?: string): string {
    switch (sort) {
      case 'airDate':
        return 'PremiereDate';
      case 'rating':
        return 'CommunityRating';
      case 'watchCount':
        return 'PlayCount';
      case 'title':
      default:
        return 'SortName';
    }
  }

  private libraryQueryDefaults(): Record<string, unknown> {
    return { CollapseBoxSetItems: false };
  }

  private randomToken(length: number): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < length; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  private *chunked<T>(arr: T[], size: number): Generator<T[]> {
    for (let i = 0; i < arr.length; i += size) {
      yield arr.slice(i, i + size);
    }
  }
}
