import { forwardRef, Module } from '@nestjs/common';
import { PlexApiModule } from '../plex-api/plex-api.module';
import { SettingsModule } from '../../settings/settings.module';
import { MediaServerFactory } from './media-server.factory';
import { PlexAdapterService } from './plex/plex-adapter.service';
// JellyfinModule will be imported in Phase B
// import { JellyfinModule } from './jellyfin/jellyfin.module';

/**
 * Media Server Module
 *
 * Provides abstraction layer for media server operations.
 * Currently supports Plex, with Jellyfin support to be added in Phase B.
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
 */
@Module({
  imports: [
    forwardRef(() => PlexApiModule),
    forwardRef(() => SettingsModule),
    // JellyfinModule, // Phase B
  ],
  providers: [
    PlexAdapterService,
    // JellyfinService, // Phase B
    MediaServerFactory,
  ],
  exports: [
    PlexAdapterService,
    // JellyfinService, // Phase B
    MediaServerFactory,
  ],
})
export class MediaServerModule {}
