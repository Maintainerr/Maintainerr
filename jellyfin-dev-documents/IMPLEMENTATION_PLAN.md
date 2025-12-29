I'm in a choice of path.... Janitorr, Maintainerr, or something else. I have like 1 month on my hands to contribute to whatever I decide since I'm in between jobs, but I'm not sure which path to take.

I talked with AI a little bit and this is what Claude Opus 4.5 suggested. @jorenn92 Do you agree? If yes, I could start with this pretty soon. For me, it would be awesome to have a one-stop-shop for everything. The main problem with Open Source (IMHO) is 10 different repos doing almost the same thing. And yes, I'm a big FOSS advocate (look at my profile).

Maintainerr feels like the most complete solution, and if we could make that work for Jellyfin (and soon to be Seer) as well, that would be great!

---

<details>
<summary>Claude Opus 4.5 suggestion</summary>

# Jellyfin Support Implementation Plan

**Document Version:** 4.3  
**Last Updated:** December 29, 2025  
**Status:** Complete - Ready for Implementation

---

## Document Overview

This implementation plan provides a technically accurate roadmap for adding Jellyfin support to Maintainerr. All findings are verified against actual source code from Maintainerr, Jellyfin server, and reference implementations (Janitorr, Jellysweep).

### Reference Codebases Analyzed

| Codebase        | Language          | Key Patterns Extracted                                |
| --------------- | ----------------- | ----------------------------------------------------- |
| Maintainerr     | TypeScript/NestJS | Current Plex integration, PlexApiService (34 methods) |
| Jellyfin Server | C#                | Official API controllers, endpoint signatures         |
| Janitorr        | Kotlin/Spring     | MediaServerClient abstraction, Feign HTTP clients     |
| Jellysweep      | Go                | Filter chain pattern, Jellystat integration           |
| @jellyfin/sdk   | TypeScript        | Official SDK v0.13.0 for Jellyfin 10.11.x             |

---

# PHASE 1: Maintainerr Deep Analysis

## 1.1 Current Architecture Overview

### Core Service Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MAINTAINERR SERVICE LAYER                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────┐                                                  │
│   │    PlexApiService    │◄─────────────────────────────────────────────┐   │
│   │  (1049 lines, 34    │                                               │   │
│   │   public methods)    │                                               │   │
│   └──────────┬───────────┘                                               │   │
│              │                                                            │   │
│              │ Used by 18 services/handlers:                             │   │
│              │                                                            │   │
│   ┌──────────┴────────────────────────────────────────────────────────┐  │   │
│   │                                                                    │  │   │
│   │  • AppModule (initialization)                                      │  │   │
│   │  • CollectionsService (collection CRUD, 1261 lines)               │  │   │
│   │  • CollectionHandler (plex sync)                                   │  │   │
│   │  • PlexGetterService (rule properties, 782 lines)                 │  │   │
│   │  • RuleExecutorService (rule evaluation)                          │  │   │
│   │  • RuleMaintenanceService (cleanup)                               │  │   │
│   │  • ExclusionCorrectorService                                      │  │   │
│   │  • SettingsService (server config)                                │  │   │
│   │  • NotificationsService                                           │  │   │
│   │  • TautulliGetterService (needs plex users)                       │  │   │
│   │  • OverseerrGetterService (needs plex metadata)                   │  │   │
│   │  • JellyseerrGetterService (needs plex metadata)                  │  │   │
│   │  • SonarrGetterService (needs plex metadata)                      │  │   │
│   │  • RadarrActionHandler (deletion)                                 │  │   │
│   │  • SonarrActionHandler (deletion)                                 │  │   │
│   │  • MediaIdFinder                                                  │  │   │
│   │  • TmdbIdService                                                  │  │   │
│   │  • PlexApiController (HTTP endpoints)                             │  │   │
│   │                                                                    │  │   │
│   └────────────────────────────────────────────────────────────────────┘  │   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 1.2 PlexApiService Method Inventory

### Complete Public Method List (Verified from Source)

| Method                                             | Return Type                         | Category    | Jellyfin Equivalent                  |
| -------------------------------------------------- | ----------------------------------- | ----------- | ------------------------------------ |
| `initialize()`                                     | `Promise<void>`                     | Setup       | ✅ Similar                           |
| `uninitialize()`                                   | `void`                              | Setup       | ✅ Similar                           |
| `isPlexSetup()`                                    | `boolean`                           | Setup       | ✅ Similar                           |
| `getStatus()`                                      | `Promise<MediaContainer>`           | Server      | `getPublicSystemInfo()`              |
| `searchContent(input)`                             | `Promise<PlexMetadata[]>`           | Search      | `getItems()` with search params      |
| `getUsers()`                                       | `Promise<PlexUserAccount[]>`        | Users       | `getUsers()`                         |
| `getUser(id)`                                      | `Promise<PlexUserAccount>`          | Users       | `getUserById()`                      |
| `getLibraries()`                                   | `Promise<PlexLibrary[]>`            | Libraries   | `getMediaFolders()`                  |
| `getLibraryContentCount(id, type)`                 | `Promise<number>`                   | Libraries   | `getItems()` count                   |
| `getLibraryContents(id, options, type)`            | `Promise<{totalSize, items}>`       | Libraries   | `getItems()` with pagination         |
| `searchLibraryContents(id, query, type)`           | `Promise<PlexLibraryItem[]>`        | Libraries   | `getItems()` with search             |
| `getMetadata(key, options)`                        | `Promise<PlexMetadata>`             | Metadata    | `getItem()`                          |
| `getChildrenMetadata(key)`                         | `Promise<PlexMetadata[]>`           | Metadata    | `getItems()` with parentId           |
| `getRecentlyAdded(id, options)`                    | `Promise<PlexLibraryItem[]>`        | Metadata    | `getItems()` sorted by DateCreated   |
| `getWatchHistory(itemId)`                          | `Promise<PlexSeenBy[]>`             | Watch       | **⚠️ DIFFERENT** - per-user UserData |
| `getCollections(libraryId, subType)`               | `Promise<PlexCollection[]>`         | Collections | `getItems()` with BoxSet type        |
| `getCollection(collectionId)`                      | `Promise<PlexCollection>`           | Collections | `getItem()`                          |
| `createCollection(params)`                         | `Promise<PlexCollection>`           | Collections | `createCollection()`                 |
| `updateCollection(body)`                           | `Promise<PlexCollection>`           | Collections | **⚠️ LIMITED** - item update         |
| `deleteCollection(collectionId)`                   | `Promise<BasicResponseDto>`         | Collections | `deleteItem()`                       |
| `getCollectionChildren(collectionId)`              | `Promise<PlexLibraryItem[]>`        | Collections | `getItems()` with parentId           |
| `addChildToCollection(collectionId, childId)`      | `Promise<PlexCollection>`           | Collections | `addToCollection()`                  |
| `deleteChildFromCollection(collectionId, childId)` | `Promise<BasicResponseDto>`         | Collections | `removeFromCollection()`             |
| `UpdateCollectionSettings(params)`                 | `Promise<PlexHub>`                  | Collections | **❌ NOT AVAILABLE**                 |
| `getPlaylists(libraryId)`                          | `Promise<PlexPlaylist[]>`           | Playlists   | ✅ `getPlaylists()` exists           |
| `deleteMediaFromDisk(plexId)`                      | `Promise<void>`                     | Actions     | `deleteItem()`                       |
| `getAvailableServers()`                            | `Promise<PlexDevice[]>`             | Servers     | **N/A** - single server              |
| `getWatchlistIdsForUser(userId, username)`         | `Promise<PlexCommunityWatchList[]>` | Watchlist   | **❌ NOT AVAILABLE**                 |
| `getAllIdsForContextAction(...)`                   | `Promise<{plexId}[]>`               | Utility     | ✅ Can implement                     |
| `getCorrectedUsers(realOwnerId)`                   | `Promise<SimplePlexUser[]>`         | Users       | ✅ Similar                           |
| `getUserDataFromPlexTv()`                          | `Promise<any>`                      | Plex.tv     | **N/A** - Plex specific              |
| `getOwnerDataFromPlexTv()`                         | `Promise<PlexUser>`                 | Plex.tv     | **N/A** - Plex specific              |
| `getDiscoverDataUserState(metaDataRatingKey)`      | `Promise<any>`                      | Plex.tv     | **N/A** - Plex specific              |
| `resetMetadataCache(mediaId)`                      | `void`                              | Cache       | ✅ Similar                           |

### Method Usage Frequency (Across All Services)

```
High Frequency (Core Operations):
├── getMetadata()           - 15+ usages (metadata lookups)
├── getChildrenMetadata()   - 12+ usages (seasons/episodes)
├── getWatchHistory()       - 10+ usages (watch tracking)
├── getUsers()              - 8+ usages (user lists)
├── getCorrectedUsers()     - 6+ usages (username mapping)
└── getLibraryContents()    - 5+ usages (library browsing)

Medium Frequency (Collection Operations):
├── addChildToCollection()  - 4+ usages
├── deleteChildFromCollection() - 3+ usages
├── UpdateCollectionSettings() - 3+ usages  ⚠️ PLEX ONLY
├── createCollection()      - 2+ usages
└── deleteCollection()      - 2+ usages

Low Frequency (Specialized):
├── getWatchlistIdsForUser() - 2 usages    ⚠️ PLEX ONLY
├── getPlaylists()          - 2 usages
├── deleteMediaFromDisk()   - 2 usages
└── getAvailableServers()   - 1 usage      ⚠️ PLEX ONLY
```

## 1.3 Data Structures Analysis

### PlexLibraryItem Interface (Source: `library.interfaces.ts`)

```typescript
interface PlexLibraryItem {
  ratingKey: string; // PRIMARY ID - maps to Jellyfin "Id"
  parentRatingKey?: string; // Parent (season for episode) - maps to "ParentId"
  grandparentRatingKey?: string; // Grandparent (show for episode) - maps to "SeriesId"
  title: string; // maps to "Name"
  parentTitle?: string;
  guid: string; // Plex GUID format - different from Jellyfin
  parentGuid?: string;
  grandparentGuid?: string;
  addedAt: number; // Unix timestamp - Jellyfin uses ISO date
  updatedAt: number;
  Guid?: { id: string }[]; // External IDs - maps to "ProviderIds"
  type: "movie" | "show" | "season" | "episode" | "collection";
  Media: Media[]; // File info - maps to "MediaSources"
  librarySectionTitle: string;
  librarySectionID: number;
  librarySectionKey: string;
  summary: string; // maps to "Overview"
  viewCount: number; // ⚠️ Global in Plex, per-user in Jellyfin
  skipCount: number;
  lastViewedAt: number; // ⚠️ Global in Plex, per-user in Jellyfin
  year: number; // maps to "ProductionYear"
  duration: number; // maps to "RunTimeTicks" (different units!)
  originallyAvailableAt: string; // maps to "PremiereDate"
  rating?: number;
  audienceRating?: number;
  userRating?: number;
  Genre?: PlexGenre[]; // maps to "Genres" (simpler in Jellyfin)
  Role?: PlexActor[]; // maps to "People"
  leafCount?: number; // Episode count - needs calculation in Jellyfin
  viewedLeafCount?: number; // ⚠️ Requires per-user aggregation
  index?: number; // Episode/Season number - maps to "IndexNumber"
  parentIndex?: number; // Season number - maps to "ParentIndexNumber"
  Collection?: { tag: string }[]; // Collection tags - different structure
  Label?: { tag: string }[]; // ⚠️ No direct Jellyfin equivalent (use Tags?)
}
```

