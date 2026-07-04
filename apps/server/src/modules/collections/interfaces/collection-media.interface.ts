import { CollectionLogMeta, MediaItemType } from '@maintainerr/contracts';

export interface CollectionMediaRecord {
  id: number;
  collectionId: number;
  mediaServerId: string;
  tmdbId: number;
  tvdbId: number;
  addDate: Date;
  isManual?: boolean;
  includedByRule?: boolean | null;
  manualMembershipSource?: 'legacy' | 'local' | 'shared' | null;
  ruleEvaluationFailed?: boolean;
}

export interface CollectionMediaChange {
  mediaServerId: string;
  reason?: CollectionLogMeta;
}

export interface AlterableMediaContext {
  // Numeric Plex ratingKey or hex-GUID Jellyfin/Emby id (#3185); consumers
  // normalize with String() before use.
  id: string | number;
  index?: number;
  parentIndex?: number;
  type: MediaItemType;
}
