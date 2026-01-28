import { forwardRef, Module } from '@nestjs/common';
import { SettingsModule } from '../../../modules/settings/settings.module';
import { PlexApiService } from './plex-api.service';
import { PlexApiLegacyController } from './plex-api-legacy.controller';
import { MediaServerModule } from '../media-server/media-server.module';

/**
 * PlexApiModule
 *
 * Provides the PlexApiService for internal use by other modules.
 *
 * Also provides deprecated /api/plex endpoints for backward compatibility.
 * The PlexApiLegacyController delegates to MediaServerFactory.
 *
 * @deprecated The /api/plex endpoints are deprecated. Use /api/media-server instead.
 * To remove legacy support: Remove PlexApiLegacyController from this module.
 */
@Module({
  imports: [forwardRef(() => SettingsModule), forwardRef(() => MediaServerModule)],
  controllers: [PlexApiLegacyController],
  providers: [PlexApiService],
  exports: [PlexApiService],
})
export class PlexApiModule {}
