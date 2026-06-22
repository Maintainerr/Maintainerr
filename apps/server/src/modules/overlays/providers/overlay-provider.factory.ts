import { MediaServerType } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { EmbyOverlayProvider } from './emby-overlay.provider';
import { JellyfinOverlayProvider } from './jellyfin-overlay.provider';
import { IOverlayProvider } from './overlay-provider.interface';
import { PlexOverlayProvider } from './plex-overlay.provider';

/**
 * Resolves the active overlay provider based on the configured media server.
 *
 * Delegates server-type resolution to MediaServerFactory so the inferred-type
 * fallback (Plex credentials present but media_server_type unset → infer Plex)
 * stays a single source of truth. Returns null when no server is configured —
 * callers (processor, controller) log and skip.
 *
 * Runtime server switches are guarded at MediaServerFactory.getService(); the
 * overlay factory itself does not repeat that check because the controller
 * sits behind MediaServerSetupGuard and the processor handles the null case
 * explicitly.
 */
@Injectable()
export class OverlayProviderFactory {
  constructor(
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly plexProvider: PlexOverlayProvider,
    private readonly jellyfinProvider: JellyfinOverlayProvider,
    private readonly embyProvider: EmbyOverlayProvider,
  ) {}

  async getProvider(): Promise<IOverlayProvider | null> {
    const type = await this.mediaServerFactory.getConfiguredServerType();
    switch (type) {
      case MediaServerType.PLEX:
        return this.plexProvider;
      case MediaServerType.JELLYFIN:
        return this.jellyfinProvider;
      case MediaServerType.EMBY:
        return this.embyProvider;
      case MediaServerType.KODI:
        // Kodi exposes no writable per-item poster surface over JSON-RPC, so
        // overlays are unsupported (gated by MediaServerFeature.OVERLAYS).
        return null;
      default:
        return null;
    }
  }
}
