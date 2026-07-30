import { addProviderId, emptyProviderIds } from './media-provider-ids.utils';

describe('media provider ids', () => {
  it('starts every provider off with an empty list', () => {
    expect(emptyProviderIds()).toEqual({ imdb: [], tmdb: [], tvdb: [] });
  });

  it.each([
    ['imdb', 'imdb'],
    ['Imdb', 'imdb'],
    ['tmdb', 'tmdb'],
    ['Tmdb', 'tmdb'],
    ['themoviedb', 'tmdb'],
    ['tvdb', 'tvdb'],
    ['Tvdb', 'tvdb'],
    ['thetvdb', 'tvdb'],
  ])('files %s under %s', (name, provider) => {
    const providerIds = emptyProviderIds();
    addProviderId(providerIds, name, 'id-1');
    expect(providerIds[provider]).toEqual(['id-1']);
  });

  it('collects every id a provider has', () => {
    const providerIds = emptyProviderIds();
    addProviderId(providerIds, 'tvdb', '73141');
    addProviderId(providerIds, 'thetvdb', '73142');
    expect(providerIds.tvdb).toEqual(['73141', '73142']);
  });

  it.each([
    ['a provider we track no ids for', 'tvrage', '12345'],
    ['a missing provider', undefined, '12345'],
    ['a missing id', 'imdb', undefined],
    ['an empty id', 'imdb', ''],
  ])('ignores %s', (_case, name, id) => {
    const providerIds = emptyProviderIds();
    addProviderId(providerIds, name, id);
    expect(providerIds).toEqual({ imdb: [], tmdb: [], tvdb: [] });
  });
});
