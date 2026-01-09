import { MediaItemType, MediaServerType } from '@maintainerr/contracts';
import { CollectionMedia } from '../entities/collection_media.entities';

export interface ICollection {
  id?: number;
  type: MediaItemType;
  mediaServerId?: string;
  mediaServerType?: MediaServerType;
  libraryId: string;
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
