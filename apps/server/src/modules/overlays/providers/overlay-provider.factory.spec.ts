import { MediaServerType } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { JellyfinOverlayProvider } from './jellyfin-overlay.provider';
import { OverlayProviderFactory } from './overlay-provider.factory';
import { PlexOverlayProvider } from './plex-overlay.provider';

describe('OverlayProviderFactory', () => {
  let factory: OverlayProviderFactory;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let plexProvider: Mocked<PlexOverlayProvider>;
  let jellyfinProvider: Mocked<JellyfinOverlayProvider>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      OverlayProviderFactory,
    ).compile();

    factory = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    plexProvider = unitRef.get(PlexOverlayProvider);
    jellyfinProvider = unitRef.get(JellyfinOverlayProvider);
  });

  it('returns the Plex provider when the configured server is Plex', async () => {
    mediaServerFactory.getConfiguredServerType.mockResolvedValue(
      MediaServerType.PLEX,
    );

    await expect(factory.getProvider()).resolves.toBe(plexProvider);
  });

  it('returns the Jellyfin provider when the configured server is Jellyfin', async () => {
    mediaServerFactory.getConfiguredServerType.mockResolvedValue(
      MediaServerType.JELLYFIN,
    );

    await expect(factory.getProvider()).resolves.toBe(jellyfinProvider);
  });

  it('returns null when no media server is configured', async () => {
    mediaServerFactory.getConfiguredServerType.mockResolvedValue(null);

    await expect(factory.getProvider()).resolves.toBeNull();
  });
});
