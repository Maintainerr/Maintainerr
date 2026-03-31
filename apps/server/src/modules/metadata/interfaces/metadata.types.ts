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
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  rating?: number;
  externalIds: ResolvedMediaIds;
  type: 'movie' | 'tv';
}