### PlexSeenBy Interface (Watch History)

```typescript
interface PlexSeenBy extends PlexLibraryItem {
  historyKey: string;
  key: string;
  ratingKey: string;
  title: string;
  thumb: string;
  originallyAvailableAt: string;
  viewedAt: number; // ⚠️ Timestamp of view
  accountID: number; // ⚠️ Plex account ID
  deviceID: number;
}
```

**Key Architecture Difference:** Plex has a central watch history endpoint (`/status/sessions/history/all`) that returns WHO watched WHAT and WHEN. Jellyfin stores this per-user in `UserData` on each item, requiring iteration over all users.

## 1.4 Rules Engine Analysis

### Property Categories (from `rules.constants.ts`)

```
PLEX Properties (43 total - verified from rules.constants.ts):
├── Date Properties:
│   ├── addDate (0)
│   ├── releaseDate (2)
│   ├── lastViewedAt (7)
│   ├── sw_lastWatched (13)
│   ├── sw_lastEpisodeAddedAt (16)
│   ├── sw_lastEpisodeAiredAt (27)
│   └── sw_seasonLastEpisodeAiredAt (29)
│
├── User List Properties:
│   ├── seenBy (1)                    ⚠️ Requires iteration in Jellyfin
│   ├── sw_allEpisodesSeenBy (12)     ⚠️ Complex - all users × all episodes
│   ├── sw_watchers (18)              ⚠️ Requires iteration in Jellyfin
│   └── watchlist_isListedByUsers (28) ❌ Plex only
│
├── Numeric Properties:
│   ├── rating_user (3)
│   ├── viewCount (5)
│   ├── collections (6)
│   ├── sw_episodes (14)
│   ├── sw_viewedEpisodes (15)
│   ├── sw_amountOfViews (17)
│   ├── playlists (20)
│   ├── rating_critics (22)
│   ├── rating_audience (23)
│   ├── rating_imdb (31)
│   └── rating_rottenTomatoesCritic (32)
│
├── List Properties:
│   ├── people (4)
│   ├── genre (11)
│   ├── collection_names (19)
│   ├── playlist_names (21)
│   ├── labels (24)                   ⚠️ Map to Jellyfin Tags
│   └── sw_collection_names_including_parent (26)
│
├── Text Properties:
│   ├── fileVideoResolution (8)
│   ├── fileBitrate (9)
│   └── fileVideoCodec (10)
│
└── Boolean Properties:
    └── watchlist_isWatchlisted (30)  ❌ Plex only
```

### Jellyfin Feature Mapping

| Property               | Plex Implementation      | Jellyfin Approach                        | Complexity |
| ---------------------- | ------------------------ | ---------------------------------------- | ---------- |
| `seenBy`               | Single API call          | Iterate all users, check UserData.Played | HIGH       |
| `viewCount`            | watchHistory.length      | Sum UserData.PlayCount across users      | MEDIUM     |
| `lastViewedAt`         | Max of viewedAt          | Max of UserData.LastPlayedDate           | MEDIUM     |
| `sw_allEpisodesSeenBy` | watchHistory per episode | ALL users × ALL episodes check           | VERY HIGH  |
| `watchlist_*`          | Plex Community API       | **NOT AVAILABLE**                        | N/A        |
| `labels`               | Plex labels              | Jellyfin Tags or custom                  | LOW        |
| `playlists`            | Plex playlists API       | Jellyfin playlists API                   | LOW        |

## 1.5 Collection Service Analysis

### Collection Visibility Limitation

```typescript
// From collections.service.ts - createCollection()
await this.plexApi.UpdateCollectionSettings({
  libraryId: collectionObj.libraryId,
  collectionId: plexCollection.ratingKey,
  recommended: collection.visibleOnRecommended, // ❌ NOT IN JELLYFIN
  ownHome: collection.visibleOnHome, // ❌ NOT IN JELLYFIN
  sharedHome: collection.visibleOnHome, // ❌ NOT IN JELLYFIN
});
```

**Jellyfin Limitation:** Collections in Jellyfin are "BoxSets" and cannot be promoted to Home screen or Recommended sections via API. This is the primary functional difference between Plex and Jellyfin collections.

### Collection Operations Mapping

| Plex Operation                               | Jellyfin Equivalent              | Notes                        |
| -------------------------------------------- | -------------------------------- | ---------------------------- |
| `createCollection(params)`                   | `POST /Collections`              | Works but no visibility      |
| `updateCollection(body)`                     | Item update API                  | Limited - name/metadata only |
| `deleteCollection(id)`                       | `DELETE /Items/{id}`             | Works                        |
| `addChildToCollection(collId, childId)`      | `POST /Collections/{id}/Items`   | Works                        |
| `deleteChildFromCollection(collId, childId)` | `DELETE /Collections/{id}/Items` | Works                        |
| `UpdateCollectionSettings(params)`           | **NOT AVAILABLE**                | No equivalent                |
| `getCollectionChildren(id)`                  | `GET /Items?parentId={id}`       | Works                        |

## 1.6 Files Requiring Modification

### Direct PlexApiService Imports (21 files)

```
apps/server/src/
├── app/
│   └── app.module.ts                          # Initialization
├── modules/
│   ├── api/
│   │   ├── plex-api/
│   │   │   ├── plex-api.controller.ts         # HTTP endpoints
│   │   │   ├── plex-api.module.ts             # Module definition
│   │   │   └── guards/
│   │   │       └── plex-setup.guard.ts        # Auth guard
│   │   └── tmdb-api/
│   │       └── tmdb-id.service.ts             # TMDB lookup
│   ├── actions/
│   │   ├── media-id-finder.ts                 # ID resolution
│   │   ├── radarr-action-handler.ts           # Radarr actions
│   │   └── sonarr-action-handler.ts           # Sonarr actions
│   ├── collections/
│   │   ├── collection-handler.ts              # Plex sync
│   │   └── collections.service.ts             # Collection CRUD
│   ├── notifications/
│   │   └── notifications.service.ts           # Notifications
│   ├── rules/
│   │   ├── getter/
│   │   │   ├── jellyseerr-getter.service.ts   # Jellyseerr props
│   │   │   ├── overseerr-getter.service.ts    # Overseerr props
│   │   │   ├── plex-getter.service.ts         # Plex props (27KB)
│   │   │   ├── sonarr-getter.service.ts       # Sonarr props (15KB)
│   │   │   └── tautulli-getter.service.ts     # Tautulli props
│   │   ├── tasks/
│   │   │   ├── exclusion-corrector.service.ts # Exclusion fix
│   │   │   ├── rule-executor.service.ts       # Rule execution
│   │   │   └── rule-maintenance.service.ts    # Cleanup
│   │   └── rules.service.ts                   # Rules CRUD
│   └── settings/
│       └── settings.service.ts                # Settings
```

Note: `getter.service.ts` imports types from plex-api but does not directly inject PlexApiService.

## 1.6.1 Plex-Specific Type System Usage

The codebase has deep Plex-specific types that require abstraction for multi-server support:

| Type/Field        | Usage Count     | Impact                                               |
| ----------------- | --------------- | ---------------------------------------------------- |
| `EPlexDataType`   | 289 occurrences | Used everywhere for movie/show/season/episode typing |
| `plexId`          | 215 occurrences | Primary ID field in entities and throughout code     |
| `ratingKey`       | 119 occurrences | Plex's item identifier                               |
| `PlexLibraryItem` | 81 occurrences  | Core data structure passed through getter services   |
| UI Plex refs      | 319 occurrences | Frontend Plex-specific code                          |

**Migration Strategy:**

1. **Create `EMediaDataType` enum** - Media-server agnostic version of `EPlexDataType`
2. **Create `MediaItem` interface** - Replace `PlexLibraryItem` throughout
3. **Rename `plexId` to `mediaServerId`** - Database migration required
4. **Update all 289+ EPlexDataType usages** - Gradual migration with type aliases

This type system migration is a prerequisite for the API service abstraction.

### Getter Services Property Counts

| Service    | Line Count   | Properties    |
| ---------- | ------------ | ------------- |
| Plex       | 27,176 bytes | 43 properties |
| Radarr     | 6,370 bytes  | 22 properties |
| Sonarr     | 14,887 bytes | 28 properties |
| Overseerr  | 11,321 bytes | 7 properties  |
| Tautulli   | 7,974 bytes  | 9 properties  |
| Jellyseerr | 11,897 bytes | 7 properties  |

## 1.7 Database Schema Analysis

### Contracts Package Analysis

The `packages/contracts/` package contains shared types used by both server and UI:

```
packages/contracts/src/
├── app/              # App-level types
├── collections/      # Collection DTOs, log types
├── events/           # Event definitions
├── plex/             # ⚠️ PLEX-SPECIFIC - contains EPlexDataType
├── rules/            # Rule types - contains plexId references
├── settings/         # Settings DTOs
└── tasks/            # Task types
```

**Key files needing updates:**

- `plex/types.ts` - Contains `EPlexDataType` (should become `media-server/enums.ts`)
- `rules/rule.ts` - Contains `plexId` in `IComparisonStatistics` interface

### Current Settings Entity (from `settings.entities.ts`)

```typescript
// Plex-specific fields that need Jellyfin equivalents:
@Column({ nullable: true })
plex_name: string;

@Column({ nullable: true })
plex_hostname: string;

@Column({ nullable: true })
plex_port: number;

@Column({ nullable: true })
plex_ssl: number;

@Column({ nullable: true })
plex_auth_token: string;
```

### Proposed Schema Additions

```typescript
// New fields for Jellyfin support:
@Column({ default: 'plex' })
media_server_type: 'plex' | 'jellyfin';

@Column({ nullable: true })
jellyfin_url: string;

@Column({ nullable: true })
jellyfin_api_key: string;

@Column({ nullable: true })
jellyfin_user_id: string;  // Primary user for admin operations

@Column({ nullable: true })
jellyfin_device_id: string;

@Column({ nullable: true })
jellyfin_server_name: string;
```

## 1.8 Key Technical Considerations

### Watch History Architecture Differences

Plex and Jellyfin have fundamentally different watch history architectures:

```
PLEX:                                    JELLYFIN:
┌─────────────────────┐                 ┌─────────────────────┐
│  Central History    │                 │  Per-User UserData  │
│  /status/sessions/  │                 │  on Each Item       │
│  history/all        │                 │                     │
├─────────────────────┤                 ├─────────────────────┤
│ Returns:            │                 │ Query Pattern:      │
│ • User ID           │                 │ FOR each user:      │
│ • Item ratingKey    │                 │   FOR each item:    │
│ • Watched date      │                 │     GET UserData    │
│ • Duration          │                 │                     │
└─────────────────────┘                 └─────────────────────┘
       O(1) query                            O(users × items)
```

### Performance Implications

- **Plex**: Single API call returns all watch history
- **Jellyfin**: Requires iterating users to get watch data (N+1 query pattern)
- **Mitigation**: Use `filters: ["IsPlayed"]` with `userId` to batch per-user queries

### Playlist Support

Jellyfin has full playlist API support via `PlaylistsController`:

- Create/delete playlists
- Add/remove items
- Reorder items

---

# PHASE 2: Jellyfin API/SDK Deep Analysis

**Status:** ✅ Complete

## 2.1 Jellyfin Server API Controller Analysis

### Available Controllers (from `/workspaces/jellyfin/Jellyfin.Api/Controllers/`)

