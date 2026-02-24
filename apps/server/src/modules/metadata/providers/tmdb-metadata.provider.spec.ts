import { TmdbApiService } from '../../api/tmdb-api/tmdb.service';
import { TmdbMetadataProvider } from './tmdb-metadata.provider';

const createProvider = () => {
  const tmdbApi = {
    getMovie: jest.fn(),
    getTvShow: jest.fn(),
    getPerson: jest.fn(),
    getByExternalId: jest.fn(),
  } as unknown as jest.Mocked<TmdbApiService>;

  return { provider: new TmdbMetadataProvider(tmdbApi), tmdbApi };
};

describe('TmdbMetadataProvider', () => {
  it('is always available', () => {
    expect(createProvider().provider.isAvailable()).toBe(true);
  });

  it('extracts and assigns tmdbId', () => {
    const { provider } = createProvider();
    expect(provider.extractId({ tmdbId: 42 })).toBe(42);
    expect(provider.extractId({})).toBeUndefined();

    const ids: { tmdbId?: number } = {};
    provider.assignId(ids, 99);
    expect(ids.tmdbId).toBe(99);
  });

  it('getDetails returns normalised movie details with externalIds', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getMovie.mockResolvedValue({
      id: 550, title: 'Fight Club', overview: 'A movie',
      poster_path: '/poster.jpg', backdrop_path: '/bg.jpg',
      external_ids: { tvdb_id: 42, imdb_id: 'tt0137523' },
    } as any);

    const result = await provider.getDetails(550, 'movie');

    expect(result).toEqual(expect.objectContaining({
      id: 550, title: 'Fight Club',
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      externalIds: expect.objectContaining({ tmdbId: 550, tvdbId: 42 }),
    }));
  });

  it('getDetails fetches TV show for type=tv', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getTvShow.mockResolvedValue({
      id: 1396, name: 'Breaking Bad', overview: 'A show',
      poster_path: null, backdrop_path: null, external_ids: {},
    } as any);

    const result = await provider.getDetails(1396, 'tv');

    expect(result?.title).toBe('Breaking Bad');
    expect(tmdbApi.getTvShow).toHaveBeenCalledWith({ tvId: 1396 });
  });

  it('findByExternalId maps IMDB results to movie/tvShow IDs', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getByExternalId.mockResolvedValue({
      movie_results: [{ id: 550 }],
      tv_results: [{ id: 1396 }],
    } as any);

    const results = await provider.findByExternalId('tt0137523', 'imdb');

    expect(results).toEqual([{ movieId: 550 }, { tvShowId: 1396 }]);
  });

  it('findByExternalId returns undefined for tmdb type', async () => {
    const { provider } = createProvider();
    expect(await provider.findByExternalId(550, 'tmdb')).toBeUndefined();
  });

  it('getPosterUrl builds image URL for movies', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getMovie.mockResolvedValue({ poster_path: '/p.jpg' } as any);

    expect(await provider.getPosterUrl(550, 'movie')).toBe(
      'https://image.tmdb.org/t/p/w500/p.jpg',
    );
  });

  it('getPosterUrl returns undefined when poster_path is null', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getTvShow.mockResolvedValue({ poster_path: null } as any);

    expect(await provider.getPosterUrl(1, 'tv')).toBeUndefined();
  });

  it('getBackdropUrl builds image URL for tv shows', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getTvShow.mockResolvedValue({ backdrop_path: '/bg.jpg' } as any);

    expect(await provider.getBackdropUrl(1396, 'tv', 'w1280')).toBe(
      'https://image.tmdb.org/t/p/w1280/bg.jpg',
    );
  });

  it('getBackdropUrl returns undefined for missing backdrop', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getMovie.mockResolvedValue({ backdrop_path: null } as any);

    expect(await provider.getBackdropUrl(1, 'movie')).toBeUndefined();
  });

  it('getPersonDetails maps TMDB person response', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getPerson.mockResolvedValue({
      id: 287, name: 'Brad Pitt', biography: 'Actor',
      birthday: '1963-12-18', deathday: null,
      known_for_department: 'Acting',
      profile_path: '/brad.jpg', imdb_id: 'nm0000093',
    } as any);

    const result = await provider.getPersonDetails(287);

    expect(result).toEqual(expect.objectContaining({
      id: 287, name: 'Brad Pitt', imdbId: 'nm0000093',
    }));
  });
});
