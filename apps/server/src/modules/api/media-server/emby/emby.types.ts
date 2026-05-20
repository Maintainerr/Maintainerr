// Minimal Emby HTTP response shapes.
//
// Emby and Jellyfin share a common API ancestor, so the JSON payload shapes
// are largely the same as @jellyfin/sdk's BaseItemDto. These types document
// only the fields Maintainerr touches. Extend as adapter methods are
// implemented and verified against a real Emby server.

export interface EmbyProviderIds {
  Imdb?: string;
  Tmdb?: string;
  Tvdb?: string;
  [key: string]: string | undefined;
}

export interface EmbyUserItemData {
  Played?: boolean;
  PlayCount?: number;
  IsFavorite?: boolean;
  PlaybackPositionTicks?: number;
  LastPlayedDate?: string;
  Key?: string;
}

export interface EmbyMediaSource {
  Id?: string;
  Path?: string;
  Container?: string;
  Size?: number;
  Bitrate?: number;
  RunTimeTicks?: number;
  MediaStreams?: EmbyMediaStream[];
}

export interface EmbyMediaStream {
  Codec?: string;
  Type?: 'Video' | 'Audio' | 'Subtitle' | string;
  Width?: number;
  Height?: number;
  AspectRatio?: string;
  BitRate?: number;
  Channels?: number;
  DisplayTitle?: string;
}

export interface EmbyGenre {
  Id?: string;
  Name?: string;
}

export interface EmbyPerson {
  Id?: string;
  Name?: string;
  Role?: string;
  Type?: string;
  PrimaryImageTag?: string;
}

export interface EmbyBaseItemDto {
  Id: string;
  Name?: string;
  OriginalTitle?: string;
  SortName?: string;
  ForcedSortName?: string;
  Size?: number;
  ServerId?: string;
  Etag?: string;
  Type?: string;
  ParentId?: string;
  SeriesId?: string;
  SeasonId?: string;
  SeriesName?: string;
  SeasonName?: string;
  IndexNumber?: number;
  IndexNumberEnd?: number;
  ParentIndexNumber?: number;
  RunTimeTicks?: number;
  ProductionYear?: number;
  PremiereDate?: string;
  DateCreated?: string;
  CommunityRating?: number;
  OfficialRating?: string;
  Overview?: string;
  ProviderIds?: EmbyProviderIds;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  UserData?: EmbyUserItemData;
  MediaSources?: EmbyMediaSource[];
  Genres?: string[];
  GenreItems?: EmbyGenre[];
  Tags?: string[];
  TagItems?: EmbyGenre[];
  People?: EmbyPerson[];
  CollectionType?: string;
  IsLocked?: boolean;
  IsFolder?: boolean;
  ChildCount?: number;
  RecursiveItemCount?: number;
  Path?: string;
  ParentLogoItemId?: string;
  ParentLogoImageTag?: string;
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  LocationType?: string;
}

export interface EmbyUserDto {
  Id: string;
  Name?: string;
  ServerId?: string;
  Policy?: {
    IsAdministrator?: boolean;
    IsDisabled?: boolean;
    EnabledFolders?: string[];
    EnableAllFolders?: boolean;
  };
  Configuration?: Record<string, unknown>;
  HasPassword?: boolean;
  PrimaryImageTag?: string;
}

export interface EmbyItemsQueryResponse<T = EmbyBaseItemDto> {
  Items: T[];
  TotalRecordCount?: number;
  StartIndex?: number;
}

export interface EmbyLibraryFolder {
  Id: string;
  Name: string;
  CollectionType?: string;
  Path?: string;
}

export interface EmbySystemInfo {
  Id?: string;
  ServerName?: string;
  Version?: string;
  ProductName?: string;
  OperatingSystem?: string;
  WebSocketPortNumber?: number;
  LocalAddress?: string;
  WanAddress?: string;
}

export interface EmbyAuthenticationResult {
  User: EmbyUserDto;
  AccessToken: string;
  ServerId?: string;
  SessionInfo?: {
    Id?: string;
    DeviceId?: string;
    Client?: string;
  };
}

export interface EmbyAuthKey {
  AccessToken: string;
  AppName?: string;
  DateCreated?: string;
}

export interface EmbyCollectionCreatedResult {
  Id: string;
}

export interface EmbyPlaylistDto {
  Id?: string;
  Name?: string;
  ChildCount?: number;
  RunTimeTicks?: number;
  DateCreated?: string;
}

export function hasProviderIds(
  item: EmbyBaseItemDto,
): item is EmbyBaseItemDto & { ProviderIds: NonNullable<EmbyProviderIds> } {
  return item.ProviderIds !== undefined && item.ProviderIds !== null;
}

export function hasUserData(
  item: EmbyBaseItemDto,
): item is EmbyBaseItemDto & { UserData: NonNullable<EmbyUserItemData> } {
  return item.UserData !== undefined && item.UserData !== null;
}

export function hasMediaSources(
  item: EmbyBaseItemDto,
): item is EmbyBaseItemDto & { MediaSources: NonNullable<EmbyMediaSource[]> } {
  return (
    item.MediaSources !== undefined &&
    item.MediaSources !== null &&
    item.MediaSources.length > 0
  );
}
