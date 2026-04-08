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
  },
  radarr: {
    providerKeys: ['tmdb'],
  },
  seerr: {
    providerKeys: ['tmdb'],
  },
};
