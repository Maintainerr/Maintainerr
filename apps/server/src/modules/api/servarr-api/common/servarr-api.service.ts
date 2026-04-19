import { normalizeDiskPath, QualityProfile } from '@maintainerr/contracts';
import { ExternalApiService } from '../../../../modules/api/external-api/external-api.service';
import { DVRSettings } from '../../../../modules/settings/interfaces/dvr-settings.interface';
import { MaintainerrLogger } from '../../../logging/logs.service';
import cacheManager from '../../lib/cache';
import {
  DiskSpaceResource,
  QueueItem,
  QueueResponse,
  RootFolder,
  SystemStatus,
  Tag,
} from '../interfaces/servarr.interface';

export abstract class ServarrApi<QueueItemAppendT> extends ExternalApiService {
  static buildUrl(settings: DVRSettings, path?: string): string {
    return `${settings.useSsl ? 'https' : 'http'}://${settings.hostname}:${settings.port}${settings.baseUrl ?? ''}${path}`;
  }

  protected apiName: string;

  constructor(
    {
      url,
      apiKey,
      cacheName,
    }: {
      url: string;
      apiKey: string;
      cacheName?: string;
    },
    protected readonly logger: MaintainerrLogger,
  ) {
    super(
      url,
      {
        apikey: apiKey,
      },
      logger,
      cacheName
        ? { nodeCache: cacheManager.getCache(cacheName).data }
        : undefined,
    );
  }

  public getSystemStatus = async (): Promise<SystemStatus> => {
    try {
      const response = await this.axios.get<SystemStatus>('/system/status');

      return response.data;
    } catch (error) {
      this.logger.warn('Failed to retrieve system status');
      this.logger.debug(error);
    }
  };

  public getProfiles = async (): Promise<QualityProfile[]> => {
    try {
      const data = await this.getRolling<QualityProfile[]>(
        `/qualityProfile`,
        undefined,
        3600,
      );

      return data;
    } catch (error) {
      this.logger.warn('Failed to retrieve profiles');
      this.logger.debug(error);
    }
  };

  public getRootFolders = async (): Promise<RootFolder[]> => {
    try {
      const data = await this.getRolling<RootFolder[]>(
        `/rootfolder`,
        undefined,
        3600,
      );

      return data;
    } catch (error) {
      this.logger.warn('Failed to retrieve root folders');
      this.logger.debug(error);
    }
  };

  public getDiskspace = async (): Promise<DiskSpaceResource[]> => {
    try {
      const data = await this.getRolling<DiskSpaceResource[]>(
        `/diskspace`,
        undefined,
        3600,
      );

      return data;
    } catch (error) {
      this.logger.warn('Failed to retrieve disk space');
      this.logger.debug(error);
    }
  };

  /**
   * Returns disk space entries merged with root folder data.
   *
   * Sonarr's /diskspace only includes DriveType.Fixed mounts, which excludes
   * NFS/CIFS network mounts commonly used in Docker setups. Radarr includes
   * DriveType.Network too, so it usually works already. We supplement both
   * with /rootfolder entries to cover missing media mount paths.
   *
   * Note: The /rootfolder API only returns freeSpace, not a trustworthy
   * totalSpace value. Fallback entries sourced from root folders therefore
   * set totalSpace = 0 and hasAccurateTotalSpace = false.
   *
   * These merged entries are safe for remaining-space calculations and for the
   * UI path picker. Total-space rule evaluation must use raw /diskspace data.
   */
  public getDiskspaceAndRootFolders = async (): Promise<{
    mounts: DiskSpaceResource[];
    rootFolderPaths: Set<string>;
  }> => {
    const [diskspace, rootFolders] = await Promise.all([
      this.getDiskspace(),
      this.getRootFolders(),
    ]);

    const mounts: DiskSpaceResource[] = [...(diskspace ?? [])];
    const existingPaths = new Set(
      mounts.filter((d) => d.path).map((d) => normalizeDiskPath(d.path!)),
    );
    const rootFolderPaths = new Set<string>();

    for (const folder of rootFolders ?? []) {
      if (!folder.path) continue;

      const normalized = normalizeDiskPath(folder.path);
      rootFolderPaths.add(normalized);
      if (!existingPaths.has(normalized)) {
        existingPaths.add(normalized);
        mounts.push({
          id: folder.id,
          path: folder.path,
          label: null,
          freeSpace: folder.freeSpace ?? 0,
          totalSpace: folder.totalSpace ?? 0,
          hasAccurateTotalSpace: folder.totalSpace != null,
        });
      }
    }

    return { mounts, rootFolderPaths };
  };

  public getDiskspaceWithRootFolders = async (): Promise<
    DiskSpaceResource[]
  > => {
    const { mounts } = await this.getDiskspaceAndRootFolders();
    return mounts;
  };

  public getQueue = async (): Promise<(QueueItem & QueueItemAppendT)[]> => {
    try {
      const response =
        await this.axios.get<QueueResponse<QueueItemAppendT>>(`/queue`);

      return response.data.records;
    } catch (error) {
      this.logger.warn('Failed to retrieve queue');
      this.logger.debug(error);
    }
  };

  public getTags = async (): Promise<Tag[]> => {
    try {
      const response = await this.axios.get<Tag[]>(`/tag`);

      return response.data;
    } catch (error) {
      this.logger.warn('Failed to retrieve tags');
      this.logger.debug(error);
      return [];
    }
  };

  public createTag = async ({ label }: { label: string }): Promise<Tag> => {
    try {
      const response = await this.axios.post<Tag>(`/tag`, {
        label,
      });

      return response.data;
    } catch (error) {
      this.logger.warn('Failed to create tag');
      this.logger.debug(error);
    }
  };

  public async runCommand(
    commandName: string,
    options: Record<string, unknown>,
    wait = false,
  ): Promise<any> {
    try {
      const resp = await this.axios.post(`/command`, {
        name: commandName,
        ...options,
      });
      if (wait && resp.data) {
        while (resp.data.status !== 'failed' && resp.data.status !== 'finished')
          resp.data = await this.get('/command/' + resp.data.id);
      }
      return resp ? resp.data : undefined;
    } catch (error) {
      this.logger.warn('Failed to run command');
      this.logger.debug(error);
    }
  }

  protected async runDelete(command: string): Promise<boolean> {
    try {
      const result = await this.delete(`/${command}`);

      if (result === undefined) {
        this.logger.warn(`Failed to run DELETE: /${command}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn(`Failed to run DELETE: /${command}`);
      this.logger.debug(error);
      return false;
    }
  }

  protected async runPut(command: string, body: string): Promise<boolean> {
    try {
      const result = await this.put(`/${command}`, body);

      if (result === undefined) {
        this.logger.warn(`Failed to run PUT: /${command}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn(`Failed to run PUT: /${command}`);
      this.logger.debug(error);
      return false;
    }
  }
}
