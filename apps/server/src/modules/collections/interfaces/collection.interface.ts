import {
  MediaItemType,
  MediaServerType,
  ServarrAction,
} from '@maintainerr/contracts';
import { CollectionMedia } from '../entities/collection_media.entities';

export { ServarrAction };

export interface ICollection {
  id?: number;
  type: MediaItemType;
  mediaServerId?: string;
  mediaServerType?: MediaServerType;
  libraryId: string;
  title: string;
  description?: string;
  isActive: boolean;
  arrAction: ServarrAction;
  visibleOnRecommended?: boolean;
  visibleOnHome?: boolean;
  listExclusions?: boolean;
  forceSeerr?: boolean;
  deleteAfterDays?: number; // amount of days after add
  media?: CollectionMedia[];
  manualCollection?: boolean;
  manualCollectionName?: string;
  keepLogsForMonths?: number;
  tautulliWatchedPercentOverride?: number;
  radarrSettingsId?: number;
  sonarrSettingsId?: number;
  radarrQualityProfileId?: number;
  sonarrQualityProfileId?: number;
  sortTitle?: string;
  overlayEnabled?: boolean;
  overlayTemplateId?: number | null;
}
