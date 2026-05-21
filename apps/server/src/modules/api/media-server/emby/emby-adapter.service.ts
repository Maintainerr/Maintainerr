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
import { Injectable } from '@nestjs/common';
import { type AxiosInstance, AxiosError } from 'axios';
import { formatConnectionFailureMessage } from '../../../../utils/connection-error';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { SettingsDataService } from '../../../settings/settings-data.service';
import { EmbyApi } from '../../emby-api/emby-api.helper';
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
 * - Uses X-Emby-Authorization. Emby's parser accepts either `Emby` or
 *   `MediaBrowser` as the scheme prefix and stores Version without enforcing it.
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
    private readonly settings: SettingsDataService,
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

    this.http = new EmbyApi({
      url: this.embyUrl,
      apiKey,
      authHeader: this.buildAuthHeader(),
    }).axios;

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
      const users = cached ? cached : await this.fetchUsersQuery(this.http);
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
    const path = this.embyUserId ? `/Users/${this.embyUserId}/Items` : '/Items';

    for (const lib of libraries) {
      try {
        let total = 0;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data } = await this.http.get<EmbyItemsQueryResponse>(path, {
            params: {
              ParentId: lib.id,
              Recursive: true,
              IncludeItemTypes: 'Movie,Episode',
              // Size lives in MediaSources[].Size; without requesting it,
              // Emby omits the field entirely and every item sums to 0.
              Fields: 'MediaSources',
              Limit: EMBY_BATCH_SIZE.MAX_PAGE_SIZE,
              StartIndex: offset,
              EnableTotalRecordCount: true,
              ...this.libraryQueryDefaults(),
            },
          });

          const items = data.Items ?? [];
          total += items.reduce(
            (sum, item) =>
              sum +
              (item.Size ??
                item.MediaSources?.reduce((s, src) => s + (src.Size ?? 0), 0) ??
                0),
            0,
          );

          offset += items.length;
          const totalCount = data.TotalRecordCount ?? offset;
          hasMore = items.length > 0 && offset < totalCount;
        }

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

  async getChildrenMetadata(
    parentId: string,
    childType?: MediaItemType,
  ): Promise<MediaItem[]> {
    if (!this.http) return [];
    try {
      // Seasons of a series live under /Shows/{seriesId}/Seasons, not under
      // /Items?ParentId= (ParentId of a season points to the library folder,
      // not the show). Same data model as Jellyfin.
      if (childType === 'season') {
        const { data } = await this.http.get<EmbyItemsQueryResponse>(
          `/Shows/${parentId}/Seasons`,
          {
            params: {
              UserId: this.embyUserId,
              Fields: 'ProviderIds,DateCreated,Overview,Tags',
              EnableUserData: true,
            },
          },
        );
        return (data.Items ?? []).map(EmbyMapper.toMediaItem);
      }

      const { data } = await this.http.get<EmbyItemsQueryResponse>('/Items', {
        params: {
          ParentId: parentId,
          IncludeItemTypes: childType
            ? EmbyMapper.toEmbyItemKind(childType)
            : undefined,
          // Skip virtual (unaired) episodes the same way the Jellyfin adapter does.
          ExcludeLocationTypes: childType === 'episode' ? 'Virtual' : undefined,
          Fields: 'ProviderIds,DateCreated,Overview,Tags',
          EnableUserData: true,
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

  /**
   * User IDs of every user with `IsFavorite=true` on this item. Mirrors
   * `JellyfinAdapterService.getItemFavoritedBy` (per-user fan-out — Emby
   * has no central favorites endpoint).
   */
  async getItemFavoritedBy(itemId: string): Promise<string[]> {
    if (!this.http) return [];
    try {
      const users = await this.getUsers();
      const favoritedBy: string[] = [];
      for (const user of users) {
        try {
          const { data } = await this.http.get<EmbyBaseItemDto>(
            `/Users/${user.id}/Items/${itemId}`,
          );
          if (data.UserData?.IsFavorite) favoritedBy.push(user.id);
        } catch {
          // user may lack visibility on this item — skip silently
        }
      }
      return favoritedBy;
    } catch (error) {
      this.logger.debug(
        `Emby getItemFavoritedBy(${itemId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  /**
   * Sum of `UserData.PlayCount` across all users (counts unfinished plays).
   * Mirrors `JellyfinAdapterService.getTotalPlayCount`.
   */
  async getTotalPlayCount(itemId: string): Promise<number> {
    if (!this.http) return 0;
    try {
      const users = await this.getUsers();
      let total = 0;
      for (const user of users) {
        try {
          const { data } = await this.http.get<EmbyBaseItemDto>(
            `/Users/${user.id}/Items/${itemId}`,
          );
          total += data.UserData?.PlayCount ?? 0;
        } catch {
          // skip users without visibility
        }
      }
      return total;
    } catch (error) {
      this.logger.debug(
        `Emby getTotalPlayCount(${itemId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return 0;
    }
  }

  /**
   * Users who watched at least one episode under `parentId` (season or show).
   * Mirrors `JellyfinAdapterService.getDescendantEpisodeWatchers`. One
   * /Items request per user, each scoped to that user with `IsPlayed=true`
   * + `Limit=1` — we only need to know whether any played episode exists.
   */
  async getDescendantEpisodeWatchers(parentId: string): Promise<string[]> {
    if (!this.http) return [];
    try {
      const users = await this.getUsers();
      const watchers = new Set<string>();
      for (const user of users) {
        try {
          const { data } = await this.http.get<EmbyItemsQueryResponse>(
            '/Items',
            {
              params: {
                UserId: user.id,
                ParentId: parentId,
                Recursive: true,
                IncludeItemTypes: 'Episode',
                ExcludeLocationTypes: 'Virtual',
                IsPlayed: true,
                Limit: 1,
                EnableUserData: true,
              },
            },
          );
          if ((data.Items ?? []).length > 0) watchers.add(user.id);
        } catch {
          // skip users without visibility
        }
      }
      return [...watchers];
    } catch (error) {
      this.logger.debug(
        `Emby getDescendantEpisodeWatchers(${parentId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  /**
   * Items inside a playlist. Mirrors `JellyfinAdapterService.getPlaylistItems`.
   */
  async getPlaylistItems(playlistId: string): Promise<MediaItem[]> {
    if (!this.http) return [];
    try {
      const { data } = await this.http.get<EmbyItemsQueryResponse>(
        `/Playlists/${playlistId}/Items`,
        { params: { UserId: this.embyUserId } },
      );
      return (data.Items ?? []).map(EmbyMapper.toMediaItem);
    } catch (error) {
      this.logger.debug(
        `Emby getPlaylistItems(${playlistId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
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

  /**
   * Pick a single random item of the given kinds from a library section (or
   * across all sections when `sectionIds` is omitted). Emby honours
   * `SortBy=Random` server-side, mirroring Jellyfin's behaviour. Virtual
   * (unaired) entries are excluded so episode previews never land on a
   * placeholder. Returns null on failure or empty result.
   */
  async findRandomItem(
    sectionIds: string[] | undefined,
    kinds: string[],
  ): Promise<EmbyBaseItemDto | null> {
    if (!this.http) return null;
    try {
      const parentId = sectionIds?.[0];
      const { data } = await this.http.get<EmbyItemsQueryResponse>('/Items', {
        params: {
          userId: this.embyUserId,
          ParentId: parentId,
          IncludeItemTypes: kinds.join(','),
          Recursive: true,
          SortBy: 'Random',
          SortOrder: 'Ascending',
          Limit: 1,
          ExcludeLocationTypes: 'Virtual',
          Fields: 'ProviderIds,DateCreated,Overview',
          ImageTypeLimit: 1,
        },
      });
      return data.Items?.[0] ?? null;
    } catch (error) {
      this.logger.warn('Failed to pick random Emby item');
      this.logger.debug(error);
      return null;
    }
  }

  async findRandomEpisode(
    sectionIds: string[] | undefined,
  ): Promise<EmbyBaseItemDto | null> {
    return this.findRandomItem(sectionIds, ['Episode']);
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
    let users: EmbyUserDto[];
    try {
      users = await this.fetchUsersQuery(this.http);
    } catch (error) {
      this.logger.debug(
        `Emby getWatchHistory(${itemId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      throw error;
    }

    const records: WatchRecord[] = [];
    for (const user of users) {
      try {
        const { data } = await this.http.get<EmbyBaseItemDto>(
          `/Users/${user.Id}/Items/${itemId}`,
        );
        if (data.UserData?.Played) {
          records.push(
            EmbyMapper.toWatchRecord(
              user.Id,
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
            Ids: params.initialItemIds?.join(','),
            // IsLocked enables composite image generation from items, matching
            // the Jellyfin adapter; without it, Emby may skip the auto-cover.
            IsLocked: true,
          },
        },
      );
      let collection = EmbyMapper.toMediaCollection(data);
      if (!collection.id) {
        throw new Error('Collection created but no ID returned');
      }
      if (!collection.title) {
        const refreshed = await this.getCollection(collection.id, true);
        if (!refreshed) {
          throw new Error('Collection created but could not be fetched');
        }
        collection = refreshed;
      }
      if (params.summary || params.sortTitle) {
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
    const fromLibrary: MediaItem[] = [];

    for (const child of children) {
      if (await this.itemIsInLibrary(child.id, libraryId)) {
        fromLibrary.push(child);
      }
    }

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
      const path = this.embyUserId
        ? `/Users/${this.embyUserId}/Items/${params.collectionId}`
        : `/Items/${params.collectionId}`;
      const { data: current } = await this.http.get<EmbyBaseItemDto>(path);
      const updated: EmbyBaseItemDto = {
        ...current,
        Name: params.title ?? current.Name,
        Overview: params.summary ?? current.Overview,
        ForcedSortName: params.sortTitle ?? current.ForcedSortName,
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
    void collectionId;
    void orderedItemIds;
    // Emby exposes DisplayOrder = PremiereDate | SortName on a BoxSet (via
    // ItemUpdateService) but no item-move/reorder endpoint, so an explicit
    // ordered list of item IDs can't be expressed. Gated by
    // supportsFeature(COLLECTION_SORT) which is false for Emby — callers
    // shouldn't reach here.
    throw new Error(
      'Collection sort is not supported on Emby (no item-move API)',
    );
  }

  /**
   * Fetches a single image off an item as a Buffer. Returns null when the
   * item has no image of that type (Emby responds 404) or any other request
   * failure. Mirrors JellyfinAdapterService.getItemImageBuffer.
   */
  async getItemImageBuffer(
    itemId: string,
    imageType = 'Primary',
  ): Promise<Buffer | null> {
    if (!this.http) return null;
    try {
      const response = await this.http.get<ArrayBuffer>(
        `/Items/${itemId}/Images/${imageType}`,
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(response.data);
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return null;
      }
      this.logger.warn(
        `Failed to download ${imageType} image for item ${itemId}`,
      );
      this.logger.debug(error);
      return null;
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
      // The request shape matches Emby's documented (and source-confirmed)
      // contract: base64 body + the image MIME on Content-Type. A 500 here is
      // therefore raised inside Emby's own handler — most often when the POST
      // body is truncated upstream (reverse-proxy/server request-size limit, so
      // Convert.FromBase64String throws) or the image processor cannot save it.
      // Surface Emby's response body so the actual cause is visible instead of
      // a bare "500"; the GET download on the same path succeeding rules out
      // auth, the item id, and connectivity.
      if (error instanceof AxiosError && error.response?.data != null) {
        const body =
          typeof error.response.data === 'string'
            ? error.response.data
            : JSON.stringify(error.response.data);
        this.logger.debug(
          `Emby rejected image upload for item ${collectionId} (status ${error.response.status}): ${body.slice(0, 500)}`,
        );
      }
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
      const seasons = await this.getChildrenMetadata(context.id, 'season');
      const episodeIds: string[] = [];
      for (const season of seasons) {
        const eps = await this.getChildrenMetadata(season.id, 'episode');
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
    const probe = new EmbyApi({
      url,
      apiKey,
      authHeader: this.buildAuthHeader(),
      timeout: 15000,
    }).axios;
    try {
      const [info, users] = await Promise.all([
        probe.get<EmbySystemInfo>('/System/Info'),
        probe.get<EmbyUserDto[] | EmbyItemsQueryResponse<EmbyUserDto>>(
          '/Users/Query',
        ),
      ]);
      const resolvedUsers = this.normalizeUsersResponse(users.data);
      return {
        success: true,
        serverName: info.data.ServerName,
        version: info.data.Version,
        users: resolvedUsers
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
    const probe = new EmbyApi({
      url,
      authHeader: this.buildAuthHeader(),
      timeout: 15000,
      extraHeaders: { 'Content-Type': 'application/json' },
    }).axios;
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
      const authed = new EmbyApi({
        url,
        apiKey: data.AccessToken,
        authHeader: this.buildAuthHeader(),
        timeout: 15000,
      }).axios;
      const [info, libs, users] = await Promise.all([
        authed.get<EmbySystemInfo>('/System/Info'),
        authed.get<EmbyItemsQueryResponse>(`/Users/${data.User.Id}/Views`),
        authed.get<EmbyUserDto[] | EmbyItemsQueryResponse<EmbyUserDto>>(
          '/Users/Query',
        ),
      ]);
      const resolvedUsers = this.normalizeUsersResponse(users.data);
      return {
        success: true,
        token: data.AccessToken,
        userId: data.User.Id,
        serverName: info.data.ServerName,
        users: resolvedUsers.map((u) => ({
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

  async itemExists(itemId: string): Promise<boolean> {
    if (!this.http) {
      throw new Error('Emby not initialized');
    }

    try {
      const { data } = await this.http.get<EmbyBaseItemDto>(`/Items/${itemId}`);
      return Boolean(data?.Id);
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  // ============================================================================
  // Internal helpers
  // ============================================================================

  private async itemIsInLibrary(
    itemId: string,
    libraryId: string,
  ): Promise<boolean> {
    if (!this.http) return false;

    try {
      const { data } = await this.http.get<EmbyBaseItemDto[]>(
        `/Items/${itemId}/Ancestors`,
      );

      return (data ?? []).some((ancestor) => ancestor.Id === libraryId);
    } catch (error) {
      this.logger.debug(
        `Emby itemIsInLibrary(${itemId}, ${libraryId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return false;
    }
  }

  private async fetchUsersQuery(client: AxiosInstance): Promise<EmbyUserDto[]> {
    const { data } = await client.get<
      EmbyUserDto[] | EmbyItemsQueryResponse<EmbyUserDto>
    >('/Users/Query');

    return this.normalizeUsersResponse(data);
  }

  private normalizeUsersResponse(
    data: EmbyUserDto[] | EmbyItemsQueryResponse<EmbyUserDto>,
  ): EmbyUserDto[] {
    return Array.isArray(data) ? data : (data.Items ?? []);
  }

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
