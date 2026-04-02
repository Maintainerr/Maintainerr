export const MetadataProvider = {
  TMDB: 'tmdb',
  TVDB: 'tvdb',
} as const;

export type MetadataProvider =
  (typeof MetadataProvider)[keyof typeof MetadataProvider];
