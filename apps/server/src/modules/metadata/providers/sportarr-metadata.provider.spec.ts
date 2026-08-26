import { Mocked, TestBed } from '@suites/unit';
import { SportarrHubApiService } from '../../api/sportarr-hub-api/sportarr-hub.service';
import { SportarrMetadataProvider } from './sportarr-metadata.provider';

describe('SportarrMetadataProvider', () => {
  let provider: SportarrMetadataProvider;
  let hub: Mocked<SportarrHubApiService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      SportarrMetadataProvider,
    ).compile();
    provider = unit;
    hub = unitRef.get(SportarrHubApiService);
  });

  const league = {
    id: 'lg-000278',
    title: 'Sample League',
    summary: 'A league description.',
    poster_url: 'https://hub/league/poster.jpg',
    banner_url: 'https://hub/league/banner.jpg',
    fanart_url: null,
    year: 1999,
    sport: 'Sample Sport',
  };

  describe('ids', () => {
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

    it('reverses a tvdb alias without a request when asked to bridge ids', async () => {
      await expect(
        provider.findByExternalId(900000278, 'tvdb'),
      ).resolves.toEqual([{ tvShowId: 278 }]);
      await expect(
        provider.findByExternalId(342040, 'tvdb'),
      ).resolves.toBeUndefined();
      await expect(
        provider.findByExternalId('tt0099785', 'imdb'),
      ).resolves.toBeUndefined();
      expect(hub.getLeague).not.toHaveBeenCalled();
    });
  });

  describe('details', () => {
    it('maps a league to show details keyed by the padded league id', async () => {
      hub.getLeague.mockResolvedValue(league);

      const details = await provider.getDetails(278, 'tv');

      expect(hub.getLeague).toHaveBeenCalledWith('lg-000278');
      expect(hub.getSeasons).not.toHaveBeenCalled();
      expect(details).toEqual({
        id: 278,
        title: 'Sample League',
        year: 1999,
        overview: 'A league description.',
        posterUrl: 'https://hub/league/poster.jpg',
        backdropUrl: 'https://hub/league/banner.jpg',
        externalIds: { sportarr: 278, type: 'tv' },
        type: 'tv',
      });
    });

    it('takes the first season as the year when the league has none', async () => {
      hub.getLeague.mockResolvedValue({ ...league, year: null });
      hub.getSeasons.mockResolvedValue([
        { season_number: 2001, title: '2001', episode_count: 4 },
        { season_number: 1998, title: '1998', episode_count: 2 },
      ]);

      const details = await provider.getDetails(278, 'tv');

      expect(details?.year).toBe(1998);
    });

    it('has no movie details and no person details', async () => {
      await expect(provider.getDetails(278, 'movie')).resolves.toBeUndefined();
      await expect(provider.getPersonDetails()).resolves.toBeUndefined();
      expect(hub.getLeague).not.toHaveBeenCalled();
    });

    it('returns nothing for a league the hub does not know', async () => {
      hub.getLeague.mockResolvedValue(undefined);

      await expect(provider.getDetails(278, 'tv')).resolves.toBeUndefined();
    });
  });

  describe('artwork', () => {
    it('returns the league poster for the show', async () => {
      hub.getLeague.mockResolvedValue(league);

      await expect(provider.getPosterUrl(278, 'tv')).resolves.toBe(
        'https://hub/league/poster.jpg',
      );
    });

    it('returns the season poster for a season, falling back to the league poster', async () => {
      hub.getLeague.mockResolvedValue(league);
      hub.getSeasons.mockResolvedValue([
        {
          season_number: 2025,
          title: '2025',
          poster_url: 'https://hub/season/2025.jpg',
          episode_count: 12,
        },
        {
          season_number: 2026,
          title: '2026',
          poster_url: null,
          episode_count: 3,
        },
      ]);

      await expect(
        provider.getPosterUrl(278, 'tv', { ref: { seasonNumber: 2025 } }),
      ).resolves.toBe('https://hub/season/2025.jpg');
      await expect(
        provider.getPosterUrl(278, 'tv', { ref: { seasonNumber: 2026 } }),
      ).resolves.toBe('https://hub/league/poster.jpg');
    });

    it('uses the banner as the backdrop when the league has no fanart', async () => {
      hub.getLeague.mockResolvedValue(league);

      await expect(provider.getBackdropUrl(278, 'tv')).resolves.toBe(
        'https://hub/league/banner.jpg',
      );
    });

    it("uses the episode still as an episode's backdrop", async () => {
      hub.getLeague.mockResolvedValue(league);
      hub.getSeasonEpisodes.mockResolvedValue([
        {
          id: 'ev-000001',
          season_number: 2026,
          episode_number: 3,
          title: 'Round 3',
          summary: 'Round three.',
          thumb_url: 'https://hub/event/3.jpg',
        },
      ]);

      await expect(
        provider.getBackdropUrl(278, 'tv', {
          ref: { seasonNumber: 2026, episodeNumber: 3 },
        }),
      ).resolves.toBe('https://hub/event/3.jpg');
      expect(hub.getSeasonEpisodes).toHaveBeenCalledWith('lg-000278', 2026);
    });
  });

  describe('overview', () => {
    it('reads an episode description from the season episodes', async () => {
      hub.getSeasonEpisodes.mockResolvedValue([
        {
          id: 'ev-000001',
          season_number: 2026,
          episode_number: 3,
          title: 'Round 3',
          summary: 'Round three.',
        },
      ]);

      await expect(
        provider.getHierarchyOverview(278, {
          seasonNumber: 2026,
          episodeNumber: 3,
        }),
      ).resolves.toBe('Round three.');
    });

    it('has no description for a season the hub leaves blank', async () => {
      hub.getSeasons.mockResolvedValue([
        { season_number: 2026, title: '2026', summary: '', episode_count: 3 },
      ]);

      await expect(
        provider.getHierarchyOverview(278, { seasonNumber: 2026 }),
      ).resolves.toBeUndefined();
    });
  });
});
