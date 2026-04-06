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
}

export interface ICollectionMedia extends CollectionMediaRecord {}

export interface CollectionMediaChange {
  mediaServerId: string;
  reason?: CollectionLogMeta;
}

export interface AddRemoveCollectionMedia extends CollectionMediaChange {}

export interface AlterableMediaContext {
  id: number;
  index?: number;
  parenIndex?: number;
  parentIndex?: number;
  type: MediaItemType;
}

export interface IAlterableMediaDto extends AlterableMediaContext {}
