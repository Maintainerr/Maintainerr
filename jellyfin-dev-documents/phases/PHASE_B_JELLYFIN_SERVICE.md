# Phase B: Jellyfin Service Implementation

**Duration:** ~1-2 weeks  
**Goal:** Implement complete JellyfinService with full API coverage using @jellyfin/sdk

**Prerequisite:** Phase A complete

---

## B.1: Install Dependencies

```bash
yarn workspace @maintainerr/server add @jellyfin/sdk
```

SDK Details:
- Package: `@jellyfin/sdk` v0.13.0+
- Compatibility: Jellyfin Server 10.11.x
- Based on OpenAPI spec, uses Axios

---

## B.2: Files to Create

```
apps/server/src/modules/api/media-server/jellyfin/
├── jellyfin.module.ts         # NestJS module
├── jellyfin.service.ts        # Main service implementation
├── jellyfin.mapper.ts         # Jellyfin ↔ MediaItem conversion
├── jellyfin.types.ts          # SDK type extensions
└── jellyfin.constants.ts      # Jellyfin-specific constants
```

---

## B.3: Jellyfin Service Implementation

### B.3.1: `jellyfin.service.ts`

Based on Jellysweep's pattern with NestJS adaptation:

```typescript
import { Jellyfin, Api } from '@jellyfin/sdk';
import {
  getItemsApi,
  getLibraryApi,
  getUserApi,
  getCollectionApi,
  getPlaystateApi,
  getTvShowsApi,
  getPlaylistsApi,
  getSearchApi,
  getSystemApi,
} from '@jellyfin/sdk/lib/utils/api';
import { BaseItemKind, ItemFields, ItemFilter, ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models';

@Injectable()
export class JellyfinService implements IMediaServerService {
  private jellyfin: Jellyfin;
  private api: Api;
  private initialized = false;
  private logger = new Logger(JellyfinService.name);

  constructor(
    private readonly settingsService: SettingsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  // ===== LIFECYCLE =====
  
  async initialize(): Promise<void> {
    const settings = await this.settingsService.getSettings();
    
    if (!settings.jellyfin_url || !settings.jellyfin_api_key) {
      throw new Error('Jellyfin settings not configured');
    }

    this.jellyfin = new Jellyfin({
      clientInfo: {
        name: 'Maintainerr',
        version: process.env.npm_package_version || '2.0.0',
      },
      deviceInfo: {
        name: 'Maintainerr-Server',
        id: `maintainerr-${settings.clientId || 'default'}`,
      },
    });

    this.api = this.jellyfin.createApi(settings.jellyfin_url);
    this.api.accessToken = settings.jellyfin_api_key;

    // Verify connection
    try {
      await getSystemApi(this.api).getPublicSystemInfo();
      this.initialized = true;
      this.logger.log('Jellyfin connection established');
    } catch (error) {
      throw new Error(`Failed to connect to Jellyfin: ${error.message}`);
    }
  }

  uninitialize(): void {
    this.initialized = false;
    this.api = undefined;
  }

  isSetup(): boolean {
    return this.initialized;
  }

  getServerType(): EMediaServerType {
    return EMediaServerType.JELLYFIN;
  }

  supportsFeature(feature: EMediaServerFeature): boolean {
    switch (feature) {
      case EMediaServerFeature.COLLECTION_VISIBILITY:
      case EMediaServerFeature.WATCHLIST:
        return false; // Jellyfin doesn't support these
      case EMediaServerFeature.LABELS:
        return true; // Via Tags
      case EMediaServerFeature.PLAYLISTS:
      case EMediaServerFeature.CENTRAL_WATCH_HISTORY:
        return false; // Per-user iteration required
      default:
        return true;
    }
  }

  // ===== SERVER INFO =====
  
  async getStatus(): Promise<MediaServerStatus> {
    const info = await getSystemApi(this.api).getPublicSystemInfo();
    return {
      serverName: info.data.ServerName,
      version: info.data.Version,
      platform: info.data.OperatingSystem,
    };
  }

  // ===== USERS =====
  
  async getUsers(): Promise<MediaUser[]> {
    const response = await getUserApi(this.api).getUsers();
    return response.data.map(JellyfinMapper.toMediaUser);
  }

  async getUser(id: string): Promise<MediaUser | undefined> {
    try {
      const response = await getUserApi(this.api).getUserById({ userId: id });
      return JellyfinMapper.toMediaUser(response.data);
    } catch {
      return undefined;
    }
  }

  // ===== LIBRARIES =====
  
  async getLibraries(): Promise<MediaLibrary[]> {
    const response = await getLibraryApi(this.api).getMediaFolders();
    return (response.data.Items || []).map(JellyfinMapper.toMediaLibrary);
  }

  async getLibraryContents(
    libraryId: string,
    options?: LibraryQueryOptions,
  ): Promise<PagedResult<MediaItem>> {
    const response = await getItemsApi(this.api).getItems({
      parentId: libraryId,
      recursive: true,
      startIndex: options?.offset || 0,
      limit: options?.limit || 100,
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
      includeItemTypes: this.mapDataTypesToBaseItemKinds(options?.types),
      enableUserData: true,
    });

    return {
      items: (response.data.Items || []).map(JellyfinMapper.toMediaItem),
      totalSize: response.data.TotalRecordCount || 0,
      offset: options?.offset || 0,
    };
  }

  // ===== METADATA =====
  
  async getMetadata(itemId: string): Promise<MediaItem | undefined> {
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
    } catch {
      return undefined;
    }
  }

  async getChildrenMetadata(parentId: string): Promise<MediaItem[]> {
    const response = await getItemsApi(this.api).getItems({
      parentId,
      fields: [ItemFields.ProviderIds, ItemFields.Path],
      enableUserData: true,
    });
    return (response.data.Items || []).map(JellyfinMapper.toMediaItem);
  }

  // ===== WATCH HISTORY (Complex - Per User) =====
  
  async getWatchHistory(itemId: string): Promise<WatchRecord[]> {
    const cacheKey = `jellyfin:watch:${itemId}`;
    const cached = await this.cacheManager.get<WatchRecord[]>(cacheKey);
    if (cached) return cached;

    const users = await this.getUsers();
    const records: WatchRecord[] = [];

    // Batch users to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(user => this.getItemUserData(itemId, user.id))
      );

      results.forEach((userData, idx) => {
        if (userData?.Played) {
          records.push({
            userId: batch[idx].id,
            userName: batch[idx].name,
            playCount: userData.PlayCount || 0,
            lastPlayedDate: userData.LastPlayedDate 
              ? new Date(userData.LastPlayedDate) 
              : undefined,
          });
        }
      });
    }

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, records, 300000);
    return records;
  }

  async getItemSeenBy(itemId: string): Promise<string[]> {
    const watchHistory = await this.getWatchHistory(itemId);
    return watchHistory.map(r => r.userId);
  }

  private async getItemUserData(itemId: string, userId: string) {
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

  // ===== COLLECTIONS =====
  
  async getCollections(libraryId: string): Promise<MediaCollection[]> {
    const response = await getItemsApi(this.api).getItems({
      parentId: libraryId,
      includeItemTypes: [BaseItemKind.BoxSet],
      recursive: false,
    });
    return (response.data.Items || []).map(JellyfinMapper.toMediaCollection);
  }

  async createCollection(params: CreateCollectionParams): Promise<MediaCollection> {
    const response = await getCollectionApi(this.api).createCollection({
      name: params.name,
      parentId: params.libraryId,
      isLocked: true,
    });
    
    // Fetch full collection data
    const collection = await this.getCollection(response.data.Id);
    return collection!;
  }

  async deleteCollection(collectionId: string): Promise<void> {
    await getLibraryApi(this.api).deleteItem({ itemId: collectionId });
  }

  async addToCollection(collectionId: string, itemId: string): Promise<void> {
    await getCollectionApi(this.api).addToCollection({
      collectionId,
      ids: [itemId],
    });
  }

  async removeFromCollection(collectionId: string, itemId: string): Promise<void> {
    await getCollectionApi(this.api).removeFromCollection({
      collectionId,
      ids: [itemId],
    });
  }

  // ===== DELETION =====
  
  async deleteFromDisk(itemId: string): Promise<void> {
    await getLibraryApi(this.api).deleteItem({ itemId });
  }

  // ===== HELPERS =====
  
  private mapDataTypesToBaseItemKinds(types?: EMediaDataType[]): BaseItemKind[] {
    if (!types?.length) return [BaseItemKind.Movie, BaseItemKind.Series];
    
    return types.map(type => {
      switch (type) {
        case EMediaDataType.MOVIE: return BaseItemKind.Movie;
        case EMediaDataType.SHOW: return BaseItemKind.Series;
        case EMediaDataType.SEASON: return BaseItemKind.Season;
        case EMediaDataType.EPISODE: return BaseItemKind.Episode;
        default: return BaseItemKind.Movie;
      }
    });
  }

  resetMetadataCache(itemId?: string): void {
    if (itemId) {
      this.cacheManager.del(`jellyfin:watch:${itemId}`);
    } else {
      // Clear all jellyfin cache entries
      // Implementation depends on cache manager
    }
  }
}
```

