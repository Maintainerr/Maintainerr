# Phase C: Rules Engine Integration

**Duration:** ~1 week  
**Goal:** Support Jellyfin-specific property getters in the rules engine

**Prerequisite:** Phase A & B complete

---

## C.1: Understanding Current Rules Architecture

Based on analysis of existing code:

```
apps/server/src/modules/rules/
├── getter/
│   ├── getter.service.ts           # Dispatcher - selects getter by application
│   ├── plex-getter.service.ts      # 43 properties (782 lines)
│   ├── radarr-getter.service.ts    # 22 properties
│   ├── sonarr-getter.service.ts    # 28 properties
│   ├── overseerr-getter.service.ts # 7 properties
│   ├── jellyseerr-getter.service.ts# 7 properties
│   └── tautulli-getter.service.ts  # 9 properties
├── constants/
│   └── rules.constants.ts          # Property definitions
└── tasks/
    └── rule-executor.service.ts    # Uses getters to evaluate rules
```

### Current Flow

1. `RuleExecutorService` loads collection rules
2. For each rule property, calls `GetterService.get(property, item)`
3. `GetterService` dispatches to appropriate getter (plex/radarr/sonarr/etc)
4. Getter returns property value for comparison

---

## C.2: Files to Create/Modify

### New Files

```
apps/server/src/modules/rules/getter/
├── media-server-getter.service.ts   # Dispatches to plex or jellyfin getter
└── jellyfin-getter.service.ts       # Jellyfin-specific properties
```

### Modified Files

```
apps/server/src/modules/rules/
├── getter/getter.service.ts         # Use media-server-getter
├── constants/rules.constants.ts     # Add availability flags
└── tasks/rule-executor.service.ts   # Use MediaServerFactory
```

---

## C.3: Media Server Getter Service

### `media-server-getter.service.ts`

Dispatches to correct getter based on configured media server:

```typescript
@Injectable()
export class MediaServerGetterService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly plexGetter: PlexGetterService,
    @Optional() private readonly jellyfinGetter: JellyfinGetterService,
  ) {}

  async get(
    property: RulesDto,
    item: MediaItem,
    collection: Collection,
  ): Promise<RulePropertyValue> {
    const settings = await this.settingsService.getSettings();
    
    if (settings.media_server_type === 'jellyfin') {
      if (!this.jellyfinGetter) {
        throw new Error('Jellyfin getter not available');
      }
      return this.jellyfinGetter.get(property, item, collection);
    }
    
    return this.plexGetter.get(property, item, collection);
  }
}
```

---

## C.4: Jellyfin Getter Service

### `jellyfin-getter.service.ts`

Implement all media-server properties for Jellyfin:

