/**
 * Common normalised types returned by the MetadataService.
 * These are provider-agnostic so callers never need to know whether
 * a result came from TMDB, TVDB, or both.
 */

/**
 * Dynamic bag of provider IDs keyed by lowercase provider name
 * (e.g. { tmdb: 550, tvdb: 81189, imdb: 'tt0137523' }).
 *
 * Fully dynamic — adding a new provider requires NO changes to this type.
 * Providers read/write their own key via extractId / assignId.
 */
export type ProviderIds = Record<string, string | number | undefined>;

/**
 * Resolved provider IDs with a guaranteed media type.
 * Returned by resolveIds / resolveIdsFromMediaItem.
 */
export type ResolvedMediaIds = ProviderIds & { type: 'movie' | 'tv' };

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
  /** Community / audience rating (0–10 scale). */
  rating?: number;
  /** Known external IDs extracted from the details response. */
  externalIds: ResolvedMediaIds;
  type: 'movie' | 'tv';
}
