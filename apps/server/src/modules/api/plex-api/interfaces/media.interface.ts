import { PlexActor, PlexGenre, PlexRating } from './library.interfaces';

export interface PlexMetadata {
  ratingKey: string;
  parentRatingKey?: string;
  guid: string;
  type: 'movie' | 'show' | 'season' | 'episode' | 'collection';
  title: string;
  Guid: {
    id: string;
  }[];
  Children?: {
    size: 12;
    Metadata: PlexMetadata[];
  };
  index: number;
  parentIndex?: number;
  Collection?: { tag: string }[];
  leafCount: number;
  grandparentRatingKey?: string;
  viewedLeafCount: number;
  addedAt: number;
  updatedAt: number;
  media: Media[];
  parentData?: PlexMetadata;
  Label?: { tag: string }[];
  rating?: number;
  audienceRating?: number;
  userRating?: number;
  Role?: PlexActor[];
  originallyAvailableAt: string;
  Media: Media[];
  Genre?: PlexGenre[];
  parentTitle?: string;
  grandparentTitle?: string;
  Rating?: PlexRating[];
}

export interface Media {
  id: number;
  duration: number;
  bitrate: number;
  width: number;
  height: number;
  aspectRatio: number;
  audioChannels: number;
  audioCodec: string;
  videoCodec: string;
  videoResolution: string;
  container: string;
  videoFrameRate: string;
  videoProfile: string;
}
export interface PlexMetadataResponse {
  MediaContainer: {
    Metadata: PlexMetadata[];
  };
}
