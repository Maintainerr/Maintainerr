import { forwardRef, Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
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
import { PlexSettings } from '../../settings/interfaces/plex-settings.interface';
import { SettingsService } from '../../settings/settings.service';
import PlexApi from '../lib/plexApi';
import PlexTvApi, { PlexUser } from '../lib/plextvApi';
import { BasicResponseDto } from './dto/basic-response.dto';
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
  PlexDevice,
  PlexStatusResponse,
} from './interfaces/server.interface';

@Injectable()
export class PlexApiService {
  private plexClient: PlexApi;
  private plexTvClient: PlexTvApi;
  private plexCommunityClient: PlexCommunityApi;
  private machineId: string;

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
    private readonly logger: MaintainerrLogger,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {
    this.logger.setContext(PlexApiService.name);
    void this.initialize({});
  }

  private getDbSettings(): PlexSettings {
    return {
      name: this.settings.plex_name,
      machineId: this.machineId,
      ip: this.settings.plex_hostname,
      port: this.settings.plex_port,
      auth_token: this.settings.plex_auth_token,
      useSsl: this.settings.plex_ssl === 1 ? true : false,
      libraries: [],
      webAppUrl: this.settings.plex_hostname,
    };
  }

  public isPlexSetup(): boolean {
    return this.plexClient != null;
  }

  public uninitialize() {
    this.plexClient = undefined;
  }

  public async initialize({
    plexToken,
    timeout,
  }: {
    plexToken?: string;
    timeout?: number;
  }) {
    try {
      this.plexClient = undefined;
      const settingsPlex = this.getDbSettings();
      plexToken = plexToken || settingsPlex.auth_token;
      if (settingsPlex.ip && plexToken) {
        this.plexClient = new PlexApi({
          hostname: settingsPlex.ip,
          port: settingsPlex.port,
          https: settingsPlex.useSsl,
          timeout: timeout,
          token: plexToken,
        });

        this.plexTvClient = new PlexTvApi(
          plexToken,
          this.loggerFactory.createLogger(),
        );
        this.plexCommunityClient = new PlexCommunityApi(
          plexToken,
          this.loggerFactory.createLogger(),
        );

        await this.setMachineId();
      } else {
        this.logger.log(
          "Plex API isn't fully initialized, required settings aren't set",
        );
      }
    } catch (err) {
      this.logger.warn(`Couldn't connect to Plex.. Please check your settings`);
      this.logger.debug(err);
    }
  }

