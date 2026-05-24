import NodeCache from 'node-cache';

type AvailableCacheIds =
  | 'tmdb'
  | 'tvdb'
  | 'plexguid'
  | 'plextv'
  | 'seerr'
  | 'plexcommunity'
  | 'tautulli'
  | 'streamystats'
  | 'github'
  | 'jellyfin'
  | 'emby';

type CacheType = AvailableCacheIds | 'radarr' | 'sonarr';

const DEFAULT_TTL = 300; // 5 min
const DEFAULT_CHECK_PERIOD = 120; // 2 min

type CacheOptions = {
  stdTtl?: number;
  checkPeriod?: number;
  // If true, this cache is NOT flushed by flushAll(). Use for external metadata
  // caches (e.g. TMDB, TVDB) whose data doesn't change between rule group runs.
  persistent?: boolean;
};

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
    this.data = new NodeCache({
      stdTTL: options.stdTtl ?? DEFAULT_TTL,
      checkperiod: options.checkPeriod ?? DEFAULT_CHECK_PERIOD,
    });
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
    plextv: new Cache('plextv', 'Plex.tv', 'plextv'),
    seerr: new Cache('seerr', 'Seerr API', 'seerr'),
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
