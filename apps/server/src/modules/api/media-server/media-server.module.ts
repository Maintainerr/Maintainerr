import { forwardRef, Module } from '@nestjs/common';
import { SettingsModule } from '../../settings/settings.module';
import { PlexApiModule } from '../plex-api/plex-api.module';
import { MediaServerSetupGuard } from './guards/media-server-setup.guard';
import { JellyfinAdapterService } from './jellyfin/jellyfin-adapter.service';
import { JellyfinModule } from './jellyfin/jellyfin.module';
import { MediaServerController } from './media-server.controller';
import { MediaServerFactory } from './media-server.factory';
import { PlexAdapterService } from './plex/plex-adapter.service';

/**
 * Media Server Module
 *
 * Provides abstraction layer for media server operations.
 * Supports both Plex and Jellyfin media servers.
 *
 * Usage:
 * ```typescript
 * // In a service or controller
 * constructor(private readonly mediaServerFactory: MediaServerFactory) {}
 *
 * async someMethod() {
 *   const mediaServer = await this.mediaServerFactory.getService();
 *   const libraries = await mediaServer.getLibraries();
 * }
 * ```
 *
 * The MediaServerController provides unified HTTP endpoints at /api/media-server
 * that automatically route to the configured media server (Plex or Jellyfin).
 */
@Module({
  imports: [
    forwardRef(() => PlexApiModule),
    forwardRef(() => SettingsModule),
    JellyfinModule,
  ],
  controllers: [MediaServerController],
  providers: [
    PlexAdapterService,
    JellyfinAdapterService,
    MediaServerFactory,
    MediaServerSetupGuard,
  ],
  exports: [
    PlexAdapterService,
    JellyfinAdapterService,
    MediaServerFactory,
    MediaServerSetupGuard,
  ],
})
export class MediaServerModule {}