---

## B.4: Jellyfin Mapper

### `jellyfin.mapper.ts`

```typescript
import { BaseItemDto, UserDto, BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models';

export class JellyfinMapper {
  /**
   * Convert Jellyfin BaseItemDto to MediaItem
   */
  static toMediaItem(item: BaseItemDto): MediaItem {
    return {
      id: item.Id!,
      title: item.Name || '',
      type: this.toMediaDataType(item.Type),
      year: item.ProductionYear,
      overview: item.Overview,
      addedAt: item.DateCreated ? new Date(item.DateCreated) : undefined,
      
      // Hierarchical
      parentId: item.ParentId,
      grandparentId: item.SeriesId,
      indexNumber: item.IndexNumber,
      parentIndexNumber: item.ParentIndexNumber,
      
      // Provider IDs
      providerIds: {
        imdb: item.ProviderIds?.Imdb,
        tmdb: item.ProviderIds?.Tmdb,
        tvdb: item.ProviderIds?.Tvdb,
      },
      
      // Duration (Jellyfin uses ticks: 1 tick = 100 nanoseconds)
      durationMs: item.RunTimeTicks 
        ? Math.floor(item.RunTimeTicks / 10000) 
        : undefined,
      
      // Ratings
      communityRating: item.CommunityRating,
      criticRating: item.CriticRating,
      
      // Tags (equivalent to Plex Labels)
      tags: item.Tags || [],
      genres: item.Genres || [],
      
      // Media info
      path: item.Path,
      mediaSources: item.MediaSources?.map(ms => ({
        id: ms.Id,
        path: ms.Path,
        size: ms.Size,
        bitrate: ms.Bitrate,
        container: ms.Container,
        videoCodec: ms.VideoStreams?.[0]?.Codec,
        videoResolution: ms.VideoStreams?.[0]?.Width 
          ? `${ms.VideoStreams[0].Width}x${ms.VideoStreams[0].Height}`
          : undefined,
      })) || [],

      // User data (if available)
      userData: item.UserData ? {
        played: item.UserData.Played || false,
        playCount: item.UserData.PlayCount || 0,
        lastPlayedDate: item.UserData.LastPlayedDate 
          ? new Date(item.UserData.LastPlayedDate) 
          : undefined,
        isFavorite: item.UserData.IsFavorite || false,
      } : undefined,
      
      // Child counts (for shows/seasons)
      childCount: item.ChildCount,
    };
  }

  static toMediaDataType(kind?: BaseItemKind | string): EMediaDataType {
    switch (kind) {
      case BaseItemKind.Movie:
      case 'Movie':
        return EMediaDataType.MOVIE;
      case BaseItemKind.Series:
      case 'Series':
        return EMediaDataType.SHOW;
      case BaseItemKind.Season:
      case 'Season':
        return EMediaDataType.SEASON;
      case BaseItemKind.Episode:
      case 'Episode':
        return EMediaDataType.EPISODE;
      default:
        return EMediaDataType.MOVIE;
    }
  }

  static toMediaLibrary(item: BaseItemDto): MediaLibrary {
    return {
      id: item.Id!,
      name: item.Name || '',
      type: this.toLibraryType(item.CollectionType),
    };
  }

  static toLibraryType(collectionType?: string): 'movies' | 'shows' | 'music' | 'unknown' {
    switch (collectionType?.toLowerCase()) {
      case 'movies':
        return 'movies';
      case 'tvshows':
        return 'shows';
      case 'music':
        return 'music';
      default:
        return 'unknown';
    }
  }

  static toMediaUser(user: UserDto): MediaUser {
    return {
      id: user.Id!,
      name: user.Name || '',
      isAdmin: user.Policy?.IsAdministrator || false,
    };
  }

  static toMediaCollection(item: BaseItemDto): MediaCollection {
    return {
      id: item.Id!,
      name: item.Name || '',
      childCount: item.ChildCount || 0,
      libraryId: item.ParentId,
    };
  }

  // Reverse mapping for API calls
  static toBaseItemKind(type: EMediaDataType): BaseItemKind {
    switch (type) {
      case EMediaDataType.MOVIE: return BaseItemKind.Movie;
      case EMediaDataType.SHOW: return BaseItemKind.Series;
      case EMediaDataType.SEASON: return BaseItemKind.Season;
      case EMediaDataType.EPISODE: return BaseItemKind.Episode;
      default: return BaseItemKind.Movie;
    }
  }
}
```

