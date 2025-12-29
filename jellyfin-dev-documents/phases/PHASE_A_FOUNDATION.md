# Phase A: Foundation - Media Server Abstraction Layer

**Duration:** ~1-2 weeks  
**Goal:** Create the abstraction layer and database schema without breaking existing Plex functionality

---

## A.1: Contracts Package - Shared Types

### Files to Create

```
packages/contracts/src/media-server/
├── index.ts           # Re-exports
├── enums.ts           # EMediaServerType, EMediaDataType
├── types.ts           # MediaItem, MediaLibrary, MediaUser, etc.
└── features.ts        # MediaServerFeature enum
```

### A.1.1: Create `enums.ts`

```typescript
// Media server type
export enum EMediaServerType {
  PLEX = 'plex',
  JELLYFIN = 'jellyfin',
}

// Media data type (replaces EPlexDataType eventually)
export enum EMediaDataType {
  MOVIE = 'movie',
  SHOW = 'show', 
  SEASON = 'season',
  EPISODE = 'episode',
}

// Feature flags for capability detection
export enum EMediaServerFeature {
  COLLECTION_VISIBILITY = 'collection_visibility',
  WATCHLIST = 'watchlist',
  CENTRAL_WATCH_HISTORY = 'central_watch_history',
  LABELS = 'labels',
  PLAYLISTS = 'playlists',
}
```

### A.1.2: Create `types.ts`

Based on analysis:
- `MediaItem` - neutral version of `PlexLibraryItem`
- `MediaLibrary` - neutral library structure
- `MediaUser` - neutral user structure
- `WatchRecord` - watch history entry
- `MediaCollection` - collection structure

### A.1.3: Update `index.ts`

Export all new types from contracts package.

---

## A.2: Database Schema Migration

### New Settings Columns

```typescript
// Add to Settings entity
@Column({ type: 'varchar', default: 'plex' })
media_server_type: 'plex' | 'jellyfin';

@Column({ nullable: true })
jellyfin_url: string;

@Column({ nullable: true })
jellyfin_api_key: string;

@Column({ nullable: true })
jellyfin_user_id: string;  // Admin user for operations

@Column({ nullable: true })
jellyfin_server_name: string;
```

### Migration File

Create migration: `{timestamp}-add-jellyfin-settings.ts`

---

## A.2.5: Media Server Switch Functionality

### Implementation Note

Instead of requiring users to "nuke the entire database" to switch media servers, we implement a **halfway house solution** that:
- **Clears**: Collections, collection media, exclusions, collection logs (media server-specific data)
- **Keeps**: General settings, Radarr/Sonarr settings, Overseerr/Jellyseerr settings, Tautulli settings, notifications

### API Endpoints

```
GET  /api/settings/media-server/switch/preview/:targetServerType
POST /api/settings/media-server/switch
```

### DTOs (in `@maintainerr/contracts`)

```typescript
// Request
interface SwitchMediaServerRequestDto {
  targetServerType: EMediaServerType;
  confirmDataClear: boolean;  // Must be true to proceed
}

// Response
interface SwitchMediaServerResponseDto {
  status: 'OK' | 'NOK';
  code: number;
  message: string;
  clearedData?: {
    collections: number;
    collectionMedia: number;
    exclusions: number;
    collectionLogs: number;
  };
}

// Preview
interface MediaServerSwitchPreviewDto {
  currentServerType: EMediaServerType;
  targetServerType: EMediaServerType;
  dataToBeCleared: { ... };
  dataToBeKept: { ... };
}
```

---

## A.3: Media Server Module Structure

### Files to Create

```
apps/server/src/modules/api/media-server/
├── media-server.module.ts
├── media-server.factory.ts
├── media-server.interface.ts
├── media-server.constants.ts
├── plex/
│   ├── plex-adapter.service.ts    # Wraps PlexApiService
│   └── plex.mapper.ts             # Plex ↔ MediaItem
└── jellyfin/
    ├── jellyfin.service.ts        # New implementation
    └── jellyfin.mapper.ts         # Jellyfin ↔ MediaItem
```

