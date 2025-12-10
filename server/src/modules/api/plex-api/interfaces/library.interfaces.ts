import { PlexCollection, PlexPlaylist } from './collection.interface';
import { Media } from './media.interface';

export interface PlexLibraryItem {
  ratingKey: string;
  parentRatingKey?: string;
  grandparentRatingKey?: string;
  title: string;
  parentTitle?: string;
  guid: string;
  parentGuid?: string;
  grandparentGuid?: string;
  addedAt: number;
  updatedAt: number;
  Guid?: {
    id: string;
  }[];
  type: 'movie' | 'show' | 'season' | 'episode' | 'collection';
  Media: Media[];
  librarySectionTitle: string;
  librarySectionID: number;
  librarySectionKey: string;
  summary: string;
  viewCount: number;
  skipCount: number;
  lastViewedAt: number;
  year: number;
  duration: number;
  originallyAvailableAt: string;
  rating?: number;
  audienceRating?: number;
  userRating?: number;
  Genre?: PlexGenre[];
  Role?: PlexActor[];
  leafCount?: number;
  viewedLeafCount?: number;
  index?: number;
  parentIndex?: number;
  Collection?: { tag: string }[];
  Label?: { tag: string }[];
}

export interface PlexLibraryResponse {
  MediaContainer: {
    size: number;
    totalSize?: number;
    Metadata?:
      | PlexLibraryItem[]
      | PlexCollection[]
      | PlexCollection
      | PlexPlaylist[];
  };
}
export interface PlexGenre {
  id: number;
  filter: string;
  tag: string;
}

export interface PlexActor {
  id: number;
  filter: string;
  tag: string; // contains name
  role: string;
  thumb: string;
}

export interface PlexRating {
  image: string;
  value: number;
  type: 'audience' | 'critic';
}

export interface PlexLibrary {
  type: 'show' | 'movie' | 'artist';
  key: string;
  title: string;
  agent: string;
}

export interface PlexLibrariesResponse {
  MediaContainer: {
    totalSize: number;
    Directory?: PlexLibrary[];
  };
}

export interface PlexHubResponse {
  MediaContainer: {
    Size: string;
    Hub: PlexHub[];
  };
}

export interface PlexHub {
  identifier: string;
  title: string;
  recommendationsVisibility: 'none' | string;
  homeVisibility: 'none' | string;
  promotedToRecommended: boolean;
  promotedToOwnHome: boolean;
  promotedToSharedHome: boolean;
  deletable: boolean;
}

export interface SimplePlexUser {
  plexId: number;
  username: string;
  uuid?: string;
}
export interface PlexUserResponse {
  Account: PlexUserAccount[];
}
export interface PlexUserAccount {
  id: number;
  key: string;
  name: string;
  defaultAudioLanguage: string;
  autoSelectAudio: true;
  defaultSubtitleLanguage: string;
  subtitleMode: number;
  thumb: string;
}

export interface PlexSeenBy extends PlexLibraryItem {
  historyKey: string;
  key: string;
  ratingKey: string;
  title: string;
  thumb: string;
  originallyAvailableAt: string;
  viewedAt: number;
  accountID: number;
  deviceID: number;
}
