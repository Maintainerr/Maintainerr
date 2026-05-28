import { Mocked, TestBed } from '@suites/unit';
import { TvdbApiService } from '../../api/tvdb-api/tvdb.service';
import { TvdbMetadataProvider } from './tvdb-metadata.provider';

describe('TvdbMetadataProvider', () => {
  let provider: TvdbMetadataProvider;
  let tvdbApi: Mocked<TvdbApiService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(TvdbMetadataProvider).compile();
    provider = unit;
    tvdbApi = unitRef.get(TvdbApiService);

    tvdbApi.getPosterUrl.mockReturnValue(undefined);
    tvdbApi.getBackdropUrl.mockReturnValue(undefined);
    tvdbApi.getTmdbId.mockReturnValue(undefined);
    tvdbApi.getImdbId.mockReturnValue(undefined);
  });

  const baseSeriesRecord = {
    id: 322399,
    name: 'Sample Series',
    firstAired: '2017-04-25',
    originalLanguage: 'eng',
    overview: '',
    score: 9,
    year: '2017',
    defaultSeasonType: 1,
    seasons: [
      // Specials in the default ordering — should be filtered out.
      { number: 0, type: { id: 1 } },
      { number: 1, type: { id: 1 } },
      { number: 2, type: { id: 1 } },
      // Alternative orderings — should be filtered out by defaultSeasonType.
      { number: 1, type: { id: 2 } },
      { number: 2, type: { id: 2 } },
      { number: 3, type: { id: 3 } },
    ],
  };

  it.each<[string, boolean | undefined]>([
    ['Ended', true],
    ['Continuing', false],
    ['Upcoming', false],
    ['Unknown', undefined],
  ])('maps TVDB status %s to ended=%s', async (statusName, expected) => {
    tvdbApi.getSeries.mockResolvedValue({
      ...baseSeriesRecord,
      status: { name: statusName },
    } as any);

    const details = await provider.getDetails(322399, 'tv');

    expect(details?.ended).toBe(expected);
    expect(details?.firstAirDate).toBe('2017-04-25');
  });

  it('counts seasons in the default ordering, excluding specials', async () => {
    tvdbApi.getSeries.mockResolvedValue({
      ...baseSeriesRecord,
      status: { name: 'Ended' },
    } as any);

    const details = await provider.getDetails(322399, 'tv');

    // Only number > 0 in the default ordering (type.id === 1) — 2 seasons.
    expect(details?.seasonCount).toBe(2);
  });

  it('does not derive ended or season count for movie details', async () => {
    tvdbApi.getMovie.mockResolvedValue({
      id: 1,
      name: 'Sample Movie',
      year: '2010',
      status: { name: 'Released' },
      originalLanguage: 'eng',
    } as any);

    const details = await provider.getDetails(1, 'movie');

    expect(details?.ended).toBeUndefined();
    expect(details?.firstAirDate).toBeUndefined();
    expect(details?.seasonCount).toBeUndefined();
  });
});
