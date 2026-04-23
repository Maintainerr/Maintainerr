import { Module } from '@nestjs/common';
import { MediaServerModule } from '../../api/media-server/media-server.module';
import { PlexApiModule } from '../../api/plex-api/plex-api.module';
import { LogsModule } from '../../logging/logs.module';
import { JellyfinOverlayProvider } from './jellyfin-overlay.provider';
import { OverlayProviderFactory } from './overlay-provider.factory';
import { PlexOverlayProvider } from './plex-overlay.provider';

/**
 * Wires the overlay provider abstraction.
 *
 * MediaServerModule exports MediaServerFactory (used by the overlay factory
 * to resolve the configured server type) and JellyfinAdapterService (used by
 * JellyfinOverlayProvider for overlay-specific Jellyfin methods).
 * PlexApiModule exports PlexApiService (used by PlexOverlayProvider — the
 * existing Plex overlay helpers live there unchanged).
 */
@Module({
  imports: [MediaServerModule, PlexApiModule, LogsModule],
  providers: [
    PlexOverlayProvider,
    JellyfinOverlayProvider,
    OverlayProviderFactory,
  ],
  exports: [OverlayProviderFactory],
})
export class OverlayProviderModule {}
