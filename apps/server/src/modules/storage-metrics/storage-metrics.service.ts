import {
  MediaItemType,
  MediaLibrary,
  MediaServerType,
  normalizeDiskPath,
  StorageCleanupTotals,
  StorageCollectionSummary,
  StorageDiskspaceEntry,
  StorageInstanceStatus,
  StorageLibrarySizesResponse,
  StorageMediaServerInfo,
  StorageMediaServerLibrary,
  StorageMetricsResponse,
  StorageTopCollection,
  StorageTotals,
} from '@maintainerr/contracts';
import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import type { IMediaServerService } from '../api/media-server/media-server.interface';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { RadarrSettings } from '../settings/entities/radarr_settings.entities';
import { SonarrSettings } from '../settings/entities/sonarr_settings.entities';
import {
  FREE_SPACE_BUCKET_BYTES,
  LIBRARY_SIZES_CACHE_TTL_MS,
} from './storage-metrics.constants';

/**
 * Returns true when `parent` is the same normalized path as `child` or an
 * ancestor directory of it. Handles POSIX roots (`/`) and Windows drive roots
 * (`C:/`, `C:\`) where the normalized form already ends in a separator.
 */
function isPathPrefix(parent: string, child: string): boolean {
  if (parent === child) return true;
  if (parent.endsWith('/') || parent.endsWith('\\')) {
    return child.startsWith(parent);
  }
  return child.startsWith(parent + '/') || child.startsWith(parent + '\\');
}

interface LibrarySizesCacheEntry {
  generatedAt: string;
  sizeBytesByLibrary: Record<string, number>;
  expiresAt: number;
}

@Injectable()
export class StorageMetricsService {
  private librarySizesCache: LibrarySizesCacheEntry | null = null;
  private librarySizesComputation: Promise<StorageLibrarySizesResponse> | null =
    null;

  constructor(
    private readonly servarrService: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly logger: MaintainerrLogger,
    @InjectRepository(RadarrSettings)
    private readonly radarrSettingsRepo: Repository<RadarrSettings>,
    @InjectRepository(SonarrSettings)
    private readonly sonarrSettingsRepo: Repository<SonarrSettings>,
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(CollectionMedia)
    private readonly collectionMediaRepo: Repository<CollectionMedia>,
  ) {
    this.logger.setContext(StorageMetricsService.name);
  }

