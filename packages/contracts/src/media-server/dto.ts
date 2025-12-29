import { EMediaServerType } from './enums';

/**
 * Request DTO for switching media server type
 */
export interface SwitchMediaServerRequestDto {
  /**
   * Target media server type to switch to
   */
  targetServerType: EMediaServerType;

  /**
   * Confirmation that user understands data will be cleared
   */
  confirmDataClear: boolean;
}

/**
 * Response DTO for media server switch operation
 */
export interface SwitchMediaServerResponseDto {
  status: 'OK' | 'NOK';
  code: number;
  message: string;
  clearedData?: {
    collections: number;
    collectionMedia: number;
    exclusions: number;
    collectionLogs: number;
  };
}

/**
 * Summary of data that will be cleared when switching media servers
 */
export interface MediaServerSwitchPreviewDto {
  currentServerType: EMediaServerType;
  targetServerType: EMediaServerType;
  dataToBeCleared: {
    collections: number;
    collectionMedia: number;
    exclusions: number;
    collectionLogs: number;
  };
  dataToBeKept: {
    generalSettings: boolean;
    radarrSettings: number;
    sonarrSettings: number;
    overseerrSettings: boolean;
    jellyseerrSettings: boolean;
    tautulliSettings: boolean;
    notificationSettings: boolean;
  };
}