  public async getStatus() {
    try {
      const response: PlexStatusResponse = await this.plexClient.query(
        '/',
        false,
      );
      return response.MediaContainer;
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
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
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getUsers(): Promise<PlexUserAccount[]> {
    try {
      const response: PlexAccountsResponse = await this.plexClient.queryAll({
        uri: '/accounts',
      });
      return response.MediaContainer.Account;
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getUser(id: number): Promise<PlexUserAccount> {
    try {
      const response: PlexAccountsResponse = await this.plexClient.queryAll({
        uri: `/accounts/${id}`,
      });
      return response?.MediaContainer?.Account[0];
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getLibraries(): Promise<PlexLibrary[]> {
    try {
      const response = await this.plexClient.queryAll<PlexLibrariesResponse>({
        uri: '/library/sections',
      });

      return response.MediaContainer.Directory.filter(
        (x) => x.type == 'movie' || x.type == 'show',
      ) as PlexLibrary[];
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getLibraryContents(
    id: string,
    { offset = 0, size = 50 }: { offset?: number; size?: number } = {},
    datatype?: EPlexDataType,
  ): Promise<{ totalSize: number; items: PlexLibraryItem[] }> {
    try {
      const type = datatype ? '&type=' + datatype : '';
      const response = await this.plexClient.query<PlexLibraryResponse>({
        uri: `/library/sections/${id}/all?includeGuids=1${type}`,
        extraHeaders: {
          'X-Plex-Container-Start': `${offset}`,
          'X-Plex-Container-Size': `${size}`,
        },
      });

      return {
        totalSize: response.MediaContainer.totalSize,
        items: (response.MediaContainer.Metadata as PlexLibraryItem[]) ?? [],
      };
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getMetadata(
    key: string,
    options: { includeChildren?: boolean } = {},
    useCache: boolean = true,
  ): Promise<PlexMetadata> {
    try {
      const response = await this.plexClient.query<PlexMetadataResponse>(
        `/library/metadata/${key}${
          options.includeChildren
            ? '?includeChildren=1&includeExternalMedia=1&asyncAugmentMetadata=1&asyncCheckFiles=1&asyncRefreshAnalysis=1'
            : ''
        }`,
        useCache,
      );
      if (response) {
        return response.MediaContainer.Metadata[0];
      } else {
        return undefined;
      }
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.warn(
        "Outbound call to discover.provider.plex.tv failed. Couldn't fetch userState",
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getUserDataFromPlexTv(): Promise<any> {
    try {
      const response = await this.plexTvClient.getUsers();
      return response.MediaContainer.User;
    } catch (err) {
      this.logger.warn("Outbound call to plex.tv failed. Couldn't fetch users");
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getOwnerDataFromPlexTv(): Promise<PlexUser> {
    try {
      return await this.plexTvClient.getUser();
    } catch (err) {
      this.logger.warn("Outbound call to plex.tv failed. Couldn't fetch owner");
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getChildrenMetadata(key: string): Promise<PlexMetadata[]> {
    try {
      const response = await this.plexClient.queryAll<PlexMetadataResponse>({
        uri: `/library/metadata/${key}/children`,
      });

      return response.MediaContainer.Metadata;
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  public async getWatchHistory(itemId: string): Promise<PlexSeenBy[]> {
    try {
      const response: PlexLibraryResponse =
        await this.plexClient.queryAll<PlexLibraryResponse>({
          uri: `/status/sessions/history/all?sort=viewedAt:desc&metadataItemID=${itemId}`,
        });
      return response.MediaContainer.Metadata as PlexSeenBy[];
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (e) {
      this.logger.warn(
        `Something went wrong while removing media ${plexId} from Plex.`,
      );
      this.logger.debug(e);
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
      const collection: PlexCollection = response.MediaContainer
        .Metadata as PlexCollection;

      return collection;
    } catch (err) {
      this.logger.warn(`Couldn't find collection with id ${+collectionId}`);
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
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
    } catch (err) {
      this.logger.debug(err);
      return {
        status: 'NOK',
        code: 0,
        message: `Something went wrong while deleting the collection from Plex: ${err}`,
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
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
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
        // uri: `/library/collections/${collectionId}/items?uri=\/library\/metadata\/${childId}`,
        uri: `/library/collections/${collectionId}/items?uri=server:\/\/${this.machineId}\/com.plexapp.plugins.library\/library\/metadata\/${childId}`,
      });
      return response.MediaContainer.Metadata[0] as PlexCollection;
    } catch (e) {
      this.logger.debug(e);
      return {
        status: 'NOK',
        code: 0,
        message: e,
      } as BasicResponseDto;
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
    } catch (e) {
      this.logger.debug(e);
      return {
        status: 'NOK',
        code: 0,
        message: e.message,
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
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
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
                  timeout: 5000,
                  token: settings.plex_auth_token,
                });

                // test connection
                return (await newClient.getStatus()) ? connection : null;
              },
            );

            device.connection = (
              await Promise.all(filteredConnectionPromises)
            ).filter(Boolean);
          }),
        );
      }
      return devices;
    } catch (e) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(e);
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
      const size = 100;

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
    } catch (e) {
      this.logger.warn(
        `Failure while fetching watchlist of user ${userId} (${username})`,
      );
      this.logger.debug(e);
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
    const thumbRegex = /https:\/\/plex\.tv\/users\/([a-z0-9]+)\/avatar\?c=\d+/;

    const plexTvUsers = await this.getUserDataFromPlexTv();
    const owner = await this.getOwnerDataFromPlexTv();

    return (await this.getUsers()).map((el) => {
      const plextv = plexTvUsers?.find((tvEl) => tvEl.$?.id == el.id);
      const ownerUser = owner?.username === el.name ? owner : undefined;

      // use the username from plex.tv if available, since Overseerr also does this
      if (ownerUser) {
        const match = ownerUser.thumb?.match(thumbRegex);
        const uuid = match ? match[1] : undefined;
        return {
          plexId: realOwnerId ? +ownerUser.id : el.id,
          username: ownerUser.username,
          uuid: uuid,
        } as SimplePlexUser;
      } else if (plextv && plextv.$ && plextv.$.username) {
        const match = plextv.$.thumb?.match(thumbRegex);
        const uuid = match ? match[1] : undefined;
        return {
          plexId: +plextv.$.id,
          username: plextv.$.username,
          uuid: uuid,
        } as SimplePlexUser;
      }
      return { plexId: +el.id, username: el.name } as SimplePlexUser;
    });
  }

  private async setMachineId() {
    try {
      const response = await this.getStatus();
      if (response?.machineIdentifier) {
        this.machineId = response.machineIdentifier;
        return response.machineIdentifier;
      } else {
        this.logger.warn("Couldn't reach Plex");
        return null;
      }
    } catch (err) {
      this.logger.warn(
        'Plex api communication failure.. Is the application running?',
      );
      this.logger.debug(err);
      return undefined;
    }
  }

  private async forceMachineId() {
    if (!this.machineId) {
      await this.setMachineId();
    }
  }
}