---

## B.5: Batch Watch History Optimization

For better performance with many users, implement batch pre-caching:

```typescript
// Add to JellyfinService
async buildWatchedCacheForLibrary(libraryId: string): Promise<void> {
  const users = await this.getUsers();
  const watchedMap = new Map<string, string[]>(); // itemId -> userIds

  for (const user of users) {
    try {
      const response = await getItemsApi(this.api).getItems({
        userId: user.id,
        parentId: libraryId,
        recursive: true,
        filters: [ItemFilter.IsPlayed],
        fields: [], // Minimal
        enableUserData: false,
      });

      for (const item of response.data.Items || []) {
        const existing = watchedMap.get(item.Id!) || [];
        existing.push(user.id);
        watchedMap.set(item.Id!, existing);
      }
    } catch (error) {
      this.logger.warn(`Failed to get watched items for user ${user.name}`, error);
    }
  }

  // Store in cache
  await this.cacheManager.set(
    `jellyfin:watched:library:${libraryId}`,
    Object.fromEntries(watchedMap),
    600000 // 10 minutes
  );
}

async getSeenByFromCache(itemId: string, libraryId: string): Promise<string[]> {
  const cacheKey = `jellyfin:watched:library:${libraryId}`;
  let cache = await this.cacheManager.get<Record<string, string[]>>(cacheKey);
  
  if (!cache) {
    await this.buildWatchedCacheForLibrary(libraryId);
    cache = await this.cacheManager.get<Record<string, string[]>>(cacheKey);
  }
  
  return cache?.[itemId] || [];
}
```