### A.3.1: `media-server.interface.ts`

Core interface based on PlexApiService analysis (34 methods → abstracted to ~25):

```typescript
export interface IMediaServerService {
  // Lifecycle
  initialize(): Promise<void>;
  uninitialize(): void;
  isSetup(): boolean;
  getServerType(): EMediaServerType;
  
  // Feature detection
  supportsFeature(feature: EMediaServerFeature): boolean;
  
  // Server info
  getStatus(): Promise<MediaServerStatus>;
  
  // Users
  getUsers(): Promise<MediaUser[]>;
  getUser(id: string): Promise<MediaUser | undefined>;
  
  // Libraries
  getLibraries(): Promise<MediaLibrary[]>;
  getLibraryContents(libraryId: string, options?: LibraryQueryOptions): Promise<PagedResult<MediaItem>>;
  getLibraryContentCount(libraryId: string, type?: EMediaDataType): Promise<number>;
  searchLibraryContents(libraryId: string, query: string, type?: EMediaDataType): Promise<MediaItem[]>;
  
  // Metadata
  getMetadata(itemId: string): Promise<MediaItem | undefined>;
  getChildrenMetadata(parentId: string): Promise<MediaItem[]>;
  getRecentlyAdded(libraryId: string, options?: RecentlyAddedOptions): Promise<MediaItem[]>;
  
  // Search
  searchContent(query: string): Promise<MediaItem[]>;
  
  // Watch History (implementation varies by server)
  getWatchHistory(itemId: string): Promise<WatchRecord[]>;
  getItemSeenBy(itemId: string): Promise<string[]>;
  
  // Collections
  getCollections(libraryId: string): Promise<MediaCollection[]>;
  getCollection(collectionId: string): Promise<MediaCollection | undefined>;
  createCollection(params: CreateCollectionParams): Promise<MediaCollection>;
  deleteCollection(collectionId: string): Promise<void>;
  getCollectionChildren(collectionId: string): Promise<MediaItem[]>;
  addToCollection(collectionId: string, itemId: string): Promise<void>;
  removeFromCollection(collectionId: string, itemId: string): Promise<void>;
  
  // Plex-only (optional methods)
  updateCollectionVisibility?(collectionId: string, settings: CollectionVisibilitySettings): Promise<void>;
  getWatchlistForUser?(userId: string): Promise<string[]>;
  
  // Playlists
  getPlaylists(libraryId: string): Promise<MediaPlaylist[]>;
  
  // Actions
  deleteFromDisk(itemId: string): Promise<void>;
  
  // Cache
  resetMetadataCache(itemId?: string): void;
}
```

### A.3.2: `media-server.factory.ts`

> **Future Extensibility Note:** The factory pattern is intentionally chosen to support future multi-server scenarios. Currently returns a single service based on global settings, but can be extended to:
> - `getService(serverType?: EMediaServerType)` - Get specific server instance
> - `getConfiguredServers()` - List all configured servers
> - Manage connection pools for multiple servers
>
> This would enable per-rule server selection in a future release.

```typescript
@Injectable()
export class MediaServerFactory {
  constructor(
    private readonly plexAdapter: PlexAdapterService,
    @Optional() private readonly jellyfinService: JellyfinService,
    private readonly settingsService: SettingsService,
  ) {}

  async getService(): Promise<IMediaServerService> {
    const settings = await this.settingsService.getSettings();
    
    switch (settings.media_server_type) {
      case 'jellyfin':
        if (!this.jellyfinService) {
          throw new Error('Jellyfin service not available');
        }
        return this.jellyfinService;
      case 'plex':
      default:
        return this.plexAdapter;
    }
  }
}
```

### A.3.3: `plex/plex-adapter.service.ts`

