import { BasicResponseDto, PlexSetting } from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import { isIP } from 'net';
import {
  CONNECTION_TEST_TIMEOUT_MS,
  getErrorMessage,
} from '../../../utils/connection-error';
import cacheManager from '../../api/lib/cache';
import PlexCommunityApi, {
  PlexCommunityErrorResponse,
  PlexCommunityWatchList,
  PlexCommunityWatchListResponse,
} from '../../api/lib/plexCommunityApi';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../../logging/logs.service';
import { Settings } from '../../settings/entities/settings.entities';
import { SettingsService } from '../../settings/settings.service';
import PlexApi from '../lib/plexApi';
import PlexTvApi, { PlexUser } from '../lib/plextvApi';
import { CollectionHubSettingsDto } from './dto/collection-hub-settings.dto';
import { EPlexDataType } from './enums/plex-data-type-enum';
import {
  CreateUpdateCollection,
  PlexCollection,
  PlexPlaylist,
} from './interfaces/collection.interface';
import {
  PlexHub,
  PlexHubResponse,
  PlexLibrariesResponse,
  PlexLibrary,
  PlexLibraryItem,
  PlexLibraryResponse,
  PlexSeenBy,
  PlexUserAccount,
  SimplePlexUser,
} from './interfaces/library.interfaces';
import {
  PlexMetadata,
  PlexMetadataResponse,
} from './interfaces/media.interface';
import {
  PlexAccountsResponse,
  PlexConnection,
  PlexDevice,
  PlexStatusResponse,
} from './interfaces/server.interface';
import { PLEX_PAGE_SIZE } from './plex-api.constants';

type PlexApiSettings = SettingsService &
  Pick<
    Settings,
    | 'plex_name'
    | 'plex_hostname'
    | 'plex_port'
    | 'plex_ssl'
    | 'plex_auth_token'
    | 'plex_machine_id'
    | 'plex_manual_mode'
  >;

@Injectable()
export class PlexApiService {
  private plexClient: PlexApi;
  private plexTvClient: PlexTvApi;
  private plexCommunityClient: PlexCommunityApi;
  private machineId: string;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: PlexApiSettings,
    private readonly logger: MaintainerrLogger,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {
    this.logger.setContext(PlexApiService.name);
  }

  private getDbSettings(): PlexSetting {
    return {
      name: this.settings.plex_name,
      machineId: this.machineId,
      ip: this.settings.plex_hostname,
      port: this.settings.plex_port,
      auth_token: this.settings.plex_auth_token,
      useSsl: this.settings.plex_ssl === 1 ? true : false,
      webAppUrl: this.settings.plex_hostname,
      manualMode: this.settings.plex_manual_mode === 1,
    };
  }

  public isPlexSetup(): boolean {
    return this.plexClient != null;
  }

  /**
   * Rank discovered Plex connections by preference.
   * Prefers local direct-IP connections (no DNS needed) over plex.direct
   * hostnames, which avoids DNS resolution issues common in Docker.
   *
   * Priority: reachable > local + direct IP > local + plex.direct > remote
   */
  public static rankConnections(
    connections: PlexConnection[],
  ): PlexConnection[] {
    const isDirectIp = (address: string) => isIP(address) !== 0;

    return [...connections].sort((a, b) => {
      // 1. Reachable first (status 200)
      const aReachable = a.status === 200 ? 1 : 0;
      const bReachable = b.status === 200 ? 1 : 0;
      if (bReachable !== aReachable) return bReachable - aReachable;

      // 2. Local over remote
      const aLocal = a.local ? 1 : 0;
      const bLocal = b.local ? 1 : 0;
      if (bLocal !== aLocal) return bLocal - aLocal;

      // 3. Direct IP over DNS-dependent hostnames (e.g., *.plex.direct)
      const aDirectIp = isDirectIp(a.address) ? 1 : 0;
      const bDirectIp = isDirectIp(b.address) ? 1 : 0;
      if (bDirectIp !== aDirectIp) return bDirectIp - aDirectIp;

      // 4. Lower latency preferred
      return (a.latency ?? Infinity) - (b.latency ?? Infinity);
    });
  }

  private buildCollectionItemsUri(itemIds: string[]): string {
    // Canonical Plex URI for `PUT /library/collections/{id}/items?uri=…`, aligned
    // with python-plexapi's Collection.addItems: a single `/library/metadata/`
    // prefix followed by comma-joined ratingKeys. The previous `library://.../item/`
    // form did not match that upstream shape and is the most likely cause of the
    // observed 400 responses on multi-item batches.
    return encodeURIComponent(
      `server://${this.machineId}/com.plexapp.plugins.library/library/metadata/${itemIds.join(',')}`,
    );
  }

