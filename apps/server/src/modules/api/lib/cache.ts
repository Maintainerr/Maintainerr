import NodeCache from 'node-cache';

type AvailableCacheIds =
  | 'tmdb'
  | 'tvdb'
  | 'plexguid'
  | 'plexwatchhistory'
  | 'plextv'
  | 'seerr'
  | 'seerrrequests'
  | 'plexcommunity'
  | 'tautulli'
  | 'streamystats'
  | 'github'
  | 'jellyfin'
  | 'emby';

type CacheType = AvailableCacheIds | 'radarr' | 'sonarr';

const DEFAULT_TTL = 300; // 5 min
const DEFAULT_CHECK_PERIOD = 120; // 2 min
// Default hard ceiling on distinct keys per cache. A bulk rule sweep caches one
// response per library item, and the metadata TTLs (up to 6h) far outlast a run,
// so without a count bound the caches grow to library size and can OOM a small
// container (#3284). A full 15k-library sweep at --max-old-space-size=536 was
// measured to peak ~430MB at 1000; each +100 keys per cache adds only ~10-20MB,
// so 1200 stays comfortably under a 512MB heap (~65MB margin) while keeping a
// little more of the persistent tmdb/tvdb set warm across rule groups in a cron
// window. It stays far above any paginated/working-set flow, so normal use never
// evicts.
export const DEFAULT_MAX_KEYS = 1200;

type CacheOptions = {
  stdTtl?: number;
  checkPeriod?: number;
  // If true, this cache is NOT flushed by flushAll(). Use for external metadata
  // caches (e.g. TMDB, TVDB) whose data doesn't change between rule group runs.
  persistent?: boolean;
  // If false, NodeCache stores and returns object references without cloning.
  // Required for non-POJO values (Maps, Sets) and for high-frequency lookups
  // where cloning large objects on every get() would be prohibitively expensive.
  // Never mutate values returned from caches that set this to false.
  useClones?: boolean;
  // Hard ceiling on distinct keys. When full, inserting a new key first evicts
  // the oldest inserted key (FIFO), so peak memory stays bounded regardless of
  // library size. Defaults to DEFAULT_MAX_KEYS. Set to 0 to disable the bound -
  // used for single-aggregate caches that intentionally hold one large value
  // (the prefetch Maps), never one entry per item.
  maxKeys?: number;
};

/**
 * A NodeCache with a hard key-count ceiling and FIFO eviction. node-cache's own
 * `maxKeys` throws ECACHEFULL on overflow instead of evicting, and every caller
 * `set()`s directly (external-api.service, plexApi), so the bound is enforced
 * here by overriding `set()` to evict the oldest key before inserting a new one.
 */
class BoundedNodeCache extends NodeCache {
  constructor(
    private readonly maxKeys: number,
    options: NodeCache.Options,
  ) {
    super(options);
  }

  override set<T>(
    key: NodeCache.Key,
    value: T,
    ttl?: number | string,
  ): boolean {
    // Only a genuinely new key grows the count; overwriting an existing key
    // reuses its slot. getStats().keys is maintained by node-cache (kept
    // accurate through TTL expiry too), so this stays O(1) below the cap.
    if (!this.has(key) && this.getStats().keys >= this.maxKeys) {
      // keys() returns Object.keys(data) in insertion order, so [0] is the
      // oldest inserted key.
      const oldest = this.keys()[0];
      if (oldest !== undefined) {
        this.del(oldest);
      }
    }

    return ttl === undefined
      ? super.set(key, value)
      : super.set(key, value, ttl);
  }
}

export class Cache {
  public id: string;
  public data: NodeCache;
  public name: string;
  public type?: CacheType;
  public persistent: boolean;

