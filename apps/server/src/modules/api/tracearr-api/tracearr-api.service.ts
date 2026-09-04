import {
  BasicResponseDto,
  MediaItem,
  MINIMUM_TRACEARR_VERSION,
  TracearrServer,
  TracearrHistoryItem,
  tracearrHistoryPageSchema,
  tracearrLibrariesPageSchema,
  tracearrRecentlyAddedPageSchema,
  tracearrServerSchema,
  tracearrUsersPageSchema,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { SettingsDataService } from '../../settings/settings-data.service';
import { resolveDescendants } from '../media-server/context-action.util';
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
  TRACEARR_SERVER_MATCH_THRESHOLD,
  TRACEARR_SERVER_PROBE_MINIMUM,
  TRACEARR_SERVER_PROBE_SIZE,
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

// Tracearr truncates the media server's added date to milliseconds, so the two
// only agree to the second.
const sameSecond = (left: Date | undefined, right: number): boolean =>
  left != null &&
  !Number.isNaN(right) &&
  Math.floor(left.getTime() / 1000) === Math.floor(right / 1000);

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
  private episodeIdsByItemId = new Map<string, Promise<string[]>>();
  private resolvedServerId: string | undefined;
  private historyGeneration = 0;
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
    this.resolvedServerId = undefined;
    // A sweep already in flight resolves after this, so mark its results stale
    // rather than let them repopulate what was just discarded.
    this.historyGeneration += 1;
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
      const servers = this.getServersFromOpenApiDocument(document);
      const sameType = await this.keepServersMatchingMediaServer(api, servers);
      return await this.keepServersSharingLibrary(params, sameType);
    } catch (error) {
      this.logger.warn(
        'Could not load Tracearr servers from the public API document.',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  /** True when nothing is bound: there is no stale selection to catch. */
  public async savedServerTracksMediaServer(): Promise<boolean | undefined> {
    const url = this.settings.tracearr_url;
    const apiKey = this.settings.tracearr_api_key;
    const serverId = this.settings.tracearr_server_id;
    if (!url || !apiKey || !serverId) {
      return true;
    }

    return this.serverSharesLibrary({ url, apiKey }, serverId);
  }

  /**
   * Confirms a Tracearr server is the one Maintainerr manages by taking its own
   * recently added items and resolving their rating keys against the media
   * server. A key alone proves nothing, since every Plex server numbers its
   * items from the same small range, so the title has to agree too.
   *
   * Returns undefined only when too little could be checked to judge, which is
   * deliberately not the same as "wrong server": an unreadable library must not
   * lock anyone out, while a foreign one must not be accepted.
   */
  public async serverSharesLibrary(
    params: ConstructorParameters<typeof TracearrApi>[0],
    serverId: string,
  ): Promise<boolean | undefined> {
    const api = new TracearrApi(params, this.loggerFactory.createLogger());
    const raw = await api.getWithoutCache<unknown>('/recently-added', {
      params: { server_id: serverId, pageSize: TRACEARR_SERVER_PROBE_SIZE },
    });
    const parsed = tracearrRecentlyAddedPageSchema.safeParse(raw);
    if (!parsed.success || parsed.data.data.length === 0) {
      return undefined;
    }

    const mediaServer = await this.mediaServerFactory.getService();
    let matches = 0;
    let contradictions = 0;
    for (const item of parsed.data.data) {
      if (!item.rating_key) {
        continue;
      }

      const metadata = await mediaServer.getMetadata(item.rating_key);
      if (metadata !== undefined) {
        // Titles like "Season 1" repeat across every library, and Plex and Emby
        // both number items from the same small range, so a title alone proves
        // nothing. The added date is the second signal: every server reports
        // one for every item, unlike year, which is missing on most rows.
        // Tracearr stores it at millisecond precision, so compare by second.
        const localAddedAt = metadata.addedAt?.getTime();
        const remoteAddedAt = Date.parse(item.added_at);
        const datesComparable =
          localAddedAt !== undefined &&
          !Number.isNaN(localAddedAt) &&
          !Number.isNaN(remoteAddedAt);

        if (metadata.title !== item.title) {
          contradictions += 1;
        } else if (!datesComparable) {
          // Every mapper leaves a missing added date as an invalid Date, so
          // it proves nothing either way. All three request the field, so
          // reaching this needs the server to omit it.
          continue;
        } else if (sameSecond(metadata.addedAt, remoteAddedAt)) {
          matches += 1;
          if (matches >= TRACEARR_SERVER_MATCH_THRESHOLD) {
            return true;
          }
        } else {
          // Same title, different moment: a different copy on a different
          // server, which argues against this one rather than proving nothing.
          contradictions += 1;
        }
        continue;
      }

      // getMetadata cannot tell an absent item from a failed read, so it must
      // not decide this on its own. itemExists answers false only when the
      // server says the item is gone, and throws otherwise, which keeps a
      // timeout or a 5xx from condemning the right server.
      try {
        if (!(await mediaServer.itemExists(item.rating_key))) {
          contradictions += 1;
        }
      } catch {
        return undefined;
      }
    }

    // Jellyfin ids are per-server GUIDs, so a foreign server's items are absent
    // rather than merely different. Absence and disagreement both count against
    // the server, but only once enough items agree on it.
    if (matches === 0 && contradictions >= TRACEARR_SERVER_PROBE_MINIMUM) {
      return false;
    }

    return undefined;
  }

  /**
   * Narrows several same-type candidates to those whose items resolve on the
   * managed library, which is the only thing that separates two servers of one
   * type. Falls back to the whole list when that confirms none, so an
   * unreadable library leaves something to choose from rather than nothing.
   */
  private async keepServersSharingLibrary(
    params: ConstructorParameters<typeof TracearrApi>[0],
    servers: TracearrServer[],
  ): Promise<TracearrServer[]> {
    if (servers.length < 2) {
      return servers;
    }

    const confirmed: TracearrServer[] = [];
    for (const server of servers) {
      if (await this.serverSharesLibrary(params, server.id)) {
        confirmed.push(server);
      }
    }

    return confirmed.length > 0 ? confirmed : servers;
  }

  /**
   * Resolves the one Tracearr server whose media server Maintainerr manages.
   * Undefined when Tracearr has no such server, or when more than one survives,
   * since either way there is nothing safe to bind to on its own.
   */
  public async resolveServerId(
    params: ConstructorParameters<typeof TracearrApi>[0],
  ): Promise<string | undefined> {
    const servers = await this.getServers(params);
    return servers?.length === 1 ? servers[0].id : undefined;
  }

  /**
   * The server list carries no type, so /libraries supplies it. Only the media
   * server Maintainerr manages shares its rating keys, and offering the others
   * yields rules that silently match nothing. A server absent from /libraries
   * has no type to compare and is kept, so it stays selectable.
   */
  private async keepServersMatchingMediaServer(
    api: TracearrApi,
    servers: TracearrServer[],
  ): Promise<TracearrServer[]> {
    const mediaServerType = this.settings.media_server_type;
    if (!mediaServerType) {
      return servers;
    }

    const raw = await api.getWithoutCache<unknown>('/libraries');
    const parsed = tracearrLibrariesPageSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.warn(
        'Could not read Tracearr library types. Listing every Tracearr server.',
      );
      return servers;
    }

    const typeByServerId = new Map(
      parsed.data.data.map((library) => [
        library.server_id,
        library.server_type,
      ]),
    );
    return servers.filter((server) => {
      const serverType = typeByServerId.get(server.id);
      return serverType === undefined || serverType === mediaServerType;
    });
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

  /**
   * The stored server id is only a cache. A media server switch clears it, and
   * an unchanged settings form cannot be re-saved, so the matching server is
   * resolved here rather than making the user reconfigure.
   */
  private async resolveActiveServerId(): Promise<string | undefined> {
    if (!this.api) {
      return undefined;
    }
    if (this.settings.tracearr_server_id) {
      this.resolvedServerId = this.settings.tracearr_server_id;
      return this.resolvedServerId;
    }
    if (this.resolvedServerId) {
      return this.resolvedServerId;
    }

    const generation = this.historyGeneration;
    const resolved = await this.resolveServerId({
      url: this.settings.tracearr_url,
      apiKey: this.settings.tracearr_api_key,
    });
    if (generation !== this.historyGeneration) {
      return undefined;
    }

    this.resolvedServerId = resolved;
    return this.resolvedServerId;
  }

  private async prefetchHistoryInternal(): Promise<void> {
    const generation = this.historyGeneration;
    this.activeHistoryIndex = undefined;
    this.activeUsernamesByTracearrUserId = undefined;
    this.episodeIdsByItemId.clear();

    const serverId = await this.resolveActiveServerId();
    if (!serverId) {
      this.logger.warn(
        'Tracearr has no server matching the configured media server. Tracearr rule values are unavailable for this run.',
      );
      return;
    }

    // A binding survives whatever the media server did since it was chosen, and
    // the wrong one's history reads as "watched nothing" for every item it does
    // not cover rather than as a failure. Unconfirmed is not good enough to
    // read history by.
    const sharesLibrary = await this.serverSharesLibrary(
      {
        url: this.settings.tracearr_url,
        apiKey: this.settings.tracearr_api_key,
      },
      serverId,
    );
    if (!sharesLibrary) {
      this.logger.warn(
        sharesLibrary === false
          ? 'The selected Tracearr server tracks a different media server than the one Maintainerr manages. Pick the right server in Tracearr settings. Tracearr rule values are unavailable for this run.'
          : 'The selected Tracearr server could not be confirmed to track the media server Maintainerr manages. Tracearr rule values are unavailable for this run.',
      );
      return;
    }

    const historyIndex = await this.refreshHistoryIndex(generation);
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

    if (generation !== this.historyGeneration) {
      return;
    }

    this.activeHistoryIndex = historyIndex;
    this.logger.log(
      `Tracearr history starts at ${new Date(historyIndex.earliestStartedAt).toISOString()}. Earlier unobserved media is skipped.`,
    );
    const usernames = await this.fetchUsernamesByTracearrUserId();
    if (!usernames) {
      this.logger.warn(
        'Tracearr media-server user lookup did not complete. Tracearr username rule values are unavailable for this run.',
      );
      return;
    }

    if (generation !== this.historyGeneration) {
      return;
    }

    this.activeUsernamesByTracearrUserId = usernames;
  }

  /**
   * Tracearr's public history only returns a play once one of its segments ran
   * for 2 minutes or more, so every Tracearr rule property counts sustained
   * plays only.
   */
  private async refreshHistoryIndex(
    generation: number,
  ): Promise<TracearrHistoryIndex | undefined> {
    const api = this.api;
    const serverId = this.resolvedServerId;
    const mediaServerType = this.settings.media_server_type;
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

        // Rating keys only exist within one media server, so a mismatched
        // selection matches nothing at all rather than matching partially.
        if (mediaServerType && row.server_type !== mediaServerType) {
          this.logger.warn(
            `The selected Tracearr server is ${row.server_type}, but Maintainerr is configured for ${mediaServerType}. Select the Tracearr server for the media server Maintainerr manages.`,
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
    if (generation === this.historyGeneration) {
      cache?.set(TRACEARR_HISTORY_CACHE_KEY, index);
    }
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

  private async fetchUsernamesByTracearrUserId(): Promise<
    Map<string, string[]> | undefined
  > {
    const api = this.api;
    const serverId = this.resolvedServerId;
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
        // Mapped whether or not they appear in the swept history: absence has
        // to mean "Tracearr has no such user" so the per-user properties can
        // skip rather than read an unknown user as "watched nothing" (#3387
        // fails closed). One name per account: Tracearr's `username` IS the
        // media server's - it re-reads it on every user sync, from plex.tv on
        // Plex (the spelling the rule editor offers) and from the server's
        // user list on Jellyfin and Emby. The live account list only fills in
        // when Tracearr answered no name at all.
        const usernames = [
          ...new Set(
            user.accounts
              .filter(
                (account) =>
                  account.server_id === serverId && !account.removed_at,
              )
              .map(
                (account) =>
                  account.username ??
                  usernamesByAccountId.get(account.external_user_id),
              )
              .filter((username): username is string => Boolean(username)),
          ),
        ];
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

  /** Every episode under a show or season; callers guarantee the type. */
  private async fetchEpisodeIds(libItem: MediaItem): Promise<string[]> {
    const mediaServer = await this.mediaServerFactory.getService();
    const descendants = await resolveDescendants(libItem, (parentId, type) =>
      mediaServer.getChildrenMetadata(parentId, type, true),
    );
    return descendants
      .filter((item) => item.type === 'episode')
      .map((item) => item.id);
  }
}