| Controller                      | Size | Primary Functions                        |
| ------------------------------- | ---- | ---------------------------------------- |
| `ItemsController.cs`            | 60KB | Item queries, filtering, UserData        |
| `LibraryController.cs`          | 42KB | Libraries, media folders, scanning       |
| `CollectionController.cs`       | 4KB  | Collection CRUD                          |
| `PlaystateController.cs`        | 15KB | Mark played/unplayed, playback reporting |
| `UserController.cs`             | 25KB | User management, authentication          |
| `PlaylistsController.cs`        | 12KB | Playlist CRUD                            |
| `LibraryStructureController.cs` | 8KB  | Virtual folders management               |
| `TvShowsController.cs`          | 20KB | TV-specific queries (seasons, episodes)  |
| `MoviesController.cs`           | 5KB  | Movie-specific queries                   |
| `SearchController.cs`           | 8KB  | Search functionality                     |

### CollectionController Endpoints (VERIFIED)

```csharp
// POST /Collections - Create collection
[HttpPost]
public async Task<ActionResult<CollectionCreationResult>> CreateCollection(
    [FromQuery] string? name,           // Collection name
    [FromQuery, ModelBinder] Guid[] ids, // Initial item IDs
    [FromQuery] Guid? parentId,         // Library ID
    [FromQuery] bool isLocked = false)  // Lock metadata

// POST /Collections/{collectionId}/Items - Add items
[HttpPost("{collectionId}/Items")]
public async Task<ActionResult> AddToCollection(
    [FromRoute] Guid collectionId,
    [FromQuery, ModelBinder] Guid[] ids)

// DELETE /Collections/{collectionId}/Items - Remove items
[HttpDelete("{collectionId}/Items")]
public async Task<ActionResult> RemoveFromCollection(
    [FromRoute] Guid collectionId,
    [FromQuery, ModelBinder] Guid[] ids)
```

**Jellyfin Collection Limitations:**

- No API for collection visibility/promotion to Home screen
- No collection sort order on home
- No collection recommended status
- Collections are basic container types without Plex's promotional features

### ItemsController Key Endpoints (VERIFIED)

```csharp
// GET /Items - Main item query (MOST IMPORTANT)
[HttpGet("Items")]
public ActionResult<QueryResult<BaseItemDto>> GetItems(
    [FromQuery] Guid? userId,              // For user-specific data
    [FromQuery] bool? isPlayed,            // Filter by played status
    [FromQuery] bool? isFavorite,          // Filter by favorites
    [FromQuery] Guid? parentId,            // Library/folder ID
    [FromQuery] bool? recursive,           // Include children
    [FromQuery] ItemSortBy[] sortBy,       // Sort options (DatePlayed, DateCreated, etc)
    [FromQuery] ItemFields[] fields,       // Fields to include
    [FromQuery] BaseItemKind[] includeItemTypes,  // Movie, Series, Episode, etc
    [FromQuery] ItemFilter[] filters,      // IsPlayed, IsUnplayed, IsFavorite, etc
    [FromQuery] bool? enableUserData,      // Include watch state
    [FromQuery] int? startIndex,           // Pagination
    [FromQuery] int? limit,                // Pagination
    // ... 60+ more filter parameters
)

// GET /UserItems/{itemId}/UserData - Get user-specific data
[HttpGet("UserItems/{itemId}/UserData")]
public ActionResult<UserItemDataDto?> GetItemUserData(
    [FromQuery] Guid? userId,
    [FromRoute] Guid itemId)

// POST /UserItems/{itemId}/UserData - Update user data
[HttpPost("UserItems/{itemId}/UserData")]
public ActionResult<UserItemDataDto?> UpdateItemUserData(
    [FromQuery] Guid? userId,
    [FromRoute] Guid itemId,
    [FromBody] UpdateUserItemDataDto userDataDto)
```

### PlaystateController Key Endpoints (VERIFIED)

```csharp
// POST /UserPlayedItems/{itemId} - Mark as played
[HttpPost("UserPlayedItems/{itemId}")]
public async Task<ActionResult<UserItemDataDto?>> MarkPlayedItem(
    [FromQuery] Guid? userId,
    [FromRoute] Guid itemId,
    [FromQuery] DateTime? datePlayed)

// DELETE /UserPlayedItems/{itemId} - Mark as unplayed
[HttpDelete("UserPlayedItems/{itemId}")]
public async Task<ActionResult<UserItemDataDto?>> MarkUnplayedItem(
    [FromQuery] Guid? userId,
    [FromRoute] Guid itemId)

// POST /Sessions/Playing - Report playback start
// POST /Sessions/Playing/Progress - Report progress
// POST /Sessions/Playing/Stopped - Report playback stop
```

### UserController Key Endpoints (VERIFIED)

```csharp
// GET /Users - List all users
[HttpGet]
public ActionResult<IEnumerable<UserDto>> GetUsers(
    [FromQuery] bool? isHidden,
    [FromQuery] bool? isDisabled)

// GET /Users/{userId} - Get user by ID
[HttpGet("{userId}")]
public ActionResult<UserDto> GetUserById([FromRoute] Guid userId)

// POST /Users/AuthenticateByName - Login
[HttpPost("AuthenticateByName")]
public async Task<ActionResult<AuthenticationResult>> AuthenticateUserByName(
    [FromBody] AuthenticateUserByName request)
```

### LibraryController Key Endpoints (VERIFIED)

```csharp
// GET /Library/MediaFolders - Get all libraries
[HttpGet("Library/MediaFolders")]
public ActionResult<QueryResult<BaseItemDto>> GetMediaFolders(
    [FromQuery] bool? isHidden)

// DELETE /Items/{itemId} - Delete item from disk
[HttpDelete("Items/{itemId}")]
public async Task<ActionResult> DeleteItem([FromRoute] Guid itemId)

// GET /Library/PhysicalPaths - Get library paths
[HttpGet("Library/PhysicalPaths")]
public ActionResult<IEnumerable<string>> GetPhysicalPaths()
```

## 2.2 @jellyfin/sdk TypeScript SDK Analysis

### SDK Overview

- **Package:** `@jellyfin/sdk` v0.13.0
- **Compatibility:** Jellyfin Server 10.11.x
- **Architecture:** Generated from OpenAPI spec, uses Axios
- **Size:** 5.03 MB unpacked (796 files)

### API Class Factory Pattern

```typescript
import { Jellyfin } from "@jellyfin/sdk";
import {
  getItemsApi,
  getLibraryApi,
  getUserApi,
  getCollectionApi,
  getPlaystateApi,
  getTvShowsApi,
  getMoviesApi,
  getPlaylistsApi,
  getSearchApi,
} from "@jellyfin/sdk/lib/utils/api";

// Create SDK instance
const jellyfin = new Jellyfin({
  clientInfo: { name: "Maintainerr", version: "2.x" },
  deviceInfo: { name: "Maintainerr-Server", id: "maintainerr-device-id" },
});

// Create API instance
const api = jellyfin.createApi("http://jellyfin.local:8096");

// Authenticate
const auth = await getUserApi(api).authenticateUserByName({
  authenticateUserByName: { Username: "admin", Pw: "password" },
});
// Token now stored in api instance

// Use specific APIs
const libraries = await getLibraryApi(api).getMediaFolders();
const items = await getItemsApi(api).getItems({
  userId: "xxx",
  recursive: true,
});
```

### Key SDK Types

```typescript
// BaseItemDto - Universal item type
interface BaseItemDto {
  Id?: string;
  Name?: string;
  Type?: BaseItemKind; // Movie, Series, Season, Episode, BoxSet
  ParentId?: string;
  SeriesId?: string;
  SeasonId?: string;
  IndexNumber?: number; // Episode/Season number
  ParentIndexNumber?: number; // Season number for episodes
  PremiereDate?: string; // ISO date
  ProductionYear?: number;
  RunTimeTicks?: number; // Duration in ticks (1 tick = 10000 ms)
  Overview?: string;
  Path?: string;
  ProviderIds?: Record<string, string>; // { Imdb: 'tt123', Tmdb: '456', Tvdb: '789' }
  Genres?: string[];
  Studios?: NameGuidPair[];
  People?: BaseItemPerson[];
  Tags?: string[];
  MediaSources?: MediaSourceInfo[];
  UserData?: UserItemDataDto; // Per-user watch data (when requested)
  DateCreated?: string;
  CommunityRating?: number;
  CriticRating?: number;
  OfficialRating?: string; // PG, TV-MA, etc.
  ImageTags?: Record<string, string>;
  ChildCount?: number; // For series/seasons
  // ... many more
}

// UserItemDataDto - Per-user watch state
interface UserItemDataDto {
  PlaybackPositionTicks?: number;
  PlayCount?: number;
  IsFavorite?: boolean;
  Played?: boolean;
  LastPlayedDate?: string; // ISO date
  Key?: string;
}

// BaseItemKind enum
enum BaseItemKind {
  Movie = "Movie",
  Series = "Series",
  Season = "Season",
  Episode = "Episode",
  BoxSet = "BoxSet", // Collections
  Playlist = "Playlist",
  // ... more
}

// ItemFields - Extra fields to request
enum ItemFields {
  Path = "Path",
  Tags = "Tags",
  ProviderIds = "ProviderIds",
  DateCreated = "DateCreated",
  MediaSources = "MediaSources",
  Genres = "Genres",
  Studios = "Studios",
  People = "People",
  Overview = "Overview",
  ParentId = "ParentId",
  Chapters = "Chapters",
  // ... more
}

// ItemFilter - Query filters
enum ItemFilter {
  IsPlayed = "IsPlayed",
  IsUnplayed = "IsUnplayed",
  IsFavorite = "IsFavorite",
  IsResumable = "IsResumable",
  Likes = "Likes",
  Dislikes = "Dislikes",
  IsFolder = "IsFolder",
  IsNotFolder = "IsNotFolder",
}

// ItemSortBy - Sorting options
enum ItemSortBy {
  DatePlayed = "DatePlayed",
  DateCreated = "DateCreated",
  PremiereDate = "PremiereDate",
  SortName = "SortName",
  CommunityRating = "CommunityRating",
  PlayCount = "PlayCount",
  Random = "Random",
  // ... more
}
```

## 2.3 Watch History Architecture Deep Dive

### Plex Watch History (Current Implementation)

```typescript
// Single API call returns ALL watch events
async getWatchHistory(itemId: string): Promise<PlexSeenBy[]> {
  const response = await axios.get(
    `/status/sessions/history/all?metadataItemID=${itemId}`
  );
  // Returns array with accountID, viewedAt, etc.
  return response.data.MediaContainer.Metadata;
}

// Usage: Direct list of who watched
const seenBy = await getWatchHistory('12345');
const watchers = seenBy.map(s => s.accountID);
```

### Jellyfin Watch History (Required Implementation)

```typescript
// MUST iterate all users and check each item's UserData
async getWatchHistory(itemId: string): Promise<JellyfinSeenBy[]> {
  const users = await this.getUsers();
  const seenBy: JellyfinSeenBy[] = [];

  for (const user of users) {
    // Get item with user-specific data
    const itemData = await getItemsApi(this.api).getItems({
      userId: user.Id,
      ids: [itemId],
      enableUserData: true
    });

    const item = itemData.data.Items?.[0];
    if (item?.UserData?.Played) {
      seenBy.push({
        userId: user.Id,
        userName: user.Name,
        playCount: item.UserData.PlayCount || 0,
        lastPlayedDate: item.UserData.LastPlayedDate
      });
    }
  }

  return seenBy;
}
```

