import { Mocked, TestBed } from '@suites/unit';
import { EmbyAdapterService } from '../../api/media-server/emby/emby-adapter.service';
import { EmbyOverlayProvider } from './emby-overlay.provider';

describe('EmbyOverlayProvider', () => {
  let provider: EmbyOverlayProvider;
  let emby: Mocked<EmbyAdapterService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(EmbyOverlayProvider).compile();

    provider = unit;
    emby = unitRef.get(EmbyAdapterService);
  });

  describe('uploadImage', () => {
    it('delegates to EmbyAdapterService.setCollectionImage', async () => {
      const buf = Buffer.from('poster');
      emby.setCollectionImage.mockResolvedValue(undefined);

      await provider.uploadImage('42', buf, 'image/jpeg');

      expect(emby.setCollectionImage).toHaveBeenCalledWith(
        '42',
        buf,
        'image/jpeg',
      );
    });
  });
});
