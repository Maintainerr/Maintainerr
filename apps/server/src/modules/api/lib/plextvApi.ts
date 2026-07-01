import { AxiosError } from 'axios';
import { parseStringPromise } from 'xml2js';
import { PlexDevice } from '../../api/plex-api/interfaces/server.interface';
import { MaintainerrLogger } from '../../logging/logs.service';
import { ExternalApiService } from '../external-api/external-api.service';
import cacheManager from './cache';

interface PlexAccountResponse {
  user: PlexUser;
}

// `unreachable` (timeout/network/5xx/429) is distinct from `invalid` (plex.tv
// rejected the token): a connectivity failure must not force re-authentication.
export type PlexTokenValidation = 'valid' | 'invalid' | 'unreachable';

export interface PlexUser {
  id: number;
  uuid: string;
  email: string;
  joined_at: string;
  username: string;
  title: string;
  thumb: string;
  hasPassword: boolean;
  authToken: string;
  subscription: {
    active: boolean;
    status: string;
    plan: string;
    features: string[];
  };
  roles: {
    roles: string[];
  };
  entitlements: string[];
}

// plex.tv v2 resource shapes (JSON). Unlike the legacy v1 /api/resources XML,
// v2 returns native booleans/numbers and ISO-8601 timestamps, and includes
// owned servers that v1 omits.
interface PlexV2Connection {
  protocol: string;
  address: string;
  port: number;
  uri: string;
  local: boolean;
  relay?: boolean;
  IPv6?: boolean;
}

interface PlexV2Resource {
  name: string;
  product: string;
  productVersion: string;
  platform: string;
  platformVersion: string;
  device: string;
  clientIdentifier: string;
  createdAt: string;
  lastSeenAt: string;
  provides: string;
  owned: boolean;
  ownerId?: number | null;
  sourceTitle?: string | null;
  publicAddress?: string;
  accessToken?: string | null;
  httpsRequired?: boolean;
  synced?: boolean;
  relay?: boolean;
  home?: boolean;
  presence?: boolean;
  publicAddressMatches?: boolean;
  dnsRebindingProtection?: boolean;
  natLoopbackSupported?: boolean;
  connections: PlexV2Connection[];
}

interface ServerResponse {
  $: {
    id: string;
    serverId: string;
    machineIdentifier: string;
    name: string;
    lastSeenAt: string;
    numLibraries: string;
    owned: string;
  };
}

export interface PlexTvUser {
  $: {
    id: string;
    title: string;
    username: string;
    email: string;
    thumb: string;
  };
  Server: ServerResponse[];
}

interface UsersResponse {
  MediaContainer: {
    User: PlexTvUser[];
  };
}

export class PlexTvApi extends ExternalApiService {
  private authToken: string;

  constructor(
    authToken: string,
    protected readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(PlexTvApi.name);
    super('https://plex.tv', {}, logger, {
      headers: {
        'X-Plex-Token': authToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      nodeCache: cacheManager.getCache('plextv').data,
    });
    this.authToken = authToken;
  }

  public async getUser(): Promise<PlexUser> {
    try {
      const account = await this.get<PlexAccountResponse>(
        '/users/account.json',
      );

      if (!account) {
        throw new Error('Failed to fetch account from plex.tv');
      }

      return account.user;
    } catch (error) {
      this.logger.error(
        'Something went wrong while getting the account from plex.tv',
      );
      this.logger.debug(error);
      throw new Error('Invalid auth token');
    }
  }

  public async validateToken(): Promise<PlexTokenValidation> {
    try {
      const response = await this.getRawWithoutCache<PlexAccountResponse>(
        '/users/account.json',
      );

      return response.data?.user ? 'valid' : 'unreachable';
    } catch (error) {
      const status =
        error instanceof AxiosError ? error.response?.status : undefined;

      // plex.tv rejects a bad token with 422 ("Invalid token"), 401, or 403.
      // Other statuses (429 rate limit, 5xx) and network errors are transient.
      if (status === 401 || status === 403 || status === 422) {
        return 'invalid';
      }

      this.logger.debug(
        `Could not reach plex.tv to validate the auth token${status ? ` (status ${status})` : ''}; keeping stored credentials`,
      );
      this.logger.debug(error);
      return 'unreachable';
    }
  }

  public async getUsers(): Promise<UsersResponse> {
    const response = await this.get('/api/users', {
      transformResponse: [],
      responseType: 'text',
    });

    if (!response) {
      throw new Error('Failed to fetch users from plex.tv');
    }

    const parsedXml = (await parseStringPromise(response)) as UsersResponse;
    return parsedXml;
  }

  public async getDevices(clientIdentifier: string): Promise<PlexDevice[]> {
    try {
      // v2 /api/v2/resources returns owned servers that legacy v1 /api/resources
      // omits. It requires X-Plex-Client-Identifier - use the same id the UI
      // authenticates with so plex.tv sees a consistent client.
      const resources = await this.get<PlexV2Resource[]>(
        '/api/v2/resources?includeHttps=1',
        {
          headers: {
            'X-Plex-Client-Identifier': clientIdentifier,
            'X-Plex-Product': 'Maintainerr',
          },
        },
      );

      if (!resources) {
        throw new Error('Failed to fetch devices from plex.tv');
      }

      return resources.map((resource) => ({
        name: resource.name,
        product: resource.product,
        productVersion: resource.productVersion,
        platform: resource.platform,
        platformVersion: resource.platformVersion,
        device: resource.device,
        clientIdentifier: resource.clientIdentifier,
        createdAt: new Date(resource.createdAt),
        lastSeenAt: new Date(resource.lastSeenAt),
        provides: resource.provides.split(','),
        owned: resource.owned,
        accessToken: resource.accessToken ?? undefined,
        publicAddress: resource.publicAddress,
        publicAddressMatches: resource.publicAddressMatches,
        httpsRequired: resource.httpsRequired,
        synced: resource.synced,
        relay: resource.relay,
        presence: resource.presence,
        dnsRebindingProtection: resource.dnsRebindingProtection,
        natLoopbackSupported: resource.natLoopbackSupported,
        ownerID:
          resource.ownerId != null ? String(resource.ownerId) : undefined,
        home: resource.home,
        sourceTitle: resource.sourceTitle ?? undefined,
        connection: (resource.connections ?? []).map((conn) => ({
          protocol: conn.protocol,
          address: conn.address,
          port: conn.port,
          uri: conn.uri,
          local: conn.local,
        })),
      }));
    } catch (error) {
      this.logger.error(
        'Something went wrong getting the devices from plex.tv',
        error,
      );
      return [];
    }
  }
}

export default PlexTvApi;
