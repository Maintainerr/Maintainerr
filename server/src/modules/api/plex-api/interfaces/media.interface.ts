export interface PlexMetadata {
  ratingKey: string;
  parentRatingKey?: string;
  guid: string;
  type: 'movie' | 'show' | 'season';
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
  leafCount: number;
  grandparentRatingKey?: number;
  viewedLeafCount: number;
  addedAt: number;
  updatedAt: number;
  media: Media[];
  parentData?: PlexMetadata;
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
