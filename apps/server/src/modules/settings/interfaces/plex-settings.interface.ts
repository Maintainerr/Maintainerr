import { Library } from './library.interface';

export interface PlexSettings {
  name: string;
  machineId?: string;
  ip: string;
  port: number;
  auth_token: string;
  useSsl?: boolean;
  libraries: Library[];
  webAppUrl?: string;
}
