import { MediaProviderIds } from '@maintainerr/contracts';

// Every name a media server may use for the providers Maintainerr tracks:
// the bare ones, the capitalised keys Jellyfin and Emby send, and the
// spelled-out ones a legacy Plex agent carries. Matched lowercased.
const PROVIDER_BY_NAME: Record<string, keyof MediaProviderIds> = {
  imdb: 'imdb',
  tmdb: 'tmdb',
  themoviedb: 'tmdb',
  tvdb: 'tvdb',
  thetvdb: 'tvdb',
};

export const emptyProviderIds = (): MediaProviderIds => ({
  imdb: [],
  tmdb: [],
  tvdb: [],
});

/**
 * File `id` under the provider `name` belongs to. A name we track no ids for
 * is ignored, so a server is free to send whatever else it holds.
 */
export const addProviderId = (
  providerIds: MediaProviderIds,
  name: string | undefined | null,
  id: string | undefined | null,
): void => {
  const provider = PROVIDER_BY_NAME[name?.toLowerCase()];
  if (provider && id) {
    providerIds[provider].push(id);
  }
};
