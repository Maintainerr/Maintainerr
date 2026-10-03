import { ImageType } from '@jellyfin/sdk/lib/generated-client/models';
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

  describe('Primary image I/O', () => {
    it('reads the Primary image on downloadImage', async () => {
      const buf = Buffer.from('jpeg');
      jf.getItemImageBuffer.mockResolvedValue(buf);

      await expect(provider.downloadImage('42')).resolves.toBe(buf);
      expect(jf.getItemImageBuffer).toHaveBeenCalledWith(
        '42',
        ImageType.Primary,
      );
    });

    it('writes the Primary image on uploadImage', async () => {
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
