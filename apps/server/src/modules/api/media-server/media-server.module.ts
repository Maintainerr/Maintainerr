import { forwardRef, Module } from '@nestjs/common';
import { PlexApiModule } from '../plex-api/plex-api.module';
import { SettingsModule } from '../../settings/settings.module';
import { MediaServerFactory } from './media-server.factory';
import { PlexAdapterService } from './plex/plex-adapter.service';
import { JellyfinModule } from './jellyfin/jellyfin.module';
import { JellyfinService } from './jellyfin/jellyfin.service';

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
 */
@Module({
  imports: [
    forwardRef(() => PlexApiModule),
    forwardRef(() => SettingsModule),
    JellyfinModule,
  ],
  providers: [
    PlexAdapterService,
    JellyfinService,
    MediaServerFactory,
  ],
  exports: [
    PlexAdapterService,
    JellyfinService,
    MediaServerFactory,
  ],
})
export class MediaServerModule {}
