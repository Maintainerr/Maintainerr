// these numbers equal the Plex API media types
// Note: if changes are made, also change this in UI's EPlexDataType
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
];