Wraps existing `PlexApiService` to implement `IMediaServerService`:

```typescript
@Injectable()
export class PlexAdapterService implements IMediaServerService {
  constructor(private readonly plexApi: PlexApiService) {}
  
  getServerType(): EMediaServerType {
    return EMediaServerType.PLEX;
  }
  
  supportsFeature(feature: EMediaServerFeature): boolean {
    // Plex supports all current features
    return true;
  }
  
  async getLibraries(): Promise<MediaLibrary[]> {
    const libraries = await this.plexApi.getLibraries();
    return libraries.map(PlexMapper.toMediaLibrary);
  }
  
  // ... wrap all 34 methods using PlexMapper
}
```

---

## A.4: Plex Mapper Implementation

### `plex/plex.mapper.ts`

Handle all conversions between Plex types and neutral MediaItem types:

```typescript
export class PlexMapper {
  // Key conversions:
  // - ratingKey → id
  // - title → title  
  // - type → type (with enum mapping)
  // - addedAt (unix timestamp) → addedAt (Date)
  // - duration (ms) → durationMs
  // - Guid[] → providerIds { imdb, tmdb, tvdb }
  // - Media[] → mediaSources
  
  static toMediaItem(plex: PlexLibraryItem): MediaItem { ... }
  static toMediaLibrary(plex: PlexLibrary): MediaLibrary { ... }
  static toMediaUser(plex: PlexUserAccount): MediaUser { ... }
  static toWatchRecord(plex: PlexSeenBy): WatchRecord { ... }
  static toMediaCollection(plex: PlexCollection): MediaCollection { ... }
  
  // Reverse mappings (for API calls)
  static toPlexDataType(type: EMediaDataType): EPlexDataType { ... }
}
```

---

## A.5: Testing Requirements

### Unit Tests

1. **PlexMapper tests**
   - Test all conversion methods
   - Test edge cases (null values, missing fields)
   - Test provider ID extraction from Plex GUID format

2. **PlexAdapterService tests**
   - Verify all methods delegate to PlexApiService correctly
   - Verify mapper is called for responses

3. **MediaServerFactory tests**
   - Test service selection based on settings
   - Test error handling for missing Jellyfin service

---

## A.6: Acceptance Criteria

- [ ] All new types in contracts package compile
- [ ] Database migration runs successfully
- [ ] PlexAdapterService wraps all PlexApiService methods
- [ ] Existing Plex functionality unchanged (all tests pass)
- [ ] MediaServerFactory returns correct service based on settings
- [ ] 100% unit test coverage for mappers

---

## Files Changed Summary

### New Files (12)

| File | Purpose |
|------|---------|
| `packages/contracts/src/media-server/index.ts` | Exports |
| `packages/contracts/src/media-server/enums.ts` | Enums |
| `packages/contracts/src/media-server/types.ts` | Types |
| `packages/contracts/src/media-server/features.ts` | Features |
| `apps/server/src/modules/api/media-server/media-server.module.ts` | Module |
| `apps/server/src/modules/api/media-server/media-server.interface.ts` | Interface |
| `apps/server/src/modules/api/media-server/media-server.factory.ts` | Factory |
| `apps/server/src/modules/api/media-server/media-server.constants.ts` | Constants |
| `apps/server/src/modules/api/media-server/plex/plex-adapter.service.ts` | Adapter |
| `apps/server/src/modules/api/media-server/plex/plex.mapper.ts` | Mapper |
| `apps/server/src/database/migrations/{ts}-add-jellyfin-settings.ts` | Migration |
| Test files | Tests |

### Modified Files (3)

| File | Changes |
|------|---------|
| `packages/contracts/src/index.ts` | Export media-server |
| `apps/server/src/modules/settings/entities/settings.entities.ts` | Add Jellyfin columns |
| `apps/server/src/app/app.module.ts` | Import MediaServerModule |