**Performance Implications:**

- Plex: 1 API call per item
- Jellyfin: N API calls per item (where N = number of users)
- For 1000 items × 10 users = 10,000 API calls in worst case
- REQUIRES: Caching, batching, or alternative approach

### Alternative: Batch Query with Filters

```typescript
// More efficient: Get all played items for a user at once
async getUserWatchedItems(userId: string, libraryId: string): Promise<string[]> {
  const response = await getItemsApi(this.api).getItems({
    userId: userId,
    parentId: libraryId,
    recursive: true,
    filters: [ItemFilter.IsPlayed],
    fields: [], // Minimal fields
    enableUserData: false // Already filtered by played
  });

  return response.data.Items?.map(i => i.Id!) || [];
}

// Then: Build lookup map
const watchedMap = new Map<string, string[]>(); // itemId -> userIds[]
for (const user of users) {
  const watchedIds = await getUserWatchedItems(user.Id, libraryId);
  for (const itemId of watchedIds) {
    if (!watchedMap.has(itemId)) watchedMap.set(itemId, []);
    watchedMap.get(itemId)!.push(user.Id);
  }
}
```

## 2.4 Janitorr Implementation Analysis

### MediaServerClient Interface (Kotlin/Spring Boot)

```kotlin
interface MediaServerClient {
    // User management
    fun listUsers(): List<MediaServerUser>

    // Library operations
    fun listLibraries(): List<VirtualFolderResponse>
    fun createLibrary(name: String, type: String, request: AddLibraryRequest, paths: List<String>)

    // Collection operations
    fun createCollection(name: String, parentId: String?): CollectionResponse
    fun addItemToCollection(id: String, itemIds: List<String>)

    // Item queries
    fun getAllItems(): ItemPage<MediaFolderItem>
    fun getAllTvShows(parentId: String): ItemPage<LibraryContent>
    fun getAllMovies(parentId: String): ItemPage<LibraryContent>
    fun getAllSeasons(showId: String): ItemPage<LibraryContent>

    // User-specific queries
    fun getUserFavorites(userId: String): ItemPage<LibraryContent>
}
```

### Janitorr's Abstraction Pattern

```kotlin
// Service layer abstraction
abstract class BaseMediaServerService(
    val serviceName: String,                    // "Jellyfin" or "Emby"
    val mediaServerClient: MediaServerClient,  // HTTP client
    val mediaServerUserClient: MediaServerUserClient,
    // ... other dependencies
) : AbstractMediaServerService() {

    // Shared logic that works for both Jellyfin and Emby
    override fun cleanupTvShows(items: List<LibraryItem>) {
        val mediaServerShows = getTvLibrary()
        for (show in items) {
            mediaServerShows
                .filter { tvShowMatches(show, it) }
                .forEach { mediaServerContent ->
                    mediaServerUserClient.deleteItemAndFiles(mediaServerContent.Id)
                }
        }
    }

    // Provider ID matching (works for both)
    private fun mediaMatches(type: LibraryType, item: LibraryItem, candidate: LibraryContent): Boolean {
        val tmdbMatches = candidate.ProviderIds?.Tmdb == item.tmdbId
        val tvdbMatches = candidate.ProviderIds?.Tvdb == item.tvdbId
        val imdbMatches = candidate.ProviderIds?.Imdb == item.imdbId
        return imdbMatches || tmdbMatches || tvdbMatches
    }
}
```

**Key Insight:** Janitorr abstracts at the HTTP client level, making it easy to support both Jellyfin and Emby (which share the same API structure).

### Janitorr's Favorites Handling (Relevant to Maintainerr)

```kotlin
override fun getAllFavoritedItems(): List<LibraryContent> {
    val users = mediaServerClient.listUsers()

    // Iterate all users, get their favorites
    return users.flatMap { user ->
        try {
            mediaServerClient.getUserFavorites(user.Id).Items
        } catch (e: Exception) {
            log.warn("Failed to fetch favorites for user {}", user.Name, e)
            emptyList()
        }
    }.distinctBy { it.Id }  // Deduplicate across users
}
```

## 2.5 Jellysweep Implementation Analysis

### Jellyfin Client (Go + jellyfin-go SDK)

```go
// Client wrapper
type Client struct {
    jellyfin *jellyfin.APIClient
    cfg      *config.Config
}

// Get all items from a library with pagination
func (c *Client) getJellyfinItemsFromLibrary(ctx context.Context, libraryID, libraryName string) ([]jellyfin.BaseItemDto, error) {
    var allItems []jellyfin.BaseItemDto
    startIndex := int32(0)
    limit := int32(1000)  // Batch size

    for {
        itemsResp, _, err := c.jellyfin.ItemsAPI.GetItems(ctx).
            ParentId(libraryID).
            Recursive(true).
            StartIndex(startIndex).
            Limit(limit).
            Fields([]jellyfin.ItemFields{
                jellyfin.ITEMFIELDS_PATH,
                jellyfin.ITEMFIELDS_DATE_CREATED,
                jellyfin.ITEMFIELDS_TAGS,
                jellyfin.ITEMFIELDS_PARENT_ID,
                jellyfin.ITEMFIELDS_MEDIA_SOURCES,
            }).
            IncludeItemTypes([]jellyfin.BaseItemKind{
                jellyfin.BASEITEMKIND_MOVIE,
                jellyfin.BASEITEMKIND_SERIES,
            }).
            Execute()

        items := itemsResp.GetItems()
        if len(items) == 0 {
            break
        }

        allItems = append(allItems, items...)

        if startIndex + int32(len(items)) >= itemsResp.GetTotalRecordCount() {
            break
        }
        startIndex += int32(len(items))
    }

    return allItems, nil
}
```

### Jellysweep's Stats Integration (for Watch History)

```go
// Uses external stats services instead of Jellyfin API directly
type StatsClient interface {
    GetItemLastPlayed(ctx context.Context, itemID string) (time.Time, error)
}

// Jellystat implementation
func (s *jellystatClient) GetItemLastPlayed(ctx context.Context, jellyfinID string) (time.Time, error) {
    lastPlayed, err := s.client.GetLastPlayed(ctx, jellyfinID)
    if err != nil {
        return time.Time{}, err
    }
    return *lastPlayed.LastPlayed, nil
}

// Streamystats implementation
func (s *streamystatsClient) GetItemLastPlayed(ctx context.Context, jellyfinID string) (time.Time, error) {
    lastWatched, err := s.client.GetItemDetails(ctx, jellyfinID)
    if err != nil {
        return time.Time{}, err
    }
    return lastWatched.LastWatched, nil
}
```

**Key Insight:** Jellysweep uses external statistics services (Jellystat, Streamystats) for watch history data rather than querying Jellyfin directly. This provides centralized watch history similar to Plex/Tautulli.

## 2.6 API Mapping: Plex → Jellyfin

### Complete Method Mapping Table

| PlexApiService Method         | Jellyfin SDK Equivalent                                                       | Notes               |
| ----------------------------- | ----------------------------------------------------------------------------- | ------------------- |
| `initialize()`                | `jellyfin.createApi()` + `authenticateUserByName()`                           | Different auth flow |
| `getStatus()`                 | `getSystemApi().getPublicSystemInfo()`                                        | Similar             |
| `getUsers()`                  | `getUserApi().getUsers()`                                                     | Similar             |
| `getUser(id)`                 | `getUserApi().getUserById()`                                                  | Similar             |
| `getLibraries()`              | `getLibraryApi().getMediaFolders()`                                           | Similar             |
| `getLibraryContents()`        | `getItemsApi().getItems()`                                                    | More params         |
| `getMetadata(key)`            | `getItemsApi().getItems({ ids: [key] })`                                      | Different approach  |
| `getChildrenMetadata()`       | `getItemsApi().getItems({ parentId })`                                        | Similar             |
| `getRecentlyAdded()`          | `getItemsApi().getItems({ sortBy: DateCreated })`                             | Similar             |
| `getWatchHistory()`           | **Iterate users + UserData**                                                  | COMPLEX             |
| `getCollections()`            | `getItemsApi().getItems({ includeItemTypes: BoxSet })`                        | Different type      |
| `getCollection(id)`           | `getItemsApi().getItems({ ids: [id] })`                                       | Similar             |
| `createCollection()`          | `getCollectionApi().createCollection()`                                       | Similar             |
| `updateCollection()`          | `getItemsApi().updateItem()`                                                  | Limited             |
| `deleteCollection()`          | `getLibraryApi().deleteItem()`                                                | Similar             |
| `addChildToCollection()`      | `getCollectionApi().addToCollection()`                                        | Similar             |
| `deleteChildFromCollection()` | `getCollectionApi().removeFromCollection()`                                   | Similar             |
| `UpdateCollectionSettings()`  | **NOT AVAILABLE**                                                             | No equivalent       |
| `getPlaylists()`              | `getPlaylistsApi().getPlaylists()`                                            | Similar             |
| `deleteMediaFromDisk()`       | `getLibraryApi().deleteItem()`                                                | Similar             |
| `searchContent()`             | `getSearchApi().getSearchHints()` OR `getItemsApi().getItems({ searchTerm })` | Multiple options    |
| `getWatchlistIdsForUser()`    | **NOT AVAILABLE**                                                             | Plex-only feature   |
| `getUserDataFromPlexTv()`     | **NOT APPLICABLE**                                                            | Plex.tv specific    |

## 2.7 Data Structure Mapping

### PlexLibraryItem → BaseItemDto

```typescript
interface PlexToJellyfinMapping {
  // IDs
  ratingKey: "Id";
  parentRatingKey: "ParentId";
  grandparentRatingKey: "SeriesId";

  // Metadata
  title: "Name";
  summary: "Overview";
  year: "ProductionYear";
  originallyAvailableAt: "PremiereDate"; // Format conversion needed
  duration: "RunTimeTicks"; // Unit conversion: ms → ticks

  // Type
  type: "Type"; // movie→Movie, show→Series, season→Season, episode→Episode

  // Provider IDs
  "Guid[].id": "ProviderIds"; // Extract from Plex GUID format

  // Hierarchical
  index: "IndexNumber";
  parentIndex: "ParentIndexNumber";

  // User Data (DIFFERENT STRUCTURE)
  viewCount: "UserData.PlayCount"; // Per-user in Jellyfin!
  lastViewedAt: "UserData.LastPlayedDate"; // Per-user in Jellyfin!

  // Media Info
  Media: "MediaSources";

  // Collections/Labels
  Collection: "(check parent collections)";
  Label: "Tags";

  // Ratings
  rating: "CommunityRating";
  audienceRating: "(map from ProviderIds.RottenTomatoes)";
}
```

### Duration Conversion

```typescript
// Plex: milliseconds
// Jellyfin: ticks (1 tick = 10000 ms, or 100 nanoseconds)
const plexToJellyfinDuration = (plexMs: number) => plexMs * 10000;
const jellyfinToPlexDuration = (jellyfinTicks: number) => jellyfinTicks / 10000;
```

### Date Conversion

```typescript
// Plex: Unix timestamp (seconds since epoch)
// Jellyfin: ISO 8601 string
const plexToJellyfinDate = (plexTimestamp: number) =>
  new Date(plexTimestamp * 1000).toISOString();

const jellyfinToPlexDate = (jellyfinIso: string) =>
  Math.floor(new Date(jellyfinIso).getTime() / 1000);
```

