import { CollectionLogMeta } from '@maintainerr/contracts';
import { EPlexDataType } from '../../api/plex-api/enums/plex-data-type-enum';

export interface ICollectionMedia {
  id: number;
  collectionId: number;
  plexId: number;
  tmdbId: number;
  tvdbid: number;
  addDate: Date;
  title?: string;
  size?: number;
}

export interface AddRemoveCollectionMedia {
  plexId: number;
  reason?: CollectionLogMeta;
}

export interface IAlterableMediaDto {
  id: number;
  index?: number;
  parenIndex?: number;
  type: EPlexDataType;
}