```typescript
@Injectable()
export class JellyfinGetterService {
  private readonly logger = new Logger(JellyfinGetterService.name);

  constructor(
    private readonly jellyfinService: JellyfinService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async get(
    property: RulesDto,
    item: MediaItem,
    collection: Collection,
  ): Promise<RulePropertyValue> {
    switch (property.id) {
      // === DATE PROPERTIES ===
      case RuleProperty.ADD_DATE:
        return this.getAddDate(item);
      case RuleProperty.RELEASE_DATE:
        return this.getReleaseDate(item);
      case RuleProperty.LAST_VIEWED_AT:
        return this.getLastViewedAt(item);
        
      // === USER LIST PROPERTIES ===
      case RuleProperty.SEEN_BY:
        return this.getSeenBy(item, collection);
      case RuleProperty.SW_ALL_EPISODES_SEEN_BY:
        return this.getAllEpisodesSeenBy(item, collection);
      case RuleProperty.SW_WATCHERS:
        return this.getWatchers(item, collection);
        
      // === NUMERIC PROPERTIES ===
      case RuleProperty.VIEW_COUNT:
        return this.getViewCount(item);
      case RuleProperty.COLLECTIONS:
        return this.getCollectionCount(item);
      case RuleProperty.RATING_USER:
        return this.getUserRating(item);
      case RuleProperty.RATING_CRITICS:
        return item.criticRating || null;
      case RuleProperty.RATING_AUDIENCE:
        return item.communityRating || null;
        
      // === SHOW-SPECIFIC PROPERTIES ===
      case RuleProperty.SW_EPISODES:
        return this.getEpisodeCount(item);
      case RuleProperty.SW_VIEWED_EPISODES:
        return this.getViewedEpisodeCount(item, collection);
        
      // === LIST PROPERTIES ===
      case RuleProperty.PEOPLE:
        return item.people?.map(p => p.name) || [];
      case RuleProperty.GENRE:
        return item.genres || [];
      case RuleProperty.LABELS:
        return item.tags || []; // Jellyfin Tags = Plex Labels
      case RuleProperty.COLLECTION_NAMES:
        return this.getCollectionNames(item);
        
      // === TEXT PROPERTIES ===
      case RuleProperty.FILE_VIDEO_RESOLUTION:
        return this.getVideoResolution(item);
      case RuleProperty.FILE_BITRATE:
        return this.getBitrate(item);
      case RuleProperty.FILE_VIDEO_CODEC:
        return this.getVideoCodec(item);
        
      // === UNSUPPORTED (PLEX-ONLY) ===
      case RuleProperty.WATCHLIST_IS_WATCHLISTED:
      case RuleProperty.WATCHLIST_IS_LISTED_BY_USERS:
        this.logger.warn(
          `Property ${property.id} (${property.name}) is not supported for Jellyfin`
        );
        return null;
        
      default:
        this.logger.warn(`Unknown property: ${property.id}`);
        return null;
    }
  }

  // === IMPLEMENTATION METHODS ===

  private getAddDate(item: MediaItem): Date | null {
    return item.addedAt || null;
  }

  private getReleaseDate(item: MediaItem): Date | null {
    // Jellyfin PremiereDate is ISO string in the source
    return item.premiereDate || null;
  }

  private async getLastViewedAt(item: MediaItem): Promise<Date | null> {
    const watchHistory = await this.jellyfinService.getWatchHistory(item.id);
    if (!watchHistory.length) return null;
    
    // Get most recent play date across all users
    const dates = watchHistory
      .map(r => r.lastPlayedDate)
      .filter((d): d is Date => d !== undefined);
    
    return dates.length > 0 
      ? new Date(Math.max(...dates.map(d => d.getTime())))
      : null;
  }

  private async getSeenBy(item: MediaItem, collection: Collection): Promise<string[]> {
    const watchHistory = await this.jellyfinService.getWatchHistory(item.id);
    
    // Map user IDs to usernames for comparison
    const users = await this.jellyfinService.getUsers();
    const userMap = new Map(users.map(u => [u.id, u.name]));
    
    return watchHistory.map(r => userMap.get(r.userId) || r.userId);
  }

  private async getViewCount(item: MediaItem): Promise<number> {
    const watchHistory = await this.jellyfinService.getWatchHistory(item.id);
    return watchHistory.reduce((sum, r) => sum + r.playCount, 0);
  }

  private async getAllEpisodesSeenBy(
    item: MediaItem,
    collection: Collection,
  ): Promise<string[]> {
    // For shows: get all episodes and find users who've seen ALL
    if (item.type !== EMediaDataType.SHOW) {
      return [];
    }

    const episodes = await this.jellyfinService.getChildrenMetadata(item.id);
    if (!episodes.length) return [];

    // Get watch history for all episodes
    const episodeWatchers = await Promise.all(
      episodes.map(ep => this.jellyfinService.getItemSeenBy(ep.id))
    );

    // Find users who appear in ALL episode watch lists
    const allUserIds = new Set(episodeWatchers.flat());
    const usersWhoWatchedAll = [...allUserIds].filter(userId =>
      episodeWatchers.every(watchers => watchers.includes(userId))
    );

    // Map to usernames
    const users = await this.jellyfinService.getUsers();
    const userMap = new Map(users.map(u => [u.id, u.name]));
    
    return usersWhoWatchedAll.map(id => userMap.get(id) || id);
  }

  private async getWatchers(item: MediaItem, collection: Collection): Promise<string[]> {
    // Same as seenBy for Jellyfin (distinct users who have watched)
    return this.getSeenBy(item, collection);
  }

  private async getEpisodeCount(item: MediaItem): Promise<number> {
    if (item.type !== EMediaDataType.SHOW) return 0;
    
    // Jellyfin includes episode count in ChildCount for seasons
    // For shows, we need to sum up all season episode counts
    const seasons = await this.jellyfinService.getChildrenMetadata(item.id);
    return seasons.reduce((sum, season) => sum + (season.childCount || 0), 0);
  }

  private async getViewedEpisodeCount(
    item: MediaItem,
    collection: Collection,
  ): Promise<number> {
    if (item.type !== EMediaDataType.SHOW) return 0;

    const episodes = await this.jellyfinService.getChildrenMetadata(item.id);
    let viewedCount = 0;

    for (const episode of episodes) {
      const seenBy = await this.jellyfinService.getItemSeenBy(episode.id);
      if (seenBy.length > 0) viewedCount++;
    }

    return viewedCount;
  }

  private async getCollectionNames(item: MediaItem): Promise<string[]> {
    // Get all collections this item belongs to
    const cacheKey = `jellyfin:item:collections:${item.id}`;
    const cached = await this.cacheManager.get<string[]>(cacheKey);
    if (cached) return cached;

    // Jellyfin doesn't have a direct "collections containing item" API
    // We need to check each collection in the library
    const libraries = await this.jellyfinService.getLibraries();
    const collectionNames: string[] = [];

    for (const library of libraries) {
      const collections = await this.jellyfinService.getCollections(library.id);
      
      for (const collection of collections) {
        const children = await this.jellyfinService.getCollectionChildren(collection.id);
        if (children.some(child => child.id === item.id)) {
          collectionNames.push(collection.name);
        }
      }
    }

    await this.cacheManager.set(cacheKey, collectionNames, 600000);
    return collectionNames;
  }

  private getVideoResolution(item: MediaItem): string | null {
    const source = item.mediaSources?.[0];
    return source?.videoResolution || null;
  }

  private getBitrate(item: MediaItem): number | null {
    const source = item.mediaSources?.[0];
    return source?.bitrate || null;
  }

  private getVideoCodec(item: MediaItem): string | null {
    const source = item.mediaSources?.[0];
    return source?.videoCodec || null;
  }

  private async getUserRating(item: MediaItem): Promise<number | null> {
    // Jellyfin stores user ratings per-user
    // Return the average or null if none
    return null; // TODO: Implement if needed
  }

  private async getCollectionCount(item: MediaItem): Promise<number> {
    const names = await this.getCollectionNames(item);
    return names.length;
  }
}
```