## 2.8 Performance Considerations

### API Call Comparison

| Operation                   | Plex Calls | Jellyfin Calls | Notes            |
| --------------------------- | ---------- | -------------- | ---------------- |
| Get library items           | 1          | 1              | Similar          |
| Get watch history (1 item)  | 1          | N (users)      | Major difference |
| Get watch history (library) | N (items)  | N × M          | Exponential      |
| Get collection children     | 1          | 1              | Similar          |
| Check if item watched       | 1          | N (users)      | Per-user check   |

### Mitigation Strategies

1. **Batch User Queries:** Get all watched items per user, build map
2. **Caching:** Cache user watch data with TTL
3. **Lazy Loading:** Only fetch watch data when rules require it
4. **External Stats:** Support Jellystat/Tautulli integration for centralized data
5. **Pagination:** Use startIndex/limit for large libraries

## 2.9 TautulliGetterService Pattern (Template for Jellystat)

**File:** [apps/server/src/modules/rules/getter/tautulli-getter.service.ts](apps/server/src/modules/rules/getter/tautulli-getter.service.ts) (240 lines)

This service demonstrates how external statistics services integrate with rules:

```typescript
// Key pattern: Watch percent override per collection
const tautulliWatchedPercentOverride =
  collection.tautulliWatchedPercentOverride;

// Filter by watched status using custom threshold
const viewerIds = history
  .filter((x) =>
    tautulliWatchedPercentOverride != null
      ? x.percent_complete >= tautulliWatchedPercentOverride
      : x.watched_status == 1
  )
  .map((el) => el.user_id);
```

**Key Insight for Jellystat:** This shows Maintainerr already supports:

- Custom watch completion thresholds per collection
- Mapping external user IDs to Plex usernames
- Aggregating watch data across episodes for shows

The same pattern should be replicated for Jellystat/Streamystats integration.

---

# PHASE 3: Additional Codebase Analysis

**Status:** ✅ Complete

## 3.1 Janitorr Architecture Patterns

### Service Abstraction Hierarchy

```
AbstractMediaServerService (abstract)
├── cleanupTvShows(items)
├── cleanupMovies(items)
├── populateMediaServerIds(items, type, bySeason)
├── updateLeavingSoon(cleanupType, libraryType, items)
├── getMediaServerIdsForLibrary(items, type, bySeason)
├── getAllFavoritedItems()
└── filterOutFavorites(items, libraryType)
    │
    └── BaseMediaServerService (abstract)
        ├── Properties: serviceName, mediaServerClient, mediaServerUserClient
        ├── Shared matching logic (mediaMatches, tvShowMatches)
        ├── Provider ID parsing
        └── Symlink/file operations
            │
            ├── JellyfinRestService
            │   └── listLibraries(), createLibrary(), addPathToLibrary()
            │
            └── EmbyRestService
                └── Same interface, different API quirks
```

### MediaServerClient Interface (HTTP Client Level)

```kotlin
interface MediaServerClient {
    // User operations
    fun listUsers(): List<MediaServerUser>

    // Library operations
    fun listLibraries(): List<VirtualFolderResponse>
    fun createLibrary(name, type, request, paths)
    fun addPathToLibrary(request, refresh)
    fun removePathFromLibrary(name, path, refresh)

    // Collection operations
    fun createCollection(name, parentId?): CollectionResponse
    fun addItemToCollection(id, itemIds)

    // Item queries
    fun getAllItems(): ItemPage<MediaFolderItem>
    fun getAllTvShows(parentId): ItemPage<LibraryContent>
    fun getAllMovies(parentId): ItemPage<LibraryContent>
    fun getAllSeasons(showId): ItemPage<LibraryContent>
    fun getMovie(movieId): ItemPage<LibraryContent>
    fun getUserFavorites(userId): ItemPage<LibraryContent>
}

interface MediaServerUserClient {
    fun deleteItemAndFiles(itemId)
}
```

### MediaServerProperties Configuration

```kotlin
interface MediaServerProperties {
    val enabled: Boolean
    val url: String
    val apiKey: String
    val username: String
    val password: String
    val delete: Boolean                // Allow deletion operations
    val excludeFavorited: Boolean      // Skip user favorites
    val leavingSoonTv: String          // "Leaving Soon" library name
    val leavingSoonMovies: String
    val leavingSoonType: LeavingSoonType
}

// Factory pattern for service selection
@Bean
fun mediaServer(...): AbstractMediaServerService {
    if (!jellyfinProperties.enabled && !embyProperties.enabled) {
        return MediaServerNoOpService()  // No-op for disabled
    }
    if (jellyfinProperties.enabled && embyProperties.enabled) {
        throw IllegalStateException("Both cannot be enabled!")
    }
    if (embyProperties.enabled) {
        return EmbyRestService(...)
    }
    return JellyfinRestService(...)
}
```

### LibraryContent Data Structure (Neutral)

```kotlin
data class LibraryContent(
    val Id: String,
    val IsFolder: Boolean,
    val IsMovie: Boolean,
    val IsSeries: Boolean,
    val Name: String,
    val Type: String,
    var ProviderIds: ProviderIds? = null,
    val SeasonId: String? = null,
    val SeasonName: String? = null,
    val IndexNumber: Int = 0,
    val SeriesId: String? = null,
    val SeriesName: String? = null
)

data class ProviderIds(
    val Tvdb: String? = null,
    val Imdb: String? = null,
    val Tmdb: String? = null,
    @JsonAnySetter @get:JsonAnyGetter
    val otherFields: Map<String, Any> = hashMapOf()  // Flexible for unknown providers
)
```

## 3.2 Jellysweep Filter Architecture

### Filter Chain Pattern

```go
type Filterer interface {
    String() string  // Filter name for logging
    Apply(ctx context.Context, items []MediaItem) ([]MediaItem, error)
}

type Filter struct {
    filters []Filterer
}

func (f *Filter) Apply(ctx context.Context, items []MediaItem) ([]MediaItem, error) {
    for _, filter := range f.filters {
        items, err = filter.Apply(ctx, items)
        if err != nil {
            return nil, err
        }
    }
    return items, nil
}
```

### Available Filters

| Filter            | Purpose                 | Relevance to Maintainerr |
| ----------------- | ----------------------- | ------------------------ |
| `database_filter` | Skip items in DB        | Similar to exclusions    |
| `series_filter`   | Filter by series status | Show-level rules         |
| `tags_filter`     | Filter by Jellyfin tags | Label-equivalent rules   |
| `size_filter`     | Filter by file size     | File property rules      |
| `age_filter`      | Filter by age/dates     | Date-based rules         |
| `stream_filter`   | Filter by watch history | **Key for watch rules**  |
| `tunarr_filter`   | Filter items in Tunarr  | External integration     |

### Stream Filter Implementation (Watch History)

```go
func (f *Filter) Apply(ctx context.Context, mediaItems []MediaItem) ([]MediaItem, error) {
    filteredItems := make([]MediaItem, 0)

    for _, item := range mediaItems {
        // Uses external stats service (Jellystat or Streamystats)
        lastStreamed, err := f.stats.GetItemLastPlayed(ctx, item.JellyfinID)
        if err != nil {
            if errors.Is(err, ErrItemNotFound) {
                continue  // No watch data = exclude
            }
            return nil, err
        }

        if lastStreamed.IsZero() {
            filteredItems = append(filteredItems, item)  // Never watched = include
            continue
        }

        // Check against threshold
        threshold := libraryConfig.GetLastStreamThreshold()
        if time.Since(lastStreamed) > time.Duration(threshold)*24*time.Hour {
            filteredItems = append(filteredItems, item)  // Old enough = include
        }
    }
    return filteredItems, nil
}
```

**Key Insight:** Jellysweep delegates watch history to external services (Jellystat/Streamystats), avoiding the N×M API call problem.

## 3.3 Comparative Analysis Summary

### Feature Support Matrix

| Feature                  | Maintainerr (Plex) | Janitorr           | Jellysweep        |
| ------------------------ | ------------------ | ------------------ | ----------------- |
| Media server abstraction | ❌ Direct          | ✅ Interface       | ✅ Client         |
| Watch history source     | Plex API           | Jellyfin API       | External stats    |
| User iteration           | N/A (central)      | Per-user favorites | Via stats service |
| Collection management    | Full               | Create only        | None              |
| Collection visibility    | ✅ API             | N/A (library only) | N/A               |
| Rule engine              | Complex (33 props) | Simple (favorites) | Filter chain      |
| \*arr integration        | Radarr, Sonarr     | Both               | Both              |
| Overseerr/Jellyseerr     | Both               | Jellyseerr         | Jellyseerr        |

### Watch History Approaches Comparison

| Approach                       | Pros                       | Cons                     |
| ------------------------------ | -------------------------- | ------------------------ |
| **Plex API (current)**         | Single call, complete data | Plex-only                |
| **Jellyfin User Iteration**    | Native, no external deps   | O(users × items), slow   |
| **External Stats (Jellystat)** | Centralized, fast          | Extra service dependency |
| **Tautulli Integration**       | Works for both             | Already supported        |
| **Batch + Cache**              | Compromise                 | Stale data risk          |

### Recommended Approach for Maintainerr

1. **Primary:** Batch queries with caching (similar to Janitorr favorites)
2. **Optional:** Jellystat integration for high-performance watch queries
3. **Fallback:** Direct per-user iteration with rate limiting

---

# PHASE 4: Consolidated Implementation Plan

**Status:** ✅ Complete

## 4.1 Architecture Decision: Abstraction Strategy

### Current Architecture (Plex-Only)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    MAINTAINERR                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐                        │
│  │   Collections   │   │     Rules       │   │    Settings     │                        │
│  │    Service      │   │    Service      │   │    Service      │                        │
│  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘                        │
│           │                     │                     │                                  │
│           │            ┌────────┴────────┐            │                                  │
│           │            │  PlexGetter     │            │                                  │
│           │            │  Service        │            │                                  │
│           │            └────────┬────────┘            │                                  │
│           │                     │                     │                                  │
│           └──────────┬──────────┴──────────┬─────────┘                                  │
│                      │                     │                                             │
│                      ▼                     ▼                                             │
│           ┌──────────────────────────────────────────┐                                  │
│           │           PlexApiService                 │                                  │
│           │  ┌─────────────────────────────────────┐ │                                  │
│           │  │ • 34 public methods                 │ │                                  │
│           │  │ • Plex-specific types throughout    │ │                                  │
│           │  │ • Direct axios calls to Plex        │ │                                  │
│           │  └─────────────────────────────────────┘ │                                  │
│           └──────────────────┬───────────────────────┘                                  │
│                              │                                                           │
└──────────────────────────────┼───────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     Plex Server      │
                    │   (HTTP/REST API)    │
                    └──────────────────────┘
