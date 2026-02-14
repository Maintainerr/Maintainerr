import { CollectionLogMeta, MediaItemType } from '@maintainerr/contracts';

export interface ICollectionMedia {
  id: number;
  collectionId: number;
  mediaServerId: string;
  tmdbId: number;
  tvdbid: number;
  addDate: Date;
}

export interface AddRemoveCollectionMedia {
  mediaServerId: string;
  reason?: CollectionLogMeta;
}

export interface IAlterableMediaDto {
  id: number;
  index?: number;
  parenIndex?: number;
  type: MediaItemType;
}
