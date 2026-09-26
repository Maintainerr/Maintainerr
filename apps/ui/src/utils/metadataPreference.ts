import { MetadataProviderPreference } from '@maintainerr/contracts'

// TVDB can only be primary while its key is configured; otherwise TMDB serves.
export function resolveMetadataPreference(
  preference: MetadataProviderPreference,
  tvdbCanBePrimary: boolean,
) {
  return preference === MetadataProviderPreference.TVDB_PRIMARY &&
    !tvdbCanBePrimary
    ? MetadataProviderPreference.TMDB_PRIMARY
    : preference
}