  public async getMetrics(): Promise<StorageMetricsResponse> {
    const [radarrSettings, sonarrSettings] = await Promise.all([
      this.radarrSettingsRepo.find(),
      this.sonarrSettingsRepo.find(),
    ]);

    const mountResults = await Promise.all([
      ...radarrSettings.map((setting) =>
        this.fetchInstanceMounts(setting, 'radarr'),
      ),
      ...sonarrSettings.map((setting) =>
        this.fetchInstanceMounts(setting, 'sonarr'),
      ),
    ]);

    const mounts: StorageDiskspaceEntry[] = [];
    const instances: StorageInstanceStatus[] = [];
    const rootFolderPathsByInstance = new Map<string, Set<string>>();
    const hostByInstance = new Map<string, string>();

    for (const result of mountResults) {
      instances.push(result.status);
      mounts.push(...result.mounts);
      const instanceKey = `${result.status.type}||${result.status.id}`;
      hostByInstance.set(instanceKey, result.host);
      if (result.rootFolderPaths.size > 0) {
        rootFolderPathsByInstance.set(instanceKey, result.rootFolderPaths);
      }
    }

    const totals = this.computeTotals(
      mounts,
      rootFolderPathsByInstance,
      hostByInstance,
    );

    const [collectionSummary, topCollections, mediaServer, cleanupTotals] =
      await Promise.all([
        this.buildCollectionSummary(),
        this.buildTopCollections(),
        this.buildMediaServerInfo(),
        this.buildCleanupTotals(),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      totals,
      mounts,
      instances,
      mediaServer,
      collectionSummary,
      topCollections,
      cleanupTotals,
    };
  }

  public async computeMediaServerLibrarySizes(): Promise<StorageLibrarySizesResponse> {
    const now = Date.now();
    if (this.librarySizesCache && this.librarySizesCache.expiresAt > now) {
      return {
        generatedAt: this.librarySizesCache.generatedAt,
        sizeBytesByLibrary: this.librarySizesCache.sizeBytesByLibrary,
      };
    }

    if (this.librarySizesComputation !== null) {
      return this.librarySizesComputation;
    }

    this.librarySizesComputation =
      this.computeAndCacheMediaServerLibrarySizes();

    return this.librarySizesComputation;
  }

  private async computeAndCacheMediaServerLibrarySizes(): Promise<StorageLibrarySizesResponse> {
    try {
      const service = await this.getConfiguredMediaServer();

      let sizes = new Map<string, number>();
      try {
        sizes = await service.computeLibraryStorageSizes();
      } catch (error) {
        this.logger.warn('Failed to compute media server library sizes');
        this.logger.debug(error);
        throw new InternalServerErrorException(
          'Failed to compute media server library sizes.',
        );
      }

      const sizeBytesByLibrary: Record<string, number> = {};
      for (const [id, bytes] of sizes) {
        sizeBytesByLibrary[id] = bytes;
      }

      const generatedAt = new Date().toISOString();
      this.librarySizesCache = {
        generatedAt,
        sizeBytesByLibrary,
        expiresAt: Date.now() + LIBRARY_SIZES_CACHE_TTL_MS,
      };

      return { generatedAt, sizeBytesByLibrary };
    } finally {
      this.librarySizesComputation = null;
    }
  }

  private async fetchInstanceMounts(
    setting: RadarrSettings | SonarrSettings,
    type: 'radarr' | 'sonarr',
  ): Promise<{
    status: StorageInstanceStatus;
    mounts: StorageDiskspaceEntry[];
    rootFolderPaths: Set<string>;
    host: string;
  }> {
    const baseStatus: StorageInstanceStatus = {
      id: setting.id,
      name: setting.serverName,
      type,
      ok: false,
      error: null,
      mountCount: 0,
    };
    const host = this.extractHost(setting.url);
    const empty = { mounts: [], rootFolderPaths: new Set<string>(), host };

    if (!setting.url || !setting.apiKey) {
      return {
        status: { ...baseStatus, error: 'Instance is not fully configured' },
        ...empty,
      };
    }

    try {
      const client =
        type === 'radarr'
          ? await this.servarrService.getRadarrApiClient(setting.id)
          : await this.servarrService.getSonarrApiClient(setting.id);

      const { mounts: diskspace, rootFolderPaths } =
        await client.getDiskspaceAndRootFolders();

      const mounts: StorageDiskspaceEntry[] = diskspace.map((entry) => ({
        instanceId: setting.id,
        instanceType: type,
        instanceName: setting.serverName,
        path: entry.path,
        label: entry.label,
        freeSpace: entry.freeSpace ?? 0,
        totalSpace: entry.totalSpace ?? 0,
        hasAccurateTotalSpace: entry.hasAccurateTotalSpace ?? true,
      }));

      return {
        status: { ...baseStatus, ok: true, mountCount: mounts.length },
        mounts,
        rootFolderPaths,
        host,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to retrieve disk space for ${type} instance "${setting.serverName}"`,
      );
      this.logger.debug(error);
      return { status: { ...baseStatus, error: message }, ...empty };
    }
  }

  private computeTotals(
    mounts: StorageDiskspaceEntry[],
    rootFolderPathsByInstance: Map<string, Set<string>>,
    hostByInstance: Map<string, string>,
  ): StorageTotals {
    const countedPathsByInstance = this.resolveCountedMountPaths(
      mounts,
      rootFolderPathsByInstance,
    );
    const seen = new Map<string, StorageDiskspaceEntry>();

    for (const mount of mounts) {
      if (!mount.path) continue;

      const instanceKey = `${mount.instanceType}||${mount.instanceId}`;
      const rootPaths = rootFolderPathsByInstance.get(instanceKey);
      // When the instance exposes root folders, only count root-folder-backed
      // mounts in the headline totals. Other /diskspace entries (e.g. download
      // paths) remain visible in the per-instance mount list.
      if (rootPaths?.size) {
        const counted = countedPathsByInstance.get(instanceKey);
        if (!counted?.has(normalizeDiskPath(mount.path))) continue;
      }

      const host = hostByInstance.get(instanceKey) ?? '';
      const key = this.buildTotalsDedupKey(mount, host);

      const existing = seen.get(key);
      if (
        !existing ||
        (!existing.hasAccurateTotalSpace && mount.hasAccurateTotalSpace)
      ) {
        seen.set(key, mount);
      }
    }

    // Coalesce mounts that survived the per-host dedupe but clearly point at
    // the same shared volume from different hosts (e.g. Radarr/Sonarr running
    // in separate LXC containers against the same NAS). A byte-exact match on
    // totalSpace plus freeSpace — or a matching volume label plus byte-exact
    // totalSpace — is implausible across truly unrelated filesystems, since
    // any block-level write would diverge them.
    const merged = this.mergeSharedMountsAcrossHosts(seen);

    // Sonarr's /diskspace excludes DriveType.Network, so NFS/CIFS mounts
    // commonly arrive via /rootfolder, which reports freeSpace but not
    // totalSpace. Sum freeSpace across every deduped mount so the Free card
    // stays honest; gate totalSpace on hasAccurateTotalSpace so the Total card
    // only reflects filesystems whose capacity we actually know.
    let freeSpace = 0;
    let totalSpace = 0;
    let accurateMountCount = 0;

    for (const mount of merged.values()) {
      freeSpace += mount.freeSpace;
      if (mount.hasAccurateTotalSpace) {
        totalSpace += mount.totalSpace;
        accurateMountCount += 1;
      }
    }

    return {
      freeSpace,
      totalSpace,
      usedSpace: Math.max(totalSpace - freeSpace, 0),
      mountCount: merged.size,
      accurateMountCount,
      accurateTotalSpace:
        merged.size > 0 &&
        accurateMountCount === merged.size &&
        totalSpace > 0,
    };
  }

  /**
   * Second-pass dedupe that merges mounts across hosts when their signature
   * is tight enough to imply shared backend storage. Stricter than the
   * per-host pass: cross-host requires byte-exact totalSpace+freeSpace (or
   * label + byte-exact totalSpace), since unrelated filesystems can land in
   * the same MiB-bucketed signature by coincidence but cannot match
   * byte-for-byte once any IO has happened.
   */
  private mergeSharedMountsAcrossHosts(
    seen: Map<string, StorageDiskspaceEntry>,
  ): Map<string, StorageDiskspaceEntry> {
    const result = new Map<string, StorageDiskspaceEntry>();
    for (const [originalKey, mount] of seen) {
      const sharedKey = this.buildCrossHostSharedKey(mount);
      const key = sharedKey ?? originalKey;
      const existing = result.get(key);
      if (
        !existing ||
        (!existing.hasAccurateTotalSpace && mount.hasAccurateTotalSpace)
      ) {
        result.set(key, mount);
      }
    }
    return result;
  }

  private buildCrossHostSharedKey(
    mount: StorageDiskspaceEntry,
  ): string | null {
    // Without an accurate totalSpace there is no reliable cross-host
    // signature, so leave inaccurate mounts on their per-host key.
    if (!mount.hasAccurateTotalSpace) return null;

    const label = mount.label?.trim().toLowerCase();
    if (label) {
      return `shared||label||${label}||${mount.totalSpace}`;
    }
    return `shared||cap||${mount.totalSpace}||${mount.freeSpace}`;
  }

  /**
   * For each instance with root folders, resolve which mount paths should be
   * counted in headline totals. Prefers the longest-prefix accurate ancestor
   * (e.g. `/` or `/data` in /diskspace when root folder is `/data/movies`)
   * so we don't discard capacity data in favour of a synthesized root-folder
   * entry without a trustworthy total. Falls back to the longest-prefix mount
   * of any accuracy when no accurate ancestor exists.
   */
  private resolveCountedMountPaths(
    mounts: StorageDiskspaceEntry[],
    rootFolderPathsByInstance: Map<string, Set<string>>,
  ): Map<string, Set<string>> {
    const mountsByInstance = new Map<string, StorageDiskspaceEntry[]>();
    for (const mount of mounts) {
      if (!mount.path) continue;
      const instanceKey = `${mount.instanceType}||${mount.instanceId}`;
      const list = mountsByInstance.get(instanceKey) ?? [];
      list.push(mount);
      mountsByInstance.set(instanceKey, list);
    }

    const result = new Map<string, Set<string>>();
    for (const [instanceKey, rootPaths] of rootFolderPathsByInstance) {
      if (!rootPaths.size) continue;
      const instanceMounts = mountsByInstance.get(instanceKey) ?? [];
      const counted = new Set<string>();

      for (const rootPath of rootPaths) {
        let bestAccurate: { path: string; len: number } | null = null;
        let bestFallback: { path: string; len: number } | null = null;

        for (const mount of instanceMounts) {
          const normalized = normalizeDiskPath(mount.path!);
          if (!isPathPrefix(normalized, rootPath)) continue;
          const candidate = { path: normalized, len: normalized.length };
          if (mount.hasAccurateTotalSpace) {
            if (!bestAccurate || candidate.len > bestAccurate.len) {
              bestAccurate = candidate;
            }
          } else if (!bestFallback || candidate.len > bestFallback.len) {
            bestFallback = candidate;
          }
        }

        const chosen = bestAccurate ?? bestFallback;
        if (chosen) counted.add(chosen.path);
      }

      result.set(instanceKey, counted);
    }

    return result;
  }

  private buildTotalsDedupKey(
    mount: StorageDiskspaceEntry,
    host: string,
  ): string {
    if (!mount.hasAccurateTotalSpace) {
      return `${host}||path||${normalizeDiskPath(mount.path ?? '')}`;
    }

    const label = mount.label?.trim().toLowerCase();
    if (label) {
      return `${host}||label||${label}||${mount.totalSpace}`;
    }

    // Arr APIs do not expose a stable filesystem identifier. For accurate
    // totals without a volume label, include a coarse free-space bucket so
    // small cross-instance drift still merges while same-size disks with
    // materially different usage stay distinct.
    const freeSpaceBucket = Math.floor(
      mount.freeSpace / FREE_SPACE_BUCKET_BYTES,
    );
    return `${host}||cap||${mount.totalSpace}||${freeSpaceBucket}`;
  }

  private extractHost(url: string | undefined): string {
    if (!url) return '';
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  private async getConfiguredMediaServer(): Promise<IMediaServerService> {
    let service: IMediaServerService;

    try {
      service = await this.mediaServerFactory.getService();
    } catch (error) {
      this.logger.debug(error);
      throw this.toMediaServerUnavailableError(error);
    }

    if (!service.isSetup()) {
      throw new ServiceUnavailableException(
        'Media server is not configured or reachable.',
      );
    }

    return service;
  }

  private toMediaServerUnavailableError(
    error: unknown,
  ): ServiceUnavailableException {
    const message = error instanceof Error ? error.message : '';

    if (message === 'No media server type configured') {
      return new ServiceUnavailableException(
        'Configure a media server before computing library sizes.',
      );
    }

    return new ServiceUnavailableException(
      message || 'Media server unavailable',
    );
  }

  private async buildMediaServerInfo(): Promise<StorageMediaServerInfo> {
    const empty: StorageMediaServerInfo = {
      configured: false,
      serverType: null,
      serverName: null,
      reachable: false,
      error: null,
      libraries: [],
      totalItemCount: 0,
    };

    let service: IMediaServerService;
    try {
      service = await this.mediaServerFactory.getService();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'No media server type configured') {
        return empty;
      }
      this.logger.debug(error);
      return { ...empty, error: message || 'Media server unavailable' };
    }

    if (!service.isSetup()) {
      return {
        ...empty,
        configured: true,
        serverType: service.getServerType(),
      };
    }

    const serverType = service.getServerType() as MediaServerType;
    let serverName: string | null = null;
    try {
      const status = await service.getStatus();
      serverName = status?.name ?? null;
    } catch (error) {
      this.logger.debug(error);
    }

    let libraries: MediaLibrary[] = [];
    try {
      libraries = await service.getLibraries();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to retrieve media server libraries: ${message}`);
      return {
        configured: true,
        serverType,
        serverName,
        reachable: false,
        error: message,
        libraries: [],
        totalItemCount: 0,
      };
    }

    let storageByLibrary = new Map<string, number>();
    try {
      storageByLibrary = await service.getLibrariesStorage();
    } catch (error) {
      this.logger.debug(error);
    }

    const libraryStats: StorageMediaServerLibrary[] = await Promise.all(
      libraries.map(async (library) => {
        let itemCount = 0;
        try {
          itemCount = await service.getLibraryContentCount(library.id);
        } catch (error) {
          this.logger.debug(error);
        }
        const storedBytes = storageByLibrary.get(library.id);
        return {
          id: library.id,
          title: library.title,
          type: library.type,
          itemCount,
          sizeBytes: storedBytes ?? null,
        };
      }),
    );

    const totalItemCount = libraryStats.reduce(
      (sum, lib) => sum + lib.itemCount,
      0,
    );

    return {
      configured: true,
      serverType,
      serverName,
      reachable: true,
      error: null,
      libraries: libraryStats,
      totalItemCount,
    };
  }

  private async buildCleanupTotals(): Promise<StorageCleanupTotals> {
    const rows = await this.collectionRepo
      .createQueryBuilder('c')
      .select('c.type', 'type')
      .addSelect('COALESCE(SUM(c.handledMediaAmount), 0)', 'handled')
      .addSelect('COALESCE(SUM(c.handledMediaSizeBytes), 0)', 'bytes')
      .groupBy('c.type')
      .getRawMany<{
        type: MediaItemType;
        handled: string | number;
        bytes: string | number;
      }>();

    let itemsHandled = 0;
    let moviesHandled = 0;
    let showsHandled = 0;
    let seasonsHandled = 0;
    let episodesHandled = 0;
    let bytesHandled = 0;
    let movieBytesHandled = 0;
    let showBytesHandled = 0;
    let seasonBytesHandled = 0;
    let episodeBytesHandled = 0;

    for (const row of rows) {
      const handled = this.toNumber(row.handled) ?? 0;
      const bytes = this.toNumber(row.bytes) ?? 0;
      itemsHandled += handled;
      bytesHandled += bytes;
      switch (row.type) {
        case 'movie':
          moviesHandled += handled;
          movieBytesHandled += bytes;
          break;
        case 'show':
          showsHandled += handled;
          showBytesHandled += bytes;
          break;
        case 'season':
          seasonsHandled += handled;
          seasonBytesHandled += bytes;
          break;
        case 'episode':
          episodesHandled += handled;
          episodeBytesHandled += bytes;
          break;
      }
    }

    return {
      itemsHandled,
      moviesHandled,
      showsHandled,
      seasonsHandled,
      episodesHandled,
      bytesHandled,
      movieBytesHandled,
      showBytesHandled,
      seasonBytesHandled,
      episodeBytesHandled,
    };
  }

  private async buildCollectionSummary(): Promise<StorageCollectionSummary> {
    const collections = await this.collectionRepo.find();

    let reclaimableCount = 0;
    let inactiveCount = 0;
    let reclaimableMovieCount = 0;
    let reclaimableShowCount = 0;
    const eligibleIds = new Set<number>();

    for (const collection of collections) {
      if (!collection.isActive) {
        inactiveCount += 1;
      }

      // "Reclaimable" only counts collections whose rules will actually free
      // disk: active and configured to delete after some number of days.
      const deleteAfterDays = this.toNumber(collection.deleteAfterDays);
      if (
        collection.isActive &&
        deleteAfterDays !== null &&
        deleteAfterDays > 0
      ) {
        eligibleIds.add(collection.id);
        reclaimableCount += 1;
        if (collection.type === 'movie') {
          reclaimableMovieCount += 1;
        } else if (collection.type === 'show') {
          reclaimableShowCount += 1;
        }
      }
    }

    let activeSizeBytes = 0;
    let movieSizeBytes = 0;
    let showSizeBytes = 0;
    let reclaimableSizedCount = 0;
    let reclaimableUsingFallback = false;

    if (eligibleIds.size > 0) {
      const ids = Array.from(eligibleIds);

      // Group by mediaServerId so the same item across multiple collections
      // is counted once. Per-item sizes are identical across rows for the
      // same id, so MAX is equivalent to "any" — it just deduplicates.
      // Partitioning by collection.type assigns each unique item to its
      // collection's type bucket; collections are typed homogeneously, so
      // overlap between movie and show buckets is not a real-world concern.
      const rows = await this.collectionMediaRepo
        .createQueryBuilder('cm')
        .select('cm.mediaServerId', 'mediaServerId')
        .addSelect('c.type', 'type')
        .addSelect('MAX(cm.sizeBytes)', 'sizeBytes')
        .innerJoin('cm.collection', 'c')
        .where('cm.collectionId IN (:...ids)', { ids })
        .andWhere('cm.sizeBytes IS NOT NULL')
        .groupBy('cm.mediaServerId')
        .addGroupBy('c.type')
        .getRawMany<{
          mediaServerId: string;
          type: MediaItemType;
          sizeBytes: string | number | null;
        }>();

      for (const row of rows) {
        const size = this.toNumber(row.sizeBytes);
        if (size === null || size <= 0) continue;

        activeSizeBytes += size;
        if (row.type === 'movie') {
          movieSizeBytes += size;
        } else if (row.type === 'show') {
          showSizeBytes += size;
        }
      }

      const sized = await this.collectionMediaRepo
        .createQueryBuilder('cm')
        .select('DISTINCT cm.collectionId', 'collectionId')
        .where('cm.collectionId IN (:...ids)', { ids })
        .andWhere('cm.sizeBytes IS NOT NULL')
        .getRawMany<{ collectionId: number }>();

      reclaimableSizedCount = sized.length;

      // Per-item sizes are populated lazily by collection size refreshes.
      // Until every reclaimable collection has been backfilled, keep using
      // the cached per-collection totals so we do not silently undercount the
      // unsized collections. In fallback mode duplicates are not deduplicated.
      if (reclaimableSizedCount !== reclaimableCount) {
        activeSizeBytes = 0;
        movieSizeBytes = 0;
        showSizeBytes = 0;
        reclaimableSizedCount = 0;

        for (const collection of collections) {
          if (!eligibleIds.has(collection.id)) continue;
          const total = this.toNumber(collection.totalSizeBytes);
          if (total === null || total <= 0) continue;

          activeSizeBytes += total;
          if (collection.type === 'movie') {
            movieSizeBytes += total;
          } else if (collection.type === 'show') {
            showSizeBytes += total;
          }
          reclaimableSizedCount += 1;
        }

        reclaimableUsingFallback = reclaimableSizedCount > 0;
      }
    }

    return {
      reclaimableCount,
      activeSizeBytes,
      reclaimableSizedCount,
      inactiveCount,
      totalCollectionCount: collections.length,
      movieSizeBytes,
      showSizeBytes,
      reclaimableMovieCount,
      reclaimableShowCount,
      reclaimableUsingFallback,
    };
  }

  private async buildTopCollections(): Promise<StorageTopCollection[]> {
    const collections = await this.collectionRepo.find({
      where: { totalSizeBytes: Not(IsNull()) },
    });

    const sorted = collections
      .map((collection) => ({
        collection,
        totalSizeBytes: this.toNumber(collection.totalSizeBytes) ?? 0,
      }))
      .filter(({ totalSizeBytes }) => totalSizeBytes > 0)
      .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes)
      .slice(0, 10);

    if (sorted.length === 0) return [];

    const mediaCounts = await this.collectionMediaRepo
      .createQueryBuilder('cm')
      .select('cm.collectionId', 'collectionId')
      .addSelect('COUNT(cm.id)', 'count')
      .where('cm.collectionId IN (:...ids)', {
        ids: sorted.map(({ collection }) => collection.id),
      })
      .groupBy('cm.collectionId')
      .getRawMany<{ collectionId: number; count: string }>();

    const countByCollection = new Map<number, number>();
    for (const row of mediaCounts) {
      countByCollection.set(Number(row.collectionId), Number(row.count));
    }

    return sorted.map(
      ({ collection, totalSizeBytes }): StorageTopCollection => ({
        id: collection.id,
        title: collection.title,
        type: collection.type as MediaItemType,
        mediaCount: countByCollection.get(collection.id) ?? 0,
        totalSizeBytes,
        isActive: collection.isActive,
      }),
    );
  }

  private toNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
