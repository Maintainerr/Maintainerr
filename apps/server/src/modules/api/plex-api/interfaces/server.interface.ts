import { PlexUserAccount } from './library.interfaces';

export interface PlexStatusResponse {
  MediaContainer: {
    machineIdentifier: string;
    version: string;
  };
}

export interface PlexAccountsResponse {
  MediaContainer: { Account: PlexUserAccount[] };
}

export interface PlexDevice {
  name: string;
  product: string;
  productVersion: string;
  platform: string;
  platformVersion: string;
  device: string;
  clientIdentifier: string;
  createdAt: Date;
  lastSeenAt: Date;
  provides: string[];
  owned: boolean;
  accessToken?: string;
  publicAddress?: string;
  httpsRequired?: boolean;
  synced?: boolean;
  relay?: boolean;
  dnsRebindingProtection?: boolean;
  natLoopbackSupported?: boolean;
  publicAddressMatches?: boolean;
  presence?: boolean;
  ownerID?: string;
  home?: boolean;
  sourceTitle?: string;
  connection: PlexConnection[];
}

export interface PlexConnection {
  protocol: string;
  address: string;
  port: number;
  uri: string;
  local: boolean;
  status?: number;
  message?: string;
}