```

### Target Architecture (Multi-Server Support)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    MAINTAINERR                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐                        │
│  │   Collections   │   │     Rules       │   │    Settings     │                        │
│  │    Service      │   │    Service      │   │    Service      │                        │
│  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘                        │
│           │                     │                     │                                  │
│           │            ┌────────┴────────┐            │                                  │
│           │            │  MediaGetter    │◄───────────┤  Uses neutral types:            │
│           │            │  Service        │            │  • MediaItem                    │
│           │            └────────┬────────┘            │  • MediaLibrary                 │
│           │                     │                     │  • EMediaDataType               │
│           └──────────┬──────────┴──────────┬─────────┘                                  │
│                      │                     │                                             │
│                      ▼                     ▼                                             │
│           ┌──────────────────────────────────────────┐                                  │
│           │        IMediaServerService               │ ◄── Abstract Interface           │
│           │  ┌─────────────────────────────────────┐ │                                  │
│           │  │ • getLibraries()                    │ │                                  │
│           │  │ • getLibraryContents()              │ │                                  │
│           │  │ • getWatchHistory()                 │ │                                  │
│           │  │ • getCollections()                  │ │                                  │
│           │  │ • supportsFeature()                 │ │                                  │
│           │  └─────────────────────────────────────┘ │                                  │
│           └──────────────────┬───────────────────────┘                                  │
│                              │                                                           │
│              ┌───────────────┼───────────────┐                                          │
│              │               │               │                                          │
│              ▼               │               ▼                                          │
│  ┌───────────────────┐      │    ┌───────────────────┐                                 │
│  │  PlexAdapter      │      │    │  JellyfinAdapter  │                                 │
│  │  Service          │      │    │  Service          │                                 │
│  ├───────────────────┤      │    ├───────────────────┤                                 │
│  │ • PlexMapper      │      │    │ • JellyfinMapper  │                                 │
│  │ • PlexApiService  │      │    │ • @jellyfin/sdk   │                                 │
│  └─────────┬─────────┘      │    └─────────┬─────────┘                                 │
│            │                │              │                                            │
└────────────┼────────────────┼──────────────┼────────────────────────────────────────────┘
             │                │              │
             ▼                │              ▼
  ┌──────────────────┐       │    ┌──────────────────┐
  │   Plex Server    │       │    │ Jellyfin Server  │
  └──────────────────┘       │    └──────────────────┘
                             │
                    ┌────────┴────────┐
                    │ MediaServer     │
                    │ Factory         │
                    │ (runtime select)│
                    └─────────────────┘
```

### Service Factory Pattern

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                          MediaServerFactory                                              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │  getService(settings: Settings): IMediaServerService                             │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                               │
│                                          ▼                                               │
│                            ┌─────────────────────────┐                                  │
│                            │ settings.media_server_  │                                  │
│                            │ type === ?              │                                  │
│                            └─────────────────────────┘                                  │
│                                          │                                               │
│                    ┌─────────────────────┼─────────────────────┐                        │
│                    │                     │                     │                        │
│                    ▼                     ▼                     ▼                        │
│          ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐               │
│          │    'plex'       │   │   'jellyfin'    │   │    (future)     │               │
│          │                 │   │                 │   │    'emby'       │               │
│          └────────┬────────┘   └────────┬────────┘   └────────┬────────┘               │
│                   │                     │                     │                         │
│                   ▼                     ▼                     ▼                         │
│          ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐               │
│          │ PlexAdapter     │   │ JellyfinAdapter │   │ EmbyAdapter     │               │
│          │ Service         │   │ Service         │   │ Service         │               │
│          │ implements      │   │ implements      │   │ implements      │               │
│          │ IMediaServer    │   │ IMediaServer    │   │ IMediaServer    │               │
│          └─────────────────┘   └─────────────────┘   └─────────────────┘               │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Rule Evaluation

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           RULE EVALUATION DATA FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   1. Collection Creation                                                                 │
│   ─────────────────────                                                                 │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐                         │
│   │   User UI    │ ───▶ │  Collection  │ ───▶ │ MediaServer  │                         │
│   │  (settings)  │      │   Service    │      │   Factory    │                         │
│   └──────────────┘      └──────────────┘      └──────┬───────┘                         │
│                                                       │                                  │
│                                                       ▼                                  │
│                                               ┌──────────────┐                          │
│                                               │ IMediaServer │                          │
│                                               │ .createColl..│                          │
│                                               └──────────────┘                          │
│                                                                                          │
│   2. Rule Execution (Scheduled)                                                         │
│   ─────────────────────────────                                                         │
│                                                                                          │
│   ┌──────────────┐                                                                      │
│   │  Scheduler   │                                                                      │
│   │  (cron)      │                                                                      │
│   └──────┬───────┘                                                                      │
│          │                                                                               │
│          ▼                                                                               │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐                         │
│   │    Rule      │ ───▶ │   Getter     │ ───▶ │ MediaServer  │                         │
│   │  Executor    │      │   Service    │      │   Service    │                         │
│   └──────────────┘      └──────┬───────┘      └──────────────┘                         │
│                                │                                                         │
│                                ▼                                                         │
│                 ┌─────────────────────────────────┐                                     │
│                 │   Select Getter by Application  │                                     │
│                 └─────────────────────────────────┘                                     │
│                                │                                                         │
│          ┌─────────────────────┼─────────────────────┐                                  │
│          │                     │                     │                                  │
│          ▼                     ▼                     ▼                                  │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐                         │
│   │ MediaGetter  │      │ RadarrGetter │      │ SonarrGetter │                         │
│   │ (Plex/JF)    │      │              │      │              │                         │
│   └──────────────┘      └──────────────┘      └──────────────┘                         │
│                                                                                          │
│   3. Property Resolution                                                                │
│   ──────────────────────                                                                │
│                                                                                          │
│   ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│   │  MediaGetter.get(property, item)                                                  │  │
│   └──────────────────────────────────────────────────────────────────────────────────┘  │
│                                          │                                               │
│                    ┌─────────────────────┼─────────────────────┐                        │
│                    │                     │                     │                        │
│                    ▼                     ▼                     ▼                        │
│          ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐               │
│          │  'seenBy'       │   │  'addDate'      │   │  'rating'       │               │
│          │  ───────────────│   │  ─────────────  │   │  ────────────── │               │
│          │  Call           │   │  Item field     │   │  Item field     │               │
│          │  getWatchHist() │   │  DateCreated    │   │  CommunityRating│               │
│          └─────────────────┘   └─────────────────┘   └─────────────────┘               │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Type System Migration

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                            TYPE SYSTEM TRANSFORMATION                                    │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   BEFORE (Plex-Specific)                    AFTER (Media-Server Neutral)                │
│   ──────────────────────                    ────────────────────────────                │
│                                                                                          │
│   ┌─────────────────────┐                   ┌─────────────────────┐                     │
│   │   EPlexDataType     │                   │   EMediaDataType    │                     │
│   ├─────────────────────┤      ───────▶     ├─────────────────────┤                     │
│   │ MOVIES = 1          │                   │ MOVIE = 'movie'     │                     │
│   │ SHOWS = 2           │                   │ SHOW = 'show'       │                     │
│   │ SEASONS = 3         │                   │ SEASON = 'season'   │                     │
│   │ EPISODES = 4        │                   │ EPISODE = 'episode' │                     │
│   └─────────────────────┘                   └─────────────────────┘                     │
│                                                                                          │
│   ┌─────────────────────┐                   ┌─────────────────────┐                     │
│   │   PlexLibraryItem   │                   │     MediaItem       │                     │
│   ├─────────────────────┤      ───────▶     ├─────────────────────┤                     │
│   │ ratingKey: string   │                   │ id: string          │                     │
│   │ title: string       │                   │ title: string       │                     │
│   │ type: string        │                   │ type: EMediaDataType│                     │
│   │ year: number        │                   │ year: number        │                     │
│   │ summary: string     │                   │ overview: string    │                     │
│   │ Guid: PlexGuid[]    │                   │ providerIds: {...}  │                     │
│   │ addedAt: number     │                   │ addedAt: Date       │                     │
│   │ viewCount: number   │                   │ (via WatchRecord)   │                     │
│   └─────────────────────┘                   └─────────────────────┘                     │
│                                                                                          │
│   ┌─────────────────────┐                   ┌─────────────────────┐                     │
│   │   plexId (field)    │                   │  mediaServerId      │                     │
│   ├─────────────────────┤      ───────▶     ├─────────────────────┤                     │
│   │ 215 occurrences     │                   │ Same field, new name│                     │
│   │ in DTOs, entities   │                   │ DB migration needed │                     │
│   └─────────────────────┘                   └─────────────────────┘                     │
│                                                                                          │
│   MIGRATION APPROACH:                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │ 1. Create new neutral types alongside existing                                   │   │
│   │ 2. Add type aliases: type EPlexDataType = EMediaDataType (temporary)            │   │
│   │ 3. Update mappers to convert both directions                                     │   │
│   │ 4. Gradually update consumers to use neutral types                              │   │
│   │ 5. Remove aliases when migration complete                                        │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Watch History: Plex vs Jellyfin

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        WATCH HISTORY IMPLEMENTATION COMPARISON                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   PLEX (Current - Single Query)                                                         │
│   ─────────────────────────────                                                         │
│                                                                                          │
│   ┌──────────────┐     GET /status/sessions/history/all?metadataItemID=123              │
│   │  Maintainerr │ ────────────────────────────────────────────────────────▶            │
│   └──────────────┘                                                                      │
│                                                                                          │
│   ┌──────────────┐     Returns: [                                                       │
│   │ Plex Server  │       { accountID: 1, viewedAt: 1703..., title: "..." },            │
│   │              │ ◀──  { accountID: 2, viewedAt: 1703..., title: "..." },             │
│   └──────────────┘       { accountID: 1, viewedAt: 1702..., title: "..." }             │
│                        ]                                                                 │
│                                                                                          │
│   Complexity: O(1) API calls                                                            │
│                                                                                          │
│   ───────────────────────────────────────────────────────────────────────────────────   │
│                                                                                          │
│   JELLYFIN (Required - Per-User Queries)                                                │
│   ──────────────────────────────────────                                                │
│                                                                                          │
│   ┌──────────────┐     GET /Users                                                       │
│   │  Maintainerr │ ────────────────────────────────────────────────────────▶            │
│   └──────────────┘                                                                      │
│         │                                                                                │
│         │              Returns: [User1, User2, User3, ...]                              │
│         │                                                                                │
│         │         FOR EACH user:                                                        │
│         │         ┌──────────────────────────────────────────────────────────┐          │
│         │         │                                                          │          │
│         ├────────▶│  GET /Items?userId={user.id}&ids=123&enableUserData=true │          │
│         │         │                                                          │          │
│         │         └──────────────────────────────────────────────────────────┘          │
│         │                           │                                                    │
│         │                           ▼                                                    │
│         │              ┌─────────────────────────┐                                      │
│         │              │ Check: item.UserData    │                                      │
│         │              │        .Played === true │                                      │
│         │              └─────────────────────────┘                                      │
│         │                           │                                                    │
│         │              YES ─────────┴───────── NO                                       │
│         │               │                      │                                         │
│         │               ▼                      ▼                                         │
│         │         Add to results         Skip user                                      │
│         │                                                                                │
│         └──────── REPEAT for each user ──────────                                       │
│                                                                                          │
│   Complexity: O(N) API calls where N = number of users                                  │
│                                                                                          │
│   ───────────────────────────────────────────────────────────────────────────────────   │
│                                                                                          │
│   JELLYFIN OPTIMIZED (Batch + Cache)                                                    │
│   ──────────────────────────────────                                                    │
│                                                                                          │
│   ┌──────────────┐     GET /Items?userId=X&filters=IsPlayed&parentId=LibraryY           │
│   │  Maintainerr │ ────────────────────────────────────────────────────────▶            │
│   └──────────────┘                                                                      │
│         │                                                                                │
│         │              Returns: ALL watched items for user X in library Y               │
│         │                                                                                │
│         ├──────────▶  Build map: { itemId: [userIds...] }                               │
│         │                                                                                │
│         │              Cache with TTL (e.g., 5 minutes)                                 │
│         │                                                                                │
│         └──────────▶  Lookup from cache for rule evaluation                             │
│                                                                                          │
│   Complexity: O(users) API calls per library (once per cache period)                    │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Module Structure

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              NEW MODULE STRUCTURE                                        │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   apps/server/src/modules/api/                                                          │
│   │                                                                                      │
│   ├── plex-api/                           (EXISTING - keep for backwards compat)        │
│   │   ├── plex-api.module.ts                                                            │
│   │   ├── plex-api.service.ts             ◄── 34 methods, 1049 lines                   │
│   │   └── plex-api.controller.ts                                                        │
│   │                                                                                      │
│   └── media-server/                       (NEW - abstraction layer)                     │
│       │                                                                                  │
│       ├── media-server.module.ts          ◄── NestJS module with providers             │
│       │   │                                                                              │
│       │   └── providers:                                                                │
│       │       ├── MediaServerFactory                                                    │
│       │       ├── PlexAdapterService                                                    │
│       │       └── JellyfinAdapterService                                                │
│       │                                                                                  │
│       ├── interfaces/                                                                   │
│       │   ├── media-server.interface.ts   ◄── IMediaServerService                      │
│       │   └── media-server.types.ts       ◄── MediaItem, MediaLibrary, etc.            │
│       │                                                                                  │
│       ├── media-server.factory.ts         ◄── Runtime service selection                │
│       │                                                                                  │
│       ├── plex/                                                                         │
│       │   ├── plex-adapter.service.ts     ◄── implements IMediaServerService           │
│       │   └── plex.mapper.ts              ◄── PlexLibraryItem ↔ MediaItem              │
│       │                                                                                  │
│       └── jellyfin/                                                                     │
│           ├── jellyfin-adapter.service.ts ◄── implements IMediaServerService           │
│           ├── jellyfin.mapper.ts          ◄── BaseItemDto ↔ MediaItem                  │
│           └── jellyfin-sdk.provider.ts    ◄── @jellyfin/sdk setup                      │
│                                                                                          │
│   packages/contracts/src/                                                               │
│   │                                                                                      │
│   ├── plex/                               (EXISTING - will be deprecated)               │
│   │   └── types.ts                        ◄── EPlexDataType (keep as alias)            │
│   │                                                                                      │
│   └── media-server/                       (NEW)                                         │
│       ├── enums.ts                        ◄── EMediaDataType                           │
│       ├── types.ts                        ◄── MediaItem, MediaLibrary, etc.            │
│       └── index.ts                        ◄── Re-exports                               │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended: Adapter Pattern with Feature Flags

