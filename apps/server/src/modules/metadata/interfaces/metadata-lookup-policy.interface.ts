export interface MetadataLookupPolicy {
  providerKeys?: string[];
  providerMatchMode?: 'all' | 'any';
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
};
