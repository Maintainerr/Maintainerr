import { EMediaDataType, EMediaServerType } from '@maintainerr/contracts';
import { CollectionMedia } from '../entities/collection_media.entities';

export interface ICollection {
  id?: number;
  type: EMediaDataType;
  /** Media server collection ID (Plex ratingKey or Jellyfin GUID) */
  mediaServerId?: string;
  /** Which media server this collection belongs to */
  mediaServerType?: EMediaServerType;
  libraryId: number;
  title: string;
  description?: string;
  isActive: boolean;
  arrAction: number;
  visibleOnRecommended?: boolean;
  visibleOnHome?: boolean;
  listExclusions?: boolean;
  forceOverseerr?: boolean;
  deleteAfterDays?: number; // amount of days after add
  media?: CollectionMedia[];
  manualCollection?: boolean;
  manualCollectionName?: string;
  keepLogsForMonths?: number;
  tautulliWatchedPercentOverride?: number;
  radarrSettingsId?: number;
  sonarrSettingsId?: number;
  sortTitle?: string;
}

export enum ServarrAction {
  DELETE,
  UNMONITOR_DELETE_ALL,
  UNMONITOR_DELETE_EXISTING,
  UNMONITOR,
  DO_NOTHING,
}
