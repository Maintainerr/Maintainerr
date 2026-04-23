import { Mocked, TestBed } from '@suites/unit';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { PlexOverlayProvider } from './plex-overlay.provider';

describe('PlexOverlayProvider', () => {
  let provider: PlexOverlayProvider;
  let plexApi: Mocked<PlexApiService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexOverlayProvider).compile();

    provider = unit;
    plexApi = unitRef.get(PlexApiService);
  });

  describe('isAvailable', () => {
    it('delegates to PlexApiService.isPlexSetup', async () => {
      plexApi.isPlexSetup.mockReturnValue(true);
      await expect(provider.isAvailable()).resolves.toBe(true);

      plexApi.isPlexSetup.mockReturnValue(false);
      await expect(provider.isAvailable()).resolves.toBe(false);
    });
  });

  describe('getSections', () => {
    it('narrows Plex types to the OverlayLibrarySection union', async () => {
      plexApi.getOverlayLibrarySections.mockResolvedValue([
        { key: 'lib-1', title: 'Films', type: 'movie' },
        { key: 'lib-2', title: 'Series', type: 'show' },
        // The underlying helper already filters non-movie/show, but belt-and-braces:
        { key: 'lib-3', title: 'Tracks', type: 'music' },
      ]);

      const sections = await provider.getSections();

      expect(sections).toEqual([
        { key: 'lib-1', title: 'Films', type: 'movie' },
        { key: 'lib-2', title: 'Series', type: 'show' },
      ]);
    });
  });

  describe('getRandomItem', () => {
    it('maps plexId to itemId on the returned preview DTO', async () => {
      plexApi.getRandomLibraryItem.mockResolvedValue({
        plexId: 'rk-42',
        title: 'Item Title',
      });

      await expect(provider.getRandomItem(['lib-1'])).resolves.toEqual({
        itemId: 'rk-42',
        title: 'Item Title',
      });
      expect(plexApi.getRandomLibraryItem).toHaveBeenCalledWith(['lib-1']);
    });

    it('returns null when PlexApiService yields null', async () => {
      plexApi.getRandomLibraryItem.mockResolvedValue(null);
      await expect(provider.getRandomItem(['lib-1'])).resolves.toBeNull();
    });
  });

  describe('getRandomEpisode', () => {
    it('maps plexId to itemId on the returned preview DTO', async () => {
      plexApi.getRandomEpisodeItem.mockResolvedValue({
        plexId: 'rk-ep',
        title: 'Episode Title',
      });

      await expect(provider.getRandomEpisode(['lib-1'])).resolves.toEqual({
        itemId: 'rk-ep',
        title: 'Episode Title',
      });
    });

    it('returns null when PlexApiService yields null', async () => {
      plexApi.getRandomEpisodeItem.mockResolvedValue(null);
      await expect(provider.getRandomEpisode(['lib-1'])).resolves.toBeNull();
    });
  });

  describe('downloadImage', () => {
    it('chains getBestPosterUrl → downloadPoster and ignores mode', async () => {
      plexApi.getBestPosterUrl.mockResolvedValue('/library/metadata/42/thumb');
      const buf = Buffer.from('jpeg-bytes');
      plexApi.downloadPoster.mockResolvedValue(buf);

      const resultPoster = await provider.downloadImage('42', 'poster');
      const resultTitleCard = await provider.downloadImage('42', 'titlecard');

      expect(resultPoster).toBe(buf);
      expect(resultTitleCard).toBe(buf);
      // Both modes use the same underlying getBestPosterUrl + downloadPoster
      // path — on Plex the item's thumb is the right artwork regardless.
      expect(plexApi.getBestPosterUrl).toHaveBeenCalledTimes(2);
      expect(plexApi.downloadPoster).toHaveBeenCalledTimes(2);
      expect(plexApi.downloadPoster).toHaveBeenCalledWith(
        '/library/metadata/42/thumb',
      );
    });

    it('returns null when the item has no thumb URL', async () => {
      plexApi.getBestPosterUrl.mockResolvedValue(null);
      await expect(provider.downloadImage('42', 'poster')).resolves.toBeNull();
      expect(plexApi.downloadPoster).not.toHaveBeenCalled();
    });
  });

  describe('uploadImage', () => {
    it('delegates to setThumb and ignores mode', async () => {
      const buf = Buffer.from('jpeg-bytes');
      plexApi.setThumb.mockResolvedValue(undefined);

      await provider.uploadImage('42', 'titlecard', buf, 'image/jpeg');

      expect(plexApi.setThumb).toHaveBeenCalledWith('42', buf, 'image/jpeg');
    });
  });
});