---

## B.6: Testing Requirements

### Unit Tests

1. **JellyfinMapper tests**
   - Test all conversion methods
   - Test duration conversion (ticks → ms)
   - Test date parsing
   - Test provider ID extraction

2. **JellyfinService tests** (with mocked SDK)
   - Test initialization flow
   - Test feature detection
   - Test library content retrieval
   - Test collection operations
   - Test watch history aggregation

### Integration Tests (Optional)

- Set up mock Jellyfin server or use test instance
- Verify actual API calls work correctly

---

## B.7: Acceptance Criteria

- [ ] @jellyfin/sdk installed and configured
- [ ] JellyfinService implements all IMediaServerService methods
- [ ] Watch history correctly aggregates across all users
- [ ] Batch caching reduces API calls for watch history
- [ ] All mapper conversions are correct
- [ ] Feature detection returns correct values
- [ ] Unit tests pass with >90% coverage

---

## Files Created Summary

| File | Size Est. | Purpose |
|------|-----------|---------|
| `jellyfin/jellyfin.module.ts` | ~50 LOC | NestJS module |
| `jellyfin/jellyfin.service.ts` | ~400 LOC | Main implementation |
| `jellyfin/jellyfin.mapper.ts` | ~150 LOC | Type conversions |
| `jellyfin/jellyfin.types.ts` | ~50 LOC | Type extensions |
| `jellyfin/jellyfin.constants.ts` | ~30 LOC | Constants |
| Test files | ~300 LOC | Unit tests |
