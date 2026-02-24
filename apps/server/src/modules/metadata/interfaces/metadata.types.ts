/**
 * Common normalised types returned by the MetadataService.
 * These are provider-agnostic so callers never need to know whether
 * a result came from TMDB, TVDB, or both.
 */

/** All known external IDs that have been resolved for a media item. */
export interface ResolvedMediaIds {
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
  type: 'movie' | 'tv';
}

/** Provider-agnostic result from a cross-provider external ID search. */
export interface ExternalIdSearchResult {
  movieId?: number;
  tvShowId?: number;
}

/** Provider-agnostic person details returned by MetadataService. */
export interface PersonDetails {
  /** Canonical ID on the provider that supplied the details. */
  id: number;
  name: string;
  biography?: string;
  birthday?: string;
  deathday?: string;
  knownForDepartment?: string;
  profileUrl?: string;
  imdbId?: string;
}

/** Provider-agnostic media details returned by MetadataService. */
export interface MetadataDetails {
  /** Canonical ID on the provider that supplied the details. */
  id: number;
  title: string;
  overview?: string;
  /** Full poster URL ready for <img src>. */
  posterUrl?: string;
  /** Full backdrop / fanart URL. */
  backdropUrl?: string;
  /** Known external IDs extracted from the details response. */
  externalIds: ResolvedMediaIds;
  type: 'movie' | 'tv';
}