```typescript
// Core abstraction for media server operations
interface IMediaServerService {
  // Lifecycle
  initialize(): Promise<void>;
  isSetup(): boolean;
  getServerType(): "plex" | "jellyfin";

  // Feature detection
  supportsFeature(feature: MediaServerFeature): boolean;

  // Core operations (both servers)
  getStatus(): Promise<ServerStatus>;
  getUsers(): Promise<MediaUser[]>;
  getLibraries(): Promise<MediaLibrary[]>;
  getLibraryContents(
    libraryId: string,
    options?: QueryOptions
  ): Promise<PagedResult<MediaItem>>;
  getMetadata(itemId: string): Promise<MediaItem>;
  getChildrenMetadata(parentId: string): Promise<MediaItem[]>;
  searchContent(query: string, libraryId?: string): Promise<MediaItem[]>;

  // Watch history (implementation varies)
  getWatchHistory(itemId: string): Promise<WatchRecord[]>;
  getItemSeenBy(itemId: string): Promise<string[]>; // User IDs who watched

  // Collections
  getCollections(libraryId: string): Promise<MediaCollection[]>;
  getCollection(collectionId: string): Promise<MediaCollection>;
  createCollection(params: CreateCollectionParams): Promise<MediaCollection>;
  deleteCollection(collectionId: string): Promise<void>;
  addToCollection(collectionId: string, itemId: string): Promise<void>;
  removeFromCollection(collectionId: string, itemId: string): Promise<void>;

  // Plex-only (returns null/empty for Jellyfin)
  updateCollectionVisibility?(
    collectionId: string,
    settings: VisibilitySettings
  ): Promise<void>;
  getWatchlistForUser?(userId: string): Promise<string[]>;

  // Actions
  deleteFromDisk(itemId: string): Promise<void>;
}

enum MediaServerFeature {
  COLLECTION_VISIBILITY = "collection_visibility",
  WATCHLIST = "watchlist",
  CENTRAL_WATCH_HISTORY = "central_watch_history",
  LABELS = "labels",
  PLAYLISTS = "playlists",
}
```

## 4.2 Implementation Roadmap

### Phase A: Foundation (Week 1-2)

**Goal:** Create abstraction layer without breaking existing Plex functionality

#### A.1: New Module Structure

```
apps/server/src/modules/api/media-server/
├── media-server.module.ts
├── media-server.interface.ts      # IMediaServerService
├── media-server.types.ts          # Neutral types
├── media-server.factory.ts        # Runtime selection
├── media-server.constants.ts      # Feature flags
├── plex/
│   ├── plex-adapter.service.ts    # Wraps existing PlexApiService
│   └── plex.mapper.ts             # Plex → Neutral types
└── jellyfin/
    ├── jellyfin.service.ts        # New implementation
    └── jellyfin.mapper.ts         # Jellyfin → Neutral types
```

#### A.2: Database Migration

```typescript
// New columns in settings entity
@Column({ default: 'plex' })
media_server_type: 'plex' | 'jellyfin';

@Column({ nullable: true })
jellyfin_url: string;

@Column({ nullable: true })
jellyfin_api_key: string;

@Column({ nullable: true })
jellyfin_user_id: string;

@Column({ nullable: true })
jellyfin_device_id: string;
```

#### A.3: PlexAdapter Implementation

```typescript
// Wrap existing service to implement interface
@Injectable()
export class PlexAdapterService implements IMediaServerService {
  constructor(private readonly plexApi: PlexApiService) {}

  getServerType() {
    return "plex";
  }

  supportsFeature(feature: MediaServerFeature): boolean {
    return true; // Plex supports all current features
  }

  async getLibraries(): Promise<MediaLibrary[]> {
    const plexLibraries = await this.plexApi.getLibraries();
    return plexLibraries.map(PlexMapper.toMediaLibrary);
  }

  // ... wrap all methods
}
```

### Phase B: Jellyfin Service (Week 2-3)

**Goal:** Implement JellyfinService with full API coverage

#### B.1: SDK Integration

```typescript
import { Jellyfin } from "@jellyfin/sdk";
import {
  getItemsApi,
  getLibraryApi,
  getUserApi,
  getCollectionApi,
} from "@jellyfin/sdk/lib/utils/api";

@Injectable()
export class JellyfinService implements IMediaServerService {
  private jellyfin: Jellyfin;
  private api: Api;
  private initialized = false;

  async initialize(): Promise<void> {
    const settings = await this.settingsService.getSettings();

    this.jellyfin = new Jellyfin({
      clientInfo: {
        name: "Maintainerr",
        version: this.configService.get("VERSION"),
      },
      deviceInfo: {
        name: "Maintainerr-Server",
        id: settings.jellyfin_device_id,
      },
    });

    this.api = this.jellyfin.createApi(settings.jellyfin_url);

    // Authenticate with API key
    this.api.accessToken = settings.jellyfin_api_key;

    this.initialized = true;
  }

  supportsFeature(feature: MediaServerFeature): boolean {
    switch (feature) {
      case MediaServerFeature.COLLECTION_VISIBILITY:
      case MediaServerFeature.WATCHLIST:
        return false;
      default:
        return true;
    }
  }
}
```

#### B.2: Watch History Implementation

```typescript
// Option 1: Batch per-user (recommended for moderate user counts)
async getWatchHistory(itemId: string): Promise<WatchRecord[]> {
  const users = await this.getUsers();
  const records: WatchRecord[] = [];

  // Batch query: get item data for all users in parallel (limited)
  const batchSize = 5;
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(user => this.getItemUserData(itemId, user.id))
    );

    results.forEach((data, idx) => {
      if (data?.Played) {
        records.push({
          userId: batch[idx].id,
          userName: batch[idx].name,
          playCount: data.PlayCount || 0,
          lastPlayedDate: data.LastPlayedDate ? new Date(data.LastPlayedDate) : undefined
        });
      }
    });
  }

  return records;
}

// Option 2: Pre-cache all watched items per library (for large libraries)
private watchedCache = new Map<string, Map<string, string[]>>(); // libraryId → itemId → userIds

async buildWatchedCache(libraryId: string): Promise<void> {
  const users = await this.getUsers();
  const cache = new Map<string, string[]>();

  for (const user of users) {
    const watchedItems = await getItemsApi(this.api).getItems({
      userId: user.id,
      parentId: libraryId,
      recursive: true,
      filters: [ItemFilter.IsPlayed],
      fields: []  // Minimal data
    });

    for (const item of watchedItems.data.Items || []) {
      const existing = cache.get(item.Id!) || [];
      existing.push(user.id);
      cache.set(item.Id!, existing);
    }
  }

  this.watchedCache.set(libraryId, cache);
}

async getItemSeenBy(itemId: string, libraryId: string): Promise<string[]> {
  if (!this.watchedCache.has(libraryId)) {
    await this.buildWatchedCache(libraryId);
  }
  return this.watchedCache.get(libraryId)?.get(itemId) || [];
}
```

### Phase C: Rules Engine Integration (Week 3-4)

**Goal:** Support Jellyfin-specific property getters

#### C.1: JellyfinGetterService

```typescript
@Injectable()
export class JellyfinGetterService {
  constructor(
    private readonly jellyfinService: JellyfinService,
    private readonly cacheManager: Cache
  ) {}

  async get(
    property: RuleProperty,
    item: MediaItem
  ): Promise<RulePropertyValue> {
    switch (property) {
      case RuleProperty.SEEN_BY:
        return this.getSeenBy(item);
      case RuleProperty.VIEW_COUNT:
        return this.getViewCount(item);
      case RuleProperty.LAST_VIEWED_AT:
        return this.getLastViewedAt(item);
      case RuleProperty.LABELS:
        return item.tags || []; // Jellyfin Tags = Plex Labels
      // ... other properties
    }
  }

  private async getSeenBy(item: MediaItem): Promise<string[]> {
    const cacheKey = `jellyfin:seenby:${item.id}`;
    const cached = await this.cacheManager.get<string[]>(cacheKey);
    if (cached) return cached;

    const watchHistory = await this.jellyfinService.getWatchHistory(item.id);
    const userIds = watchHistory.map((r) => r.userId);

    await this.cacheManager.set(cacheKey, userIds, 300); // 5 min TTL
    return userIds;
  }
}
```

#### C.2: Update Rules Constants

```typescript
// Add feature availability flags
export const RULE_PROPERTIES: Record<number, RulePropertyDefinition> = {
  [RuleProperty.SEEN_BY]: {
    id: 1,
    name: "seenBy",
    type: "user_list",
    availableFor: ["plex", "jellyfin"],
    jellyfinNote: "Requires user iteration, may be slower",
  },
  [RuleProperty.WATCHLIST_IS_LISTED]: {
    id: 28,
    name: "watchlist_isListedByUsers",
    type: "user_list",
    availableFor: ["plex"], // Plex-only
    jellyfinNote: "Not available - Jellyfin has no watchlist API",
  },
  // ...
};
```

