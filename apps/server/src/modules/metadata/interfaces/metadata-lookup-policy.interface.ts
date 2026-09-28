import { ProviderIds } from './metadata.types';

/** The ids and release year of a Radarr movie or Sonarr series. */
export interface ArrLibraryEntry {
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
  year?: number;
}

/** Reads an *arr's whole library; undefined when the read failed. */
export type ArrLibrary = () => Promise<ArrLibraryEntry[] | undefined>;

export interface MetadataLookupPolicy {
  providerKeys?: string[];
  providerMatchMode?: 'all' | 'any';
  /** Searched when no provider could look the item up; `cachedIds` must agree. */
  arr?: { library: ArrLibrary; cachedIds: Partial<ProviderIds> };
}

export const metadataLookupPoliciesByService: Record<
  string,
  MetadataLookupPolicy
> = {
  sonarr: {
    providerKeys: ['tvdb'],
    providerMatchMode: 'any',
  },
  radarr: {
    providerKeys: ['tmdb'],
    providerMatchMode: 'any',
  },
  seerr: {
    providerKeys: ['tmdb'],
    providerMatchMode: 'any',
  },
  ombi: {
    providerKeys: ['tmdb'],
    providerMatchMode: 'any',
  },
};
