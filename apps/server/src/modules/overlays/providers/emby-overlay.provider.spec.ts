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

  describe('itemExists', () => {
    it('delegates to EmbyAdapterService.itemExists', async () => {
      emby.itemExists.mockResolvedValue(true);

      await expect(provider.itemExists('42')).resolves.toBe(true);
      expect(emby.itemExists).toHaveBeenCalledWith('42');

      emby.itemExists.mockResolvedValue(false);
      await expect(provider.itemExists('42')).resolves.toBe(false);
    });

    it('propagates errors so revert callers preserve state on transient failures', async () => {
      emby.itemExists.mockRejectedValue(new Error('5xx'));

      await expect(provider.itemExists('42')).rejects.toThrow('5xx');
    });
  });
});
