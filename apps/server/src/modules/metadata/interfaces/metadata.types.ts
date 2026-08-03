export type ProviderIds = Record<string, string | number | undefined>;

export type ResolvedMediaIds = ProviderIds & { type: 'movie' | 'tv' };

export interface ExternalIdSearchResult {
  movieId?: number;
  tvShowId?: number;
}

/**
 * Addresses a season, or one episode inside it, within a tv lookup. Providers
 * answer for the most specific thing they hold and fall back to the show.
 */
export interface TvHierarchyRef {
  seasonNumber: number;
  episodeNumber?: number;
}

export interface MetadataImageOptions {
  /** Preferred image width. Providers serving fixed URLs ignore it. */
  sizeHint?: string;
  ref?: TvHierarchyRef;
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
  studios?: string[];
  externalIds: ResolvedMediaIds;
  type: 'movie' | 'tv';
  // Show-only fallback fields. Limited to values whose semantics match across
  // Sonarr / TMDB / TVDB; status strings, language codes vs names, and the
  // rating scale differ enough between sources that exposing them would let
  // rules silently mis-evaluate.
  ended?: boolean;
  firstAirDate?: string;
  // Excludes Season 0 / specials to match Sonarr's `statistics.seasonCount`.
  seasonCount?: number;
}