  constructor(
    id: string,
    name: string,
    type: CacheType,
    options: CacheOptions = {},
  ) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.persistent = options.persistent ?? false;
    const nodeCacheOptions: NodeCache.Options = {
      stdTTL: options.stdTtl ?? DEFAULT_TTL,
      checkperiod: options.checkPeriod ?? DEFAULT_CHECK_PERIOD,
      useClones: options.useClones ?? true,
    };
    const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
    this.data =
      maxKeys > 0
        ? new BoundedNodeCache(maxKeys, nodeCacheOptions)
        : new NodeCache(nodeCacheOptions);
  }

  public getStats() {
    return this.data.getStats();
  }

  public flush(): void {
    this.data.flushAll();
  }
}

class CacheManager {
  private availableCaches: Record<AvailableCacheIds, Cache> = {
    tmdb: new Cache('tmdb', 'The Movie Database API', 'tmdb', {
      stdTtl: 21600, // 6 hours
      checkPeriod: 60 * 30,
      persistent: true,
    }),
    tvdb: new Cache('tvdb', 'TheTVDB API', 'tvdb', {
      stdTtl: 21600, // 6 hours
      checkPeriod: 60 * 30,
      persistent: true,
    }),
    plexguid: new Cache('plexguid', 'Plex GUID', 'plexguid'),
    // Holds the leaf watch-history map built by PlexApiService.prefetchWatchHistory.
    // Persistent so the map survives flushAll() between rule groups in the same
    // cron window; useClones is off because the value is a large Map -
    // getWatchHistory returns copies of the per-item arrays instead.
    plexwatchhistory: new Cache(
      'plexwatchhistory',
      'Plex watch history',
      'plexwatchhistory',
      {
        stdTtl: 3600, // 1 hour
        persistent: true,
        useClones: false,
        // Holds a single prefetched Map, not one entry per item - exempt from
        // the key-count bound so it is never evicted mid-run.
        maxKeys: 0,
      },
    ),
    plextv: new Cache('plextv', 'Plex.tv', 'plextv'),
    seerr: new Cache('seerr', 'Seerr API', 'seerr'),
    // Holds the run-scoped request index built by SeerrApiService.getRequestsForMedia
    // (one bulk /request sweep grouped by tmdbId). useClones is off because the
    // value is a Map - per-item reads copy the per-title array out. Unlike
    // plexwatchhistory this is NOT persistent: request data changes between runs,
    // so flushAll() at each rule-group start rebuilds it (freshness over reuse).
    // Long TTL so a single long run can't expire it mid-sweep.
    seerrrequests: new Cache(
      'seerrrequests',
      'Seerr requests',
      'seerrrequests',
      {
        stdTtl: 3600, // 1 hour
        useClones: false,
        // Single prefetched request index (one Map), not one entry per item -
        // exempt from the key-count bound so it is never evicted mid-run.
        maxKeys: 0,
      },
    ),
    plexcommunity: new Cache(
      'plexcommunity',
      'community.Plex.tv',
      'plexcommunity',
    ),
    tautulli: new Cache('tautulli', 'Tautulli API', 'tautulli'),
    streamystats: new Cache('streamystats', 'Streamystats API', 'streamystats'),
    github: new Cache('github', 'GitHub API', 'github', {
      stdTtl: 86400, // 24 hours
      checkPeriod: 60 * 60, // Check every hour
    }),
    jellyfin: new Cache('jellyfin', 'Jellyfin API', 'jellyfin'),
    emby: new Cache('emby', 'Emby API', 'emby'),
  };

  public createCache(
    id: string,
    name: string,
    type: CacheType,
    options?: CacheOptions,
  ): Cache {
    if (this.availableCaches[id]) {
      throw new Error(`Cache with id ${id} already exists.`);
    }

    return (this.availableCaches[id] = new Cache(id, name, type, options));
  }

  public getCache(id: string): Cache | undefined {
    return this.availableCaches[id];
  }

  public getCachesByType(type: CacheType): Cache[] {
    return Object.values(this.availableCaches).filter(
      (cache) => cache.type === type,
    );
  }

  public getAllCaches(): Record<string, Cache> {
    return this.availableCaches;
  }

  public flushAll(): void {
    for (const [, value] of Object.entries(this.getAllCaches())) {
      if (!value.persistent) {
        value.flush();
      }
    }
  }
}

const cacheManager = new CacheManager();

export default cacheManager;
