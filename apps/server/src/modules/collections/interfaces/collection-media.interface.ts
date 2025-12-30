import { CollectionLogMeta, EMediaDataType } from '@maintainerr/contracts';

export interface ICollectionMedia {
  id: number;
  collectionId: number;
  /** Media server item ID (Plex ratingKey or Jellyfin GUID) */
  mediaServerId: string;
  tmdbId: number;
  tvdbid: number;
  addDate: Date;
}

export interface AddRemoveCollectionMedia {
  /** Media server item ID (Plex ratingKey or Jellyfin GUID) */
  mediaServerId: string;
  reason?: CollectionLogMeta;
}

export interface IAlterableMediaDto {
  id: number;
  index?: number;
  parenIndex?: number;
  type: EMediaDataType;
}
