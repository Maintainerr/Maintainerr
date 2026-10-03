import { MediaServerType } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { EmbyOverlayProvider } from './emby-overlay.provider';
import { JellyfinOverlayProvider } from './jellyfin-overlay.provider';
import { OverlayProviderFactory } from './overlay-provider.factory';
import { PlexOverlayProvider } from './plex-overlay.provider';

describe('OverlayProviderFactory', () => {
  let factory: OverlayProviderFactory;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let plexProvider: Mocked<PlexOverlayProvider>;
  let jellyfinProvider: Mocked<JellyfinOverlayProvider>;
  let embyProvider: Mocked<EmbyOverlayProvider>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      OverlayProviderFactory,
    ).compile();

    factory = unit;
    mediaServerFactory = unitRef.get(MediaServerFactory);
    plexProvider = unitRef.get(PlexOverlayProvider);
    jellyfinProvider = unitRef.get(JellyfinOverlayProvider);
    embyProvider = unitRef.get(EmbyOverlayProvider);
  });

  it.each([
    [MediaServerType.PLEX, () => plexProvider],
    [MediaServerType.JELLYFIN, () => jellyfinProvider],
    [MediaServerType.EMBY, () => embyProvider],
  ])('returns the %s provider', async (serverType, provider) => {
    mediaServerFactory.getConfiguredServerType.mockResolvedValue(serverType);

    await expect(factory.getProvider()).resolves.toBe(provider());
  });

  it('returns null when no media server is configured', async () => {
    mediaServerFactory.getConfiguredServerType.mockResolvedValue(null);

    await expect(factory.getProvider()).resolves.toBeNull();
  });
});