  private extractPlexAvatarUuid(thumb?: string): string | undefined {
    if (!thumb) {
      return undefined;
    }

    try {
      const url = new URL(thumb);

      if (url.protocol !== 'https:' || url.hostname !== 'plex.tv') {
        return undefined;
      }

      const prefix = '/users/';
      const suffix = '/avatar';
      const path = url.pathname;

      if (!path.startsWith(prefix) || !path.endsWith(suffix)) {
        return undefined;
      }

      const uuid = path.slice(prefix.length, -suffix.length);
      if (!uuid || uuid.includes('/')) {
        return undefined;
      }

      for (const character of uuid) {
        const isDigit = character >= '0' && character <= '9';
        const isLowercaseLetter = character >= 'a' && character <= 'z';

        if (!isDigit && !isLowercaseLetter) {
          return undefined;
        }
      }

      const cacheBuster = url.searchParams.get('c');
      if (!cacheBuster) {
        return undefined;
      }

      for (const character of cacheBuster) {
        if (character < '0' || character > '9') {
          return undefined;
        }
      }

      return uuid;
    } catch {
      return undefined;
    }
  }

  public uninitialize() {
    this.plexClient = undefined;
    this.plexCommunityClient = undefined;
    this.plexTvClient = undefined;
    cacheManager.getCache('plexguid').data.flushAll();
    cacheManager.getCache('plextv').data.flushAll();
    cacheManager.getCache('plexcommunity').data.flushAll();
  }

  public async initialize() {
    try {
      this.uninitialize();
      const settingsPlex = this.getDbSettings();
      const plexToken = settingsPlex.auth_token;

      if (!settingsPlex.ip || !plexToken) {
        this.logger.warn(
          "Plex API isn't fully initialized, required settings aren't set",
        );
        return;
      }

      this.plexTvClient = new PlexTvApi(
        plexToken,
        this.loggerFactory.createLogger(),
      );
      this.plexCommunityClient = new PlexCommunityApi(
        plexToken,
        this.loggerFactory.createLogger(),
      );

      // Try stored primary connection
      this.plexClient = new PlexApi({
        hostname: settingsPlex.ip,
        port: settingsPlex.port,
        https: settingsPlex.useSsl,
        token: plexToken,
      });

      const machineId = await this.setMachineId();

      if (machineId) {
        return; // Primary connection works
      }

      // Manual mode: don't attempt re-discovery, user owns the connection
      if (settingsPlex.manualMode) {
        this.plexClient = undefined;
        this.logger.warn(
          'Plex connection failed (manual mode active — skipping re-discovery)',
        );
        return;
      }

      // Re-discover from plex.tv
      const recovered = await this.rediscoverConnection(plexToken);
      if (!recovered) {
        // Clear the dead client so isSetup() reflects reality
        this.plexClient = undefined;
        this.logger.warn(
          'Plex connection failed after re-discovery attempt. Please check your settings',
        );
      }
    } catch (error) {
      this.plexClient = undefined;
      this.logger.error(
        `Couldn't connect to Plex.. Please check your settings`,
      );
      this.logger.debug(error);
    }
  }

  /**
   * Attempt to re-discover a working Plex connection from plex.tv.
   * Matches the stored machineId to find the right server, ranks connections
   * to prefer local direct-IP, and promotes the first working one to primary.
   */
  private async rediscoverConnection(plexToken: string): Promise<boolean> {
    const storedMachineId = this.settings.plex_machine_id;

    if (!storedMachineId) {
      this.logger.debug(
        'No stored machine ID — cannot identify server for re-discovery',
      );
      return false;
    }

    this.logger.log(
      'Primary Plex connection failed, attempting re-discovery from plex.tv...',
    );

    try {
      const devices = await this.getAvailableServers();
      const matchingDevice = devices?.find(
        (d) => d.clientIdentifier === storedMachineId,
      );

      if (!matchingDevice?.connection?.length) {
        this.logger.debug(
          'Re-discovery: server not found or no reachable connections',
        );
        return false;
      }

      const ranked = PlexApiService.rankConnections(matchingDevice.connection);

      for (const conn of ranked) {
        const testClient = new PlexApi({
          hostname: conn.address,
          port: conn.port,
          https: conn.protocol === 'https',
          timeout: CONNECTION_TEST_TIMEOUT_MS,
          token: plexToken,
        });

        const ok = await testClient.getStatus();
        if (!ok) continue;

        // Found a working connection — promote it
        this.plexClient = new PlexApi({
          hostname: conn.address,
          port: conn.port,
          https: conn.protocol === 'https',
          token: plexToken,
        });

        await this.settings.updatePlexConnectionDetails({
          plex_hostname: conn.address,
          plex_port: conn.port,
          plex_ssl: conn.protocol === 'https' ? 1 : 0,
        });

        await this.setMachineId();

        this.logger.log(
          `Re-discovery: switched to ${conn.protocol}://${conn.address}:${conn.port} (local=${conn.local})`,
        );
        return true;
      }

      this.logger.debug('Re-discovery: all discovered connections failed');
      return false;
    } catch (error) {
      this.logger.debug('Re-discovery from plex.tv failed');
      this.logger.debug(error);
      return false;
    }
  }

