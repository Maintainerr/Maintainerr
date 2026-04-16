import {
  ArrDiskspaceResource,
  MediaItemType,
  MediaLibrary,
  MediaServerType,
  normalizeDiskPath,
  StorageCollectionSummary,
  StorageDiskspaceEntry,
  StorageInstanceStatus,
  StorageMediaServerInfo,
  StorageMediaServerLibrary,
  StorageMetricsResponse,
  StorageTopCollection,
  StorageTotals,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../logging/logs.service';
import { RadarrSettings } from '../settings/entities/radarr_settings.entities';
import { SonarrSettings } from '../settings/entities/sonarr_settings.entities';

interface DedupKey {
  host: string;
  path: string;
}

@Injectable()
export class StorageMetricsService {
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

    for (const result of mountResults) {
      instances.push(result.status);
      mounts.push(...result.mounts);
    }

    const totals = this.computeTotals(mounts, [
      ...radarrSettings,
      ...sonarrSettings,
    ]);

    const [collectionSummary, topCollections, mediaServer] = await Promise.all([
      this.buildCollectionSummary(),
      this.buildTopCollections(),
      this.buildMediaServerInfo(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      totals,
      mounts,
      instances,
      mediaServer,
      collectionSummary,
      topCollections,
    };
  }

  private async fetchInstanceMounts(
    setting: RadarrSettings | SonarrSettings,
    type: 'radarr' | 'sonarr',
  ): Promise<{
    status: StorageInstanceStatus;
    mounts: StorageDiskspaceEntry[];
  }> {
    const baseStatus: StorageInstanceStatus = {
      id: setting.id,
      name: setting.serverName,
      type,
      ok: false,
      error: null,
      mountCount: 0,
    };

    if (!setting.url || !setting.apiKey) {
      return {
        status: { ...baseStatus, error: 'Instance is not fully configured' },
        mounts: [],
      };
    }

    try {
      const client =
        type === 'radarr'
          ? await this.servarrService.getRadarrApiClient(setting.id)
          : await this.servarrService.getSonarrApiClient(setting.id);

      const diskspace: ArrDiskspaceResource[] =
        (await client.getDiskspaceWithRootFolders()) ?? [];

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
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to retrieve disk space for ${type} instance "${setting.serverName}"`,
      );
      this.logger.debug(error);
      return {
        status: { ...baseStatus, error: message },
        mounts: [],
      };
    }
  }

  private computeTotals(
    mounts: StorageDiskspaceEntry[],
    settings: Array<RadarrSettings | SonarrSettings>,
  ): StorageTotals {
    const hostByInstance = new Map<number, string>();
    for (const setting of settings) {
      hostByInstance.set(setting.id, this.extractHost(setting.url));
    }

    const seen = new Map<string, StorageDiskspaceEntry>();

    for (const mount of mounts) {
      if (!mount.path) continue;

      const host = hostByInstance.get(mount.instanceId) ?? '';
      const key = this.buildDedupKey({
        host,
        path: normalizeDiskPath(mount.path),
      });

      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, mount);
      } else if (
        !existing.hasAccurateTotalSpace &&
        mount.hasAccurateTotalSpace
      ) {
        seen.set(key, mount);
      }
    }

    let freeSpace = 0;
    let totalSpace = 0;
    let accurateMountCount = 0;

    for (const mount of seen.values()) {
      if (mount.hasAccurateTotalSpace) {
        totalSpace += mount.totalSpace;
        freeSpace += mount.freeSpace;
        accurateMountCount += 1;
      }
    }

    const usedSpace = Math.max(totalSpace - freeSpace, 0);
    const accurateTotalSpace =
      seen.size > 0 && accurateMountCount === seen.size && totalSpace > 0;

    return {
      freeSpace,
      totalSpace,
      usedSpace,
      mountCount: seen.size,
      accurateMountCount,
      accurateTotalSpace,
    };
  }

  private extractHost(url: string | undefined): string {
    if (!url) return '';
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  private buildDedupKey(key: DedupKey): string {
    return `${key.host}||${key.path}`;
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

    let service;
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
      return { ...empty, configured: true, serverType: service.getServerType() };
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

    const libraryStats: StorageMediaServerLibrary[] = await Promise.all(
      libraries.map(async (library) => {
        let itemCount = 0;
        try {
          itemCount = await service.getLibraryContentCount(library.id);
        } catch (error) {
          this.logger.debug(error);
        }
        return {
          id: library.id,
          title: library.title,
          type: library.type,
          itemCount,
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

  private async buildCollectionSummary(): Promise<StorageCollectionSummary> {
    const collections = await this.collectionRepo.find();

    let activeCount = 0;
    let inactiveCount = 0;
    let activeSizeBytes = 0;
    let activeSizedCount = 0;
    let movieSizeBytes = 0;
    let showSizeBytes = 0;
    let movieCollectionCount = 0;
    let showCollectionCount = 0;

    for (const collection of collections) {
      if (collection.isActive) {
        activeCount += 1;
      } else {
        inactiveCount += 1;
      }

      if (collection.type === 'movie') {
        movieCollectionCount += 1;
      } else if (collection.type === 'show') {
        showCollectionCount += 1;
      }

      const size = this.toNumber(collection.totalSizeBytes);
      if (!collection.isActive || size === null) continue;

      activeSizeBytes += size;
      activeSizedCount += 1;

      if (collection.type === 'movie') {
        movieSizeBytes += size;
      } else if (collection.type === 'show') {
        showSizeBytes += size;
      }
    }

    return {
      activeCount,
      activeSizeBytes,
      activeSizedCount,
      inactiveCount,
      totalCollectionCount: collections.length,
      movieSizeBytes,
      showSizeBytes,
      movieCollectionCount,
      showCollectionCount,
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