---

## C.5: Update Rules Constants

### Modify `rules.constants.ts`

Add `jellyfin` as a new application alongside existing applications (plex, radarr, sonarr, etc.):

```typescript
// Add jellyfin to the applications enum/list
export const RuleApplications = {
  PLEX: 'plex',
  JELLYFIN: 'jellyfin',  // NEW - mirrors plex properties
  RADARR: 'radarr',
  SONARR: 'sonarr',
  OVERSEERR: 'overseerr',
  JELLYSEERR: 'jellyseerr',
  TAUTULLI: 'tautulli',
} as const;

// Properties that work for jellyfin use application: 'jellyfin'
// Properties that are plex-only remain application: 'plex'
```

The existing pattern of selecting getter by application already works - just add `jellyfin` as a valid application value.

---

## C.6: Update Getter Service Dispatcher

### Modify `getter.service.ts`

Add `jellyfin` case to dispatch to JellyfinGetterService:

```typescript
@Injectable()
export class GetterService {
  constructor(
    private readonly plexGetter: PlexGetterService,
    private readonly jellyfinGetter: JellyfinGetterService,  // NEW
    private readonly radarrGetter: RadarrGetterService,
    private readonly sonarrGetter: SonarrGetterService,
    // ... other getters
  ) {}

  async get(
    property: RulesDto,
    item: MediaItem,
    collection: Collection,
  ): Promise<RulePropertyValue> {
    // Determine which getter based on property application
    switch (property.application) {
      case 'plex':
        return this.plexGetter.get(property, item, collection);
      case 'jellyfin':  // NEW - uses JellyfinGetterService
        return this.jellyfinGetter.get(property, item, collection);
      case 'radarr':
        return this.radarrGetter.get(property, item, collection);
      case 'sonarr':
        return this.sonarrGetter.get(property, item, collection);
      // ... other applications
    }
  }
}
```

