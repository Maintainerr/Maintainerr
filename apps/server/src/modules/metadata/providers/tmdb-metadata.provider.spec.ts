import { Mocked, TestBed } from '@suites/unit';
import { TmdbApiService } from '../../api/tmdb-api/tmdb.service';
import { TmdbMetadataProvider } from './tmdb-metadata.provider';

describe('TmdbMetadataProvider', () => {
  let provider: TmdbMetadataProvider;
  let tmdbApi: Mocked<TmdbApiService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(TmdbMetadataProvider).compile();
    provider = unit;
    tmdbApi = unitRef.get(TmdbApiService);
  });

  const baseTvRecord = {
    id: 1,
    name: 'Sample Series',
    first_air_date: '2017-04-25',
    original_language: 'en',
    overview: '',
    vote_average: 8.1,
    poster_path: '/p.jpg',
    backdrop_path: '/b.jpg',
    external_ids: { tvdb_id: 322399, imdb_id: 'tt5673782' },
    seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }],
  };

  it.each<[string, boolean | undefined, string, boolean | undefined]>([
    // [status, in_production, label, expectedEnded]
    ['Ended', false, 'status Ended + in_production false', true],
    ['Canceled', false, 'status Canceled', true],
    ['Returning Series', true, 'status Returning Series', false],
    ['In Production', true, 'status In Production', false],
    ['Pilot', undefined, 'status Pilot (unknown)', undefined],
  ])(
    'maps %s to ended=%s (%s)',
    async (status, inProduction, label, expected) => {
      tmdbApi.getTvShow.mockResolvedValue({
        ...baseTvRecord,
        status,
        in_production: inProduction,
      } as any);

      const details = await provider.getDetails(1, 'tv');

      expect(details?.ended).toBe(expected);
      expect(details?.firstAirDate).toBe('2017-04-25');
    },
  );

  it('counts only non-special seasons', async () => {
    tmdbApi.getTvShow.mockResolvedValue({
      ...baseTvRecord,
      status: 'Ended',
      in_production: false,
    } as any);

    const details = await provider.getDetails(1, 'tv');

    expect(details?.seasonCount).toBe(2);
  });

  it('prefers in_production: true over an "Ended" status string', async () => {
    tmdbApi.getTvShow.mockResolvedValue({
      ...baseTvRecord,
      status: 'Ended',
      in_production: true,
    } as any);

    const details = await provider.getDetails(1, 'tv');

    expect(details?.ended).toBe(false);
  });

  it('returns the requested season poster instead of the show poster', async () => {
    tmdbApi.getTvShow.mockResolvedValue({
      ...baseTvRecord,
      seasons: [
        { season_number: 1, poster_path: '/s1.jpg' },
        { season_number: 2, poster_path: '/s2.jpg' },
      ],
    } as any);

    await expect(
      provider.getPosterUrl(1, 'tv', {
        sizeHint: 'w300',
        ref: { seasonNumber: 2 },
      }),
    ).resolves.toBe('https://image.tmdb.org/t/p/w300/s2.jpg');
  });

  it('falls back to the show poster when the season has no artwork', async () => {
    tmdbApi.getTvShow.mockResolvedValue({
      ...baseTvRecord,
      seasons: [{ season_number: 1 }],
    } as any);

    await expect(
      provider.getPosterUrl(1, 'tv', {
        sizeHint: 'w300',
        ref: { seasonNumber: 1 },
      }),
    ).resolves.toBe('https://image.tmdb.org/t/p/w300/p.jpg');
    await expect(
      provider.getPosterUrl(1, 'tv', {
        sizeHint: 'w300',
        ref: { seasonNumber: 9 },
      }),
    ).resolves.toBe('https://image.tmdb.org/t/p/w300/p.jpg');
  });

  it('reads the season overview from the show record', async () => {
    tmdbApi.getTvShow.mockResolvedValue({
      ...baseTvRecord,
      seasons: [
        { season_number: 1, overview: 'First season.' },
        { season_number: 2, overview: '' },
      ],
    } as any);

    await expect(
      provider.getHierarchyOverview(1, { seasonNumber: 1 }),
    ).resolves.toBe('First season.');
    // An empty provider overview is no overview at all.
    await expect(
      provider.getHierarchyOverview(1, { seasonNumber: 2 }),
    ).resolves.toBeUndefined();
    await expect(
      provider.getHierarchyOverview(1, { seasonNumber: 9 }),
    ).resolves.toBeUndefined();
  });

  it('gives an episode its season poster, since TMDB has no episode poster', async () => {
    tmdbApi.getTvShow.mockResolvedValue({
      ...baseTvRecord,
      seasons: [{ season_number: 2, poster_path: '/s2.jpg' }],
    } as any);

    await expect(
      provider.getPosterUrl(1, 'tv', {
        sizeHint: 'w300',
        ref: { seasonNumber: 2, episodeNumber: 4 },
      }),
    ).resolves.toBe('https://image.tmdb.org/t/p/w300/s2.jpg');
    expect(tmdbApi.getTvSeason).not.toHaveBeenCalled();
  });

  it("uses the episode still as the episode's backdrop", async () => {
    tmdbApi.getTvSeason.mockResolvedValue({
      season_number: 2,
      episodes: [
        { episode_number: 3, still_path: '/e3.jpg', overview: 'Third.' },
        { episode_number: 4, still_path: '/e4.jpg', overview: '' },
      ],
    } as any);

    // Stills are not published in backdrop sizes, so the hint is ignored.
    await expect(
      provider.getBackdropUrl(1, 'tv', {
        sizeHint: 'w1280',
        ref: { seasonNumber: 2, episodeNumber: 3 },
      }),
    ).resolves.toBe('https://image.tmdb.org/t/p/original/e3.jpg');
    expect(tmdbApi.getTvSeason).toHaveBeenCalledWith({
      tvId: 1,
      seasonNumber: 2,
    });
  });

  it('falls back to the show backdrop for a season, and for an episode with no still', async () => {
    tmdbApi.getTvShow.mockResolvedValue(baseTvRecord as any);
    tmdbApi.getTvSeason.mockResolvedValue({
      season_number: 2,
      episodes: [{ episode_number: 3 }],
    } as any);

    await expect(
      provider.getBackdropUrl(1, 'tv', {
        sizeHint: 'w1280',
        ref: { seasonNumber: 2 },
      }),
    ).resolves.toBe('https://image.tmdb.org/t/p/w1280/b.jpg');
    // A season alone never needs the season request - only episodes do.
    expect(tmdbApi.getTvSeason).not.toHaveBeenCalled();

    await expect(
      provider.getBackdropUrl(1, 'tv', {
        sizeHint: 'w1280',
        ref: { seasonNumber: 2, episodeNumber: 3 },
      }),
    ).resolves.toBe('https://image.tmdb.org/t/p/w1280/b.jpg');
  });

  it('reads the episode overview from the season record', async () => {
    tmdbApi.getTvSeason.mockResolvedValue({
      season_number: 2,
      episodes: [
        { episode_number: 3, overview: 'Third episode.' },
        { episode_number: 4, overview: '' },
      ],
    } as any);

    await expect(
      provider.getHierarchyOverview(1, { seasonNumber: 2, episodeNumber: 3 }),
    ).resolves.toBe('Third episode.');
    await expect(
      provider.getHierarchyOverview(1, { seasonNumber: 2, episodeNumber: 4 }),
    ).resolves.toBeUndefined();
    await expect(
      provider.getHierarchyOverview(1, { seasonNumber: 2, episodeNumber: 9 }),
    ).resolves.toBeUndefined();
  });

  it('does not set show-only fields for movie details', async () => {
    tmdbApi.getMovie.mockResolvedValue({
      id: 1,
      title: 'Sample Movie',
      release_date: '2010-01-01',
      overview: '',
      vote_average: 7,
      poster_path: '/p.jpg',
      backdrop_path: '/b.jpg',
      status: 'Released',
      external_ids: {},
    } as any);

    const details = await provider.getDetails(1, 'movie');

    expect(details?.ended).toBeUndefined();
    expect(details?.firstAirDate).toBeUndefined();
    expect(details?.seasonCount).toBeUndefined();
  });
});
