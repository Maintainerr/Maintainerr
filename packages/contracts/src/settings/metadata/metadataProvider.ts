/**
 * Determines which metadata provider is tried first.
 * The other provider acts as a fallback when available.
 *
 * Values follow the pattern "{provider}_primary" and are matched
 * against IMetadataProvider.name (case-insensitive).
 */
export enum MetadataProviderPreference {
  TMDB_PRIMARY = 'tmdb_primary',
  TVDB_PRIMARY = 'tvdb_primary',
}
