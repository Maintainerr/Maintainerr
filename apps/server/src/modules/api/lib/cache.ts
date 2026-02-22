import NodeCache from 'node-cache';

type AvailableCacheIds =
  | 'tmdb'
  | 'plexguid'
  | 'plextv'
  | 'seerr'
  | 'plexcommunity'
  | 'tautulli'
  | 'github'
  | 'jellyfin';

type CacheType = AvailableCacheIds | 'radarr' | 'sonarr';

const DEFAULT_TTL = 300; // 5 min
const DEFAULT_CHECK_PERIOD = 120; // 2 min

type CacheOptions = {
  stdTtl?: number;
  checkPeriod?: number;
};

export class Cache {
  public id: string;
  public data: NodeCache;
  public name: string;
  public type?: CacheType;

  constructor(
    id: string,
    name: string,
    type: CacheType,
    options: CacheOptions = {},
  ) {
    this.id = id;
    this.name = name;
    this.type = type;
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
    github: new Cache('github', 'GitHub API', 'github', {
      stdTtl: 86400, // 24 hours
      checkPeriod: 60 * 60, // Check every hour
    }),
    jellyfin: new Cache('jellyfin', 'Jellyfin API', 'jellyfin'),
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
      value.flush();
    }
  }
}

const cacheManager = new CacheManager();

export default cacheManager;
