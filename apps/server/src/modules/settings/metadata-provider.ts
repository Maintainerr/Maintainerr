export const MetadataProvider = {
  TMDB: 'tmdb',
  TVDB: 'tvdb',
  SPORTARR: 'sportarr',
} as const;

export type MetadataProvider =
  (typeof MetadataProvider)[keyof typeof MetadataProvider];
