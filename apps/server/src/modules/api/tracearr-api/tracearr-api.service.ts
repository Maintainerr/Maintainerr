import {
  BasicResponseDto,
  MediaItem,
  MINIMUM_TRACEARR_VERSION,
  TracearrServer,
  TracearrHistoryItem,
  tracearrHistoryPageSchema,
  tracearrServerSchema,
  tracearrUsersPageSchema,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { SettingsDataService } from '../../settings/settings-data.service';
import { MediaServerFactory } from '../media-server/media-server.factory';
import {
  CONNECTION_TEST_TIMEOUT_MS,
  formatConnectionFailureMessage,
  logConnectionTestError,
} from '../../../utils/connection-error';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import cacheManager from '../lib/cache';
import {
  TRACEARR_CACHE_ID,
  TRACEARR_HISTORY_CACHE_KEY,
  TRACEARR_HISTORY_MAX_RECORDS,
  TRACEARR_PAGE_SIZE,
} from './tracearr-api.constants';
import { TracearrApi } from './helpers/tracearr-api.helper';
import { isBelowMinimumVersion } from '../../../utils/required-version-helper';

interface TracearrOpenApiDocument {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
  };
  paths?: Record<
    string,
    Record<string, TracearrOpenApiOperation | undefined> | undefined
  >;
}

interface TracearrOpenApiOperation {
  parameters?: TracearrOpenApiParameter[];
}

interface TracearrOpenApiParameter {
  name?: string;
  in?: string;
  description?: string;
  schema?: {
    enum?: unknown[];
  };
}

export interface TracearrHistoryIndex {
  rowsById: Map<string, TracearrHistoryItem>;
  rowsByRatingKey: Map<string, TracearrHistoryItem[]>;
  rowsByShowRatingKey: Map<string, TracearrHistoryItem[]>;
  earliestStartedAt: number;
  unfinishedChainIds: Set<string>;
}

@Injectable()
export class TracearrApiService {
  api: TracearrApi | undefined;
  private activeHistoryIndex: TracearrHistoryIndex | undefined;
  private activeUsernamesByTracearrUserId: Map<string, string[]> | undefined;
  private episodeIdsByItemId = new Map<string, Promise<string[] | undefined>>();
  private sweepPromise: Promise<void> | undefined;

