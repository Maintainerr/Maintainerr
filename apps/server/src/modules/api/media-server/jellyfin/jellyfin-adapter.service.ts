import { Jellyfin, type Api } from '@jellyfin/sdk';
import {
  BaseItemKind,
  ImageFormat,
  ImageType,
  ItemFields,
  ItemSortBy,
  LocationType,
  SortOrder,
  type BaseItemDto,
  type UserItemDataDto,
} from '@jellyfin/sdk/lib/generated-client/models';
import {
  getCollectionApi,
  getConfigurationApi,
  getImageApi,
  getItemRefreshApi,
  getItemsApi,
  getItemUpdateApi,
  getLibraryApi,
  getPlaylistsApi,
  getSessionApi,
  getSystemApi,
  getTvShowsApi,
  getUserApi,
  getUserLibraryApi,
} from '@jellyfin/sdk/lib/utils/api/index.js';
import {
  MediaServerFeature,
  MediaServerType,
  stripTrailingSlashes,
  type CollectionVisibilitySettings,
  type CreateCollectionParams,
  type LibraryQueryOptions,
  type MediaCollection,
  type MediaItem,
  type MediaItemType,
  type MediaLibrary,
  type MediaLibrarySortField,
  type MediaPlaylist,
  type MediaServerStatus,
  type MediaUser,
  type PagedResult,
  type RecentlyAddedOptions,
  type UpdateCollectionParams,
  type WatchRecord,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
// isAxiosError duck-types on the error's own flag, so it also matches errors
// thrown by @jellyfin/sdk. The SDK is ESM-only and pulls axios's ESM build,
// while this server compiles to CommonJS and gets axios's CJS build - two
// module instances, two error classes, so an instanceof check against the
// imported class silently never matches an SDK failure.
import { isAxiosError } from 'axios';
import { formatConnectionFailureMessage } from '../../../../utils/connection-error';
import { delay } from '../../../../utils/delay';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { SettingsDataService } from '../../../settings/settings-data.service';
import { createPrefetchProgressReporter } from '../../../../utils/prefetch-progress';
import cacheManager, { type Cache } from '../../lib/cache';
import { applyHttpRetry } from '../../lib/httpRetry';
import {
  isBlankMediaServerId,
  isForeignServerId,
} from '../media-server-id.utils';
import { resolveContextActionIds } from '../context-action.util';
import { onlyRequestedItemKinds } from '../item-kinds.util';
import { supportsFeature } from '../media-server.constants';
import type {
  IMediaServerService,
  MediaWatchState,
} from '../media-server.interface';
import {
  JELLYFIN_BATCH_SIZE,
  JELLYFIN_CACHE_KEYS,
  JELLYFIN_CACHE_TTL,
  jellyfinWatchSnapshotCacheKey,
  JELLYFIN_WATCH_SNAPSHOT_MAX_RECORDS,
  JELLYFIN_CLIENT_INFO,
  JELLYFIN_DEVICE_INFO,
  JELLYFIN_LIBRARY_QUERY_DEFAULTS,
  JELLYFIN_LIBRARY_RETRY_DELAY_MS,
  JELLYFIN_RETRYABLE_LIBRARY_ERROR_CODES,
  JELLYFIN_RETRYABLE_LIBRARY_STATUS_CODES,
} from './jellyfin.constants';
import { readMetadataInBatches } from '../metadata-batch.util';
import { JellyfinMapper } from './jellyfin.mapper';
import type { JellyfinWatchSnapshot } from './jellyfin.types';

const toJellyfinSortBy = (sort?: MediaLibrarySortField): ItemSortBy => {
  switch (sort) {
    case 'airDate':
      return ItemSortBy.PremiereDate;
    case 'rating':
      return ItemSortBy.CommunityRating;
    case 'watchCount':
      return ItemSortBy.PlayCount;
    case 'studio':
      return ItemSortBy.Studio;
    case 'title':
    default:
      return ItemSortBy.SortName;
  }
};

// Overview/search library lists intentionally keep the Jellyfin payload lean.
// If cards ever start rendering richer metadata such as genres, actors,
// ratings, media sources, or tags directly in the list view, either add the
// required fields here or fetch that detail lazily per item via /meta/:id.
const JELLYFIN_LIBRARY_LIST_FIELDS = [
  ItemFields.ProviderIds,
  ItemFields.DateCreated,
  ItemFields.Overview,
] as const;

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
// The fields a metadata read needs, shared by the single-item and bulk reads so
// the two can never drift into answering differently shaped items.
const JELLYFIN_METADATA_FIELDS = [
  ItemFields.ProviderIds,
  ItemFields.Path,
  ItemFields.DateCreated,
  ItemFields.MediaSources,
  ItemFields.Genres,
  ItemFields.Tags,
  ItemFields.Overview,
  ItemFields.People,
  ItemFields.Studios,
];

@Injectable()
export class JellyfinAdapterService implements IMediaServerService {
  private api: Api | undefined;
  private initialized = false;
  private jellyfinUserId: string | undefined;
  private readonly cache: Cache;
  // Shared in-flight prefetch, so concurrent rule groups sweep once.
  private watchHistoryPrefetches = new Map<string, Promise<void>>();
  // Shared in-flight metadata reads, keyed by item id. See getMetadata.
  private readonly metadataRequests = new Map<
    string,
    Promise<MediaItem | undefined>
  >();

  constructor(
    private readonly settingsDataService: SettingsDataService,
    private readonly logger: MaintainerrLogger,
  ) {
    this.cache = cacheManager.getCache('jellyfin');
    this.logger.setContext(JellyfinAdapterService.name);
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

    // Rows saved before the schema stripped trailing slashes (#3422) can
    // still hold one, and Jellyfin 404s routes reached through a double slash.
    const api = jellyfin.createApi(stripTrailingSlashes(url), apiKey);

    // Retry transient failures with exponential backoff, like every other
    // outbound client (e.g. so a momentary blip doesn't surface as a null
    // active-sessions lookup that would defer deletions).
    applyHttpRetry(api.axiosInstance);

    return api;
  }

  /**
   * Verify connection to a Jellyfin server and return server info.
   */
  private async verifyConnection(api: Api): Promise<{
    success: boolean;
    serverName?: string;
    version?: string;
    error?: string;
    cause?: unknown;
    users?: Array<{ id: string; name: string }>;
  }> {
    try {
      // First get public system info to check if server is reachable
      const systemInfo = await getSystemApi(api).getPublicSystemInfo();

      // Then verify API key by calling an authenticated endpoint
      let users: Array<{ id: string; name: string }> = [];
      try {
        const usersResponse = await getUserApi(api).getUsers();
        users = (usersResponse.data || [])
          .filter((u) => u.Policy?.IsAdministrator)
          .map((u) => ({
            id: u.Id || '',
            name: u.Name || '',
          }));
      } catch (authError) {
        return {
          success: false,
          error: 'Invalid API key',
          cause: authError,
        };
      }

      return {
        success: true,
        serverName: systemInfo.data.ServerName || undefined,
        version: systemInfo.data.Version || undefined,
        users,
      };
    } catch (error) {
      return {
        success: false,
        error: formatConnectionFailureMessage(
          error,
          'Failed to connect to Jellyfin. Verify URL and API key.',
        ),
        cause: error,
      };
    }
  }

  async initialize(): Promise<void> {
    const settings = await this.settingsDataService.getSettings();

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
    this.jellyfinUserId = settings.jellyfin_user_id ?? undefined;
    this.logger.log(
      `Jellyfin connection established: ${result.serverName} (${result.version})`,
    );
  }

  uninitialize(): void {
    this.initialized = false;
    this.api = undefined;
    this.jellyfinUserId = undefined;
    // Clear the cache when uninitializing
    this.cache.flush();
    cacheManager.getCache('jellyfinwatchhistory').data.flushAll();
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
    users?: Array<{ id: string; name: string }>;
  }> {
    const api = this.createApiClient(url, apiKey, 'test');
    const result = await this.verifyConnection(api);

    if (result.success) {
      this.logger.debug(
        `Jellyfin connection test successful: ${result.serverName} (${result.version})`,
      );
    } else {
      this.logger.error('Jellyfin connection test failed');
      this.logger.debug(result.cause ?? result.error);
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
      const settings = await this.settingsDataService.getSettings();
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
      this.logger.error('Failed to get Jellyfin status');
      this.logger.debug(error);
      return undefined;
    }
  }

  async getUsers(throwOnError = false): Promise<MediaUser[]> {
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
      this.logger.error('Failed to get Jellyfin users');
      this.logger.debug(error);

      if (throwOnError) {
        throw error;
      }

      return [];
    }
  }

  private async getPlayedCompletionThreshold(
    throwOnError = false,
  ): Promise<number | undefined> {
    if (!this.api) return undefined;

    if (this.cache.data.has(JELLYFIN_CACHE_KEYS.PLAYED_THRESHOLD)) {
      return this.cache.data.get<number>(JELLYFIN_CACHE_KEYS.PLAYED_THRESHOLD);
    }

    try {
      const response = await getConfigurationApi(this.api).getConfiguration();
      const threshold = response.data.MaxResumePct;

      if (typeof threshold !== 'number' || Number.isNaN(threshold)) {
        return undefined;
      }

      const normalizedThreshold = Math.min(100, Math.max(0, threshold));

      this.cache.data.set(
        JELLYFIN_CACHE_KEYS.PLAYED_THRESHOLD,
        normalizedThreshold,
        JELLYFIN_CACHE_TTL.PLAYED_THRESHOLD,
      );

      return normalizedThreshold;
    } catch (error) {
      this.logger.warn('Failed to get Jellyfin MaxResumePct');
      this.logger.debug(error);

      if (throwOnError) {
        throw error;
      }

      return undefined;
    }
  }

  // ── Overlay helpers ───────────────────────────────────────────────────────
  //
  // These methods are consumed exclusively by JellyfinOverlayProvider in the
  // overlays module. They are public on the adapter (not on IMediaServerService)
  // so Jellyfin SDK types do not leak outside the jellyfin/ folder.

  /**
   * Pick a single random media item (movie or series, configurable) from the
   * given section ids. When no section ids are provided, picks across all
   * supported libraries. Uses Jellyfin's native `ItemSortBy.Random` so the
   * server does the randomisation - no client-side sampling needed.
   */
  async findRandomItem(
    sectionIds: string[] | undefined,
    kinds: BaseItemKind[],
  ): Promise<BaseItemDto | null> {
    if (!this.api) return null;

    try {
      const userId = await this.getUserId();
      // The overlay editor UI passes a single section key; for "all sections"
      // the caller omits the param. Anything else is unsupported - the
      // recursive getItems call spans the selected parent or the whole server.
      const parentId = sectionIds?.[0];
      const response = await getItemsApi(this.api).getItems({
        ...JELLYFIN_LIBRARY_QUERY_DEFAULTS,
        userId,
        parentId,
        includeItemTypes: kinds,
        recursive: true,
        sortBy: [ItemSortBy.Random],
        sortOrder: [SortOrder.Ascending],
        limit: 1,
        excludeLocationTypes: [LocationType.Virtual],
        imageTypeLimit: 1,
      });

      return response.data.Items?.[0] ?? null;
    } catch (error) {
      this.logger.warn('Failed to pick random Jellyfin item');
      this.logger.debug(error);
      return null;
    }
  }

  /**
   * Pick a single random episode from the given show library sections (or
   * across all of them). Skips unaired placeholders via Virtual location
   * exclusion so the preview never lands on a missing file.
   */
  async findRandomEpisode(
    sectionIds: string[] | undefined,
  ): Promise<BaseItemDto | null> {
    return this.findRandomItem(sectionIds, [BaseItemKind.Episode]);
  }

  /**
   * Download the raw bytes of a specific image for an item. The `imageType`
   * is the caller's choice - `Primary` for movie/show posters, `Thumb` for
   * episode title-card stills. Forces JPEG so callers can rely on a known
   * Content-Type (the overlay editor's /poster proxy hard-codes image/jpeg;
   * the render pipeline also emits JPEG). Returns null when the item has no
   * image of that type (Jellyfin responds 404) or any other request failure.
   */
  async getItemImageBuffer(
    itemId: string,
    imageType: ImageType,
  ): Promise<Buffer | null> {
    if (!this.api) return null;

    try {
      const response = await getImageApi(this.api).getItemImage(
        { itemId, imageType, format: ImageFormat.Jpg },
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(response.data as unknown as ArrayBuffer);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      this.logger.warn(
        `Failed to download ${imageType} image for item ${itemId}`,
      );
      this.logger.debug(error);
      return null;
    }
  }

  /**
   * Replace the given image type on an item. Sends the image as a
   * base64-encoded string body - the Jellyfin server (at least through the
   * versions this project targets) rejects raw binary payloads on this
   * endpoint with a 500, despite the OpenAPI description hinting at
   * `image/*` binary. Base64 is the empirically-verified working path; see
   * the discussion in jellyfin/jellyfin#12447. Throws on failure so the
   * processor counts it as a per-item error.
   */
  async setItemImage(
    itemId: string,
    imageType: ImageType,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    if (!this.api) {
      throw new Error('Jellyfin API not initialized');
    }

    const base64Body = buffer.toString('base64');

    await getImageApi(this.api).setItemImage(
      {
        itemId,
        imageType,
        body: base64Body as unknown as File,
      },
      {
        headers: { 'Content-Type': contentType },
      },
    );
  }

  async setCollectionImage(
    collectionId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    // BoxSets are Items in Jellyfin, so the same Primary-image endpoint
    // applies. Reuses the base64 quirk handled by setItemImage.
    await this.setItemImage(
      collectionId,
      ImageType.Primary,
      buffer,
      contentType,
    );
  }

  private isCompletedWatch(
    userData:
      | {
          Played?: boolean | null;
          PlayedPercentage?: number | null;
        }
      | undefined,
    playedCompletionThreshold?: number,
  ): boolean {
    if (!userData) return false;

    if (
      playedCompletionThreshold !== undefined &&
      typeof userData.PlayedPercentage === 'number'
    ) {
      return (
        userData.Played === true ||
        userData.PlayedPercentage >= playedCompletionThreshold
      );
    }

    return userData.Played === true;
  }

  async getUser(id: string): Promise<MediaUser | undefined> {
    if (!this.api) return undefined;

    try {
      const response = await getUserApi(this.api).getUserById({ userId: id });
      return response.data
        ? JellyfinMapper.toMediaUser(response.data)
        : undefined;
    } catch (error) {
      this.logger.warn(`Failed to get Jellyfin user ${id}`);
      this.logger.debug(error);
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

      const response = await this.retryLibraryRequestOnce(
        'get Jellyfin libraries',
        async () => await getLibraryApi(this.api!).getMediaFolders(),
      );
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
      this.logger.error('Failed to get Jellyfin libraries');
      this.logger.debug(error);
      return [];
    }
  }

  /**
   * Uses Jellyfin's system storage endpoint (GET /System/Info/Storage,
   * added in Jellyfin 10.11.0, admin-only).
   * Returns an empty map when the endpoint is missing (older server) or the
   * configured user is not an administrator. The reported UsedSpace is
   * device-level usage, so accurate per-library sizes still require
   * iterating items (computeLibraryStorageSizes).
   */
  async getLibrariesStorage(): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (!this.api) return result;

    try {
      const response = await getSystemApi(this.api).getSystemStorage();
      for (const library of response.data.Libraries ?? []) {
        if (!library.Id) continue;
        const usedByDevice = new Map<string, number>();

        for (const folder of library.Folders ?? []) {
          const deviceKey = folder.DeviceId ?? folder.Path;
          if (!deviceKey || usedByDevice.has(deviceKey)) {
            continue;
          }

          usedByDevice.set(deviceKey, folder.UsedSpace ?? 0);
        }

        const usedAcrossFolders = Array.from(usedByDevice.values()).reduce(
          (sum, usedSpace) => sum + usedSpace,
          0,
        );

        if (usedAcrossFolders > 0) {
          result.set(library.Id, usedAcrossFolders);
        }
      }
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 404) {
        this.logger.debug(
          'Jellyfin /System/Info/Storage not available - server is older than 10.11',
        );
      } else if (status === 401 || status === 403) {
        this.logger.debug(
          'Jellyfin /System/Info/Storage denied - the configured user is not an administrator',
        );
      } else {
        this.logger.debug(error);
      }
    }
    return result;
  }

  async computeLibraryStorageSizes(): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (!this.api) return result;

    const userId = await this.getUserId();
    if (!userId) return result;

    const libraries = await this.getLibraries();
    for (const library of libraries) {
      result.set(library.id, await this.sumLibraryItemSizes(userId, library));
    }
    return result;
  }

  private async sumLibraryItemSizes(
    userId: string,
    library: MediaLibrary,
  ): Promise<number> {
    const includeItemTypes =
      library.type === 'show' ? [BaseItemKind.Episode] : [BaseItemKind.Movie];

    let total = 0;
    let startIndex = 0;
    const pageSize = JELLYFIN_BATCH_SIZE.DEFAULT_PAGE_SIZE;

    while (true) {
      let page: Awaited<ReturnType<ReturnType<typeof getItemsApi>['getItems']>>;
      try {
        page = await getItemsApi(this.api!).getItems({
          ...JELLYFIN_LIBRARY_QUERY_DEFAULTS,
          userId,
          parentId: library.id,
          recursive: true,
          includeItemTypes,
          fields: [ItemFields.MediaSources],
          startIndex,
          limit: pageSize,
        });
      } catch (error) {
        this.logLibraryError(library.id, 'compute library size', error);
        return total;
      }

      const items = page.data.Items ?? [];
      for (const item of items) {
        for (const source of item.MediaSources ?? []) {
          total += source.Size ?? 0;
        }
      }

      const totalRecordCount = page.data.TotalRecordCount ?? items.length;
      startIndex += items.length;
      if (items.length < pageSize || startIndex >= totalRecordCount) break;
    }

    return total;
  }

  /**
   * True/false when the server answered, undefined when the lookup failed.
   * A failed check must not read as "not in this library" (1bf6c8e9 pins that
   * a partial failure still removes what it can and keeps the collection), but
   * the caller has to know cleanup was incomplete rather than report success.
   */
  private async itemIsInLibrary(
    itemId: string,
    libraryId: string,
  ): Promise<boolean | undefined> {
    try {
      const userId = await this.getUserId();
      const ancestors = (
        await getLibraryApi(this.api!).getAncestors({ itemId, userId })
      ).data;

      return ancestors.some((ancestor) => ancestor.Id === libraryId);
    } catch (error) {
      this.logger.debug(
        `Failed to check library membership for item ${itemId}`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  async getLibraryContents(
    libraryId: string,
    options?: LibraryQueryOptions,
  ): Promise<PagedResult<MediaItem>> {
    if (!this.api) {
      throw new Error('Jellyfin not initialized');
    }

    try {
      const userId = await this.getUserId();
      const includeItemTypes = JellyfinMapper.toBaseItemKinds(
        options?.type ? [options.type] : undefined,
      );
      const response = await this.retryLibraryRequestOnce(
        `get Jellyfin library contents for ${libraryId}`,
        async () =>
          await getItemsApi(this.api!).getItems({
            ...JELLYFIN_LIBRARY_QUERY_DEFAULTS,
            userId,
            parentId: libraryId,
            recursive: true,
            startIndex: options?.offset || 0,
            limit: options?.limit || JELLYFIN_BATCH_SIZE.DEFAULT_PAGE_SIZE,
            // Keep library listings lean. Full metadata is fetched lazily via /meta/:id.
            fields: [...JELLYFIN_LIBRARY_LIST_FIELDS],
            includeItemTypes,
            enableUserData: true,
            sortBy: [toJellyfinSortBy(options?.sort)],
            sortOrder: [
              options?.sortOrder === 'desc'
                ? SortOrder.Descending
                : SortOrder.Ascending,
            ],
          }),
      );

      const items = onlyRequestedItemKinds(
        response.data.Items,
        includeItemTypes,
      ).map(JellyfinMapper.toMediaItem);

      return {
        items,
        totalSize: response.data.TotalRecordCount || items.length,
        offset: options?.offset || 0,
        limit: options?.limit || JELLYFIN_BATCH_SIZE.DEFAULT_PAGE_SIZE,
      };
    } catch (error) {
      this.logLibraryError(libraryId, 'get library contents', error);
      // A fabricated empty page reads as end-of-library downstream, which
      // truncates rule evaluation and mass-removes the unevaluated tail from
      // collections (#3307). Fail closed like getCollectionChildren.
      throw error;
    }
  }

  async getLibraryContentCount(
    libraryId: string,
    type?: MediaItemType,
  ): Promise<number> {
    if (!this.api) return 0;

    try {
      const userId = await this.getUserId();
      const response = await getItemsApi(this.api).getItems({
        ...JELLYFIN_LIBRARY_QUERY_DEFAULTS,
        userId,
        parentId: libraryId,
        recursive: true,
        limit: 0,
        includeItemTypes: JellyfinMapper.toBaseItemKinds(
          type ? [type] : undefined,
        ),
      });

      return response.data.TotalRecordCount || 0;
    } catch (error) {
      this.logLibraryError(libraryId, 'get library count', error);
      // Same contract as getLibraryContents: a fabricated count masks a
      // failed read from callers that gate work on it.
      throw error;
    }
  }

  async searchLibraryContents(
    libraryId: string,
    query: string,
    type?: MediaItemType,
  ): Promise<MediaItem[]> {
    if (!this.api) return [];

    try {
      const userId = await this.getUserId();
      const includeItemTypes = JellyfinMapper.toBaseItemKinds(
        type ? [type] : undefined,
      );
      const response = await getItemsApi(this.api).getItems({
        ...JELLYFIN_LIBRARY_QUERY_DEFAULTS,
        userId,
        parentId: libraryId,
        recursive: true,
        searchTerm: query,
        fields: [
          ItemFields.ProviderIds,
          ItemFields.Path,
          ItemFields.DateCreated,
          ItemFields.MediaSources,
        ],
        includeItemTypes,
        enableUserData: true,
      });

      return onlyRequestedItemKinds(response.data.Items, includeItemTypes).map(
        JellyfinMapper.toMediaItem,
      );
    } catch (error) {
      this.logLibraryError(libraryId, 'search library', error);
      return [];
    }
  }

  /**
   * Every rule condition re-reads the evaluated item (and its parents) through
   * here, so an uncached read costs one wide request per condition per item
   * (#3355). Cached like the Plex path, which has always served these from its
   * API-layer cache - the whole-cache flush at the start of each rule group
   * bounds staleness to a single group run.
   *
   * The cache cannot collapse the first read of an id, though: sibling items
   * are evaluated concurrently (RULE_EVALUATION_CONCURRENCY) and each resolves
   * the same parent and grandparent, so they all miss together and all fetch.
   * Concurrent callers therefore share one in-flight request, whose entry is
   * dropped the moment it settles - every later read goes through the cache
   * above. No caller mutates what it gets back, so sharing is safe.
   *
   * A MediaItem carries UserData-derived fields (viewCount, lastViewedAt,
   * userRating), so anything that feeds a watch or deletion decision must read
   * the library page's own item rather than this - see how PlexGetterService
   * passes `libItem.viewCount` into getWatchState (#2570), not `metadata`.
   */
  async getMetadata(itemId: string): Promise<MediaItem | undefined> {
    if (!this.api) return undefined;

    const cacheKey = `${JELLYFIN_CACHE_KEYS.METADATA}:${itemId}`;
    // Read once rather than has()-then-get(): an entry expiring between the two
    // would return undefined, which callers read as "item is gone".
    const cached = this.cache.data.get<MediaItem>(cacheKey);
    if (cached !== undefined) return cached;

    const inFlight = this.metadataRequests.get(itemId);
    if (inFlight !== undefined) return inFlight;

    const pending = this.fetchMetadata(itemId, cacheKey).finally(() => {
      this.metadataRequests.delete(itemId);
    });
    this.metadataRequests.set(itemId, pending);

    return pending;
  }

  private async fetchMetadata(
    itemId: string,
    cacheKey: string,
  ): Promise<MediaItem | undefined> {
    try {
      const userId = await this.getUserId();
      const response = await getItemsApi(this.api).getItems({
        userId,
        ids: [itemId],
        fields: JELLYFIN_METADATA_FIELDS,
        enableUserData: true,
      });

      // Jellyfin silently drops an unparseable ids filter and answers with an
      // unfiltered listing, so only an exact id match may count as a result -
      // taking the first row would resolve garbage input to a random item.
      const item = response.data.Items?.find((el) => el.Id === itemId);
      if (!item) return undefined;

      // Only a resolved item is cached. This method answers undefined for both
      // a missing item and a failed read, so persisting that would turn a
      // transient blip into "item is gone" for the whole TTL (#3307).
      const mediaItem = JellyfinMapper.toMediaItem(item);
      this.cache.data.set(cacheKey, mediaItem, JELLYFIN_CACHE_TTL.METADATA);
      return mediaItem;
    } catch (error) {
      this.logger.warn(`Failed to get metadata for ${itemId}`);
      this.logger.debug(error);
      return undefined;
    }
  }

  async getMetadataBatch(itemIds: string[]): Promise<MediaItem[]> {
    if (!this.api) return [];

    return readMetadataInBatches({
      itemIds,
      // The SDK sends one `ids=` parameter per id.
      perIdCost: 'ids='.length + 1,
      cache: {
        get: (itemId) =>
          this.cache.data.get<MediaItem>(
            `${JELLYFIN_CACHE_KEYS.METADATA}:${itemId}`,
          ),
        set: (item) =>
          this.cache.data.set(
            `${JELLYFIN_CACHE_KEYS.METADATA}:${item.id}`,
            item,
            JELLYFIN_CACHE_TTL.METADATA,
          ),
      },
      readBatch: async (idBatch) => {
        const userId = await this.getUserId();
        const response = await getItemsApi(this.api).getItems({
          userId,
          ids: idBatch,
          fields: JELLYFIN_METADATA_FIELDS,
          enableUserData: true,
        });

        return (response.data.Items ?? []).map(JellyfinMapper.toMediaItem);
      },
      onBatchError: (idBatch, error) => {
        this.logger.warn(
          `Failed to get metadata for ${idBatch.length} Jellyfin item(s)`,
        );
        this.logger.debug(error);
      },
    });
  }

  /**
   * Confirm a Jellyfin item is still present. Distinguishes "definitely
   * gone" (200 with empty Items, or 404) from "could not check" - the
   * latter throws so revert callers don't drop their state on a blip.
   * An uninitialised adapter is treated as inconclusive (throws) for the
   * same reason: callers must never delete the only restore-from-overlay
   * backup just because the media server is temporarily unconfigured.
   */
  async itemExists(itemId: string): Promise<boolean> {
    if (!this.api) {
      throw new Error('Jellyfin API not initialized');
    }

    const userId = await this.getUserId();
    try {
      const response = await getItemsApi(this.api).getItems({
        userId,
        ids: [itemId],
        enableUserData: false,
        limit: 1,
      });
      return Boolean(response.data.Items?.some((el) => el.Id === itemId));
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Cached for the same reason as getMetadata (#3355): the show and season
   * getters walk the tree on every condition, so an uncached read costs
   * 1 + seasons requests per condition per item. Plex has always served these
   * from its API-layer cache. Only a completed read is stored - the catch below
   * answers [] for a failed one, and caching that would read as "no episodes".
   */
  async getChildrenMetadata(
    parentId: string,
    childType?: MediaItemType,
    throwOnError = false,
  ): Promise<MediaItem[]> {
    if (!this.api) {
      if (throwOnError) {
        throw new Error('Jellyfin API not initialized');
      }
      return [];
    }

    const cacheKey = `${JELLYFIN_CACHE_KEYS.CHILDREN}:${parentId}:${childType ?? 'any'}`;
    const cached = this.cache.data.get<MediaItem[]>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const userId = await this.getUserId();

      // For seasons, use the dedicated TvShows API which properly handles
      // the Jellyfin data model where seasons have SeriesId pointing to the show,
      // not ParentId (which points to the library folder).
      if (childType === 'season') {
        const response = await getTvShowsApi(this.api).getSeasons({
          seriesId: parentId,
          userId,
          fields: [
            ItemFields.ProviderIds,
            ItemFields.Path,
            ItemFields.DateCreated,
            ItemFields.MediaSources,
          ],
          enableUserData: true,
        });
        if (!Array.isArray(response.data.Items)) {
          throw new Error('Jellyfin returned no child item list');
        }
        if (
          typeof response.data.TotalRecordCount === 'number' &&
          response.data.Items.length !== response.data.TotalRecordCount
        ) {
          throw new Error('Jellyfin returned an incomplete child item list');
        }

        return this.cacheChildren(
          cacheKey,
          response.data.Items.map(JellyfinMapper.toMediaItem),
        );
      }

      // For episodes and other types, parentId works correctly
      const response = await getItemsApi(this.api).getItems({
        userId,
        parentId,
        fields: [
          ItemFields.ProviderIds,
          ItemFields.Path,
          ItemFields.DateCreated,
          ItemFields.MediaSources,
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
        excludeLocationTypes:
          childType === 'episode' ? [LocationType.Virtual] : undefined,
      });
      if (!Array.isArray(response.data.Items)) {
        throw new Error('Jellyfin returned no child item list');
      }
      if (
        typeof response.data.TotalRecordCount === 'number' &&
        response.data.Items.length !== response.data.TotalRecordCount
      ) {
        throw new Error('Jellyfin returned an incomplete child item list');
      }

      return this.cacheChildren(
        cacheKey,
        response.data.Items.map(JellyfinMapper.toMediaItem),
      );
    } catch (error) {
      if (throwOnError) {
        // Worded like the Plex adapter's: the raw client error reaches the user
        // as "Request failed with status code 404", which names nothing.
        throw new Error(
          `Could not read the children of Jellyfin item ${parentId}`,
          { cause: error },
        );
      }

      this.logger.error(`Failed to get children for ${parentId}`);
      this.logger.debug(error);
      return [];
    }
  }

  private cacheChildren(cacheKey: string, children: MediaItem[]): MediaItem[] {
    this.cache.data.set(cacheKey, children, JELLYFIN_CACHE_TTL.METADATA);
    return children;
  }

  async getRecentlyAdded(
    libraryId: string,
    options?: RecentlyAddedOptions,
  ): Promise<MediaItem[]> {
    if (!this.api) return [];

    try {
      const userId = await this.getUserId();
      const includeItemTypes = JellyfinMapper.toBaseItemKinds(
        options?.type ? [options.type] : undefined,
      );
      const response = await getItemsApi(this.api).getItems({
        ...JELLYFIN_LIBRARY_QUERY_DEFAULTS,
        userId,
        parentId: libraryId,
        recursive: true,
        sortBy: [ItemSortBy.DateCreated],
        sortOrder: [SortOrder.Descending],
        limit: options?.limit || 50,
        includeItemTypes,
        fields: [
          ItemFields.ProviderIds,
          ItemFields.Path,
          ItemFields.DateCreated,
        ],
        enableUserData: true,
      });

      return onlyRequestedItemKinds(response.data.Items, includeItemTypes).map(
        JellyfinMapper.toMediaItem,
      );
    } catch (error) {
      this.logLibraryError(libraryId, 'get recently added', error);
      return [];
    }
  }

  async searchContent(query: string): Promise<MediaItem[]> {
    if (!this.api) return [];

    try {
      const userId = await this.getUserId();
      const includeItemTypes = [
        BaseItemKind.Movie,
        BaseItemKind.Series,
        BaseItemKind.Episode,
      ];
      const response = await getItemsApi(this.api).getItems({
        ...JELLYFIN_LIBRARY_QUERY_DEFAULTS,
        userId,
        recursive: true,
        searchTerm: query,
        fields: [
          ItemFields.ProviderIds,
          ItemFields.Path,
          ItemFields.DateCreated,
          ItemFields.MediaSources,
          ItemFields.Studios,
        ],
        includeItemTypes,
        limit: 50,
        enableUserData: true,
      });

      return onlyRequestedItemKinds(response.data.Items, includeItemTypes).map(
        JellyfinMapper.toMediaItem,
      );
    } catch (error) {
      this.logger.error('Failed to search Jellyfin content');
      this.logger.debug(error);
      return [];
    }
  }

  async prefetchWatchHistory({
    libraryId,
    abortSignal,
  }: {
    libraryId: string;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    if (!this.api) return;

    if (
      cacheManager
        .getCache('jellyfinwatchhistory')
        .data.has(jellyfinWatchSnapshotCacheKey(libraryId))
    ) {
      return;
    }

    // Deduplicate concurrent callers onto one in-flight sweep per library.
    const existing = this.watchHistoryPrefetches.get(libraryId);
    if (existing !== undefined) {
      return existing;
    }

    const inFlight = this.buildWatchSnapshot(libraryId, abortSignal).finally(
      () => {
        this.watchHistoryPrefetches.delete(libraryId);
      },
    );
    this.watchHistoryPrefetches.set(libraryId, inFlight);
    return inFlight;
  }

  /**
   * Capture every user's watch state for the whole server in one paginated
   * sweep per user, so rule evaluation reads it from memory instead of asking
   * per item (#3337). Jellyfin has no central history endpoint, but /Items
   * answers "all items with this user's UserData" in bulk, and that is the
   * same payload the per-item path reads.
   *
   * Series and seasons are swept alongside movies and episodes: their
   * favourite state is independent of their episodes' - a favourited season
   * says nothing about the episodes under it - so it can only come from the
   * container's own UserData (#3356). Jellyfin answers a container id from
   * that same UserData live, so a swept container is identical to a live read.
   * Plex's map stays leaf-only for the opposite reason: there a container id
   * means a server-side rollup its bulk rows cannot reproduce.
   *
   * Episode rows carry SeriesId and SeasonId, so the show/season -> episode
   * index comes free from the same response. Plex could not do this - its
   * history rows key on an undocumented grandparentKey - which is why the
   * descendant lookup here needs no extra request.
   *
   * Best-effort by contract: on any failure the snapshot is simply not cached
   * and every caller falls back to a live read, so a failed prefetch can never
   * be mistaken for "nobody watched anything".
   */
  private async buildWatchSnapshot(
    libraryId: string,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    try {
      abortSignal?.throwIfAborted();
      this.logger.log(
        'Prefetching watch state (history, play counts, favourites) for all users...',
      );

      const playedCompletionThreshold =
        await this.getPlayedCompletionThreshold(true);
      const users = await this.getUsers(true);
      if (users.length === 0) {
        this.logger.warn(
          'Watch state prefetch found no Jellyfin users - falling back to per-item reads.',
        );
        return;
      }

      const watchHistory = new Map<string, WatchRecord[]>();
      const descendants = new Map<string, string[]>();
      const favoritedBy = new Map<string, string[]>();
      const playCount = new Map<string, number>();
      const lastPlayedAt = new Map<string, number>();
      let records = 0;
      // Checked while accumulating, not at the end: the point of the ceiling
      // is to stop before the snapshot grows large enough to matter. Users run
      // in batches, so overshoot is bounded to the batch that trips it.
      let exceededCeiling = false;

      let sweptUsers = 0;
      const reportProgress = createPrefetchProgressReporter(
        (message) => this.logger.log(message),
        'Prefetching watch state',
        'users',
      );

      const entries = await this.mapUsersBatched(async (user) => {
        if (exceededCeiling) {
          throw new Error('watch snapshot ceiling exceeded');
        }

        // Pages are folded in as they arrive rather than collected first, so
        // the transient cost is one page, not one copy of the library.
        const seenThisUser = new Set<string>();
        const total = await this.sweepUserItems(
          user.id,
          libraryId,
          abortSignal,
          (items) => {
            for (const item of items) {
              if (!item.Id) continue;
              // Paging is not transactional, so a library changing under the sweep
              // can repeat a row on the next page; counting it twice would inflate
              // playCount and duplicate watch records.
              if (seenThisUser.has(item.Id)) continue;
              seenThisUser.add(item.Id);

              let itemRecords = watchHistory.get(item.Id);
              if (!itemRecords) {
                itemRecords = [];
                watchHistory.set(item.Id, itemRecords);
                // Index each episode under its season and series exactly once.
                // Seasons also carry SeriesId, so this is gated on the type -
                // indexing one would list seasons as episodes of their series.
                if (item.Type === BaseItemKind.Episode) {
                  for (const parentId of [item.SeriesId, item.SeasonId]) {
                    if (!parentId) continue;
                    const siblings = descendants.get(parentId);
                    if (siblings) siblings.push(item.Id);
                    else descendants.set(parentId, [item.Id]);
                  }
                }
              }

              const userData = item.UserData ?? undefined;

              // Favourites and play counts are raw UserData, already in this
              // response - they cost nothing extra and are not gated on the
              // watch threshold (favouriting or starting something is not
              // finishing it).
              if (userData?.IsFavorite) {
                const fans = favoritedBy.get(item.Id);
                if (fans) fans.push(user.id);
                else favoritedBy.set(item.Id, [user.id]);
              }
              if (userData?.PlayCount) {
                playCount.set(
                  item.Id,
                  (playCount.get(item.Id) ?? 0) + userData.PlayCount,
                );
              }
              if (userData?.LastPlayedDate) {
                const playedMs = new Date(userData.LastPlayedDate).getTime();
                const newest = lastPlayedAt.get(item.Id);
                if (
                  !Number.isNaN(playedMs) &&
                  (newest === undefined || playedMs > newest)
                ) {
                  lastPlayedAt.set(item.Id, playedMs);
                }
              }

              if (!this.isCompletedWatch(userData, playedCompletionThreshold)) {
                continue;
              }

              itemRecords.push(
                JellyfinMapper.toWatchRecord(
                  user.id,
                  item.Id,
                  userData?.LastPlayedDate
                    ? new Date(userData.LastPlayedDate)
                    : undefined,
                  userData?.PlayedPercentage ?? undefined,
                ),
              );
              records += 1;
              if (records > JELLYFIN_WATCH_SNAPSHOT_MAX_RECORDS) {
                exceededCeiling = true;
                throw new Error('watch snapshot ceiling exceeded');
              }
            }
          },
        );
        if (seenThisUser.size !== total) {
          throw new Error(
            `Jellyfin returned ${seenThisUser.size} unique items of ${total} for user ${user.id}`,
          );
        }

        sweptUsers += 1;
        reportProgress(sweptUsers, users.length);
        return user.id;
      }, true);

      if (exceededCeiling) {
        this.logger.warn(
          `Watch state prefetch passed ${JELLYFIN_WATCH_SNAPSHOT_MAX_RECORDS} watch records - falling back to per-item reads.`,
        );
        return;
      }

      // A user whose sweep failed would read as having watched nothing across
      // the whole library, so an incomplete snapshot is discarded outright.
      if (entries.length !== users.length) {
        this.logger.warn(
          `Watch state prefetch covered ${entries.length} of ${users.length} users - falling back to per-item reads.`,
        );
        return;
      }

      cacheManager
        .getCache('jellyfinwatchhistory')
        .data.set(jellyfinWatchSnapshotCacheKey(libraryId), {
          watchHistory,
          descendants,
          favoritedBy,
          playCount,
          lastPlayedAt,
          playedCompletionThreshold,
        } satisfies JellyfinWatchSnapshot);

      this.logger.log(
        `Watch state prefetch complete: ${watchHistory.size} items across ${users.length} users - ${records} watch records.`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      this.logger.warn(
        'Watch state prefetch failed - falling back to per-item reads.',
      );
      this.logger.debug(error);
    }
  }

  /**
   * Hands each page of one user's movies, episodes, series and seasons to
   * `onPage` as it arrives. Throws on a short or uncountable page so a
   * truncated sweep is never mistaken for a small library.
   */
  private async sweepUserItems(
    userId: string,
    libraryId: string,
    abortSignal: AbortSignal | undefined,
    onPage: (items: BaseItemDto[]) => void,
  ): Promise<number> {
    const pageSize = JELLYFIN_BATCH_SIZE.MAX_PAGE_SIZE;
    let fetched = 0;
    let total = 0;

    do {
      abortSignal?.throwIfAborted();
      const response = await getItemsApi(this.api!).getItems({
        // Include BoxSet members: libraries with "Group films into
        // collections" hide them by default, which would leave those items
        // out of the snapshot entirely (#2554).
        ...JELLYFIN_LIBRARY_QUERY_DEFAULTS,
        userId,
        // Scoped to the library being evaluated. Unscoped, the (item x user)
        // matrix is the whole server's and trips
        // JELLYFIN_WATCH_SNAPSHOT_MAX_RECORDS on large installs, which
        // abandons the snapshot outright and puts every read back per item.
        parentId: libraryId,
        recursive: true,
        // Series and Season carry their own UserData (IsFavorite, Played), so
        // sweeping them costs a couple of extra pages per user and spares
        // container properties a per-user fan-out each (#3356).
        includeItemTypes: [
          BaseItemKind.Movie,
          BaseItemKind.Episode,
          BaseItemKind.Series,
          BaseItemKind.Season,
        ],
        // Ignore unaired placeholders (mirrors #2624).
        excludeLocationTypes: [LocationType.Virtual],
        enableUserData: true,
        // Minimize payload - we only need UserData and the parent ids.
        fields: [],
        // Jellyfin exposes no unique sort key; SortName is at least a stable
        // order for a library that is not changing under the sweep.
        sortBy: [ItemSortBy.SortName],
        sortOrder: [SortOrder.Ascending],
        startIndex: fetched,
        limit: pageSize,
      });

      const items = response.data.Items;
      if (!Array.isArray(items)) {
        throw new Error(`Jellyfin returned no item list for user ${userId}`);
      }
      if (typeof response.data.TotalRecordCount !== 'number') {
        throw new Error(`Jellyfin reported no item count for user ${userId}`);
      }

      total = response.data.TotalRecordCount;
      fetched += items.length;
      onPage(items);

      // Jellyfin fills every page but the last, so anything shorter before the
      // total is reached is a truncated read, not a small library.
      if (fetched < total && items.length < pageSize) {
        throw new Error(
          `Jellyfin returned ${fetched} of ${total} items for user ${userId}`,
        );
      }
    } while (fetched < total);

    return total;
  }

  /**
   * The prefetched snapshot, or undefined when there is none to use. One built
   * under a different PlayedPercentage threshold is ignored: that threshold is
   * what decided which plays count as watched.
   */
  /**
   * The snapshot for `libraryId`, or undefined when there is none to use.
   * Without a library there is nothing to look up, so every read goes live -
   * the same outcome as a miss, since a miss here is never an answer.
   */
  private getWatchSnapshot(
    libraryId: string | undefined,
    playedCompletionThreshold: number | undefined,
  ): JellyfinWatchSnapshot | undefined {
    if (!libraryId) return undefined;

    const snapshot = cacheManager
      .getCache('jellyfinwatchhistory')
      .data.get<JellyfinWatchSnapshot>(
        jellyfinWatchSnapshotCacheKey(libraryId),
      );

    return snapshot?.playedCompletionThreshold === playedCompletionThreshold
      ? snapshot
      : undefined;
  }

  async getWatchHistory(
    itemId: string,
    useSnapshot = true,
    libraryId?: string,
  ): Promise<WatchRecord[]> {
    if (!this.api) return [];

    // Errors must propagate so callers can distinguish a real outage from a
    // confirmed empty history. Returning [] here would misclassify failures as
    // "never watched", which leaks into NOT_EXISTS checks and missing-value
    // diagnostics in the rules layer.
    const playedCompletionThreshold =
      await this.getPlayedCompletionThreshold(true);

    if (useSnapshot) {
      // Only a present key is authoritative - an absent one means the item was
      // not swept (an item added since), so fall through to a live read rather
      // than answering "never watched".
      const records = this.getWatchSnapshot(
        libraryId,
        playedCompletionThreshold,
      )?.watchHistory.get(itemId);
      // The snapshot cache stores by reference, so hand callers a copy.
      if (records) return [...records];
    }

    const cacheKey = `${JELLYFIN_CACHE_KEYS.WATCH_HISTORY}:${playedCompletionThreshold ?? 'played'}:${itemId}`;
    if (this.cache.data.has(cacheKey)) {
      return this.cache.data.get<WatchRecord[]>(cacheKey) || [];
    }

    const records: WatchRecord[] = [];

    // Jellyfin watch state is user-scoped, so we aggregate item user data
    // across all users and build a normalized watch history from that.
    const userDataEntries = await this.getAllUserItemData(itemId, true);
    userDataEntries.forEach(({ user, userData }) => {
      if (!this.isCompletedWatch(userData, playedCompletionThreshold)) {
        return;
      }

      records.push(
        JellyfinMapper.toWatchRecord(
          user.id,
          itemId,
          userData?.LastPlayedDate
            ? new Date(userData.LastPlayedDate)
            : undefined,
          userData?.PlayedPercentage ?? undefined,
        ),
      );
    });

    this.cache.data.set(cacheKey, records, JELLYFIN_CACHE_TTL.WATCH_HISTORY);
    return records;
  }

  /**
   * Return the newest playback timestamp across all users, including
   * unfinished playback. This is intentionally separate from getWatchHistory,
   * whose completed-watch semantics feed lastViewedAt, seenBy and viewCount.
   *
   * The live path is all-or-nothing (#2744): a dropped user lowers the newest
   * date, which reads as "played longer ago" and can delete something that was
   * just started.
   */
  async getLastPlayedAt(
    itemId: string,
    libraryId?: string,
  ): Promise<Date | null> {
    if (!this.api) {
      throw new Error('Jellyfin not initialized');
    }

    const snapshot = this.getWatchSnapshot(
      libraryId,
      await this.getPlayedCompletionThreshold(),
    );
    if (snapshot?.watchHistory.has(itemId)) {
      const sweptMs = snapshot.lastPlayedAt.get(itemId);
      return sweptMs === undefined ? null : new Date(sweptMs);
    }

    const users = await this.getUsers(true);
    const entries = await this.mapUsersBatched(async (user) => {
      // The per-item route 404s for users the item is invisible to, which is
      // no data for that user rather than a failed read; the list form answers
      // 200 with an empty list. Mirrors getItemUserData.
      const response = await getItemsApi(this.api!).getItems({
        userId: user.id,
        ids: [itemId],
        enableUserData: true,
      });

      // A missing list is a broken read (proxy error page, auth interstitial),
      // not "this user never played it".
      const items = response.data.Items;
      if (!Array.isArray(items)) {
        throw new Error(`Jellyfin returned no item list for ${itemId}`);
      }

      // Jellyfin drops an ids filter it cannot parse and answers with the
      // whole library, so the row is matched by id rather than taken first.
      return items.find((el) => el.Id === itemId)?.UserData?.LastPlayedDate;
    }, true);

    // mapUsersBatched drops users whose request failed, which here would lower
    // the newest date and read as "played longer ago".
    if (entries.length !== users.length) {
      throw new Error(
        `Jellyfin last-played read for ${itemId} covered ${entries.length} of ${users.length} users`,
      );
    }

    let latestMs: number | undefined;
    for (const lastPlayedDate of entries) {
      if (!lastPlayedDate) continue;

      const playedMs = new Date(lastPlayedDate).getTime();
      if (
        !Number.isNaN(playedMs) &&
        (latestMs === undefined || playedMs > latestMs)
      ) {
        latestMs = playedMs;
      }
    }

    return latestMs === undefined ? null : new Date(latestMs);
  }

  async getWatchState(itemId: string): Promise<MediaWatchState> {
    // Deliberately bypasses the prefetched snapshot: this is the is-watched /
    // viewCount read that feeds deletions, so it asks Jellyfin live and
    // something just watched can never be deleted off a stale snapshot. Mirrors
    // PlexAdapterService.getWatchState passing useCache: false.
    const history = await this.getWatchHistory(itemId, false);

    return {
      viewCount: history.length,
      isWatched: history.length > 0,
    };
  }

  async getItemSeenBy(itemId: string, libraryId?: string): Promise<string[]> {
    const history = await this.getWatchHistory(itemId, true, libraryId);
    return history.map((record) => record.userId);
  }

  async getActiveSessions(): Promise<Set<string>> {
    if (!this.api) return new Set<string>();
    try {
      const response = await getSessionApi(this.api).getSessions();
      const playing = new Set<string>();
      for (const session of response.data ?? []) {
        const item = session.NowPlayingItem;
        if (!item) continue;
        // A collection can track an episode at any level, so protect the
        // episode and its season and series. ParentId is intentionally
        // omitted - for Jellyfin movies it is the library folder, not a
        // collectable ancestor. Movies only carry Id.
        if (item.Id) playing.add(item.Id);
        if (item.SeasonId) playing.add(item.SeasonId);
        if (item.SeriesId) playing.add(item.SeriesId);
      }
      return playing;
    } catch (error) {
      this.logger.warn('Failed to fetch active Jellyfin sessions.');
      this.logger.debug(error);
      return new Set<string>();
    }
  }

  /**
   * Watch records for every Episode descendant of `parentId` (show or season),
   * keyed by episode id, with an entry for every episode the sweep saw (an
   * empty array means confirmed never watched). One getItems call per user
   * (batched via mapUsersBatched) - O(users), not the O(users × episodes) a
   * per-episode getWatchHistory walk costs (#3337).
   *
   * This reads the same /Items + enableUserData payload the per-item path
   * reads, so the records it builds are identical; only the request count
   * changes. The sweep is deliberately unfiltered: Jellyfin's isPlayed filter
   * tests the Played flag alone, so it would drop episodes that are only
   * watched by crossing the PlayedPercentage threshold (#2466).
   *
   * All-or-nothing. A user whose sweep failed, or a short page, would read as
   * "watched nothing" for every episode of the show, so an incomplete sweep
   * throws rather than answering with a partial map (#2744).
   */
  async getDescendantEpisodeWatchHistory(
    parentId: string,
    libraryId?: string,
  ): Promise<Record<string, WatchRecord[]>> {
    if (!this.api) return {};

    const playedCompletionThreshold =
      await this.getPlayedCompletionThreshold(true);

    // A parent the prefetch indexed is answered from memory. An unindexed one
    // (no snapshot, or a show added since) falls through to the per-show sweep
    // below, which is still one request per user rather than per episode.
    const snapshot = this.getWatchSnapshot(
      libraryId,
      playedCompletionThreshold,
    );
    const sweptEpisodeIds = snapshot?.descendants.get(parentId);
    if (sweptEpisodeIds) {
      const fromSnapshot: Record<string, WatchRecord[]> = {};
      for (const episodeId of sweptEpisodeIds) {
        fromSnapshot[episodeId] = [
          ...(snapshot.watchHistory.get(episodeId) ?? []),
        ];
      }
      return fromSnapshot;
    }

    const users = await this.getUsers(true);
    if (!users.length) {
      throw new Error('Jellyfin returned no users for watch history');
    }
    const entries = await this.mapUsersBatched(async (user) => {
      const response = await getItemsApi(this.api!).getItems({
        userId: user.id,
        parentId,
        recursive: true,
        includeItemTypes: [BaseItemKind.Episode],
        // Ignore unaired placeholders (mirrors #2624).
        excludeLocationTypes: [LocationType.Virtual],
        enableUserData: true,
        // Minimize payload - we only need UserData per episode.
        fields: [],
      });

      // Jellyfin always returns an Items array here, so a response without one
      // is a broken read (proxy error page, auth interstitial), not an empty
      // show - and treating it as empty would read as "nobody watched".
      const items = response.data.Items;
      if (!Array.isArray(items)) {
        throw new Error(`Jellyfin returned no episode list under ${parentId}`);
      }

      const total = response.data.TotalRecordCount;
      if (typeof total === 'number' && items.length < total) {
        throw new Error(
          `Jellyfin returned ${items.length} of ${total} episodes under ${parentId}`,
        );
      }

      return { userId: user.id, items };
    }, true);

    // mapUsersBatched drops users whose request failed, which here would read
    // as "this user watched nothing" for the whole show.
    if (entries.length !== users.length) {
      throw new Error(
        `Jellyfin watch-history sweep for ${parentId} covered ${entries.length} of ${users.length} users`,
      );
    }

    const watchHistory: Record<string, WatchRecord[]> = {};
    for (const { userId, items } of entries) {
      for (const item of items) {
        if (!item.Id) continue;

        watchHistory[item.Id] ??= [];
        const userData = item.UserData ?? undefined;
        if (!this.isCompletedWatch(userData, playedCompletionThreshold)) {
          continue;
        }

        watchHistory[item.Id].push(
          JellyfinMapper.toWatchRecord(
            userId,
            item.Id,
            userData?.LastPlayedDate
              ? new Date(userData.LastPlayedDate)
              : undefined,
            userData?.PlayedPercentage ?? undefined,
          ),
        );
      }
    }

    return watchHistory;
  }

  /**
   * Get user IDs of all users who have favorited an item.
   * Iterates over all users and checks UserData.IsFavorite.
   */
  async getItemFavoritedBy(
    itemId: string,
    libraryId?: string,
  ): Promise<string[]> {
    if (!this.api) return [];

    try {
      // The prefetch indexes movies, episodes, series and seasons, so a swept
      // id answers from memory; an unswept one (an item added since) falls
      // through to the per-user read below.
      const snapshot = this.getWatchSnapshot(
        libraryId,
        await this.getPlayedCompletionThreshold(),
      );
      if (snapshot?.watchHistory.has(itemId)) {
        return [...(snapshot.favoritedBy.get(itemId) ?? [])];
      }

      const cacheKey = `${JELLYFIN_CACHE_KEYS.FAVORITED_BY}:${itemId}`;
      if (this.cache.data.has(cacheKey)) {
        return this.cache.data.get<string[]>(cacheKey) || [];
      }

      const userDataEntries = await this.getAllUserItemData(itemId);
      const favoritedBy = userDataEntries
        .filter(({ userData }) => userData?.IsFavorite)
        .map(({ user }) => user.id);

      this.cache.data.set(cacheKey, favoritedBy, JELLYFIN_CACHE_TTL.USER_DATA);

      return favoritedBy;
    } catch (error) {
      this.logger.error(`Failed to get favorited-by list for ${itemId}`);
      this.logger.debug(error);
      return [];
    }
  }

  /**
   * Get total play count for an item across all users.
   * This includes partial/unfinished plays (PlayCount > 0 but Played = false).
   * Only meaningful for Movies and Episodes (Series/Seasons always return 0).
   */
  async getTotalPlayCount(itemId: string, libraryId?: string): Promise<number> {
    if (!this.api) return 0;

    try {
      const snapshot = this.getWatchSnapshot(
        libraryId,
        await this.getPlayedCompletionThreshold(),
      );
      if (snapshot?.watchHistory.has(itemId)) {
        return snapshot.playCount.get(itemId) ?? 0;
      }

      const cacheKey = `${JELLYFIN_CACHE_KEYS.TOTAL_PLAY_COUNT}:${itemId}`;
      if (this.cache.data.has(cacheKey)) {
        return this.cache.data.get<number>(cacheKey) || 0;
      }

      const userDataEntries = await this.getAllUserItemData(itemId);
      const totalPlayCount = userDataEntries.reduce((count, { userData }) => {
        return count + (userData?.PlayCount ?? 0);
      }, 0);

      this.cache.data.set(
        cacheKey,
        totalPlayCount,
        JELLYFIN_CACHE_TTL.USER_DATA,
      );

      return totalPlayCount;
    } catch (error) {
      this.logger.error(`Failed to get play count for ${itemId}`);
      this.logger.debug(error);
      return 0;
    }
  }

  /**
   * Run `fn` for every Jellyfin user in rate-limited batches with
   * `Promise.allSettled`. Centralizes the per-user fan-out pattern shared by
   * watch history, favorited-by, play-count and episode-watcher aggregation.
   */
  private async mapUsersBatched<T>(
    fn: (user: MediaUser) => Promise<T>,
    throwOnUserLookupError = false,
  ): Promise<T[]> {
    const users = await this.getUsers(throwOnUserLookupError);
    const entries: T[] = [];

    for (
      let i = 0;
      i < users.length;
      i += JELLYFIN_BATCH_SIZE.USER_WATCH_HISTORY
    ) {
      const batch = users.slice(i, i + JELLYFIN_BATCH_SIZE.USER_WATCH_HISTORY);
      const results = await Promise.allSettled(batch.map((user) => fn(user)));
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          entries.push(result.value);
          return;
        }

        this.logger.debug(
          `Failed Jellyfin per-user batch operation for user ${batch[idx].id}`,
        );
        this.logger.debug(result.reason);
      });
    }

    return entries;
  }

  /**
   * Get item user data for all Jellyfin users.
   */
  private async getAllUserItemData(
    itemId: string,
    throwOnUserLookupError = false,
  ): Promise<Array<{ user: MediaUser; userData?: UserItemDataDto }>> {
    return this.mapUsersBatched(
      async (user) => ({
        user,
        userData: await this.getItemUserData(itemId, user.id),
      }),
      throwOnUserLookupError,
    );
  }

  /**
   * Get user data for a specific item.
   */
  private async getItemUserData(
    itemId: string,
    userId: string,
  ): Promise<UserItemDataDto | undefined> {
    if (!this.api) return undefined;

    try {
      // Use getItems with enableUserData instead of the dedicated
      // getItemUserData endpoint - the latter does not reliably return
      // per-user data when authenticating with an API key on all
      // Jellyfin versions.
      const response = await getItemsApi(this.api).getItems({
        userId,
        ids: [itemId],
        enableUserData: true,
      });
      return response.data.Items?.find((el) => el.Id === itemId)?.UserData;
    } catch (error) {
      this.logger.debug(
        `Failed to get Jellyfin user data for item ${itemId} and user ${userId}`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  /**
   * Get the configured Jellyfin admin user ID from settings.
   * Jellyfin requires userId for item visibility filtering when
   * authenticating with an API key (no implicit user session).
   */
  private async getUserId(): Promise<string | undefined> {
    if (this.jellyfinUserId !== undefined) {
      return this.jellyfinUserId;
    }

    const settings = await this.settingsDataService.getSettings();
    this.jellyfinUserId =
      settings && 'jellyfin_user_id' in settings
        ? (settings.jellyfin_user_id ?? undefined)
        : undefined;

    return this.jellyfinUserId;
  }

  async getCollections(
    libraryId: string,
    useCache = true,
  ): Promise<MediaCollection[]> {
    if (!this.api) {
      throw new Error('Jellyfin not initialized');
    }

    const cacheKey = `${JELLYFIN_CACHE_KEYS.COLLECTIONS}:${libraryId}`;
    // Still written back on a live read, so per-item reads stay warm.
    let allCollections = useCache
      ? this.cache.data.get<MediaCollection[]>(cacheKey)
      : undefined;

    if (!allCollections) {
      allCollections = [];

      try {
        const userId = await this.getUserId();
        const response = await getItemsApi(this.api).getItems({
          userId,
          parentId: libraryId,
          includeItemTypes: [BaseItemKind.BoxSet],
          recursive: true,
          fields: [
            ItemFields.Overview,
            ItemFields.DateCreated,
            ItemFields.ChildCount,
            ItemFields.ParentId,
          ],
        });

        const collections = (response.data.Items || []).map(
          JellyfinMapper.toMediaCollection,
        );

        allCollections = collections.filter(
          (collection): collection is MediaCollection => collection !== null,
        );
        // Skip caching empty results so a transient zero-collection response
        // (e.g. mid-library-scan) can't mask a just-created entry.
        if (allCollections.length > 0) {
          this.cache.data.set(
            cacheKey,
            allCollections,
            JELLYFIN_CACHE_TTL.COLLECTIONS,
          );
        }
      } catch (error) {
        this.logger.error(`Failed to get collections for ${libraryId}`);
        this.logger.debug(error);
        throw error;
      }
    }

    return allCollections;
  }

  async getCollection(
    collectionId: string,
    throwOnError = false,
  ): Promise<MediaCollection | undefined> {
    // Guard predates throwOnError, and answered "confirmed 404" without it.
    if (!this.api) {
      if (throwOnError) {
        throw new Error('Jellyfin not initialized');
      }
      return undefined;
    }

    try {
      const userId = await this.getUserId();
      const response = await getUserLibraryApi(this.api).getItem({
        itemId: collectionId,
        userId,
      });

      return response.data
        ? JellyfinMapper.toMediaCollection(response.data)
        : undefined;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        this.logger.debug(
          `Jellyfin collection ${collectionId} not found; treating it as missing`,
        );
        return undefined;
      }

      this.logger.debug(`Failed to get collection ${collectionId}`);
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
    if (!this.api) {
      throw new Error('Jellyfin not initialized');
    }

    try {
      // Created empty; items are added afterwards via addBatchToCollection.
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

      this.invalidateCollectionsCache(params.libraryId);

      // Note: No refresh needed - Jellyfin auto-generates composite images
      // when items are added (as long as isLocked: true, which we set above).

      // Construct from known data - the collection may not be immediately
      // queryable via getItems as Jellyfin needs time to index it
      return {
        id: collectionId,
        title: params.title,
        summary: params.summary,
        childCount: 0,
        smart: false,
        libraryId: params.libraryId,
      };
    } catch (error) {
      this.logger.error('Failed to create Jellyfin collection');
      this.logger.debug(error);
      throw error;
    }
  }

  async deleteCollection(collectionId: string): Promise<void> {
    // Resolving here would tell the caller the BoxSet is gone, and the caller
    // drops the link on that (#3344). An uninitialized client knows nothing.
    if (!this.api) {
      throw new Error('Jellyfin not initialized');
    }

    try {
      await getLibraryApi(this.api).deleteItem({ itemId: collectionId });
    } catch (error) {
      // The BoxSet may already be gone (a concurrent delete, or the user
      // removed it in Jellyfin), which 404/500s here. Re-check and swallow if
      // so. Note: Jellyfin does NOT auto-delete BoxSets that merely go empty.
      if (await this.collectionStillExists(collectionId)) {
        this.logger.error(`Failed to delete collection ${collectionId}`);
        this.logger.debug(error);
        // Throw before the cache invalidation below - the collection still
        // exists, so cached entries are still valid.
        throw error;
      }
      this.logger.debug(`Jellyfin collection ${collectionId} already gone`);
    }

    // libraryId not known here; clear all per-library entries.
    this.invalidateCollectionsCache();
    this.invalidateCollectionChildrenCache(collectionId);
  }

  /**
   * Whether the BoxSet is still on the server. Only a confirmed 404 reads as
   * gone: `getCollection(id, true)` throws when it cannot tell, and an
   * unverifiable re-check must not turn a failed delete into a silent success
   * (#3344). Mirrors the Plex adapter's helper of the same name.
   */
  private async collectionStillExists(collectionId: string): Promise<boolean> {
    try {
      return Boolean(await this.getCollection(collectionId, true));
    } catch {
      return true;
    }
  }

  async getCollectionChildren(collectionId: string): Promise<MediaItem[]> {
    if (!this.api) {
      throw new Error('Jellyfin API not initialized');
    }

    const cacheKey = `${JELLYFIN_CACHE_KEYS.COLLECTIONS}:children:${collectionId}`;
    let allCollectionChildren = this.cache.data.get<MediaItem[]>(cacheKey);

    if (!allCollectionChildren) {
      allCollectionChildren = [];

      try {
        const userId = await this.getUserId();

        // For BoxSets in Jellyfin, we need to use the Items endpoint
        // with the collection's ID as parentId AND a userId
        const response = await this.retryLibraryRequestOnce(
          `get Jellyfin collection children for ${collectionId}`,
          async () =>
            await getItemsApi(this.api!).getItems({
              userId,
              parentId: collectionId,
              fields: [
                ItemFields.ProviderIds,
                ItemFields.Path,
                ItemFields.DateCreated,
                // Collection grids are sorted Maintainerr-side, so studio
                // ordering needs the field on every hydrated child.
                ItemFields.Studios,
              ],
              enableUserData: true,
              recursive: false,
            }),
        );

        // If parentId approach returns nothing, try recursive search
        if (!response.data.Items?.length) {
          const itemsResponse = await this.retryLibraryRequestOnce(
            `get Jellyfin collection children recursively for ${collectionId}`,
            async () =>
              await getItemsApi(this.api!).getItems({
                userId,
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
                  ItemFields.Studios,
                ],
                enableUserData: true,
              }),
          );

          if (itemsResponse.data.Items?.length) {
            allCollectionChildren = (itemsResponse.data.Items || []).map(
              JellyfinMapper.toMediaItem,
            );
          }
        } else {
          allCollectionChildren = (response.data.Items || []).map(
            JellyfinMapper.toMediaItem,
          );
        }

        // Skip caching empty results: Jellyfin may briefly return [] for a
        // freshly-created collection while indexing.
        if (allCollectionChildren.length > 0) {
          this.cache.data.set(
            cacheKey,
            allCollectionChildren,
            JELLYFIN_CACHE_TTL.COLLECTIONS,
          );
        }
      } catch (error) {
        if (
          isAxiosError(error) &&
          (error.response?.status === 400 || error.response?.status === 404)
        ) {
          throw error;
        }
        this.logger.error(
          `Failed to get collection children for ${collectionId}`,
          error,
        );
        // A swallowed enumeration failure reads as "the collection is empty"
        // downstream, which mass-resyncs rule-owned items and adopts stale
        // server children as ghost manual members.
        throw error;
      }
    }

    return allCollectionChildren;
  }

  private invalidateCollectionsCache(libraryId?: string): void {
    if (libraryId) {
      this.cache.data.del(`${JELLYFIN_CACHE_KEYS.COLLECTIONS}:${libraryId}`);
      return;
    }
    const prefix = `${JELLYFIN_CACHE_KEYS.COLLECTIONS}:`;
    const childrenPrefix = `${JELLYFIN_CACHE_KEYS.COLLECTIONS}:children:`;
    const stale = this.cache.data
      .keys()
      .filter((k) => k.startsWith(prefix) && !k.startsWith(childrenPrefix));
    if (stale.length > 0) this.cache.data.del(stale);
  }

  private invalidateCollectionChildrenCache(collectionId: string): void {
    this.cache.data.del(
      `${JELLYFIN_CACHE_KEYS.COLLECTIONS}:children:${collectionId}`,
    );
  }

  private async addToCollectionInternal(
    collectionId: string,
    itemId: string,
    logFailure: boolean,
  ): Promise<void> {
    if (!this.api) return;

    try {
      await getCollectionApi(this.api).addToCollection({
        collectionId,
        ids: [itemId],
      });
    } catch (error) {
      if (logFailure) {
        this.logger.error(
          `Failed to add item ${itemId} to collection ${collectionId}`,
          error,
        );
      }
      throw error;
    }
  }

  async addToCollection(collectionId: string, itemId: string): Promise<void> {
    await this.addToCollectionInternal(collectionId, itemId, true);
    this.invalidateCollectionChildrenCache(collectionId);
  }

  async addBatchToCollection(
    collectionId: string,
    itemIds: string[],
  ): Promise<string[]> {
    if (!this.api || itemIds.length === 0) return [];

    const chunkSize = JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION;
    const failedIds: string[] = [];
    let usedFallback = false;

    for (let i = 0; i < itemIds.length; i += chunkSize) {
      const chunk = itemIds.slice(i, i + chunkSize);
      try {
        await getCollectionApi(this.api).addToCollection({
          collectionId,
          ids: chunk,
        });
      } catch (error) {
        usedFallback = true;

        for (const itemId of chunk) {
          try {
            await this.addToCollectionInternal(collectionId, itemId, false);
          } catch {
            failedIds.push(itemId);
          }
        }
      }
    }

    if (usedFallback && failedIds.length > 0) {
      this.logger.warn(
        `Jellyfin batch add fallback left ${failedIds.length} failed item(s) for collection ${collectionId}`,
      );
    }

    this.invalidateCollectionChildrenCache(collectionId);

    return failedIds;
  }

  async cleanupCollectionForLibrary(
    collectionId: string,
    libraryId: string,
    isManualCollection: boolean,
  ): Promise<void> {
    const children = await this.getCollectionChildren(collectionId);
    const childIds = children.map((item) => item.id);

    const itemsToRemove: string[] = [];
    let membershipUnknown = false;
    for (const id of childIds) {
      const inLibrary = await this.itemIsInLibrary(id, libraryId);
      if (inLibrary === undefined) {
        membershipUnknown = true;
      } else if (inLibrary) {
        itemsToRemove.push(id);
      }
    }

    // Remove items belonging to the specified library
    const failedIds = await this.removeBatchFromCollection(
      collectionId,
      itemsToRemove,
    );

    if (failedIds.length > 0) {
      this.logger.warn(
        `Failed to remove ${failedIds.length} items from collection ${collectionId}`,
      );
    }

    // Delete the collection if all items belonged to this library and it's not
    // manual. Jellyfin does NOT auto-delete a BoxSet that merely goes empty, so
    // this explicit delete is what removes it.
    if (childIds.length === itemsToRemove.length && !isManualCollection) {
      await this.deleteCollection(collectionId);
    }

    // Removals above still stand; this only tells the caller the sweep was
    // incomplete, so it logs that the collection may need removing by hand
    // instead of silently dropping the link on an apparent success.
    if (membershipUnknown) {
      throw new Error(
        `Could not determine library membership for every child of collection ${collectionId}`,
      );
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
      this.invalidateCollectionChildrenCache(collectionId);
    } catch (error) {
      this.logger.error(
        `Failed to remove ${itemId} from collection ${collectionId}`,
        error,
      );
      throw error;
    }
  }

  async removeBatchFromCollection(
    collectionId: string,
    itemIds: string[],
  ): Promise<string[]> {
    if (!this.api || itemIds.length === 0) return [];

    const chunkSize = JELLYFIN_BATCH_SIZE.COLLECTION_MUTATION;
    const failedIds: string[] = [];

    for (let i = 0; i < itemIds.length; i += chunkSize) {
      const chunk = itemIds.slice(i, i + chunkSize);
      try {
        await getCollectionApi(this.api).removeFromCollection({
          collectionId,
          ids: chunk,
        });
      } catch (error) {
        this.logger.error(
          `Failed to remove ${chunk.length} items from collection ${collectionId}`,
          error,
        );
        failedIds.push(...chunk);
      }
    }

    this.invalidateCollectionChildrenCache(collectionId);

    return failedIds;
  }

  // COLLECTION METADATA UPDATE

  async updateCollection(
    params: UpdateCollectionParams,
  ): Promise<MediaCollection> {
    if (!this.api) {
      throw new Error('Jellyfin client not initialized');
    }

    try {
      const userId = await this.getUserId();
      // First, get the existing collection to preserve all properties
      const existingResponse = await getItemsApi(this.api).getItems({
        userId,
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
        userId,
        ids: [params.collectionId],
        includeItemTypes: [BaseItemKind.BoxSet],
        fields: [
          ItemFields.Overview,
          ItemFields.DateCreated,
          ItemFields.ChildCount,
          ItemFields.ParentId,
        ],
      });

      const collection = response.data.Items?.[0];
      if (!collection) {
        throw new Error(`Collection ${params.collectionId} not found`);
      }

      this.invalidateCollectionsCache(params.libraryId);

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

  async reorderCollectionItems(
    collectionId: string,
    orderedItemIds: string[],
  ): Promise<void> {
    this.logger.warn(
      `Attempted to reorder ${orderedItemIds.length} items in collection ${collectionId}, ` +
        'but Jellyfin does not support boxset reordering.',
    );
    throw new Error('Collection sort not supported on Jellyfin');
  }

  // OPTIONAL: SERVER-SPECIFIC FEATURES (Not supported)

  // getWatchlistForUser is not implemented for Jellyfin
  // as it doesn't have a watchlist API

  async getPlaylists(libraryId: string): Promise<MediaPlaylist[]> {
    if (!this.api) return [];

    try {
      const userId = await this.getUserId();

      // Jellyfin playlists are not library-specific, but we filter by parentId
      // to maintain consistency with the interface contract
      const response = await getItemsApi(this.api).getItems({
        userId,
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

  async getPlaylistItems(playlistId: string): Promise<MediaItem[]> {
    if (!this.api) return [];

    try {
      const userId = await this.getUserId();
      const response = await getPlaylistsApi(this.api).getPlaylistItems({
        userId,
        playlistId,
      });

      return (response.data.Items || []).map(JellyfinMapper.toMediaItem);
    } catch (error) {
      this.logger.error(
        `Failed to get Jellyfin playlist items for ${playlistId}`,
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
    return resolveContextActionIds(
      collectionType,
      context,
      mediaId,
      (parentId, type) => this.getChildrenMetadata(parentId, type, true),
      (message) => this.logger.warn(message),
    );
  }

  async deleteFromDisk(itemId: string): Promise<void> {
    if (!this.api) {
      throw new Error(
        'Jellyfin API not initialized - cannot delete item from disk',
      );
    }

    if (!itemId || itemId.trim() === '') {
      throw new Error(
        'deleteFromDisk called with empty itemId - aborting to prevent unintended deletion',
      );
    }

    try {
      await getLibraryApi(this.api).deleteItem({ itemId });
      this.logger.log(`Successfully deleted Jellyfin item ${itemId} from disk`);
    } catch (error) {
      this.logger.error(`Failed to delete item ${itemId} from disk`);
      this.logger.debug(error);
      throw error;
    }
  }

  resetMetadataCache(itemId?: string): void {
    // The prefetched snapshot is a point-in-time copy of every item's watch
    // state, so it has to go too - otherwise a manual mark-watched would stay
    // invisible for the rest of the batch, which is exactly #3274.
    cacheManager.getCache('jellyfinwatchhistory').data.flushAll();

    if (itemId) {
      // Watch-history entries are keyed per item. Season/show getters
      // (e.g. sw_allEpisodesSeenBy) aggregate their DESCENDANT episodes' entries,
      // which carry the episode id - not the season/show id passed here - so
      // scoping the watch invalidation to `:${itemId}` left them stale: a season
      // stayed "not watched by everyone" for hours after a manual mark in
      // Jellyfin (#3274). Clear the whole watch-history namespace instead (cheap,
      // and flushed each run anyway). Children entries are keyed the same way -
      // a show's episode lists hang off its season ids, not the id passed here -
      // so that namespace goes wholesale too. The item's favourite/play-count
      // entries and the server-wide aggregate caches (users/libraries/status/
      // collections) are invalidated exactly as before.
      this.cache.data
        .keys()
        .filter(
          (key) =>
            key.startsWith(`${JELLYFIN_CACHE_KEYS.WATCH_HISTORY}:`) ||
            key.startsWith(`${JELLYFIN_CACHE_KEYS.CHILDREN}:`) ||
            key === `${JELLYFIN_CACHE_KEYS.FAVORITED_BY}:${itemId}` ||
            key === `${JELLYFIN_CACHE_KEYS.TOTAL_PLAY_COUNT}:${itemId}` ||
            key === `${JELLYFIN_CACHE_KEYS.METADATA}:${itemId}`,
        )
        .forEach((key) => this.cache.data.del(key));
    } else {
      // Clear all Jellyfin cache
      this.cache.data.flushAll();
    }
  }

  async refreshItemMetadata(itemId: string): Promise<void> {
    if (!this.api) {
      throw new Error(
        'Jellyfin API not initialized - cannot refresh item metadata',
      );
    }

    if (isBlankMediaServerId(itemId)) {
      throw new Error(
        'refreshItemMetadata called with empty itemId - aborting metadata refresh request',
      );
    }

    try {
      await getItemRefreshApi(this.api).refreshItem({
        itemId,
        metadataRefreshMode: 'Default',
        imageRefreshMode: 'Default',
      });
    } catch (error) {
      this.logger.warn(
        `Failed to refresh Jellyfin metadata for item ${itemId}`,
      );
      this.logger.debug(error);
      throw error;
    }
  }

  /**
   * Log a library access error, distinguishing migration issues from real failures.
   */
  private logLibraryError(
    libraryId: string,
    operation: string,
    error: unknown,
  ): void {
    if (isForeignServerId(MediaServerType.JELLYFIN, libraryId)) {
      this.logger.warn(
        `Library '${libraryId || '(empty)'}' appears to be from a different media server. Please update the library setting in your rules.`,
      );
    } else {
      this.logger.error(`Failed to ${operation} for ${libraryId}`);
      this.logger.debug(error);
    }
  }

  private async retryLibraryRequestOnce<T>(
    operation: string,
    request: () => Promise<T>,
  ): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (!this.isRetryableLibraryError(error)) {
        throw error;
      }

      this.logger.warn(
        `Transient Jellyfin failure during ${operation}; retrying once in ${JELLYFIN_LIBRARY_RETRY_DELAY_MS}ms`,
      );
      this.logger.debug(error);

      await delay(JELLYFIN_LIBRARY_RETRY_DELAY_MS);
      return await request();
    }
  }

  private isRetryableLibraryError(error: unknown): boolean {
    const errorCode = isAxiosError(error)
      ? error.code
      : error && typeof error === 'object' && 'code' in error
        ? typeof error.code === 'string'
          ? error.code
          : undefined
        : undefined;

    if (
      errorCode &&
      JELLYFIN_RETRYABLE_LIBRARY_ERROR_CODES.has(errorCode.toUpperCase())
    ) {
      return true;
    }

    const statusCode = isAxiosError(error) ? error.response?.status : undefined;

    if (
      statusCode !== undefined &&
      JELLYFIN_RETRYABLE_LIBRARY_STATUS_CODES.has(statusCode)
    ) {
      return true;
    }

    return false;
  }
}
