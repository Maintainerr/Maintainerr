import {
  BaseItemKind,
  ImageType,
} from '@jellyfin/sdk/lib/generated-client/models';
import { Mocked, TestBed } from '@suites/unit';
import { JellyfinAdapterService } from '../../api/media-server/jellyfin/jellyfin-adapter.service';
import { JellyfinOverlayProvider } from './jellyfin-overlay.provider';

describe('JellyfinOverlayProvider', () => {
  let provider: JellyfinOverlayProvider;
  let jf: Mocked<JellyfinAdapterService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      JellyfinOverlayProvider,
    ).compile();

    provider = unit;
    jf = unitRef.get(JellyfinAdapterService);
  });

  describe('isAvailable', () => {
    it('delegates to JellyfinAdapterService.isSetup', async () => {
      jf.isSetup.mockReturnValue(true);
      await expect(provider.isAvailable()).resolves.toBe(true);

      jf.isSetup.mockReturnValue(false);
      await expect(provider.isAvailable()).resolves.toBe(false);
    });
  });

  describe('getSections', () => {
    it('filters libraries to movie/show and maps to OverlayLibrarySection', async () => {
      jf.getLibraries.mockResolvedValue([
        { id: 'lib-1', title: 'Films', type: 'movie' } as any,
        { id: 'lib-2', title: 'Series', type: 'show' } as any,
      ]);

      await expect(provider.getSections()).resolves.toEqual([
        { key: 'lib-1', title: 'Films', type: 'movie' },
        { key: 'lib-2', title: 'Series', type: 'show' },
      ]);
    });
  });

  describe('getRandomItem', () => {
    it('queries Movie/Series kinds and maps to OverlayPreviewItem', async () => {
      jf.findRandomItem.mockResolvedValue({
        Id: 'jf-42',
        Name: 'Item Title',
      } as any);

      await expect(provider.getRandomItem(['lib-1'])).resolves.toEqual({
        itemId: 'jf-42',
        title: 'Item Title',
      });
      expect(jf.findRandomItem).toHaveBeenCalledWith(
        ['lib-1'],
        [BaseItemKind.Movie, BaseItemKind.Series],
      );
    });

    it('returns null when the adapter yields null', async () => {
      jf.findRandomItem.mockResolvedValue(null);
      await expect(provider.getRandomItem()).resolves.toBeNull();
    });

    it('returns null when the item has no Id', async () => {
      jf.findRandomItem.mockResolvedValue({ Id: undefined } as any);
      await expect(provider.getRandomItem()).resolves.toBeNull();
    });
  });

  describe('getRandomEpisode', () => {
    it('prefixes the episode title with the series name when available', async () => {
      jf.findRandomEpisode.mockResolvedValue({
        Id: 'jf-ep',
        Name: 'Episode One',
        SeriesName: 'Series Name',
      } as any);

      await expect(provider.getRandomEpisode(['lib-1'])).resolves.toEqual({
        itemId: 'jf-ep',
        title: 'Series Name — Episode One',
      });
    });

    it('falls back to the bare episode name when series name is missing', async () => {
      jf.findRandomEpisode.mockResolvedValue({
        Id: 'jf-ep',
        Name: 'Orphan Episode',
        SeriesName: null,
      } as any);

      await expect(provider.getRandomEpisode()).resolves.toEqual({
        itemId: 'jf-ep',
        title: 'Orphan Episode',
      });
    });
  });

  describe('mode → ImageType mapping', () => {
    it('maps poster → Primary on downloadImage', async () => {
      const buf = Buffer.from('jpeg');
      jf.getItemImageBuffer.mockResolvedValue(buf);

      await expect(provider.downloadImage('42')).resolves.toBe(buf);
      expect(jf.getItemImageBuffer).toHaveBeenCalledWith(
        '42',
        ImageType.Primary,
      );
    });

    it('maps titlecard → Thumb on downloadImage', async () => {
      const buf = Buffer.from('jpeg');
      jf.getItemImageBuffer.mockResolvedValue(buf);

      await expect(provider.downloadImage('42')).resolves.toBe(buf);
      expect(jf.getItemImageBuffer).toHaveBeenCalledWith(
        '42',
        ImageType.Primary,
      );
    });

    it('maps poster → Primary on uploadImage', async () => {
      const buf = Buffer.from('jpeg');
      jf.setItemImage.mockResolvedValue(undefined);

      await provider.uploadImage('42', buf, 'image/jpeg');

      expect(jf.setItemImage).toHaveBeenCalledWith(
        '42',
        ImageType.Primary,
        buf,
        'image/jpeg',
      );
    });

    it('maps titlecard → Thumb on uploadImage', async () => {
      const buf = Buffer.from('jpeg');
      jf.setItemImage.mockResolvedValue(undefined);

      await provider.uploadImage('42', buf, 'image/jpeg');

      expect(jf.setItemImage).toHaveBeenCalledWith(
        '42',
        ImageType.Primary,
        buf,
        'image/jpeg',
      );
    });
  });
});