  public async getStatus() {
    try {
      if (!this.isPlexSetup()) {
        this.logger.debug('Plex client not initialized, skipping getStatus');
        return undefined;
      }
      const response: PlexStatusResponse = await this.plexClient.query(
        '/',
        false,
      );
      return response.MediaContainer;
    } catch (error) {
      this.logger.debug('Plex status probe failed');
      return undefined;
    }
  }

  public async validateAuthToken(token?: string): Promise<boolean> {
    const authToken = token ?? this.settings.plex_auth_token;

    if (!authToken) {
      throw new Error('Plex auth token is required for validation');
    }

    try {
      const plexTvClient = new PlexTvApi(
        authToken,
        this.loggerFactory.createLogger(),
      );

      await plexTvClient.getUser();
      return true;
    } catch (error) {
      this.logger.debug('Plex auth token validation failed');
      this.logger.debug(error);
      return false;
    }
  }

  public async searchContent(input: string) {
    try {
      const response: PlexMetadataResponse = await this.plexClient.query(
        `/search?query=${encodeURIComponent(input)}&includeGuids=1`,
      );
      const results = response.MediaContainer.Metadata
        ? Promise.all(
            response.MediaContainer.Metadata.filter(
              (x) => x.type === 'movie' || x.type === 'show',
            ).map(async (el: PlexMetadata) => {
              return el.grandparentRatingKey
                ? await this.getMetadata(el.grandparentRatingKey.toString())
                : el;
            }),
          )
        : [];
      const filteredResults: PlexMetadata[] = [];
      (await results).forEach((el: PlexMetadata) => {
        if (
          filteredResults.find(
            (e: PlexMetadata) => e.ratingKey === el.ratingKey,
          ) === undefined
        ) {
          filteredResults.push(el);
        }
      });
      return filteredResults;
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getUsers(): Promise<PlexUserAccount[]> {
    try {
      const response: PlexAccountsResponse = await this.plexClient.queryAll({
        uri: '/accounts',
      });
      return response.MediaContainer.Account;
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getUser(id: number): Promise<PlexUserAccount> {
    try {
      const response: PlexAccountsResponse = await this.plexClient.queryAll({
        uri: `/accounts/${id}`,
      });
      return response?.MediaContainer?.Account[0];
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getLibraries(): Promise<PlexLibrary[]> {
    try {
      const response = await this.plexClient.queryAll<PlexLibrariesResponse>({
        uri: '/library/sections',
      });

      return response.MediaContainer.Directory ?? [];
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getLibraryContentCount(
    id: string | number,
    datatype?: EPlexDataType,
  ): Promise<number | undefined> {
    try {
      const type = datatype ? '?type=' + datatype : '';
      const response = await this.plexClient.query<PlexLibrariesResponse>({
        uri: `/library/sections/${id}/all${type}`,
        extraHeaders: {
          'X-Plex-Container-Start': '0',
          'X-Plex-Container-Size': '0',
        },
      });

      return response.MediaContainer.totalSize;
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getLibraryContents(
    id: string,
    {
      offset = 0,
      size = PLEX_PAGE_SIZE.DEFAULT,
      sort,
    }: { offset?: number; size?: number; sort?: string } = {},
    datatype?: EPlexDataType,
    useCache: boolean = true,
  ): Promise<{ totalSize: number; items: PlexLibraryItem[] }> {
    try {
      const type = datatype ? '&type=' + datatype : '';
      const sortQuery = sort ? `&sort=${encodeURIComponent(sort)}` : '';
      const response = await this.plexClient.query<PlexLibraryResponse>(
        {
          uri: `/library/sections/${id}/all?includeGuids=1${type}${sortQuery}`,
          extraHeaders: {
            'X-Plex-Container-Start': `${offset}`,
            'X-Plex-Container-Size': `${size}`,
          },
        },
        useCache,
      );

      return {
        totalSize: response.MediaContainer.totalSize,
        items: (response.MediaContainer.Metadata as PlexLibraryItem[]) ?? [],
      };
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async searchLibraryContents(
    id: string,
    query: string,
    datatype?: EPlexDataType,
  ): Promise<PlexLibraryItem[]> {
    try {
      const params = new URLSearchParams({
        includeGuids: '1',
        title: query,
        ...(datatype ? { type: datatype.toString() } : {}),
      });

      const response = await this.plexClient.query<PlexLibraryResponse>({
        uri: `/library/sections/${id}/all?${params.toString()}`,
      });

      return response.MediaContainer.Metadata as PlexLibraryItem[];
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getMetadata(
    key: string,
    options: { includeChildren?: boolean; includeExternalMedia?: boolean } = {},
    useCache: boolean = true,
  ): Promise<PlexMetadata> {
    try {
      const queryParams = new URLSearchParams();

      if (options.includeChildren) {
        queryParams.set('includeChildren', '1');
      }

      if (options.includeChildren || options.includeExternalMedia) {
        queryParams.set('includeExternalMedia', '1');
        queryParams.set('asyncAugmentMetadata', '1');
      }

      const queryString = queryParams.toString();

      const response = await this.plexClient.query<PlexMetadataResponse>(
        `/library/metadata/${key}${queryString.length > 0 ? `?${queryString}` : ''}`,
        useCache,
      );
      if (response) {
        return response.MediaContainer.Metadata[0];
      } else {
        return undefined;
      }
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public resetMetadataCache(mediaId: string) {
    cacheManager.getCache('plexguid').data.del(
      JSON.stringify({
        uri: `/library/metadata/${mediaId}`,
      }),
    );
  }

  public async getDiscoverDataUserState(
    metaDataRatingKey: string,
  ): Promise<any> {
    const settings = this.getDbSettings();

    try {
      const response = await axios.get(
        `https://discover.provider.plex.tv/library/metadata/${metaDataRatingKey}/userState`,
        {
          headers: {
            'content-type': 'application/json',
            'X-Plex-Token': settings.auth_token,
          },
        },
      );

      return response.data.MediaContainer.UserState;
    } catch (error) {
      this.logger.error(
        "Outbound call to discover.provider.plex.tv failed. Couldn't fetch userState",
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getUserDataFromPlexTv(): Promise<any> {
    try {
      const response = await this.plexTvClient.getUsers();
      return response.MediaContainer.User;
    } catch (error) {
      this.logger.error(
        "Outbound call to plex.tv failed. Couldn't fetch users",
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getOwnerDataFromPlexTv(): Promise<PlexUser> {
    try {
      return await this.plexTvClient.getUser();
    } catch (error) {
      this.logger.error(
        "Outbound call to plex.tv failed. Couldn't fetch owner",
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getChildrenMetadata(key: string): Promise<PlexMetadata[]> {
    try {
      const response = await this.plexClient.queryAll<PlexMetadataResponse>({
        uri: `/library/metadata/${key}/children`,
      });

      return response.MediaContainer.Metadata;
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getRecentlyAdded(
    id: string,
    options: { addedAt: number } = {
      addedAt: Date.now() - 1000 * 60 * 60,
    },
  ): Promise<PlexLibraryItem[]> {
    try {
      const response = await this.plexClient.queryAll<PlexLibraryResponse>({
        uri: `/library/sections/${id}/all?sort=addedAt%3Adesc&addedAt>>=${Math.floor(
          options.addedAt / 1000,
        )}`,
      });
      return response.MediaContainer.Metadata as PlexLibraryItem[];
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getWatchHistory(
    itemId: string,
    useCache: boolean = true,
  ): Promise<PlexSeenBy[]> {
    try {
      const response: PlexLibraryResponse =
        await this.plexClient.queryAll<PlexLibraryResponse>(
          {
            uri: `/status/sessions/history/all?sort=viewedAt:desc&metadataItemID=${itemId}`,
          },
          useCache,
        );
      return response.MediaContainer.Metadata as PlexSeenBy[];
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getCollections(
    libraryId: string | number,
    subType?: 'movie' | 'show' | 'season' | 'episode',
  ): Promise<PlexCollection[]> {
    try {
      const response = await this.plexClient.queryAll<PlexLibraryResponse>({
        uri: `/library/sections/${libraryId}/collections?${subType ? `subtype=${subType}` : ''}`,
      });
      const collection: PlexCollection[] = response.MediaContainer
        .Metadata as PlexCollection[];

      return collection;
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  /**
   * Retrieves all playlists from the Plex API the given ratingKey is part of.
   *
   * @return {Promise<PlexPlaylist[]>} A promise that resolves to an array of Plex playlists.
   */
  public async getPlaylists(libraryId: string): Promise<PlexPlaylist[]> {
    try {
      const filteredItems: PlexPlaylist[] = [];

      const response = await this.plexClient.queryAll<PlexLibraryResponse>({
        uri: `/playlists?playlistType=video&includeCollections=1&includeExternalMedia=1&includeAdvanced=1&includeMeta=1`,
      });

      const items = response.MediaContainer.Metadata
        ? (response.MediaContainer.Metadata as PlexPlaylist[])
        : [];

      for (const item of items) {
        const itemResp = await this.plexClient.query<PlexLibraryResponse>({
          uri: item.key,
        });

        const filteredForRatingKey = (
          itemResp?.MediaContainer?.Metadata as PlexLibraryItem[]
        )?.filter((i) => i.ratingKey === libraryId);

        if (filteredForRatingKey && filteredForRatingKey.length > 0) {
          filteredItems.push(item);
        }
      }

      return filteredItems;
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async deleteMediaFromDisk(plexId: number | string): Promise<void> {
    try {
      await this.plexClient.deleteQuery({
        uri: `/library/metadata/${plexId}`,
      });
      this.logger.log(
        `[Plex] Removed media with ID ${plexId} from Plex library.`,
      );
    } catch (error) {
      this.logger.error(
        `Something went wrong while removing media ${plexId} from Plex.`,
      );
      this.logger.debug(error);
    }
  }

  public async refreshMediaMetadata(ratingKey: string): Promise<void> {
    try {
      await this.plexClient.putQuery({
        uri: `/library/metadata/${ratingKey}/refresh`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to refresh Plex metadata for item ${ratingKey}`,
      );
      this.logger.debug(error);
      throw error;
    }
  }

  public async getCollection(
    collectionId: string | number,
  ): Promise<PlexCollection> {
    try {
      const response = await this.plexClient.query<PlexLibraryResponse>(
        {
          uri: `/library/collections/${+collectionId}?`,
        },
        false,
      );
      // Metadata can be a single object or an array - handle both
      const metadata = response.MediaContainer.Metadata;
      const collection = (
        Array.isArray(metadata) ? metadata[0] : metadata
      ) as PlexCollection;

      return collection;
    } catch (error) {
      this.logger.debug(`Couldn't find collection with id ${+collectionId}`);
      this.logger.debug(error);
      return undefined;
    }
  }

  public async createCollection(params: CreateUpdateCollection) {
    try {
      const response = await this.plexClient.postQuery<any>({
        uri: `/library/collections?type=${
          params.type
        }&title=${encodeURIComponent(params.title)}&sectionId=${
          params.libraryId
        }`,
      });
      const collection: PlexCollection = response.MediaContainer
        .Metadata[0] as PlexCollection;
      if (params.summary || params.sortTitle) {
        params.collectionId = collection.ratingKey;
        return this.updateCollection(params);
      }
      return collection;
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async updateCollection(body: CreateUpdateCollection) {
    try {
      let uri = `/library/sections/${body.libraryId}/all?type=18&id=${body.collectionId}`;

      if (body.title) {
        uri += `&title.value=${encodeURIComponent(body.title)}`;
      }
      if (body.summary) {
        uri += `&summary.value=${encodeURIComponent(body.summary)}`;
      }
      if (body.sortTitle) {
        // Lock sort title so Plex keeps the custom value.
        uri += `&titleSort.value=${encodeURIComponent(body.sortTitle)}&titleSort.locked=1`;
      } else if (body.title) {
        // Clear custom sort title and fall back to the regular title.
        uri += `&titleSort.value=${encodeURIComponent(body.title)}&titleSort.locked=0`;
      }
      await this.plexClient.putQuery({ uri });
      return await this.getCollection(+body.collectionId);
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async deleteCollection(
    collectionId: string,
  ): Promise<BasicResponseDto> {
    try {
      await this.plexClient.deleteQuery({
        uri: `/library/collections/${collectionId}`,
      });
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return {
        status: 'NOK',
        code: 0,
        message: getErrorMessage(
          error,
          'Something went wrong while deleting the collection from Plex',
        ),
      };
    }
    this.logger.log('Removed collection from Plex');
    return {
      status: 'OK',
      code: 1,
      message: 'Success',
    };
  }

  public async getCollectionChildren(
    collectionId: string,
    useCache: boolean = true,
  ): Promise<PlexLibraryItem[]> {
    try {
      const response: PlexLibraryResponse =
        await this.plexClient.queryAll<PlexLibraryResponse>(
          {
            uri: `/library/collections/${collectionId}/children`,
          },
          useCache,
        );

      // Empty collections return no Metadata node
      if (response.MediaContainer.Metadata === undefined) {
        return [];
      }

      return response.MediaContainer.Metadata as PlexLibraryItem[];
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async addChildToCollection(
    collectionId: string,
    childId: string,
  ): Promise<PlexCollection | BasicResponseDto> {
    try {
      await this.forceMachineId();
      const response: PlexLibraryResponse = await this.plexClient.putQuery({
        uri: `/library/collections/${collectionId}/items?uri=${this.buildCollectionItemsUri([childId])}`,
      });
      return response.MediaContainer.Metadata[0] as PlexCollection;
    } catch (error) {
      const failure = this.buildCollectionMutationFailure(error);

      if (failure.logLevel === 'warn') {
        this.logger.warn(failure.message);
      } else {
        this.logger.error(failure.message);
      }
      this.logger.debug(error);
      return {
        status: 'NOK',
        code: failure.code,
        message: failure.message,
      } as BasicResponseDto;
    }
  }

  public async addChildrenToCollection(
    collectionId: string,
    childIds: string[],
  ): Promise<PlexCollection | BasicResponseDto> {
    if (childIds.length === 0) {
      return {
        status: 'OK',
        code: 1,
        message: 'No collection items to add',
      } as BasicResponseDto;
    }

    try {
      await this.forceMachineId();
      const response: PlexLibraryResponse = await this.plexClient.putQuery({
        uri: `/library/collections/${collectionId}/items?uri=${this.buildCollectionItemsUri(childIds)}`,
      });

      return (
        (response.MediaContainer.Metadata?.[0] as PlexCollection | undefined) ??
        ({
          status: 'OK',
          code: 1,
          message: `successfully added ${childIds.length} children to collection ${collectionId}`,
        } as BasicResponseDto)
      );
    } catch (error) {
      const failure = this.buildCollectionMutationFailure(error);

      if (failure.logLevel === 'error') {
        this.logger.error(failure.message);
        this.logger.debug(error);
      }

      return {
        status: 'NOK',
        code: failure.code,
        message: failure.message,
      } as BasicResponseDto;
    }
  }

  private buildCollectionMutationFailure(error: unknown): {
    code: number;
    logLevel: 'warn' | 'error';
    message: string;
  } {
    if (axios.isAxiosError(error) && error.response?.status) {
      const responseBody = this.stringifyResponseBody(error.response.data);
      const statusMessage = `Plex request failed with ${error.response.status}${error.response.statusText ? ` ${error.response.statusText}` : ''}`;

      return {
        code: error.response.status,
        logLevel:
          error.response.status >= 400 && error.response.status < 500
            ? 'warn'
            : 'error',
        message: responseBody
          ? `${statusMessage}. Response body: ${responseBody}`
          : `${statusMessage}.`,
      };
    }

    return {
      code: 0,
      logLevel: 'error',
      message: getErrorMessage(
        error,
        'Plex api communication failure.. Is the application running?',
      ),
    };
  }

  private stringifyResponseBody(body: unknown): string | undefined {
    if (body == null) {
      return undefined;
    }

    if (typeof body === 'string') {
      return body;
    }

    try {
      return JSON.stringify(body);
    } catch {
      return undefined;
    }
  }

  public async deleteChildFromCollection(
    collectionId: string,
    childId: string,
  ): Promise<BasicResponseDto> {
    try {
      await this.plexClient.deleteQuery({
        uri: `/library/collections/${collectionId}/children/${childId}`,
      });
      return {
        status: 'OK',
        code: 1,
        message: `successfully deleted child with id ${childId}`,
      } as BasicResponseDto;
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return {
        status: 'NOK',
        code: 0,
        message: getErrorMessage(
          error,
          'Plex api communication failure.. Is the application running?',
        ),
      } as BasicResponseDto;
    }
  }

  public async UpdateCollectionSettings(
    params: CollectionHubSettingsDto,
  ): Promise<PlexHub> {
    try {
      const response: PlexHubResponse = await this.plexClient.postQuery({
        uri: `/hubs/sections/${params.libraryId}/manage?metadataItemId=${
          params.collectionId
        }&promotedToRecommended=${+params.recommended}&promotedToOwnHome=${+params.ownHome}&promotedToSharedHome=${+params.sharedHome}`,
      });
      return response.MediaContainer.Hub[0] as PlexHub;
    } catch (error) {
      this.logger.error(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  public async getAvailableServers(): Promise<PlexDevice[]> {
    try {
      // reload requirements, auth token might have changed
      const settings = (await this.settings.getSettings()) as Settings;
      this.plexTvClient = new PlexTvApi(
        settings.plex_auth_token,
        this.loggerFactory.createLogger(),
      );

      const devices = (await this.plexTvClient?.getDevices())?.filter(
        (device) => {
          return device.provides.includes('server') && device.owned;
        },
      );

      if (devices) {
        await Promise.all(
          devices.map(async (device) => {
            device.connection.map((connection) => {
              const url = new URL(connection.uri);
              if (url.hostname !== connection.address) {
                const plexDirectConnection = {
                  ...connection,
                  address: url.hostname,
                };
                device.connection.push(plexDirectConnection);
                connection.protocol = 'http';
              }
            });

            const filteredConnectionPromises = device.connection.map(
              async (connection) => {
                const newClient = new PlexApi({
                  hostname: connection.address,
                  port: connection.port,
                  https: connection.protocol === 'https',
                  timeout: CONNECTION_TEST_TIMEOUT_MS,
                  token: settings.plex_auth_token,
                });

                const start = Date.now();
                const ok = await newClient.getStatus();
                if (!ok) return null;
                return {
                  ...connection,
                  status: 200,
                  latency: Date.now() - start,
                };
              },
            );

            device.connection = PlexApiService.rankConnections(
              (await Promise.all(filteredConnectionPromises)).filter(Boolean),
            );
          }),
        );
      }
      return devices;
    } catch (error) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(error);
      return [];
    }
  }

  public async getWatchlistIdsForUser(
    userId: string,
    username: string,
  ): Promise<PlexCommunityWatchList[]> {
    try {
      let result: PlexCommunityWatchList[] = [];
      let next = true;
      let page: string | null = null;
      const size = PLEX_PAGE_SIZE.WATCHLIST;

      while (next) {
        const resp = await this.plexCommunityClient.query<
          PlexCommunityWatchListResponse | PlexCommunityErrorResponse
        >({
          query: `
          query GetWatchlistHub($uuid: ID = "", $first: PaginationInt!, $after: String) {
            user(id: $uuid) {
              watchlist(first: $first, after: $after) {
                nodes {
                  id
                  key
                  title
                  type
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        `,
          variables: {
            uuid: userId,
            first: size,
            skipUserState: true,
            after: page,
          },
        });

        if (!resp) {
          this.logger.warn(
            `Failure while fetching watchlist of user ${userId} (${username})`,
          );
          return undefined;
        } else if (resp.errors) {
          this.logger.warn(
            `Failure while fetching watchlist of user ${userId} (${username}): ${resp.errors.map((x) => x.message).join(', ')}`,
          );
          return undefined;
        }

        const watchlist = resp.data.user.watchlist;
        result = [...result, ...watchlist.nodes];

        if (!watchlist.pageInfo?.hasNextPage) {
          next = false;
        } else {
          page = watchlist.pageInfo?.endCursor;
        }
      }
      return result;
    } catch (error) {
      this.logger.warn(
        `Failure while fetching watchlist of user ${userId} (${username})`,
      );
      this.logger.debug(error);
    }
  }

  public async getAllIdsForContextAction(
    collectionType: EPlexDataType,
    context: { type: EPlexDataType; id: number },
    media: { plexId: number },
  ) {
    const handleMedia: { plexId: number }[] = [];

    if (collectionType && media) {
      // switch based on collection type
      switch (collectionType) {
        // when collection type is seasons
        case EPlexDataType.SEASONS:
          switch (context.type) {
            // and context type is seasons
            case EPlexDataType.SEASONS:
              handleMedia.push({ plexId: context.id });
              break;
            // and content type is episodes
            case EPlexDataType.EPISODES:
              // this is not allowed
              this.logger.warn(
                'Tried to add episodes to a collection of type season. This is not allowed.',
              );
              break;
            // and context type is full show
            default:
              const data = await this.getChildrenMetadata(
                media.plexId.toString(),
              );
              // transform & add season
              data.forEach((el) => {
                handleMedia.push({
                  plexId: +el.ratingKey,
                });
              });
              break;
          }
          break;

        // when collection type is episodes
        case EPlexDataType.EPISODES:
          switch (context.type) {
            // and context type is seasons
            case EPlexDataType.SEASONS:
              const eps = await this.getChildrenMetadata(context.id.toString());
              // transform & add episodes
              eps.forEach((el) => {
                handleMedia.push({
                  plexId: +el.ratingKey,
                });
              });
              break;
            // and context type is episodes
            case EPlexDataType.EPISODES:
              handleMedia.push({ plexId: context.id });
              break;
            // and context type is full show
            default:
              // get all seasons
              const seasons = await this.getChildrenMetadata(
                media.plexId.toString(),
              );
              // get and add all episodes for each season
              for (const season of seasons) {
                const eps = await this.getChildrenMetadata(season.ratingKey);
                eps.forEach((ep) => {
                  handleMedia.push({
                    plexId: +ep.ratingKey,
                  });
                });
              }
              break;
          }
          break;
        // when collection type is SHOW or MOVIE
        default:
          // just add media item
          handleMedia.push({ plexId: media.plexId });
          break;
      }
    }
    // for all collections
    else {
      switch (context.type) {
        case EPlexDataType.SEASONS:
          // for seasons, add all episode ID's + the season media item
          handleMedia.push({ plexId: context.id });

          // get all episodes
          const data = await this.getChildrenMetadata(context.id.toString());

          // transform & add eps
          if (data) {
            handleMedia.push(
              ...data.map((el) => {
                return {
                  plexId: +el.ratingKey,
                };
              }),
            );
          }
          break;
        case EPlexDataType.EPISODES:
          // transform & push episode
          handleMedia.push({
            plexId: +context.id,
          });
          break;
        case EPlexDataType.SHOWS:
          // add show id
          handleMedia.push({
            plexId: +media.plexId,
          });

          // get all seasons
          const seasons = await this.getChildrenMetadata(
            media.plexId.toString(),
          );

          for (const season of seasons) {
            // transform & add season
            handleMedia.push({
              plexId: +season.ratingKey,
            });

            // get all eps of season
            const eps = await this.getChildrenMetadata(
              season.ratingKey.toString(),
            );
            // transform & add eps
            if (eps) {
              handleMedia.push(
                ...eps.map((el) => {
                  return {
                    plexId: +el.ratingKey,
                  };
                }),
              );
            }
          }
          break;
        case EPlexDataType.MOVIES:
          handleMedia.push({
            plexId: +media.plexId,
          });
      }
    }
    return handleMedia;
  }

  public async getCorrectedUsers(
    realOwnerId: boolean = true,
  ): Promise<SimplePlexUser[]> {
    const plexTvUsers = await this.getUserDataFromPlexTv();
    const owner = await this.getOwnerDataFromPlexTv();

    return (await this.getUsers()).map((el) => {
      const plextv = plexTvUsers?.find((tvEl) => tvEl.$?.id == el.id);
      const ownerUser = owner?.username === el.name ? owner : undefined;

      // use the username from plex.tv if available, since Overseerr also does this
      if (ownerUser) {
        const uuid = this.extractPlexAvatarUuid(ownerUser.thumb);
        return {
          plexId: realOwnerId ? +ownerUser.id : el.id,
          username: ownerUser.username,
          uuid: uuid,
        } as SimplePlexUser;
      } else if (plextv && plextv.$ && plextv.$.username) {
        const uuid = this.extractPlexAvatarUuid(plextv.$.thumb);
        return {
          plexId: +plextv.$.id,
          username: plextv.$.username,
          uuid: uuid,
        } as SimplePlexUser;
      }
      return { plexId: +el.id, username: el.name } as SimplePlexUser;
    });
  }

  private async setMachineId(): Promise<string | null> {
    try {
      const response = await this.getStatus();
      if (response?.machineIdentifier) {
        this.machineId = response.machineIdentifier;

        // Persist to DB so re-discovery can match the server when the
        // primary connection is dead and we can't query the server directly.
        if (this.settings.plex_machine_id !== response.machineIdentifier) {
          await this.settings.updatePlexConnectionDetails({
            plex_machine_id: response.machineIdentifier,
          });
        }

        return response.machineIdentifier;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private async forceMachineId() {
    if (!this.machineId) {
      await this.setMachineId();
    }
  }
}
