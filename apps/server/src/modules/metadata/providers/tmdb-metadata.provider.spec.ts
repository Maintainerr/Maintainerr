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

  it('extracts and assigns ID using dynamic key', () => {
    const { provider } = createProvider();
    expect(provider.extractId({ tmdb: 42 })).toBe(42);
    expect(provider.extractId({})).toBeUndefined();
    expect(provider.extractId({ tmdb: 'not-a-number' })).toBeUndefined();

    const ids: Record<string, number | undefined> = {};
    provider.assignId(ids, 99);
    expect(ids['tmdb']).toBe(99);
  });

  it('getDetails returns normalised movie details with externalIds', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getMovie.mockResolvedValue({
      id: 10,
      title: 'Test Movie',
      overview: 'A movie',
      poster_path: '/poster.jpg',
      backdrop_path: '/bg.jpg',
      external_ids: { tvdb_id: 20, imdb_id: 'tt0000010' },
    } as any);

    const result = await provider.getDetails(10, 'movie');

    expect(result).toEqual(
      expect.objectContaining({
        id: 10,
        title: 'Test Movie',
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        externalIds: expect.objectContaining({ tmdb: 10, tvdb: 20 }),
      }),
    );
  });

  it('getDetails fetches TV show for type=tv', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getTvShow.mockResolvedValue({
      id: 30,
      name: 'Test Series',
      overview: 'A show',
      poster_path: null,
      backdrop_path: null,
      external_ids: {},
    } as any);

    const result = await provider.getDetails(30, 'tv');

    expect(result?.title).toBe('Test Series');
    expect(tmdbApi.getTvShow).toHaveBeenCalledWith({ tvId: 30 });
  });

  it('findByExternalId maps IMDB results to movie/tvShow IDs', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getByExternalId.mockResolvedValue({
      movie_results: [{ id: 10 }],
      tv_results: [{ id: 30 }],
    } as any);

    const results = await provider.findByExternalId('tt0000010', 'imdb');

    expect(results).toEqual([{ movieId: 10 }, { tvShowId: 30 }]);
  });

  it('findByExternalId returns undefined for tmdb type', async () => {
    const { provider } = createProvider();
    expect(await provider.findByExternalId(10, 'tmdb')).toBeUndefined();
  });

  it('getPosterUrl builds image URL for movies', async () => {
    const { provider, tmdbApi } = createProvider();
    tmdbApi.getMovie.mockResolvedValue({ poster_path: '/p.jpg' } as any);

    expect(await provider.getPosterUrl(10, 'movie')).toBe(
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

    expect(await provider.getBackdropUrl(30, 'tv', 'w1280')).toBe(
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
      id: 100,
      name: 'Test Actor',
      biography: 'Actor bio',
      birthday: '1980-01-01',
      deathday: null,
      known_for_department: 'Acting',
      profile_path: '/actor.jpg',
      imdb_id: 'nm0000100',
    } as any);

    const result = await provider.getPersonDetails(100);

    expect(result).toEqual(
      expect.objectContaining({
        id: 100,
        name: 'Test Actor',
        imdbId: 'nm0000100',
      }),
    );
  });
});
