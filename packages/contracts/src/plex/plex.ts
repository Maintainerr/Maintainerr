// these numbers equal the Plex API media types
export enum EPlexDataType {
  MOVIES = 1,
  SHOWS = 2,
  SEASONS = 3,
  EPISODES = 4,
}

// EPlexDataType values as strings
export const PlexDataTypeStrings: string[] = [
  'MOVIES',
  'SHOWS',
  'SEASONS',
  'EPISODES',
]

type BasePlexMetadata = {
  ratingKey: string
  guid: string
  type: 'movie' | 'show' | 'season' | 'episode' | 'collection'
  title: string
  Guid: {
    id: string
  }[]
  index: number
  addedAt: number
  updatedAt: number
  summary: string
  Collection?: { tag: string }[]
  Label?: { tag: string }[]
}

export interface PlexPlaylist {
  ratingKey: string
  key: string
  guid: string
  type: string
  title: string
  summary: string
  smart: boolean
  playlistType: string
  composite: string
  viewCount: number
  lastViewedAt: number
  duration: number
  leafCount: number
  addedAt: number
  updatedAt: number
  itemCount: number
}

type Alias<t> = t & { _?: never }

export type PlexMedia = Alias<
  PlexMovie | PlexShow | PlexSeason | PlexEpisode
  // | PlexLibraryCollection
  // | PlexMusicArtist
  // | PlexMusicAlbum
  // | PlexMusicTrack
  // | PlexPlaylist
>

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function isPlexMediaType<T extends PlexMedia>(discrim: string) {
  return (media: PlexMedia | undefined): media is T => {
    return media?.type === discrim
  }
}

export const isPlexMovie = isPlexMediaType<PlexMovie>('movie')
export const isPlexShow = isPlexMediaType<PlexShow>('show')
export const isPlexSeason = isPlexMediaType<PlexSeason>('season')
export const isPlexEpisode = isPlexMediaType<PlexEpisode>('episode')
// export const isPlexCollection =
//   isPlexMediaType<PlexLibraryCollection>('collection');

export type PlexMetadata = PlexShow | PlexMovie | PlexSeason | PlexEpisode

// TODO Validate audienceRating, userRating, other ratings does not exist for season and update the constant

export type PlexMovie = BasePlexMetadata & {
  type: 'movie'
  originallyAvailableAt?: string
  contentRating?: string
  rating?: number
  audienceRating?: number
  userRating?: number
  year?: number
  Genre?: PlexGenre[]
  Media?: Media[]
  Role?: PlexActor[]
  Rating?: PlexRating[]
}

export type PlexShow = BasePlexMetadata & {
  type: 'show'
  leafCount: number
  viewedLeafCount: number
  originallyAvailableAt: string
  rating?: number
  contentRating: string
  audienceRating?: number
  userRating?: number
  year?: number
  Role?: PlexActor[]
  Children?: {
    size: 12
    Metadata: PlexMetadata[]
  }
  Genre: PlexGenre[]
  Rating?: PlexRating[]
}

export type PlexSeason = BasePlexMetadata & {
  type: 'season'
  leafCount: number
  viewedLeafCount: number
  parentRatingKey?: string
  parentIndex?: number
  parentData?: PlexMetadata
  parentYear?: number
  parentTitle?: string
  Children?: {
    size: 12
    Metadata: PlexMetadata[]
  }
}

export type PlexEpisode = BasePlexMetadata & {
  type: 'episode'
  parentRatingKey?: string
  parentIndex?: number
  parentData?: PlexMetadata
  parentYear?: number
  parentTitle?: string
  grandparentTitle?: string
  grandparentRatingKey?: string
  originallyAvailableAt?: string
  rating?: number
  contentRating?: string
  audienceRating?: number
  userRating?: number
  year?: number
  Genre?: PlexGenre[]
  Media?: Media[]
  Role?: PlexActor[]
  Rating?: PlexRating[]
}

export interface Media {
  id: number
  duration: number
  bitrate: number
  width: number
  height: number
  aspectRatio: number
  audioChannels: number
  audioCodec: string
  videoCodec: string
  videoResolution: string
  container: string
  videoFrameRate: string
  videoProfile: string
}

export interface PlexGenre {
  id: number
  filter: string
  tag: string
}

export interface PlexActor {
  id: number
  filter: string
  tag: string // contains name
  role: string
  thumb: string
}

export interface PlexRating {
  image: string
  value: number
  type: 'audience' | 'critic'
}
