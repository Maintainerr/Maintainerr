export type ProviderIds = Record<string, string | number | undefined>;

export type ResolvedMediaIds = ProviderIds & { type: 'movie' | 'tv' };

export interface ExternalIdSearchResult {
  movieId?: number;
  tvShowId?: number;
}

export interface PersonDetails {
  id: number;
  name: string;
  biography?: string;
  birthday?: string;
  deathday?: string;
  knownForDepartment?: string;
  profileUrl?: string;
  imdbId?: string;
}

export interface MetadataDetails {
  id: number;
  title: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  rating?: number;
  externalIds: ResolvedMediaIds;
  type: 'movie' | 'tv';
  // Full original release/air date (YYYY-MM-DD) when known; used for write-back.
  releaseDate?: string;
  // Show-only fallback fields. Limited to values whose semantics match across
  // Sonarr / TMDB / TVDB; status strings, language codes vs names, and the
  // rating scale differ enough between sources that exposing them would let
  // rules silently mis-evaluate.
  ended?: boolean;
  firstAirDate?: string;
  // Excludes Season 0 / specials to match Sonarr's `statistics.seasonCount`.
  seasonCount?: number;
}
