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
    async (status, inProduction, _label, expected) => {
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
