import { MediaProviderIds } from '@maintainerr/contracts';

// Every name a media server may use for the providers Maintainerr tracks:
// the bare ones, the capitalised keys Jellyfin and Emby send, the
// spelled-out ones a legacy Plex agent carries, and the Sportarr namespace
// its own agents stamp. Matched lowercased.
//
// A Map, not an object literal: the name comes from the server's own metadata,
// and `constructor` / `__proto__` resolve on an object literal's prototype
// chain - a truthy hit that then throws when the id is pushed.
const PROVIDER_BY_NAME = new Map<string, keyof MediaProviderIds>([
  ['imdb', 'imdb'],
  ['tmdb', 'tmdb'],
  ['themoviedb', 'tmdb'],
  ['tvdb', 'tvdb'],
  ['thetvdb', 'tvdb'],
  ['sportarr', 'sportarr'],
]);

export const emptyProviderIds = (): MediaProviderIds => ({
  imdb: [],
  tmdb: [],
  tvdb: [],
  sportarr: [],
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
  const provider = PROVIDER_BY_NAME.get(name?.toLowerCase() ?? '');
  if (provider && id) {
    providerIds[provider].push(id);
  }
};