---

## C.7: Property Application Assignment

Properties are assigned to either `plex` or `jellyfin` application based on media server type:

- Plex users see properties with `application: 'plex'`
- Jellyfin users see properties with `application: 'jellyfin'`
- Plex-only features (watchlist) simply don't have a jellyfin equivalent

The rule builder will only show properties for the configured media server type.

---

## C.8: Testing Requirements

### Unit Tests

1. **JellyfinGetterService tests**
   - Test each property getter
   - Test unsupported property handling
   - Test caching behavior

2. **MediaServerGetterService tests**
   - Test correct getter selection
   - Test fallback behavior

3. **Integration tests**
   - Test full rule evaluation with mock data

### Property Coverage Tests

```typescript
describe('JellyfinGetterService', () => {
  it.each([
    [RuleProperty.ADD_DATE, 'addDate'],
    [RuleProperty.RELEASE_DATE, 'releaseDate'],
    [RuleProperty.SEEN_BY, 'seenBy'],
    // ... all supported properties
  ])('should return value for %s (%s)', async (propertyId, propertyName) => {
    const result = await service.get(
      { id: propertyId, name: propertyName },
      mockMediaItem,
      mockCollection,
    );
    expect(result).toBeDefined();
  });

  it.each([
    [RuleProperty.WATCHLIST_IS_WATCHLISTED, 'watchlist_isWatchlisted'],
    [RuleProperty.WATCHLIST_IS_LISTED_BY_USERS, 'watchlist_isListedByUsers'],
  ])('should return null for unsupported property %s (%s)', async (propertyId, propertyName) => {
    const result = await service.get(
      { id: propertyId, name: propertyName },
      mockMediaItem,
      mockCollection,
    );
    expect(result).toBeNull();
  });
});
```

---

## C.9: Acceptance Criteria

- [ ] JellyfinGetterService implements all applicable properties
- [ ] `jellyfin` added as application in rules constants
- [ ] GetterService dispatches to JellyfinGetter for jellyfin application
- [ ] Watch history aggregation works correctly
- [ ] Caching reduces API calls
- [ ] All unit tests pass

---

## Property Support Matrix

| Property | Plex | Jellyfin | Notes |
|----------|------|----------|-------|
| addDate | ✅ | ✅ | DateCreated |
| releaseDate | ✅ | ✅ | PremiereDate |
| seenBy | ✅ | ✅ | Requires user iteration |
| lastViewedAt | ✅ | ✅ | Max of user LastPlayedDates |
| viewCount | ✅ | ✅ | Sum of PlayCounts |
| rating_user | ✅ | ⚠️ | Per-user in Jellyfin |
| rating_critics | ✅ | ✅ | CriticRating |
| rating_audience | ✅ | ✅ | CommunityRating |
| people | ✅ | ✅ | People array |
| genre | ✅ | ✅ | Genres array |
| labels | ✅ | ✅ | Tags in Jellyfin |
| collections | ✅ | ✅ | Requires iteration |
| playlists | ✅ | ✅ | Playlists API |
| fileVideoResolution | ✅ | ✅ | MediaSources |
| fileBitrate | ✅ | ✅ | MediaSources |
| fileVideoCodec | ✅ | ✅ | MediaSources |
| sw_episodes | ✅ | ✅ | ChildCount |
| sw_viewedEpisodes | ✅ | ✅ | Requires iteration |
| sw_allEpisodesSeenBy | ✅ | ✅ | Complex - all users × episodes |
| sw_watchers | ✅ | ✅ | Same as seenBy |
| watchlist_* | ✅ | ❌ | Plex only - no jellyfin equivalent |

---

## Files Summary

### New Files (1)

| File | LOC Est. | Purpose |
|------|----------|---------||
| `jellyfin-getter.service.ts` | ~400 | Property getters |

### Modified Files (2)

| File | Changes |
|------|---------|
| `getter.service.ts` | Add jellyfin case |
| `rules.constants.ts` | Add jellyfin application |