  constructor(
    private readonly settings: SettingsDataService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly logger: MaintainerrLogger,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {
    logger.setContext(TracearrApiService.name);
  }

  public init(): void {
    this.api = undefined;
    this.invalidateHistory();
    cacheManager.getCache(TRACEARR_CACHE_ID)?.data.flushAll();

    if (!this.settings.tracearr_url || !this.settings.tracearr_api_key) {
      return;
    }

    this.api = new TracearrApi(
      {
        url: this.settings.tracearr_url,
        apiKey: this.settings.tracearr_api_key,
      },
      this.loggerFactory.createLogger(),
    );
  }

  public getHistoryIndex(): TracearrHistoryIndex | undefined {
    return this.activeHistoryIndex;
  }

  public getUsernamesByTracearrUserId(): Map<string, string[]> | undefined {
    return this.activeUsernamesByTracearrUserId;
  }

  public invalidateHistory(): void {
    this.activeHistoryIndex = undefined;
    this.activeUsernamesByTracearrUserId = undefined;
    this.episodeIdsByItemId.clear();
    cacheManager
      .getCache(TRACEARR_CACHE_ID)
      ?.data.del(TRACEARR_HISTORY_CACHE_KEY);
  }

  public async getEpisodeIds(
    libItem: MediaItem,
  ): Promise<string[] | undefined> {
    if (libItem.type !== 'show' && libItem.type !== 'season') {
      return undefined;
    }

    const existing = this.episodeIdsByItemId.get(libItem.id);
    if (existing !== undefined) {
      return await existing;
    }

    const episodeIds = this.fetchEpisodeIds(libItem);
    this.episodeIdsByItemId.set(libItem.id, episodeIds);

    try {
      return await episodeIds;
    } catch (error) {
      this.episodeIdsByItemId.delete(libItem.id);
      throw error;
    }
  }

  public async prefetchHistory(): Promise<void> {
    if (this.sweepPromise !== undefined) {
      return this.sweepPromise;
    }

    this.sweepPromise = this.prefetchHistoryInternal().finally(() => {
      this.sweepPromise = undefined;
    });
    return this.sweepPromise;
  }

  public async getServers(
    params: ConstructorParameters<typeof TracearrApi>[0],
  ): Promise<TracearrServer[] | undefined> {
    const api = new TracearrApi(params, this.loggerFactory.createLogger());

    try {
      const document = await this.getOpenApiDocument(api);
      return this.getServersFromOpenApiDocument(document);
    } catch (error) {
      this.logger.warn(
        'Could not load Tracearr servers from the public API document.',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async testConnection(
    params: ConstructorParameters<typeof TracearrApi>[0],
  ): Promise<BasicResponseDto> {
    const api = new TracearrApi(params, this.loggerFactory.createLogger());

    try {
      const document = await this.getOpenApiDocument(api);

      const version = document.info?.version;
      if (
        !document.openapi ||
        document.info?.title !== 'Tracearr Public API' ||
        !version
      ) {
        return {
          status: 'NOK',
          code: 0,
          message:
            'Unexpected response from Tracearr. Verify the URL points to a Tracearr v2 instance.',
        };
      }
      if (isBelowMinimumVersion(version, MINIMUM_TRACEARR_VERSION)) {
        return {
          status: 'NOK',
          code: 0,
          message: `Tracearr ${version} is below the minimum supported version ${MINIMUM_TRACEARR_VERSION}. Please update Tracearr.`,
        };
      }

      return {
        status: 'OK',
        code: 1,
        message: version,
      };
    } catch (error) {
      logConnectionTestError(this.logger, 'Tracearr');
      this.logger.debug(error);
      return {
        status: 'NOK',
        code: 0,
        message: formatConnectionFailureMessage(
          error,
          'Failed to connect to Tracearr. Verify URL, API key, and that the service is running.',
        ),
      };
    }
  }

  private async prefetchHistoryInternal(): Promise<void> {
    this.activeHistoryIndex = undefined;
    this.activeUsernamesByTracearrUserId = undefined;
    this.episodeIdsByItemId.clear();

    if (!this.isHistoryConfigured()) {
      this.logger.warn(
        'Tracearr history rules are unavailable until a server ID is configured.',
      );
      return;
    }

    const historyIndex = await this.refreshHistoryIndex();
    if (!historyIndex) {
      this.logger.warn(
        'Tracearr history sweep did not complete. Tracearr rule values are unavailable for this run.',
      );
      return;
    }

    if (historyIndex.rowsByRatingKey.size === 0) {
      this.logger.warn(
        'Tracearr history contains no usable rating keys. Tracearr rule values are unavailable until history is recorded.',
      );
      return;
    }

    this.activeHistoryIndex = historyIndex;
    this.logger.log(
      `Tracearr history starts at ${new Date(historyIndex.earliestStartedAt).toISOString()}. Earlier unobserved media is skipped.`,
    );
    const usernames = await this.fetchUsernamesByTracearrUserId(historyIndex);
    if (!usernames) {
      this.logger.warn(
        'Tracearr media-server user lookup did not complete. Tracearr username rule values are unavailable for this run.',
      );
      return;
    }

    this.activeUsernamesByTracearrUserId = usernames;
  }

  private async refreshHistoryIndex(): Promise<
    TracearrHistoryIndex | undefined
  > {
    const api = this.api;
    const serverId = this.settings.tracearr_server_id;
    if (!api || !serverId) {
      return undefined;
    }

    const cache = cacheManager.getCache(TRACEARR_CACHE_ID)?.data;
    const previous = cache?.get<TracearrHistoryIndex>(
      TRACEARR_HISTORY_CACHE_KEY,
    );
    const rowsById = new Map(previous?.rowsById);
    const unresolvedUnfinishedChainIds = new Set(previous?.unfinishedChainIds);
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let reachedKnownHistory = false;

    while (!reachedKnownHistory || unresolvedUnfinishedChainIds.size > 0) {
      const raw = await api.getWithoutCache<unknown>('/history', {
        params: {
          server_id: serverId,
          pageSize: TRACEARR_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
      });
      const parsed = tracearrHistoryPageSchema.safeParse(raw);
      if (!parsed.success) {
        if (raw !== undefined) {
          this.logger.warn(
            'Tracearr history payload did not match the public API schema.',
          );
          this.logger.debug(parsed.error);
        }
        return undefined;
      }

      for (const row of parsed.data.data) {
        unresolvedUnfinishedChainIds.delete(row.id);
        if (row.server_id !== serverId) {
          this.logger.warn(
            'Tracearr history response included a row for a different server.',
          );
          return undefined;
        }

        if (previous?.rowsById.has(row.id)) {
          reachedKnownHistory = true;
        }
        rowsById.set(row.id, row);
      }

      if (rowsById.size > TRACEARR_HISTORY_MAX_RECORDS) {
        this.logger.warn(
          `Tracearr history passed ${TRACEARR_HISTORY_MAX_RECORDS} records - rule values are unavailable for this run.`,
        );
        return undefined;
      }

      const nextCursor = parsed.data.meta.nextCursor;
      if (
        !nextCursor ||
        (reachedKnownHistory && unresolvedUnfinishedChainIds.size === 0)
      ) {
        break;
      }
      if (cursors.has(nextCursor)) {
        this.logger.warn('Tracearr history cursor repeated before completion.');
        return undefined;
      }
      cursors.add(nextCursor);
      cursor = nextCursor;
    }

    if (unresolvedUnfinishedChainIds.size > 0) {
      this.logger.warn(
        `Tracearr did not return ${unresolvedUnfinishedChainIds.size} unfinished history chain(s). Dropping them from the snapshot.`,
      );
      for (const chainId of unresolvedUnfinishedChainIds) {
        rowsById.delete(chainId);
      }
    }

    const index = this.createHistoryIndex(rowsById);
    cache?.set(TRACEARR_HISTORY_CACHE_KEY, index);
    return index;
  }

  private createHistoryIndex(
    rowsById: Map<string, TracearrHistoryItem>,
  ): TracearrHistoryIndex {
    const rowsByRatingKey = new Map<string, TracearrHistoryItem[]>();
    const rowsByShowRatingKey = new Map<string, TracearrHistoryItem[]>();
    const unfinishedChainIds = new Set<string>();
    let earliestStartedAt = Number.POSITIVE_INFINITY;

    for (const row of rowsById.values()) {
      earliestStartedAt = Math.min(
        earliestStartedAt,
        new Date(row.started_at).getTime(),
      );
      if (row.stopped_at == null) {
        unfinishedChainIds.add(row.id);
      }
      if (row.rating_key) {
        const rows = rowsByRatingKey.get(row.rating_key) ?? [];
        rows.push(row);
        rowsByRatingKey.set(row.rating_key, rows);
      }

      if (row.grandparent_rating_key) {
        const rows = rowsByShowRatingKey.get(row.grandparent_rating_key) ?? [];
        rows.push(row);
        rowsByShowRatingKey.set(row.grandparent_rating_key, rows);
      }
    }

    return {
      rowsById,
      rowsByRatingKey,
      rowsByShowRatingKey,
      earliestStartedAt,
      unfinishedChainIds,
    };
  }

  private async getOpenApiDocument(
    api: TracearrApi,
  ): Promise<TracearrOpenApiDocument> {
    const response = await api.getRawWithoutCache<TracearrOpenApiDocument>(
      '/docs',
      { signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS) },
    );
    return response.data;
  }

  private getServersFromOpenApiDocument(
    document: TracearrOpenApiDocument,
  ): TracearrServer[] {
    const serverParameter = this.getServerParameter(document);
    if (!serverParameter?.schema?.enum) {
      this.logger.warn(
        'Tracearr public API document does not list any available servers.',
      );
      return [];
    }

    return serverParameter.schema.enum.flatMap((id) => {
      if (typeof id !== 'string') {
        return [];
      }

      const server = tracearrServerSchema.safeParse({
        id,
        name: this.getServerName(serverParameter.description, id),
      });
      return server.success ? [server.data] : [];
    });
  }

  private getServerParameter(
    document: TracearrOpenApiDocument,
  ): TracearrOpenApiParameter | undefined {
    for (const path of Object.values(document.paths ?? {})) {
      for (const operation of Object.values(path ?? {})) {
        const serverParameter = operation?.parameters?.find(
          (parameter) =>
            parameter.name === 'server_id' && parameter.in === 'query',
        );
        if (serverParameter) {
          return serverParameter;
        }
      }
    }

    return undefined;
  }

  private getServerName(description: string | undefined, id: string): string {
    if (!description) {
      return id;
    }

    const idIndex = description.indexOf(id);
    if (idIndex === -1) {
      return id;
    }

    const nameEnd = description.lastIndexOf('**', idIndex);
    const nameStart = description.lastIndexOf('**', nameEnd - 1);
    if (nameStart === -1 || nameEnd === -1 || nameEnd > idIndex) {
      return id;
    }

    const name = description.slice(nameStart + 2, nameEnd);
    return name || id;
  }

  private async fetchUsernamesByTracearrUserId(
    historyIndex: TracearrHistoryIndex,
  ): Promise<Map<string, string[]> | undefined> {
    const api = this.api;
    const serverId = this.settings.tracearr_server_id;
    if (!api || !serverId) {
      return undefined;
    }

    const mediaServer = await this.mediaServerFactory.getService();
    const mediaUsers = await mediaServer.getUsers();
    if (mediaUsers.length === 0) {
      return undefined;
    }

    const usernamesByAccountId = new Map(
      mediaUsers.map((user) => [user.id, user.name]),
    );
    const historyUserIds = new Set(
      [...historyIndex.rowsById.values()].map((row) => row.user.id),
    );
    const usernamesByTracearrUserId = new Map<string, string[]>();
    const cursors = new Set<string>();
    let cursor: string | undefined;

    for (;;) {
      const raw = await api.getWithoutCache<unknown>('/users', {
        params: {
          pageSize: TRACEARR_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
      });
      const parsed = tracearrUsersPageSchema.safeParse(raw);
      if (!parsed.success) {
        if (raw !== undefined) {
          this.logger.warn(
            'Tracearr users payload did not match the public API schema.',
          );
          this.logger.debug(parsed.error);
        }
        return undefined;
      }

      for (const user of parsed.data.data) {
        if (!historyUserIds.has(user.id)) {
          continue;
        }

        const usernames = user.accounts
          .filter((account) => account.server_id === serverId)
          .map((account) => usernamesByAccountId.get(account.external_user_id))
          .filter((username): username is string => Boolean(username));
        if (usernames.length > 0) {
          usernamesByTracearrUserId.set(user.id, usernames);
        }
      }

      const nextCursor = parsed.data.meta.nextCursor;
      if (!nextCursor) {
        return usernamesByTracearrUserId;
      }
      if (cursors.has(nextCursor)) {
        this.logger.warn('Tracearr users cursor repeated before completion.');
        return undefined;
      }
      cursors.add(nextCursor);
      cursor = nextCursor;
    }
  }

  private isHistoryConfigured(): boolean {
    return Boolean(this.api && this.settings.tracearr_server_id);
  }

  private async fetchEpisodeIds(
    libItem: MediaItem,
  ): Promise<string[] | undefined> {
    const mediaServer = await this.mediaServerFactory.getService();

    if (libItem.type === 'season') {
      const episodes = await mediaServer.getChildrenMetadata(
        libItem.id,
        'episode',
        true,
      );
      return episodes.map((item) => item.id);
    }
    if (libItem.type !== 'show') {
      return undefined;
    }

    const seasons = await mediaServer.getChildrenMetadata(
      libItem.id,
      'season',
      true,
    );
    const episodeLists = await Promise.all(
      seasons.map((season) =>
        mediaServer.getChildrenMetadata(season.id, 'episode', true),
      ),
    );
    return episodeLists.flatMap((episodes) => episodes.map((item) => item.id));
  }
}
