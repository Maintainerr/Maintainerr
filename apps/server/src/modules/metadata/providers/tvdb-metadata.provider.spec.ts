import { TvdbApiService } from '../../api/tvdb-api/tvdb.service';
import { TvdbMetadataProvider } from './tvdb-metadata.provider';

const createProvider = (available = true) => {
  const tvdbApi = {
    isAvailable: jest.fn().mockReturnValue(available),
    getMovie: jest.fn(),
    getSeries: jest.fn(),
    getPerson: jest.fn(),
    searchByRemoteId: jest.fn(),
    getPosterUrl: jest.fn(),
    getBackdropUrl: jest.fn(),
    getTmdbId: jest.fn(),
    getImdbId: jest.fn(),
  } as unknown as jest.Mocked<TvdbApiService>;

  return { provider: new TvdbMetadataProvider(tvdbApi), tvdbApi };
};

describe('TvdbMetadataProvider', () => {
  it('delegates isAvailable to the API service', () => {
    expect(createProvider(false).provider.isAvailable()).toBe(false);
    expect(createProvider(true).provider.isAvailable()).toBe(true);
  });

  it('extracts and assigns tvdbId', () => {
    const { provider } = createProvider();
    expect(provider.extractId({ tvdbId: 81189 })).toBe(81189);
    expect(provider.extractId({})).toBeUndefined();

    const ids: { tvdbId?: number } = {};
    provider.assignId(ids, 99);
    expect(ids.tvdbId).toBe(99);
  });

  it('getDetails builds normalised response with cross-provider IDs', async () => {
    const { provider, tvdbApi } = createProvider();
    const series = { id: 81189, name: 'Breaking Bad', overview: 'A show' };
    tvdbApi.getSeries.mockResolvedValue(series as any);
    tvdbApi.getPosterUrl.mockReturnValue('https://artworks.thetvdb.com/poster.jpg');
    tvdbApi.getBackdropUrl.mockReturnValue('https://artworks.thetvdb.com/bg.jpg');
    tvdbApi.getTmdbId.mockReturnValue(1396);
    tvdbApi.getImdbId.mockReturnValue('tt0903747');

    const result = await provider.getDetails(81189, 'tv');

    expect(result).toEqual(expect.objectContaining({
      id: 81189, title: 'Breaking Bad',
      externalIds: expect.objectContaining({ tmdbId: 1396, tvdbId: 81189 }),
    }));
    expect(tvdbApi.getSeries).toHaveBeenCalledWith(81189);
  });

  it('getDetails uses getMovie for movie type', async () => {
    const { provider, tvdbApi } = createProvider();
    tvdbApi.getMovie.mockResolvedValue({ id: 1, name: 'Movie' } as any);
    tvdbApi.getPosterUrl.mockReturnValue(undefined);
    tvdbApi.getBackdropUrl.mockReturnValue(undefined);
    tvdbApi.getTmdbId.mockReturnValue(undefined);
    tvdbApi.getImdbId.mockReturnValue(undefined);

    await provider.getDetails(1, 'movie');

    expect(tvdbApi.getMovie).toHaveBeenCalledWith(1);
  });

  it('findByExternalId only supports IMDB type', async () => {
    const { provider, tvdbApi } = createProvider();
    expect(await provider.findByExternalId(1396, 'tmdb')).toBeUndefined();
    expect(await provider.findByExternalId(81189, 'tvdb')).toBeUndefined();

    tvdbApi.searchByRemoteId.mockResolvedValue([
      { series: { id: 81189 } as any, movie: null },
    ]);

    const results = await provider.findByExternalId('tt0903747', 'imdb');

    expect(results).toEqual([{ tvShowId: 81189 }]);
  });

  it('getPosterUrl delegates to tvdbApi for tv', async () => {
    const { provider, tvdbApi } = createProvider();
    tvdbApi.getSeries.mockResolvedValue({ id: 1 } as any);
    tvdbApi.getPosterUrl.mockReturnValue('https://poster.jpg');

    expect(await provider.getPosterUrl(1, 'tv')).toBe('https://poster.jpg');
    expect(tvdbApi.getSeries).toHaveBeenCalledWith(1);
  });

  it('getPosterUrl uses getMovie for movie type', async () => {
    const { provider, tvdbApi } = createProvider();
    tvdbApi.getMovie.mockResolvedValue({ id: 2 } as any);
    tvdbApi.getPosterUrl.mockReturnValue('https://movie-poster.jpg');

    expect(await provider.getPosterUrl(2, 'movie')).toBe('https://movie-poster.jpg');
    expect(tvdbApi.getMovie).toHaveBeenCalledWith(2);
  });

  it('getBackdropUrl delegates to tvdbApi', async () => {
    const { provider, tvdbApi } = createProvider();
    tvdbApi.getSeries.mockResolvedValue({ id: 1 } as any);
    tvdbApi.getBackdropUrl.mockReturnValue('https://bg.jpg');

    expect(await provider.getBackdropUrl(1, 'tv')).toBe('https://bg.jpg');
  });

  it('getPersonDetails extracts english biography and IMDB ID', async () => {
    const { provider, tvdbApi } = createProvider();
    tvdbApi.getPerson.mockResolvedValue({
      id: 100, name: 'Actor',
      image: 'https://img.tvdb.com/actor.jpg',
      birth: '1980-01-01', death: null,
      biographies: [
        { biography: 'Biografie', language: 'deu' },
        { biography: 'English bio', language: 'eng' },
      ],
      remoteIds: [{ id: 'nm0001', sourceName: 'IMDB', type: 2 }],
    } as any);

    const result = await provider.getPersonDetails(100);

    expect(result).toEqual(expect.objectContaining({
      name: 'Actor', biography: 'English bio', imdbId: 'nm0001',
    }));
  });
});