### Phase D: Collection Handling (Week 4)

**Goal:** Handle Jellyfin collection limitations gracefully

#### D.1: Update CollectionsService

```typescript
async createCollection(params: CreateCollectionDto): Promise<Collection> {
  const mediaServer = this.mediaServerFactory.getService();

  // Create in media server
  const serverCollection = await mediaServer.createCollection({
    name: params.name,
    libraryId: params.libraryId,
    isLocked: true
  });

  // Handle visibility (Plex-only)
  if (mediaServer.supportsFeature(MediaServerFeature.COLLECTION_VISIBILITY)) {
    await mediaServer.updateCollectionVisibility(serverCollection.id, {
      visibleOnHome: params.visibleOnHome,
      visibleOnRecommended: params.visibleOnRecommended
    });
  } else {
    // Log that visibility settings won't apply
    this.logger.info(
      `Collection visibility settings ignored for ${mediaServer.getServerType()} ` +
      `(feature not supported)`
    );
  }

  // Save to database
  return this.collectionRepository.save({
    ...params,
    mediaServerId: serverCollection.id,
    mediaServerType: mediaServer.getServerType()
  });
}
```

### Phase E: UI Integration (Week 5)

**Goal:** Server selection and Jellyfin-specific UI

#### E.1: Settings Page Updates

```tsx
// JellyfinSettings.tsx
export const JellyfinSettings: React.FC = () => {
  const { register, handleSubmit, formState } = useForm<JellyfinSettingsForm>({
    resolver: zodResolver(jellyfinSettingsSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        label="Jellyfin URL"
        {...register("jellyfin_url")}
        placeholder="http://jellyfin.local:8096"
      />
      <Input
        label="API Key"
        type="password"
        {...register("jellyfin_api_key")}
      />
      <Alert type="info">
        Note: Collection visibility settings are not supported by Jellyfin.
        Collections will be created but won't appear on Home screens.
      </Alert>
      <Button type="submit" loading={formState.isSubmitting}>
        Save & Test Connection
      </Button>
    </form>
  );
};
```

#### E.2: Feature Availability Indicators

```tsx
// CollectionForm.tsx - Hide unsupported options
const mediaServerType = useMediaServerType();

return (
  <form>
    {/* ... other fields */}

    {mediaServerType === "plex" && (
      <>
        <Checkbox label="Visible on Home" {...register("visibleOnHome")} />
        <Checkbox
          label="Visible on Recommended"
          {...register("visibleOnRecommended")}
        />
      </>
    )}

    {mediaServerType === "jellyfin" && (
      <Alert type="warning">
        Collections in Jellyfin cannot be promoted to Home or Recommended
        screens.
      </Alert>
    )}
  </form>
);
```

## 4.3 Testing Strategy

### Unit Tests

```typescript
describe("JellyfinService", () => {
  describe("getWatchHistory", () => {
    it("should aggregate watch data across all users", async () => {
      // Mock users
      mockUserApi.getUsers.mockResolvedValue({
        data: [
          { Id: "user1", Name: "User One" },
          { Id: "user2", Name: "User Two" },
        ],
      });

      // Mock user data
      mockItemsApi.getItems.mockResolvedValueOnce({
        data: {
          Items: [{ Id: "item1", UserData: { Played: true, PlayCount: 3 } }],
        },
      });
      mockItemsApi.getItems.mockResolvedValueOnce({
        data: { Items: [{ Id: "item1", UserData: { Played: false } }] },
      });

      const result = await service.getWatchHistory("item1");

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe("user1");
      expect(result[0].playCount).toBe(3);
    });
  });

  describe("supportsFeature", () => {
    it("should return false for collection visibility", () => {
      expect(
        service.supportsFeature(MediaServerFeature.COLLECTION_VISIBILITY)
      ).toBe(false);
    });

    it("should return false for watchlist", () => {
      expect(service.supportsFeature(MediaServerFeature.WATCHLIST)).toBe(false);
    });

    it("should return true for playlists", () => {
      expect(service.supportsFeature(MediaServerFeature.PLAYLISTS)).toBe(true);
    });
  });
});
```

### Integration Tests

```typescript
describe("Jellyfin Integration", () => {
  // Use real Jellyfin test server or mock server
  beforeAll(async () => {
    await testModule.get(JellyfinService).initialize();
  });

  it("should connect to Jellyfin server", async () => {
    const status = await jellyfinService.getStatus();
    expect(status.serverName).toBeDefined();
    expect(status.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("should list libraries", async () => {
    const libraries = await jellyfinService.getLibraries();
    expect(libraries.length).toBeGreaterThan(0);
    expect(libraries[0]).toHaveProperty("id");
    expect(libraries[0]).toHaveProperty("name");
    expect(libraries[0]).toHaveProperty("type");
  });
});
```

## 4.4 Migration Path

### For Existing Plex Users

1. **No changes required** - Existing functionality preserved
2. Media server type defaults to 'plex'
3. All existing rules and collections continue working

### For New Jellyfin Users

1. Initial setup wizard detects no media server configured
2. User selects "Jellyfin" as media server type
3. Enters Jellyfin URL and API key
4. System validates connection and imports libraries
5. User informed about feature limitations (visibility, watchlist)

### For Users Migrating Plex → Jellyfin

1. Change media server type in settings
2. System warns about:
   - Collection visibility settings will be ignored
   - Watchlist rules will not work
   - User mapping may differ
3. Collections recreated in Jellyfin (manual process)
4. Rules re-evaluated against Jellyfin data

## 4.5 Known Limitations (Final)

| Feature               | Plex           | Jellyfin          | Workaround                 |
| --------------------- | -------------- | ----------------- | -------------------------- |
| Collection visibility | ✅ Full        | ❌ None           | Document limitation        |
| Watchlist rules       | ✅ Via Plex.tv | ❌ No API         | Remove from Jellyfin rules |
| Central watch history | ✅ Single call | ⚠️ User iteration | Cache + batch              |
| Labels                | ✅ Labels      | ⚠️ Tags           | Map Labels→Tags            |
| Multi-server          | ⚠️ Basic       | ⚠️ Basic          | Single server per instance |

## 4.6 Files to Create/Modify Summary

### New Files (18)

| File                                             | Purpose                                 |
| ------------------------------------------------ | --------------------------------------- |
| `media-server/media-server.module.ts`            | NestJS module                           |
| `media-server/media-server.interface.ts`         | IMediaServerService                     |
| `media-server/media-server.types.ts`             | Neutral types (MediaItem, MediaLibrary) |
| `media-server/media-server.factory.ts`           | Runtime factory                         |
| `media-server/media-server.constants.ts`         | Feature flags                           |
| `media-server/media-server.enums.ts`             | EMediaDataType (replaces EPlexDataType) |
| `media-server/plex/plex-adapter.service.ts`      | Plex wrapper                            |
| `media-server/plex/plex.mapper.ts`               | Type mapping                            |
| `media-server/jellyfin/jellyfin.service.ts`      | Jellyfin impl                           |
| `media-server/jellyfin/jellyfin.mapper.ts`       | Type mapping                            |
| `rules/getter/jellyfin-getter.service.ts`        | Rule properties                         |
| `database/migrations/xxx-jellyfin-support.ts`    | DB schema (mediaServerId)               |
| `database/migrations/xxx-rename-plexid.ts`       | Rename plexId → mediaServerId           |
| `ui/components/Settings/JellyfinSettings.tsx`    | Settings UI                             |
| `ui/components/Settings/MediaServerSelector.tsx` | Server picker                           |
| `contracts/settings/jellyfin.dto.ts`             | API DTOs                                |
| `contracts/media-server/types.ts`                | Shared types                            |
| `contracts/media-server/enums.ts`                | Shared enums                            |

### Modified Files (40+)

| File                           | Changes                                              |
| ------------------------------ | ---------------------------------------------------- |
| `app.module.ts`                | Import MediaServerModule                             |
| `settings.entities.ts`         | Add Jellyfin columns                                 |
| `collection.entities.ts`       | Rename plexId → mediaServerId, add media_server_type |
| `collection_media.entities.ts` | Rename plexId → mediaServerId                        |
| `collections.service.ts`       | Use IMediaServerService                              |
| `collection-handler.ts`        | Use factory                                          |
| `plex-getter.service.ts`       | Extract to adapter, use MediaItem                    |
| `rules.constants.ts`           | Add availability flags                               |
| `rule-executor.service.ts`     | Use factory, MediaItem                               |
| `settings.service.ts`          | Handle Jellyfin settings                             |
| `notifications.service.ts`     | Use interface                                        |
| `getter.service.ts`            | Dispatch to Jellyfin getter                          |
| `radarr-getter.service.ts`     | Use MediaItem                                        |
| `sonarr-getter.service.ts`     | Use MediaItem                                        |
| `overseerr-getter.service.ts`  | Use MediaItem                                        |
| `jellyseerr-getter.service.ts` | Use MediaItem                                        |
| `tautulli-getter.service.ts`   | Use MediaItem                                        |
| `media-id-finder.ts`           | Use mediaServerId                                    |
| `radarr-action-handler.ts`     | Use mediaServerId                                    |
| `sonarr-action-handler.ts`     | Use mediaServerId                                    |
| **+ 289 files**                | Update EPlexDataType → EMediaDataType (gradual)      |
| **+ 215 files**                | Update plexId references (gradual)                   |
| **+ 319 UI files**             | Update Plex-specific references                      |

### Database Migrations Required

1. **Add Jellyfin settings columns** - `media_server_type`, `jellyfin_url`, `jellyfin_api_key`, `jellyfin_user_id`
2. **Rename `plexId` to `mediaServerId`** - In `collection`, `collection_media` tables
3. **Add `media_server_type` column** - To `collection` table

### Type Alias Strategy (for gradual migration)

```typescript
// Phase 1: Create alias
export type EMediaDataType = EPlexDataType; // Alias during migration
export type MediaItem = PlexLibraryItem; // Alias during migration

// Phase 2: Replace references gradually
// Phase 3: Move types to contracts package
// Phase 4: Remove aliases
```

---

## Appendix A: Quick Reference

### Jellyfin SDK API Factories

```typescript
import {
  getItemsApi, // Items, queries, filtering
  getLibraryApi, // Libraries, deletion
  getUserApi, // Users, auth
  getCollectionApi, // Collections
  getPlaystateApi, // Mark played/unplayed
  getTvShowsApi, // TV-specific
  getPlaylistsApi, // Playlists
  getSearchApi, // Search
  getSystemApi, // Server info
} from "@jellyfin/sdk/lib/utils/api";
```

### Common Jellyfin Query Patterns

```typescript
// Get library items with pagination
const items = await getItemsApi(api).getItems({
  userId: userId,
  parentId: libraryId,
  recursive: true,
  startIndex: 0,
  limit: 100,
  fields: [ItemFields.ProviderIds, ItemFields.Path],
  includeItemTypes: [BaseItemKind.Movie, BaseItemKind.Series],
  enableUserData: true,
});

// Get watched items for user
const watched = await getItemsApi(api).getItems({
  userId: userId,
  filters: [ItemFilter.IsPlayed],
  recursive: true,
});

// Get collections in library
const collections = await getItemsApi(api).getItems({
  parentId: libraryId,
  includeItemTypes: [BaseItemKind.BoxSet],
});
```

---

_End of Master Implementation Plan - Version 4.3_

</details>
