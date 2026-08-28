import { Mocked, TestBed } from '@suites/unit';
import { SportarrMetadataApiService } from '../../api/sportarr-metadata-api/sportarr-metadata.service';
import { SportarrMetadataProvider } from './sportarr-metadata.provider';

describe('SportarrMetadataProvider', () => {
  let provider: SportarrMetadataProvider;
  let api: Mocked<SportarrMetadataApiService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      SportarrMetadataProvider,
    ).compile();
    provider = unit;
    api = unitRef.get(SportarrMetadataApiService);
  });

  const league = {
    title: 'Sample League',
    summary: 'A league description.',
    poster_url: 'https://metadata/league/poster.jpg',
    banner_url: 'https://metadata/league/banner.jpg',
    fanart_url: null,
  };

  it('stands down when the api has nowhere left to read', () => {
    api.hasReachableSource.mockReturnValue(false);
    expect(provider.isAvailable()).toBe(false);

    api.hasReachableSource.mockReturnValue(true);
    expect(provider.isAvailable()).toBe(true);
  });

  describe('ids', () => {
    it('is the authority for an item that carries a Sportarr id', () => {
      expect(provider.isAuthorityFor({ sportarr: 'lg-000278' })).toBe(true);
      expect(provider.isAuthorityFor({ tvdb: 900_000_278 })).toBe(true);
      expect(provider.isAuthorityFor({ tmdb: 101, tvdb: 322_399 })).toBe(false);
    });

    it('parses the league id its agents stamp into the provider id', () => {
      expect(provider.parseId('lg-000278')).toBe(278);
      expect(provider.parseId('LG-1234567')).toBe(1234567);
    });

    it.each(['ev-848683', '900000278', 'lg-', 'lg-000000', ''])(
      'does not parse %s as a league',
      (value) => {
        expect(provider.parseId(value)).toBeUndefined();
      },
    );

    it('extracts its own id whether the bag holds the number or the stamped string', () => {
      expect(provider.extractId({ sportarr: 278 })).toBe(278);
      expect(provider.extractId({ sportarr: 'lg-000278' })).toBe(278);
    });

    it('extracts the league from a tvdb alias when no sportarr id is present', () => {
      expect(provider.extractId({ tvdb: 900000278 })).toBe(278);
      expect(provider.extractId({ tvdb: '900000278' })).toBe(278);
    });

    it('falls through to the alias when the sportarr id names an event', () => {
      expect(
        provider.extractId({ sportarr: 'ev-848683', tvdb: 900000278 }),
      ).toBe(278);
    });

    it('leaves a real tvdb id alone', () => {
      expect(provider.extractId({ tvdb: 342040 })).toBeUndefined();
      expect(provider.extractId({ tmdb: 5555 })).toBeUndefined();
    });
  });

  describe('details', () => {
    it('maps a league to show details keyed by the padded league id, with no year', async () => {
      api.getLeague.mockResolvedValue(league);

      const details = await provider.getDetails(278, 'tv');

      expect(api.getLeague).toHaveBeenCalledWith('lg-000278');
      expect(api.getSeasons).not.toHaveBeenCalled();
      expect(details).toEqual({
        id: 278,
        title: 'Sample League',
        overview: 'A league description.',
        posterUrl: 'https://metadata/league/poster.jpg',
        backdropUrl: 'https://metadata/league/banner.jpg',
        externalIds: { sportarr: 278, type: 'tv' },
        type: 'tv',
      });
    });

    it('has no movie details and no person details', async () => {
      await expect(provider.getDetails(278, 'movie')).resolves.toBeUndefined();
      await expect(provider.getPersonDetails()).resolves.toBeUndefined();
      expect(api.getLeague).not.toHaveBeenCalled();
    });

    it('returns nothing for a league the source does not know', async () => {
      api.getLeague.mockResolvedValue(undefined);

      await expect(provider.getDetails(278, 'tv')).resolves.toBeUndefined();
    });
  });

  describe('artwork', () => {
    it('returns the league poster for the show', async () => {
      api.getLeague.mockResolvedValue(league);

      await expect(provider.getPosterUrl(278, 'tv')).resolves.toBe(
        'https://metadata/league/poster.jpg',
      );
    });

    it('returns the season poster for a season, falling back to the league poster', async () => {
      api.getLeague.mockResolvedValue(league);
      api.getSeasons.mockResolvedValue([
        { season_number: 2025, poster_url: 'https://metadata/season/2025.jpg' },
        { season_number: 2026, poster_url: null },
      ]);

      await expect(
        provider.getPosterUrl(278, 'tv', { ref: { seasonNumber: 2025 } }),
      ).resolves.toBe('https://metadata/season/2025.jpg');
      await expect(
        provider.getPosterUrl(278, 'tv', { ref: { seasonNumber: 2026 } }),
      ).resolves.toBe('https://metadata/league/poster.jpg');
    });

    it('uses the banner as the backdrop when the league has no fanart', async () => {
      api.getLeague.mockResolvedValue(league);

      await expect(provider.getBackdropUrl(278, 'tv')).resolves.toBe(
        'https://metadata/league/banner.jpg',
      );
    });

    it("uses the event still as an episode's backdrop", async () => {
      api.getLeague.mockResolvedValue(league);
      api.getSeasonEpisodes.mockResolvedValue([
        { episode_number: 3, thumb_url: 'https://metadata/event/3.jpg' },
      ]);

      await expect(
        provider.getBackdropUrl(278, 'tv', {
          ref: { seasonNumber: 2026, episodeNumber: 3 },
        }),
      ).resolves.toBe('https://metadata/event/3.jpg');
      expect(api.getSeasonEpisodes).toHaveBeenCalledWith('lg-000278', 2026);
    });
  });

  describe('overview', () => {
    it('reads an event description from the season events', async () => {
      api.getSeasonEpisodes.mockResolvedValue([
        { episode_number: 3, summary: 'Round three.' },
      ]);

      await expect(
        provider.getHierarchyOverview(278, {
          seasonNumber: 2026,
          episodeNumber: 3,
        }),
      ).resolves.toBe('Round three.');
    });

    it('has no description for a season the source leaves blank', async () => {
      api.getSeasons.mockResolvedValue([{ season_number: 2026, summary: '' }]);

      await expect(
        provider.getHierarchyOverview(278, { seasonNumber: 2026 }),
      ).resolves.toBeUndefined();
    });
  });
});
